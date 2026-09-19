/* =====================================================================
   codes.js -- voucher validation, single-use redemption, tracking
   ---------------------------------------------------------------------
   - Two special codes bypass the voucher store entirely (see
     src/specialcodes.js): MASTER never runs out, STAFF works a fixed
     number of times per day. Neither is ever printed on a card, and
     neither lives in this file any more -- they were on public GitHub.
   - A real card code is valid exactly ONCE. After redemption it is
     marked "used" with a timestamp and cannot be used again.
   - release() gives a burned code back (failed session or staff action
     from /admin) so the guest can retry.
   - Every redemption/release is appended to data/redemptions.log.
   - Saves are atomic (tmp file + rename): a crash mid-write can never
     leave a half-written codes.json behind.
   ===================================================================== */

const fs = require("fs");
const path = require("path");

const special = require("./specialcodes");
const FILE = path.join(__dirname, "..", "data", "codes.json");
const LOG  = path.join(__dirname, "..", "data", "redemptions.log");

/**
 * The special codes are generated on first run, and must not land on a code
 * that is already printed on someone's card. They therefore need to see the
 * voucher store -- but only once, and only after it has been read, which is
 * why this is lazy instead of a plain require-time call.
 */
let specialReady = false;
function sc() {
  if (!specialReady) {
    specialReady = true;                                // set first: load() must not recurse
    try { special.load(new Set(Object.keys(load().codes))); } catch (e) {}
  }
  return special;
}

function load() {
  if (!fs.existsSync(FILE)) return { batches: [], codes: {} };
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch (e) {
    // Corrupt store (e.g. crash mid-write before saves were atomic):
    // keep the broken file for recovery and fail open with an empty store,
    // so the booth keeps running via the master code. Nothing writes over
    // the backup until a code is actually redeemed again.
    try { fs.copyFileSync(FILE, FILE + ".corrupt-" + Date.now()); } catch (e2) {}
    console.error("[codes] codes.json unreadable -- backed up, starting empty:", e.message);
    return { batches: [], codes: {} };
  }
}

function save(db) {
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, FILE);                           // atomic on the same volume
}

function logLine(text) {
  try { fs.appendFileSync(LOG, text + "\n"); } catch (e) { /* logging must never break the flow */ }
}

function validateAndRedeem(input) {
  const code = String(input || "").trim();

  const kind = sc().kindOf(code);

  if (kind === "master") {
    return { valid: true, special: true, kind: "master" };   // never burned
  }

  if (kind === "staff") {
    // Spend first, then report. If the session later fails, /api/release
    // hands the use back -- exactly what happens to a guest voucher.
    if (!sc().spendStaffUse()) {
      const quota = sc().staffQuota();
      logLine(`${new Date().toISOString()}  ${code}  STAFF DENIED  ${quota.used}/${quota.limit} today`);
      return { valid: false, reason: "staff_limit", quota };
    }
    const quota = sc().staffQuota();
    logLine(`${new Date().toISOString()}  ${code}  STAFF USED  ${quota.used}/${quota.limit} today`);
    return { valid: true, special: true, kind: "staff", quota };
  }

  if (!/^\d{6}$/.test(code)) {
    return { valid: false, reason: "invalid" };
  }

  const db = load();
  const entry = db.codes[code];
  if (!entry) return { valid: false, reason: "invalid" };
  if (entry.status === "used") {
    return { valid: false, reason: "already_used", usedAt: entry.usedAt };
  }
  // From a batch that has been replaced. Kept in the store rather than
  // deleted so it can never be minted again -- see retireAll().
  if (entry.retired) return { valid: false, reason: "retired" };

  entry.status = "used";
  entry.usedAt = new Date().toISOString();
  save(db);
  logLine(`${entry.usedAt}  ${code}  REDEEMED  batch:${entry.batch}`);
  return { valid: true };
}

/**
 * Give a burned code back.
 *
 * `fromFailedSession` matters for the staff code and only for the staff
 * code. A session that died gets its daily use back, which is fair. The
 * same call reachable from a button -- /admin or the cloud dashboard --
 * would not be: pressing it twice puts the allowance back to zero used and
 * "twice a day" means nothing. Guest vouchers have no such limit to game,
 * so they are released either way.
 */
function release(input, { fromFailedSession = false } = {}) {
  const code = String(input || "").trim();
  const kind = sc().kindOf(code);

  if (kind === "master") return { released: false, reason: "master" };
  if (kind === "staff") {
    if (!fromFailedSession) return { released: false, reason: "staff_quota_not_refundable", kind: "staff" };
    const ok = sc().refundStaffUse();
    if (ok) logLine(`${new Date().toISOString()}  ${code}  STAFF REFUNDED`);
    return { released: ok, reason: ok ? null : "nothing_to_refund", kind: "staff" };
  }

  const db = load();
  const entry = db.codes[code];
  if (!entry) return { released: false, reason: "unknown" };
  // The /admin list offers a release button on every redemption. After a
  // reset that list would otherwise be 250 old cards waiting to be
  // brought back one click at a time.
  if (entry.retired) return { released: false, reason: "retired" };
  if (entry.status !== "used") return { released: false, reason: "not_used" };

  entry.status = "unused";
  entry.usedAt = null;
  save(db);
  logLine(`${new Date().toISOString()}  ${code}  RELEASED  batch:${entry.batch}`);
  return { released: true };
}

function stats() {
  const db = load();
  const all = Object.entries(db.codes);
  /* The counts are about the cards that can still be handed out, so a
     retired batch is left out of them -- otherwise a fresh batch of 250
     on top of 250 spent ones opens at "50 percent left" and the low-codes
     alarm fires on the wrong number.

     usedList keeps every redemption ever, retired or not, because the
     per-batch economics (how fast a batch comes back) are history and
     should survive a reset. Each entry says whether it is retired, so the
     page that offers "release" can leave those out. It stays the ONE list
     of plain codes on purpose: publicCodeStats() strips it by name before
     anything leaves this PC, and a second list would not be stripped. */
  const active = all.filter(([, e]) => !e.retired);
  const used = active.filter(([, e]) => e.status === "used");
  const unused = active.length - used.length;
  return {
    total: active.length,
    used: used.length,
    unused,
    remaining: unused,
    retired: all.length - active.length,
    batches: db.batches,
    usedList: all
      .filter(([, e]) => e.status === "used")
      .map(([code, e]) => ({ code, usedAt: e.usedAt, batch: e.batch, retired: !!e.retired }))
      .sort((a, b) => (a.usedAt < b.usedAt ? 1 : -1)),
  };
}

/** Every code that has not been redeemed yet -- these are worth printing. */
function unusedCodes() {
  const db = load();
  return Object.entries(db.codes)
    .filter(([, e]) => e.status !== "used" && !e.retired)
    .map(([code]) => code)
    .sort();
}

/**
 * Take every code currently in the store out of service, for a new card
 * batch replacing the old one.
 *
 * Retired, not deleted. A deleted code is a code the generator is free to
 * mint again, and the old card carrying it -- used or not -- would start
 * working the day it came back. Kept in the store, every future batch is
 * checked against it automatically, because both generators and the
 * importer already refuse anything the store knows.
 *
 * Status is left exactly as it was: used stays used, so the history of how
 * a batch was spent is intact. Returns what was retired.
 */
function retireAll(db, when) {
  const at = when || new Date().toISOString();
  let used = 0, unused = 0;
  for (const e of Object.values(db.codes)) {
    if (e.retired) continue;
    e.retired = true;
    e.retiredAt = at;
    if (e.status === "used") used++; else unused++;
  }
  for (const b of db.batches || []) if (!b.retired) { b.retired = true; b.retiredAt = at; }
  return { used, unused };
}

/**
 * Add a batch of fresh random codes. Never touches existing ones, so cards
 * already handed out stay valid -- the same rule the CLI generator follows.
 */
function generateBatch(count) {
  const crypto = require("crypto");
  const LEN = 6;
  const max = Math.pow(10, LEN);
  if (!Number.isInteger(count) || count < 1) throw new Error("invalid count");
  if (count > max * 0.5) throw new Error("too many codes for " + LEN + " digits");

  const db = load();
  const batch = db.batches.reduce((m, b) => Math.max(m, b.batch), 0) + 1;

  const reserved = sc().reserved();
  const fresh = new Set();
  while (fresh.size < count) {
    const code = String(crypto.randomInt(0, max)).padStart(LEN, "0");
    if (reserved.has(code) || db.codes[code] || fresh.has(code)) continue;
    fresh.add(code);
  }
  for (const c of fresh) db.codes[c] = { status: "unused", usedAt: null, batch };
  db.batches.push({ batch, generatedAt: new Date().toISOString(), count: fresh.size });
  save(db);
  logLine(`${new Date().toISOString()}  BATCH ${batch} GENERATED  ${fresh.size} codes`);
  return { batch, added: fresh.size, total: Object.keys(db.codes).length };
}

/** The two special codes plus today's staff allowance -- for /admin. */
function specialCodes() {
  return { ...sc().codes(), staffQuota: sc().staffQuota() };
}

module.exports = { validateAndRedeem, release, stats, unusedCodes, generateBatch, specialCodes, retireAll };
