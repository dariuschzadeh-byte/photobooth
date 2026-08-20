/* =====================================================================
   reporter.js -- the booth's one-way radio to the cloud dashboard.

   HOW IT WORKS
   ---------------------------------------------------------------------
   Every REPORT_SECONDS the booth POSTs one packet upstream:
     - the full stats snapshot (printer, media, codes, funnel, alerts)
     - every event since the last acknowledged one
   and the reply carries back any commands staff queued in the dashboard
   (generate codes, release a code, test print, restart).

   That direction matters. The booth PC sits behind a cafe router in Bali
   with no fixed address and no forwarded port, so nothing can reach in.
   By having the booth ask, the dashboard can still drive it -- and there is
   no open door on the cafe network for anyone else to find.

   THREE RULES THIS FILE MUST NEVER BREAK
   ---------------------------------------------------------------------
   1. A guest standing at the booth must never wait for the internet. Every
      call here is out-of-band and every failure is swallowed.
   2. No internet must never mean no photos. Unsent events queue on disk and
      go up when the line comes back; the booth is fully functional offline.
   3. It must not grow the disk without bound. The cursor advances only on
      an explicit acknowledgement, and a backlog is capped per packet.

   Configure via data/cloud.json (git never sees it) -- see cloud.example.json.
   Without that file this module does nothing at all, quietly.
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const { URL } = require("url");

const config = require("../config");
const events = require("./events");

const CONF   = path.join(config.paths.data, "cloud.json");
const CURSOR = path.join(config.paths.data, "reporter-cursor.json");

const REPORT_SECONDS = 30;
const MAX_EVENTS_PER_PACKET = 500;   // a long offline spell drains over several ticks
const REQUEST_TIMEOUT_MS = 15000;

let timer = null;
let handlers = {};
let settings = null;
let consecutiveFailures = 0;
let lastOkAt = null;

/* ---------- plumbing ------------------------------------------------- */

/**
 * Minimal JSON POST on Node's own http/https.
 *
 * Deliberately not fetch(): this runs on a booth PC whose Node version we do
 * not control and cannot easily check from Bali. http.request has been there
 * since forever, fetch has not.
 */
function postJson(urlString, body, headers = {}) {
  return new Promise((resolve, reject) => {
    let url;
    try { url = new URL(urlString); } catch (e) { return reject(new Error("bad cloud url: " + urlString)); }
    const payload = Buffer.from(JSON.stringify(body), "utf8");
    const lib = url.protocol === "http:" ? http : https;

    const req = lib.request({
      method: "POST",
      hostname: url.hostname,
      port: url.port || (url.protocol === "http:" ? 80 : 443),
      path: url.pathname + url.search,
      headers: { "Content-Type": "application/json", "Content-Length": payload.length, ...headers },
      timeout: REQUEST_TIMEOUT_MS,
    }, res => {
      let raw = "";
      res.on("data", c => { raw += c; });
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 200)}`));
        }
        try { resolve(raw ? JSON.parse(raw) : {}); }
        catch (e) { reject(new Error("bad JSON in reply: " + raw.slice(0, 200))); }
      });
    });

    req.on("timeout", () => req.destroy(new Error("timed out after " + REQUEST_TIMEOUT_MS + "ms")));
    req.on("error", reject);
    req.end(payload);
  });
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return fallback; }
}

function writeJson(file, obj) {
  try {
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
    fs.renameSync(tmp, file);
  } catch (e) { /* a cursor we cannot save just means we resend -- harmless */ }
}

/* ---------- the send cursor ------------------------------------------ */

/**
 * Which events have been accepted upstream.
 *
 * Advanced only when the server says so. If the packet is lost, or accepted
 * and the reply never arrives, the same events go up again next tick -- and
 * the database ignores them, because every event carries an id generated
 * once at write time. Re-sending is cheap; losing an event is not.
 */
function cursor() { return readJson(CURSOR, { lastAt: null, lastId: null }); }

function pendingEvents() {
  const c = cursor();
  const all = events.all();
  // First run drains from the OLDEST end, not the newest. Taking the tail
  // instead would send the most recent few, move the cursor past them, and
  // silently discard everything before -- the entire backlog, on the one
  // run where the backlog is largest.
  if (!c.lastAt) return all.slice(0, MAX_EVENTS_PER_PACKET);
  const cut = new Date(c.lastAt).getTime();
  return all.filter(e => e.date.getTime() > cut || (e.date.getTime() === cut && e.id !== c.lastId))
            .slice(0, MAX_EVENTS_PER_PACKET);
}

/* ---------- commands from the dashboard ------------------------------ */

/**
 * Run one queued command and describe what happened. Never throws: a bad
 * command must come back as a failed result, not take the reporter down.
 */
async function runCommand(cmd) {
  const fn = handlers[cmd.type];
  if (!fn) return { id: cmd.id, status: "failed", result: { error: "unknown command: " + cmd.type } };
  try {
    const result = await fn(cmd.params || {});
    events.log("command_done", { command: cmd.type, commandId: cmd.id });
    return { id: cmd.id, status: "done", result: result || {} };
  } catch (e) {
    events.log("command_failed", { command: cmd.type, commandId: cmd.id, error: e.message });
    return { id: cmd.id, status: "failed", result: { error: e.message } };
  }
}

/* ---------- one round trip ------------------------------------------- */

async function tick() {
  if (!settings) return;

  const stats = require("./stats");
  const codes = require("./codes");

  let snapshot;
  try { snapshot = stats.collect(codes.stats()); }
  catch (e) { snapshot = { error: "stats failed: " + e.message, generatedAt: new Date().toISOString() }; }

  const batch = pendingEvents();

  let reply;
  try {
    reply = await postJson(settings.url, {
      boothSlug: settings.boothSlug,
      sentAt: new Date().toISOString(),
      version: require("../package.json").version,
      uptimeSeconds: Math.round(process.uptime()),
      snapshot,
      events: batch.map(e => {
        const { date, ...rest } = e;      // `date` is a parse artefact, not data
        return rest;
      }),
    }, { "x-booth-key": settings.boothKey });
  } catch (e) {
    consecutiveFailures++;
    // Say it once, then go quiet: a booth offline for a day should not write
    // 2,880 identical lines into server.log.
    if (consecutiveFailures === 1 || consecutiveFailures % 60 === 0) {
      console.warn(`[cloud] cannot reach the dashboard (${consecutiveFailures}x): ${e.message}` +
        (consecutiveFailures === 1 ? " - the booth keeps working, events are queued on disk" : ""));
    }
    return;
  }

  if (consecutiveFailures > 0) {
    console.log(`[cloud] back online after ${consecutiveFailures} failed attempt(s), ${batch.length} event(s) delivered`);
    consecutiveFailures = 0;
  }
  lastOkAt = new Date().toISOString();

  // Advance only on an explicit acknowledgement.
  if (reply && reply.acceptedThrough && batch.length) {
    const last = batch[batch.length - 1];
    if (reply.acceptedThrough === last.id) writeJson(CURSOR, { lastAt: last.at, lastId: last.id });
  }

  const commands = (reply && Array.isArray(reply.commands)) ? reply.commands : [];
  if (!commands.length) return;

  const results = [];
  for (const cmd of commands) results.push(await runCommand(cmd));

  try {
    await postJson(settings.url, {
      boothSlug: settings.boothSlug,
      sentAt: new Date().toISOString(),
      commandResults: results,
    }, { "x-booth-key": settings.boothKey });
  } catch (e) {
    // The command ran; only the receipt was lost. The dashboard re-issues
    // after a timeout, which is why every handler must be safe to repeat.
    console.warn("[cloud] command results could not be delivered: " + e.message);
  }
}

/* ---------- lifecycle ------------------------------------------------ */

function loadSettings() {
  const raw = readJson(CONF, null);
  if (!raw || !raw.url || !raw.boothKey) return null;
  return {
    url: raw.url,
    boothKey: raw.boothKey,
    boothSlug: raw.boothSlug || "fr-anz",
    intervalSeconds: Number(raw.intervalSeconds) || REPORT_SECONDS,
  };
}

/**
 * Tell the dashboard this was a deliberate stop, not a crash.
 *
 * Called by STOP-BOOTH.bat *before* it kills anything, and that is not a
 * style choice. Windows has no signals: STOP-BOOTH ends the server with
 * Stop-Process -Force, which is TerminateProcess -- no SIGTERM is delivered
 * and no handler in this process ever runs. The only reliable moment to say
 * goodbye is while the batch file is still in charge.
 *
 * Without this, every normal closing time looks exactly like the PC dying.
 */
async function notifyShutdown(reason = "stop-booth") {
  const s = loadSettings();
  if (!s) return false;
  try {
    await postJson(s.url, {
      boothSlug: s.boothSlug,
      sentAt: new Date().toISOString(),
      cleanShutdown: true,
      reason,
    }, { "x-booth-key": s.boothKey });
    return true;
  } catch (e) { return false; }
}

function start(commandHandlers = {}) {
  handlers = commandHandlers;

  settings = loadSettings();
  if (!settings) {
    console.log("[cloud] not configured (data/cloud.json missing) - running standalone, nothing is sent");
    return false;
  }

  console.log(`[cloud] reporting to ${new URL(settings.url).host} every ${settings.intervalSeconds}s as "${settings.boothSlug}"`);

  const run = () => { tick().catch(e => console.warn("[cloud] tick failed: " + e.message)); };
  setTimeout(run, 3000);                                    // let the booth finish starting
  timer = setInterval(run, settings.intervalSeconds * 1000);
  timer.unref && timer.unref();                             // never hold the process open

  // Ctrl+C during development, and any platform that actually delivers
  // signals. On the booth PC this never fires -- see notifyShutdown().
  const goodbye = signal => {
    events.log("booth_stopping", { signal });
    notifyShutdown("signal:" + signal).finally(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();        // never hang on a dead line
  };
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => goodbye(sig));

  return true;
}

function status() {
  return { configured: !!settings, lastOkAt, consecutiveFailures, pending: settings ? pendingEvents().length : 0 };
}

module.exports = { start, status, tick, notifyShutdown };
