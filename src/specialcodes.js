/* =====================================================================
   specialcodes.js -- the two codes that are NOT vouchers.

     MASTER  (owner)  unlimited, never burned. For you.
     STAFF   (crew)   works N times per calendar day, then it is done
                      until midnight. For the morning sample strip.

   ---------------------------------------------------------------------
   WHY THEY LIVE IN A FILE AND NOT IN config.js
   ---------------------------------------------------------------------
   The old master code sat in src/codes.js as a plain constant, and that
   file is on public GitHub -- anyone who found the repo could print for
   free. A 6-digit code cannot be protected by hashing either (a laptop
   tries all million in well under a second), so the only real protection
   is: never commit it. Both codes therefore live in data/secrets.json,
   which .gitignore blocks, and travel to the booth exactly never.

   That leaves the question of how the booth gets its codes after a fresh
   clone. Answer: it makes its own. On first start, if the file is missing,
   two random codes are generated and printed to the log; /admin shows them
   from then on. Staff read them off the control centre. Nothing to copy,
   nothing to forget, and no secret ever goes through git.

   To pick the codes by hand instead: node scripts/set-codes.js --help
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const config = require("../config");

const LEN = 6;
const FILE  = path.join(__dirname, "..", "data", "secrets.json");
const USAGE = path.join(__dirname, "..", "data", "staff-usage.json");

const DEFAULT_STAFF_USES_PER_DAY = 2;

/* ---------- tiny atomic-write helpers (same rule as codes.js) -------- */

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { return fallback; }
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);                       // atomic on the same volume
}

function randomCode() {
  return String(crypto.randomInt(0, Math.pow(10, LEN))).padStart(LEN, "0");
}

/* ---------- the secrets file ---------------------------------------- */

let cache = null;

/**
 * Codes pinned in config.js win over the generated ones.
 *
 * That file is committed, so pinning them puts them in the repository --
 * which is the thing this module was written to avoid. It is offered
 * anyway because typing six digits twice on a 1024x600 touchscreen is its
 * own kind of failure, and the owner made that trade knowingly. Remove
 * the config block and the gitignored secrets file takes over again.
 */
function pinned() {
  const c = config.codes;
  if (!c) return null;
  const m = String(c.master || "").trim();
  const s = String(c.staff || "").trim();
  if (!/^\d{6}$/.test(m) || !/^\d{6}$/.test(s) || m === s) return null;
  return {
    masterCode: m,
    staffCode: s,
    staffUsesPerDay: Number(c.staffUsesPerDay) > 0 ? Number(c.staffUsesPerDay) : DEFAULT_STAFF_USES_PER_DAY,
    source: "config.js",
  };
}

/**
 * Every voucher currently in the store, read straight off disk.
 *
 * Read here rather than accepted from the caller, and that is the whole
 * point. It used to be a parameter, which meant the exclusion below only
 * happened if codes.js got to load() first -- and it does not: stats.js
 * requires this module directly and reaches staffQuota() during the very
 * first heartbeat, priming the cache with an EMPTY set. A master code
 * could then be minted on top of a card already in someone's wallet, and
 * because kindOf() is checked before the store, that card would print
 * forever without ever burning. Reading the file makes the guard
 * unconditional.
 */
function vouchersOnDisk() {
  try {
    const db = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "codes.json"), "utf8"));
    return new Set(Object.keys(db.codes || {}));
  } catch (e) {
    return new Set();          // no store yet: nothing to collide with
  }
}

/**
 * Load both codes, creating them on first run.
 *
 * `extraTaken` is merged on top of what is already on disk -- callers can
 * add to the exclusion set, but can never shrink it.
 */
function load(extraTaken = new Set()) {
  if (cache) return cache;

  const fixed = pinned();
  if (fixed) return (cache = fixed);

  let s = readJson(FILE, null);
  let created = false;

  if (!s || !/^\d{6}$/.test(String(s.masterCode || "")) || !/^\d{6}$/.test(String(s.staffCode || ""))) {
    const taken = vouchersOnDisk();
    for (const c of extraTaken) taken.add(c);
    const pick = () => { let c; do { c = randomCode(); } while (taken.has(c)); return c; };
    const masterCode = pick();
    let staffCode; do { staffCode = pick(); } while (staffCode === masterCode);
    s = {
      masterCode,
      staffCode,
      staffUsesPerDay: DEFAULT_STAFF_USES_PER_DAY,
      createdAt: new Date().toISOString(),
    };
    writeJson(FILE, s);
    created = true;
  }

  s.staffUsesPerDay = Number(s.staffUsesPerDay) > 0 ? Number(s.staffUsesPerDay) : DEFAULT_STAFF_USES_PER_DAY;
  cache = s;

  if (created) {
    console.log("──────────────────────────────────────────────");
    console.log("  NEW BOOTH CODES GENERATED (data/secrets.json)");
    console.log(`  master code  ${s.masterCode}   unlimited, owner only`);
    console.log(`  staff code   ${s.staffCode}   ${s.staffUsesPerDay}x per day`);
    console.log("  Both are also shown on /admin. Do not put them in git.");
    console.log("──────────────────────────────────────────────");
  }
  return cache;
}

/** Drop the cache so a code change takes effect without a restart. */
function reload() { cache = null; return load(); }

/* ---------- the staff daily allowance ------------------------------- */

/**
 * Local calendar day. Deliberately the booth PC's own clock and not UTC:
 * "twice a day" has to mean the day the crew is standing in, and the booth
 * is set to Bali time. A UTC boundary would roll over at 08:00 local and
 * hand out a second allowance in the middle of the morning shift.
 */
function today() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function usage() {
  const u = readJson(USAGE, null);
  if (!u || u.date !== today()) return { date: today(), used: 0 };
  return { date: u.date, used: Number(u.used) || 0 };
}

/** How the staff code stands right now -- for /admin and the dashboard. */
function staffQuota() {
  const s = load();
  const u = usage();
  return { used: u.used, limit: s.staffUsesPerDay, left: Math.max(0, s.staffUsesPerDay - u.used), date: u.date };
}

/** Spend one staff use. Returns false when today's allowance is gone. */
function spendStaffUse() {
  const s = load();
  const u = usage();
  if (u.used >= s.staffUsesPerDay) return false;
  writeJson(USAGE, { date: u.date, used: u.used + 1 });
  return true;
}

/**
 * Give a staff use back -- the camera or printer died, so the crew never got
 * their strip. Same courtesy the guest vouchers get in codes.release().
 *
 * Only ever called for a session that actually failed (see codes.release).
 * Wiring it to the staff-facing "release a code" button instead would turn
 * "twice a day" into "as often as you like": press it twice and the
 * allowance is back at zero used.
 */
function refundStaffUse() {
  const u = usage();
  if (u.used <= 0) return false;
  writeJson(USAGE, { date: u.date, used: u.used - 1 });
  return true;
}

/* ---------- what the rest of the app asks ---------------------------- */

/** "master" | "staff" | null -- which special code is this, if any. */
function kindOf(input) {
  const code = String(input || "").trim();
  if (!/^\d{6}$/.test(code)) return null;
  const s = load();
  if (code === s.masterCode) return "master";
  if (code === s.staffCode) return "staff";
  return null;
}

/** Both codes, so voucher batches can steer clear of them. */
function reserved() {
  const s = load();
  return new Set([s.masterCode, s.staffCode]);
}

function codes() {
  const s = load();
  return { masterCode: s.masterCode, staffCode: s.staffCode, staffUsesPerDay: s.staffUsesPerDay };
}

/** Write chosen codes (used by scripts/set-codes.js). */
function setCodes({ masterCode, staffCode, staffUsesPerDay }) {
  const s = { ...load() };
  if (masterCode) s.masterCode = String(masterCode);
  if (staffCode) s.staffCode = String(staffCode);
  if (staffUsesPerDay) s.staffUsesPerDay = Number(staffUsesPerDay);
  if (s.masterCode === s.staffCode) throw new Error("master and staff code must differ");
  for (const c of [s.masterCode, s.staffCode]) {
    if (!/^\d{6}$/.test(c)) throw new Error("codes must be exactly 6 digits: " + c);
  }
  s.updatedAt = new Date().toISOString();
  writeJson(FILE, s);
  cache = null;
  return codes();
}

module.exports = { kindOf, reserved, codes, setCodes, staffQuota, spendStaffUse, refundStaffUse, reload, FILE };
