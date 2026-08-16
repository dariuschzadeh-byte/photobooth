/* =====================================================================
   fr-anz photobooth -- server
   Serves the kiosk UI (public/) and the booth API:
     POST /api/validate   -> check & burn a voucher code, start a session
     POST /api/capture    -> take one photo
     POST /api/print      -> build the strip + send to printer
     POST /api/release    -> failed session: give the burned code back
     GET  /admin          -> codes overview, release buttons, test print
     GET  /admin/stats    -> codes used / remaining (JSON)
     POST /admin/release  -> staff: manually give a code back
     POST /admin/testprint-> print a strip from assets/test-photos (no camera)
   ===================================================================== */

const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const Jimp = require("jimp");

const config = require("./config");
const codes = require("./src/codes");
const stats = require("./src/stats");
const adminPage = require("./src/admin");
const auth = require("./src/auth");
const camera = require("./src/camera");
const { buildStrip } = require("./src/strip");
const { printStrip } = require("./src/printer");

// make sure runtime folders exist
for (const p of [config.paths.data, config.paths.output, config.paths.prints, config.paths.sessions]) {
  fs.mkdirSync(p, { recursive: true });
}

// optional startup cleanup: delete session photos + prints older than
// config.outputRetentionDays (0 = disabled, keep everything)
function cleanOldOutput() {
  const days = config.outputRetentionDays;
  if (!days) return;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const base of [config.paths.sessions, config.paths.prints]) {
    let names = [];
    try { names = fs.readdirSync(base); } catch (e) { continue; }
    for (const name of names) {
      const p = path.join(base, name);
      try {
        if (fs.statSync(p).mtimeMs < cutoff) { fs.rmSync(p, { recursive: true, force: true }); removed++; }
      } catch (e) { /* cleanup must never block startup */ }
    }
  }
  if (removed) console.log(`[cleanup] removed ${removed} output item(s) older than ${days} days`);
}
cleanOldOutput();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(config.paths.public));
app.use("/sessions", express.static(config.paths.sessions));
app.use("/prints", express.static(config.paths.prints));

const sessions = new Map(); // id -> { dir, photos: [], code, master }

/**
 * Check afterwards whether a photo actually got light.
 * A misfiring flash produces a near-black frame (measured: ~5 of 255, versus
 * ~170 with flash). The booth still prints it -- the guest should not be left
 * empty-handed -- but the log says plainly what happened, which is the only
 * way to spot a flaky sync cable from a distance.
 * Runs after the response has been sent so it never slows the countdown.
 */
const DARK_THRESHOLD = 30;
async function logIfDark(file, index) {
  try {
    const img = await Jimp.read(file);
    const { width: w, height: h, data } = img.bitmap;
    let sum = 0, n = 0;
    for (let y = 0; y < h; y += 12) {
      for (let x = 0; x < w; x += 12) {
        const i = (y * w + x) * 4;
        sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
        n++;
      }
    }
    const mean = sum / n;
    if (mean < DARK_THRESHOLD) {
      console.warn(`[flash] WARNING: photo ${index + 1} is nearly black (brightness ${mean.toFixed(1)}/255) ` +
        `- the flash did not fire. Check the sync cable and its plugs.`);
    }
  } catch (e) { /* diagnostics must never break a session */ }
}

/* ---------- control centre login ------------------------------------ */

const clientIp = req => (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "?";
const isLocal = req => {
  const ip = req.socket.remoteAddress || "";
  // Only genuinely local connections count -- a tunnel forwards a real
  // client IP in x-forwarded-for, and those must always log in.
  return !req.headers["x-forwarded-for"] && (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1");
};

function requireLogin(req, res, next) {
  if (config.admin.trustLocalhost && isLocal(req)) return next();
  if (auth.validSession(auth.readCookie(req, "franz_session"))) return next();
  const target = encodeURIComponent(req.originalUrl || "/admin");
  res.redirect("/login?next=" + target);
}

app.get("/login", (req, res) => {
  if (auth.validSession(auth.readCookie(req, "franz_session"))) return res.redirect("/admin");
  res.send(adminPage.loginPage({ error: req.query.error || "", next: req.query.next || "/admin" }));
});

app.post("/login", (req, res) => {
  const ip = clientIp(req);
  const next = (req.body && req.body.next) || "/admin";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/admin";

  if (auth.blocked(ip)) {
    console.warn(`[login] blocked, too many attempts from ${ip}`);
    return res.status(429).send(adminPage.loginPage({ error: "Too many attempts. Wait 15 minutes.", next: safeNext }));
  }

  const user = String((req.body && req.body.user) || "");
  const pass = String((req.body && req.body.password) || "");
  const ok = user === config.admin.user && auth.verifyPassword(pass, config.admin.salt, config.admin.hash);

  if (!ok) {
    auth.noteFail(ip);
    console.warn(`[login] failed attempt from ${ip}`);
    return res.status(401).send(adminPage.loginPage({ error: "Wrong user or password.", next: safeNext }));
  }

  const token = auth.createSession(user);
  const secure = (req.headers["x-forwarded-proto"] === "https") ? "; Secure" : "";
  res.setHeader("Set-Cookie",
    `franz_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${auth.SESSION_HOURS * 3600}${secure}`);
  console.log(`[login] ${user} signed in from ${ip}`);
  res.redirect(safeNext);
});

app.post("/logout", (req, res) => {
  auth.destroySession(auth.readCookie(req, "franz_session"));
  res.setHeader("Set-Cookie", "franz_session=; HttpOnly; Path=/; Max-Age=0");
  res.redirect("/login");
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, testMode: config.TEST_MODE, photos: config.photos, ...codes.stats() });
});

// 1) validate + burn the code, open a session
//    (master code always works and is never burned -- handled inside codes.js)
app.post("/api/validate", (req, res) => {
  const code = (req.body && req.body.code || "").toString();
  const result = codes.validateAndRedeem(code);

  if (!result.valid) {
    const status = result.reason === "already_used" ? "used" : "invalid";
    return res.json({ status });
  }

  const id = crypto.randomUUID();
  const dir = path.join(config.paths.sessions, id);
  fs.mkdirSync(dir, { recursive: true });
  sessions.set(id, { dir, photos: [], code, master: !!result.master });
  res.json({ status: "ok", sessionId: id });
});

// 2) capture one photo
app.post("/api/capture", async (req, res) => {
  const { sessionId, index } = req.body || {};
  const s = sessions.get(sessionId);
  if (!s) return res.status(400).json({ error: "unknown session" });
  try {
    const idx = Number(index) || 0;
    const file = await camera.capture(s.dir, idx);
    s.photos[idx] = file;
    res.json({ ok: true, url: `/sessions/${sessionId}/${path.basename(file)}` });
    setImmediate(() => logIfDark(file, idx));   // after the response, never blocks
  } catch (e) {
    console.error("[capture] FAILED:", e); res.status(500).json({ error: e.message });
  }
});

// 3) build the strip + print
app.post("/api/print", async (req, res) => {
  const { sessionId } = req.body || {};
  const s = sessions.get(sessionId);
  if (!s) return res.status(400).json({ error: "unknown session" });

  const missing = [];
  for (let i = 0; i < config.photos; i++) if (!s.photos[i]) missing.push(i + 1);
  if (missing.length) {
    return res.status(500).json({ error: `missing photo(s): ${missing.join(", ")}` });
  }

  try {
    const out = path.join(config.paths.prints, `${sessionId}.png`);
    await buildStrip(s.photos, out);
    const printResult = await printStrip(out);
    sessions.delete(sessionId);                       // done -- free the session
    res.json({ ok: true, stripUrl: `/prints/${sessionId}.png`, print: printResult });
  } catch (e) {
    console.error("[print] FAILED:", e); res.status(500).json({ error: e.message });
  }
});

// 4) a session failed (camera/printer down) -> give the code back so the
//    guest can simply try again with the same card
app.post("/api/release", (req, res) => {
  const { sessionId } = req.body || {};
  const s = sessions.get(sessionId);
  if (!s) return res.json({ ok: true, released: false });
  sessions.delete(sessionId);
  const released = s.master ? false : codes.release(s.code).released;
  console.log(`[release] session ${sessionId} -> code ${s.code}${released ? " released" : " (not released)"}`);
  res.json({ ok: true, released });
});

// JSON stats -- raw numbers behind the control centre
app.get("/admin/stats", requireLogin, (req, res) => res.json(stats.collect(codes.stats())));

// the printed handbook, served so the control centre can link to it
app.get("/handbook", requireLogin, (req, res) => res.sendFile(path.join(config.paths.root, "BOOTH-HANDBOOK.html")));

// download the codes that have NOT been used yet -- these are the ones
// still worth printing on cards
app.get("/admin/export", requireLogin, (req, res) => {
  const unused = codes.unusedCodes();
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="franz-codes-unused.csv"`);
  res.send("code\n" + unused.join("\n") + "\n");
});

// generate a fresh batch (adds, never replaces -- see scripts/generate-codes.js)
app.post("/admin/generate", requireLogin, (req, res) => {
  const count = Math.max(1, Math.min(5000, parseInt(req.body && req.body.count, 10) || 0));
  try {
    const r = codes.generateBatch(count);
    res.redirect("/admin?msg=" + encodeURIComponent(
      `generated ${r.added} new codes as batch ${r.batch} - download the CSV to print them (${r.total} codes in total now)`));
  } catch (e) {
    console.error("[generate] FAILED:", e);
    res.redirect("/admin?msg=" + encodeURIComponent("could not generate codes: " + e.message));
  }
});

// staff: manually give a code back (e.g. booth failed after the code was typed)
app.post("/admin/release", requireLogin, (req, res) => {
  const code = (req.body && req.body.code || "").toString();
  const r = codes.release(code);
  const msg = r.released ? `code ${code} released -- it can be used again` : `code ${code} NOT released (${r.reason})`;
  res.redirect("/admin?msg=" + encodeURIComponent(msg));
});

// staff: print a test strip from assets/test-photos -- checks strip build +
// hot folder + printer without touching the camera or burning a code
app.post("/admin/testprint", requireLogin, async (req, res) => {
  try {
    let pool = [];
    try {
      pool = fs.readdirSync(config.paths.testPhotos)
        .filter(f => /\.(jpe?g|png)$/i.test(f))
        .map(f => path.join(config.paths.testPhotos, f))
        .sort();
    } catch (e) {}
    if (!pool.length) throw new Error("no test photos in assets/test-photos");
    const photos = [0, 1, 2].map(i => pool[i % pool.length]);
    const out = path.join(config.paths.prints, `test-${Date.now()}.png`);
    await buildStrip(photos, out);
    const r = await printStrip(out);
    res.redirect("/admin?msg=" + encodeURIComponent(
      r.printed ? `test strip sent to printer (${path.basename(out)})` : `test strip built, TEST mode -- nothing printed (${path.basename(out)})`));
  } catch (e) {
    console.error("[testprint] FAILED:", e);
    res.redirect("/admin?msg=" + encodeURIComponent("TEST PRINT FAILED: " + e.message));
  }
});

// The control centre: numbers, charts, code management, quick actions.
app.get("/admin", requireLogin, (req, res) => {
  const s = stats.collect(codes.stats());
  res.send(adminPage.page(s, {
    msg: req.query.msg || "",
    testMode: config.TEST_MODE,
    host: config.HOST,
    port: config.PORT,
    masterCode: codes.MASTER_CODE,
  }));
});

app.listen(config.PORT, config.HOST, () => {
  const s = codes.stats();
  console.log("──────────────────────────────────────────────");
  console.log("  fr-anz photobooth running");
  console.log(`  → open  http://localhost:${config.PORT}`);
  console.log(`  bind    ${config.HOST} ${config.HOST === "127.0.0.1" ? "(this PC only)" : "(reachable from the network!)"}`);
  console.log(`  mode    ${config.TEST_MODE ? "TEST (no hardware)" : "LIVE (camera + printer)"}`);
  console.log(`  codes   ${s.total} total · ${s.used} used · ${s.remaining} left`);
  console.log("──────────────────────────────────────────────");
});
