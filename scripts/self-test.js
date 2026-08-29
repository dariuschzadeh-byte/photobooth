/* =====================================================================
   Does the booth software still do what it is supposed to?

   Exercises the parts that are easy to break by accident and expensive to
   discover at a guest's expense: voucher codes, the two special codes and
   their daily limit, the statistics, and building a strip end to end.

   Touches no hardware, so it runs anywhere -- including on the booth PC
   while it is live. It uses a temporary data folder and puts the real one
   back afterwards, so a run cannot cost anybody a voucher.

   Exit code 0 = everything passed.
   ===================================================================== */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = path.join(__dirname, "..");
process.chdir(ROOT);

/* Run against a scratch data folder. The live one is moved aside first --
   the codes in it are money and a test must never be able to spend them. */
const LIVE = path.join(ROOT, "data");
const PARKED = LIVE + ".selftest-" + Date.now();
let parked = false;
try { if (fs.existsSync(LIVE)) { fs.renameSync(LIVE, PARKED); parked = true; } } catch (e) {}
fs.mkdirSync(LIVE, { recursive: true });

function restore() {
  try { fs.rmSync(LIVE, { recursive: true, force: true }); } catch (e) {}
  if (parked) { try { fs.renameSync(PARKED, LIVE); } catch (e) {} }
}

let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log("  ok    " + name); passed++; }
  catch (e) { console.log("  FAIL  " + name + "\n        " + e.message); throw e; }
};

(async () => {
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

  check("a voucher is valid exactly once", () => {
    const v = codes.unusedCodes()[0];
    assert.strictEqual(codes.validateAndRedeem(v).valid, true);
    assert.strictEqual(codes.validateAndRedeem(v).reason, "already_used");
  });

  check("redemptions are counted correctly", () => {
    assert.strictEqual(stats.collect(codes.stats()).redemptions.total, 1);
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

  console.log("\n  " + passed + " checks passed. The software side is healthy.");
  console.log("  (This says nothing about the camera or printer -- use CHECK-PRINTER for those.)\n");
})()
  .then(() => { restore(); process.exit(0); })
  .catch(e => { restore(); console.error("\n  SELF TEST FAILED: " + e.message + "\n"); process.exit(1); });
