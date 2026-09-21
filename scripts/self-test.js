/* =====================================================================
   Does the booth software still do what it is supposed to?

   Exercises the parts that are easy to break by accident and expensive to
   discover at a guest's expense: voucher codes, the two special codes and
   their daily limit, the statistics, and building a strip end to end.

   Touches no hardware, so it runs anywhere. It uses a temporary data
   folder and puts the real one back afterwards, so a run cannot cost
   anybody a voucher -- which is only true while the booth is STOPPED, so
   it refuses to start otherwise (see park() below).

   Exit code 0 = everything passed.
   ===================================================================== */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = path.join(__dirname, "..");
process.chdir(ROOT);

/* Run against a scratch data folder. The live one is moved aside first --
   the codes in it are money and a test must never be able to spend them.

   This used to say it was safe to run on the booth while it was live, and
   it was the opposite. A running booth holds data\server.log open (the
   ">>" in _server-loop.bat), and Windows will not rename a folder with an
   open file in it. The rename failed, the error was swallowed, and the
   test went on against the LIVE store: minting 500 real codes, spending
   some, resetting every used card to valid -- and then restore() deleted
   the folder it believed was its scratch copy. Icon 11 on the booth's
   desktop was one click away from all of that.

   Now it asks first and gives up on any doubt, before touching anything. */
const net = require("net");
const LIVE = path.join(ROOT, "data");
const PARKED = LIVE + ".selftest-" + Date.now();
let parked = false;   // the live folder has been moved aside
let scratch = false;  // LIVE now holds nothing but this run's scratch data

function refuse(why) {
  console.log("\n  " + why);
  console.log("  Nothing was changed.\n");
  process.exit(2);
}

// Something answering on the booth's port is the booth.
function boothIsRunning(port) {
  return new Promise(resolve => {
    const sock = net.connect({ port, host: "127.0.0.1" });
    const done = v => { sock.destroy(); resolve(v); };
    sock.once("connect", () => done(true));
    sock.once("error", () => done(false));
    sock.setTimeout(800, () => done(false));
  });
}

async function park() {
  const { PORT } = require("../config");
  if (await boothIsRunning(PORT)) {
    refuse("The booth is running. Stop it first (icon 2 - STOP PHOTOBOOTH), then run the self-test again.");
  }
  if (fs.existsSync(LIVE)) {
    try { fs.renameSync(LIVE, PARKED); parked = true; }
    catch (e) {
      refuse(`Could not move the data folder aside (${e.code || e.message}). ` +
             "Is the booth still running? Stop it (icon 2 - STOP PHOTOBOOTH) and try again.");
    }
  }
  fs.mkdirSync(LIVE, { recursive: true });
  scratch = true;
}

function restore() {
  if (!scratch) return;   // never delete a folder this run did not create
  try { fs.rmSync(LIVE, { recursive: true, force: true }); } catch (e) {}
  if (parked) {
    try { fs.renameSync(PARKED, LIVE); }
    catch (e) {
      // Say so loudly: a booth started now would start with no codes.
      console.log("\n  !!! Could not put the real data back (" + (e.code || e.message) + ").");
      console.log("  !!! It is safe in:  " + PARKED);
      console.log("  !!! Rename that folder back to 'data' BEFORE starting the booth.\n");
    }
  }
}

let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log("  ok    " + name); passed++; }
  catch (e) { console.log("  FAIL  " + name + "\n        " + e.message); throw e; }
};

(async () => {
  await park();           // before any module below can open the data folder
  const codes = require("../src/codes");
  const special = require("../src/specialcodes");
  const stats = require("../src/stats");
  const config = require("../config");
  const { buildStrip } = require("../src/strip");

  console.log("\n  fr-anz photobooth - self test\n");

  const c = codes.specialCodes();

  check("the two special codes exist and differ", () => {
    assert(/^\d{6}$/.test(c.masterCode) && /^\d{6}$/.test(c.staffCode));
    assert(c.masterCode !== c.staffCode);
  });

  check("the old public master code is dead", () => {
    assert.strictEqual(codes.validateAndRedeem("731790").valid, false);
  });

  check("master code works repeatedly and is never used up", () => {
    for (let i = 0; i < 5; i++) assert.strictEqual(codes.validateAndRedeem(c.masterCode).kind, "master");
  });

  check("staff code stops after its daily allowance", () => {
    for (let i = 0; i < c.staffUsesPerDay; i++) assert(codes.validateAndRedeem(c.staffCode).valid);
    assert.strictEqual(codes.validateAndRedeem(c.staffCode).reason, "staff_limit");
  });

  check("a staff use comes back only for a failed session", () => {
    assert.strictEqual(codes.release(c.staffCode).released, false);
    assert.strictEqual(codes.release(c.staffCode, { fromFailedSession: true }).released, true);
  });

  check("generated vouchers never collide with the special codes", () => {
    codes.generateBatch(500);
    const u = codes.unusedCodes();
    assert(!u.includes(c.masterCode) && !u.includes(c.staffCode));
    assert(u.length >= 499);
  });

  check("a new batch hands back its codes, so the dashboard can print cards", () => {
    const r = codes.generateBatch(7);
    assert(Array.isArray(r.codes) && r.codes.length === 7, "no codes in the result");
    assert(r.codes.every(v => /^\d{6}$/.test(v)), "a code is not six digits");
    assert(new Set(r.codes).size === 7, "the batch repeats a code");
    assert(!r.codes.includes(c.masterCode) && !r.codes.includes(c.staffCode));
    // Every one of them has to be in the store and spendable.
    const unused = new Set(codes.unusedCodes());
    assert(r.codes.every(v => unused.has(v)), "a returned code is not in the store");
  });

  check("a voucher is valid exactly once", () => {
    const v = codes.unusedCodes()[0];
    assert.strictEqual(codes.validateAndRedeem(v).valid, true);
    assert.strictEqual(codes.validateAndRedeem(v).reason, "already_used");
  });

  check("redemptions are counted correctly", () => {
    assert.strictEqual(stats.collect(codes.stats()).redemptions.total, 1);
  });

  check("a released code is not logged in full to the cloud's event stream", () => {
    // Read the source: the release handlers run inside the server, which
    // this test does not start. Crude, but it catches the one regression
    // that matters -- `{ code, ...}` creeping back into the logged fields.
    const src = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
    const calls = src.match(/events\.log\("code_released_by_staff",\s*\{[^}]*\}/g) || [];
    assert(calls.length >= 2, "the release log calls were not found");
    for (const c of calls) assert(!/\{\s*code\s*[,}]|[,\s]code\s*[,}]/.test(c.replace(/codeEnd/g, "")),
      "a release event logs the full code: " + c);
  });

  check("no plain voucher codes leave the booth in the snapshot", () => {
    const snap = JSON.stringify(stats.collect(codes.stats()));
    for (const v of codes.unusedCodes().slice(0, 30)) assert(!snap.includes(v));
  });

  check("the statistics have every section the dashboard reads", () => {
    const s = stats.collect(codes.stats());
    for (const k of ["codes","printer","hotFolder","capacity","prints","funnel","rejects","batches","money","charts","alerts","special"]) {
      assert(s[k] !== undefined, "missing " + k);
    }
    assert(Array.isArray(s.charts.heatmap) && s.charts.heatmap.length === 7);
  });

  check("a booth key survives being read out over the phone", () => {
    const k = require("../src/cloudkey");
    const key = k.generate();
    assert(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key), "unexpected shape " + key);
    assert([...key.replace(/-/g, "")].every(ch => k.ALPHABET.includes(ch)), "confusable character in " + key);
    // every way a person might type it lands on the same hash
    const sloppy = key.toLowerCase().replace(/-/g, " ");
    assert.strictEqual(k.normalize(sloppy), key);
    assert.strictEqual(k.hash(sloppy), k.hash(key));
    assert.strictEqual(k.hash(key.replace(/-/g, "")), k.hash(key));
    // the same digest the Edge Function computes: sha256 hex of the key as sent
    assert.strictEqual(k.hash(key), require("crypto").createHash("sha256").update(key).digest("hex"));
    // an old-style long key is left exactly alone
    const old = "xa0VC8QgqCZW6yska1b9CLNzT_Q12vC7";
    assert.strictEqual(k.normalize(old), old);
  });

  check("the paper count counts down from the newest reading", () => {
    const media = require("../src/media");
    const events = require("../src/events");

    /* Readings and prints are ordered by their millisecond timestamps, so a
       test that logs both inside one millisecond cannot say which came
       first -- and failed at random because of it, about one run in three.
       A real roll change and the next print are seconds apart. Waiting for
       the clock to move gives the test the same unambiguous order. */
    const tick = () => { const t0 = Date.now(); while (Date.now() === t0) { /* spin */ } };

    media.set(media.PER_ROLL, "new_roll");
    assert.strictEqual(media.estimate(null).remaining, media.PER_ROLL);
    tick();

    events.log("print_ok", { kind: "guest", printed: true });
    events.log("print_ok", { kind: "guest", printed: true });
    events.log("print_ok", { kind: "staff", printed: true });
    events.log("print_ok", { kind: "guest", printed: false });    // preview mode: no paper
    events.log("test_print", { ok: true, printed: true });
    const e = media.estimate(null);
    assert.strictEqual(e.remaining, media.PER_ROLL - 4, "only sheets that reached the printer count");

    // an older printer reading loses to the newer roll; a newer one wins
    const old = { found: true, online: true, sheets: 123, at: "2020-01-01T00:00:00.000Z" };
    assert.strictEqual(media.estimate(old).base.source, "new_roll");
    const fresh = { found: true, online: true, sheets: 321, at: new Date(Date.now() + 60000).toISOString() };
    assert.strictEqual(media.estimate(fresh).remaining, 321);
    // a status written while the printer was not healthy is no reading at all
    assert.strictEqual(media.estimate({ ...fresh, online: false }).base.source, "new_roll");

    tick();
    media.set(120, "entered");
    const st = stats.collect(codes.stats());
    assert.strictEqual(st.printer.sheets, 120);
    assert.strictEqual(st.printer.strips, 240);
    // everything downstream in sheets: one voucher is one sheet
    assert.strictEqual(st.capacity.possible, Math.min(120, codes.stats().unused));
    if (st.capacity.perDay > 0.2) {
      assert.strictEqual(st.capacity.daysLeft, Math.round(120 / st.capacity.perDay), "days left must be sheets / sheets per day");
    }
    let refused = false;
    try { media.set("lots", "entered"); } catch (err) { refused = true; }
    assert(refused, "a nonsense count was accepted");
  });

  check("the dashboard's paper field does what the control page does", () => {
    const media = require("../src/media");
    const refuses = params => { try { media.fromCommand(params); return false; } catch (e) { return true; } };

    const roll = media.fromCommand({ newRoll: true });
    assert.strictEqual(roll.remaining, media.PER_ROLL); assert.strictEqual(roll.source, "new_roll");
    const typed = media.fromCommand({ remaining: 412 });
    assert.strictEqual(typed.remaining, 412); assert.strictEqual(typed.source, "entered");
    assert.strictEqual(media.estimate(null).remaining, 412, "the entered count is not the one the booth counts from");

    // A typo, a word, nothing at all, and a count past two full rolls.
    assert(refuses({ remaining: 7000 }), "7000 sheets was accepted");
    assert(refuses({ remaining: "lots" }), "a word was accepted");
    assert(refuses({}), "an empty command was accepted");
    assert(refuses({ remaining: -3 }), "a negative count was accepted");
    // Only a real boolean means a new roll. "true" as text must not quietly
    // reset the count to a full roll.
    assert(refuses({ newRoll: "true" }), "the string \"true\" was taken as a new roll");
    assert.strictEqual(media.estimate(null).remaining, 412, "a refused command changed the count");
  });

  check("a paper count that arrives late is dated when it was read", () => {
    const media = require("../src/media");
    const events = require("../src/events");
    const tick = () => { const t0 = Date.now(); while (Date.now() === t0) { /* spin */ } };

    // 10:00 -- Trueman reads 500 off the Status App; the wifi is down, so
    // the command waits in the cloud while the booth keeps printing.
    tick();
    const readAt = new Date().toISOString();
    tick();
    for (let i = 0; i < 3; i++) events.log("print_ok", { kind: "guest", printed: true });
    tick();
    // 13:00 -- the wifi is back and the command finally arrives.
    const late = media.fromCommand({ remaining: 500, at: readAt });
    assert.strictEqual(late.remaining, 497, "the prints made while it waited were not subtracted");

    // Someone entered a newer count on the booth itself in the meantime:
    // the older one from the phone must not overwrite it.
    tick();
    media.set(300, "entered");
    tick();
    const stale = media.fromCommand({ remaining: 650, at: readAt });
    assert.strictEqual(stale.superseded, true, "an older count was applied over a newer one");
    assert.strictEqual(media.estimate(null).remaining, 300, "the newer count was overwritten");

    // A phone clock running an hour fast cannot date a reading into the future.
    tick();
    media.fromCommand({ remaining: 200, at: new Date(Date.now() + 3600e3).toISOString() });
    assert(Date.parse(media.estimate(null).base.at) <= Date.now(), "a reading was dated in the future");
    assert.strictEqual(media.estimate(null).remaining, 200);
  });

  check("a reset makes every code valid again for a reprint", () => {
    const { execFileSync } = require("child_process");
    const run = extra => execFileSync(process.execPath, ["scripts/reset-codes.js", ...extra], { stdio: "pipe" });

    const spent = codes.stats().usedList[0].code;            // redeemed further up
    assert.strictEqual(codes.validateAndRedeem(spent).reason, "already_used");
    const before = codes.stats();

    run(["--dry-run"]);
    assert.deepStrictEqual(codes.stats().used, before.used, "a dry run changed the store");

    run([]);
    const after = codes.stats();
    assert.strictEqual(after.total, before.total, "codes were lost");
    assert.strictEqual(after.used, 0, "redemptions survived the reset");
    assert.strictEqual(after.batches.length, 1, "the reprint should be one batch");
    assert.strictEqual(codes.validateAndRedeem(spent).valid, true, "a spent code did not come back");
    assert.strictEqual(codes.validateAndRedeem(spent).reason, "already_used", "and it must still work only once");
    assert(fs.readdirSync("data").some(f => f.startsWith("codes.json.before-reset-")), "no backup written");

    // the special codes do not live in the store and must come through untouched
    assert.strictEqual(codes.validateAndRedeem(c.masterCode).kind, "master");
  });

  await (async () => {
    try {
      const pool = fs.readdirSync(config.paths.testPhotos)
        .filter(f => /\.(jpe?g|png)$/i.test(f)).sort()
        .map(f => path.join(config.paths.testPhotos, f));
      assert(pool.length, "no test photos");
      const out = path.join(os.tmpdir(), "selftest-strip-" + Date.now() + ".png");
      await buildStrip([0, 1, 2].map(i => pool[i % pool.length]), out);
      assert(fs.statSync(out).size > 50000, "strip suspiciously small");
      fs.rmSync(out, { force: true });
      console.log("  ok    a printable strip can be built");
      passed++;
    } catch (e) { console.log("  FAIL  building a strip\n        " + e.message); throw e; }
  })();

  /* The look-matcher has to be able to recover settings it did not see.
     Its first version could not: it matched one colour, reported numbers
     that were all wrong, and looked confident doing it. */
  await (async () => {
    try {
      const { execFileSync } = require("child_process");
      const Jimp = require("jimp");
      const cfg = require("../config");
      const pool = fs.readdirSync(cfg.paths.testPhotos)
        .filter(f => /\.(jpe?g|png)$/i.test(f)).sort()
        .map(f => path.join(cfg.paths.testPhotos, f));

      const sess = path.join(cfg.paths.sessions, "selftest");
      fs.mkdirSync(sess, { recursive: true });
      pool.slice(0, 3).forEach((src, i) => fs.copyFileSync(src, path.join(sess, `photo_${i + 1}.jpg`)));

      const TRUE = { magenta: 0.30, sat: 1.10, exposure: 0.95 };
      const keep = { m: cfg.strip.grade.magenta, s: cfg.strip.grade.sat, e: cfg.strip.tone.exposure };
      cfg.strip.grade.magenta = TRUE.magenta;
      cfg.strip.grade.sat = TRUE.sat;
      cfg.strip.tone.exposure = TRUE.exposure;
      const ref = path.join(os.tmpdir(), "selftest-ref-" + Date.now() + ".png");
      await buildStrip(pool.slice(0, 3), ref);
      cfg.strip.grade.magenta = keep.m; cfg.strip.grade.sat = keep.s; cfg.strip.tone.exposure = keep.e;

      const out = execFileSync(process.execPath,
        [path.join(__dirname, "match-look.js"), ref, sess], { encoding: "utf8" });
      const num = k => Number((out.match(new RegExp(k + "\\s*:\\s*([\\d.]+)")) || [])[1]);
      const got = { magenta: num("magenta"), sat: num("sat"), exposure: num("exposure") };

      for (const k of Object.keys(TRUE)) {
        assert(Math.abs(got[k] - TRUE[k]) <= 0.06,
          `${k}: recovered ${got[k]}, built with ${TRUE[k]}`);
      }
      fs.rmSync(ref, { force: true });
      fs.rmSync(sess, { recursive: true, force: true });
      console.log("  ok    the look-matcher recovers settings it was not told");
      passed++;
    } catch (e) {
      console.log("  FAIL  the look-matcher\n        " + e.message);
      throw e;
    }
  })();

  console.log("\n  " + passed + " checks passed. The software side is healthy.");
  console.log("  (This says nothing about the camera or printer -- use CHECK-PRINTER for those.)\n");
})()
  .then(() => { restore(); process.exit(0); })
  .catch(e => { restore(); console.error("\n  SELF TEST FAILED: " + e.message + "\n"); process.exit(1); });
