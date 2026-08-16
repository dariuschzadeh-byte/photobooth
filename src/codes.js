/* =====================================================================
   codes.js -- voucher validation, single-use redemption, tracking
   ---------------------------------------------------------------------
   - MASTER_CODE always validates and is NEVER burned (staff/testing).
     It only exists here in the code, never printed on a card.
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

const MASTER_CODE = "731790";                         // staff only -- never on a card
const FILE = path.join(__dirname, "..", "data", "codes.json");
const LOG  = path.join(__dirname, "..", "data", "redemptions.log");

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

  if (code === MASTER_CODE) {
    return { valid: true, master: true };             // never burned
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

  entry.status = "used";
  entry.usedAt = new Date().toISOString();
  save(db);
  logLine(`${entry.usedAt}  ${code}  REDEEMED  batch:${entry.batch}`);
  return { valid: true };
}

/** Give a burned code back (failed session / staff action). */
function release(input) {
  const code = String(input || "").trim();
  if (code === MASTER_CODE) return { released: false, reason: "master" };

  const db = load();
  const entry = db.codes[code];
  if (!entry) return { released: false, reason: "unknown" };
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
  const used = all.filter(([, e]) => e.status === "used");
  const unused = all.length - used.length;
  return {
    total: all.length,
    used: used.length,
    unused,
    remaining: unused,
    batches: db.batches,
    usedList: used
      .map(([code, e]) => ({ code, usedAt: e.usedAt, batch: e.batch }))
      .sort((a, b) => (a.usedAt < b.usedAt ? 1 : -1)),
  };
}

/** Every code that has not been redeemed yet -- these are worth printing. */
function unusedCodes() {
  const db = load();
  return Object.entries(db.codes)
    .filter(([, e]) => e.status !== "used")
    .map(([code]) => code)
    .sort();
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

  const fresh = new Set();
  while (fresh.size < count) {
    const code = String(crypto.randomInt(0, max)).padStart(LEN, "0");
    if (code === MASTER_CODE || db.codes[code] || fresh.has(code)) continue;
    fresh.add(code);
  }
  for (const c of fresh) db.codes[c] = { status: "unused", usedAt: null, batch };
  db.batches.push({ batch, generatedAt: new Date().toISOString(), count: fresh.size });
  save(db);
  logLine(`${new Date().toISOString()}  BATCH ${batch} GENERATED  ${fresh.size} codes`);
  return { batch, added: fresh.size, total: Object.keys(db.codes).length };
}

module.exports = { validateAndRedeem, release, stats, unusedCodes, generateBatch, MASTER_CODE };
