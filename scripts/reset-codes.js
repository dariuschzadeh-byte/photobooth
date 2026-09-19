/* =====================================================================
   Make every voucher code valid again, for a reprint of the same cards.

   Usage:
     node scripts/reset-codes.js --dry-run     show what would change
     node scripts/reset-codes.js               do it

   The cards are thrown away once they have been used, so a spent code is
   not sitting in anybody's wallet: the same codes can simply be printed
   again. This clears every redemption in the store and counts the codes
   as a new print run -- a new batch number, dated today -- so the
   statistics measure how fast THIS run goes, not the one from months ago.

   Nothing is imported and no list travels to this PC: the codes on the
   reprinted cards are the codes already in the store, so the two cannot
   disagree.

   What it does not touch: the master and staff codes (they never lived in
   this store), data/redemptions.log (the history of every past redemption
   stays), and the store itself until it has been copied to
   codes.json.before-reset-<date and time>.
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const config = require("../config");

const dryRun = process.argv.includes("--dry-run");
const FILE = config.paths.codesFile;

if (!fs.existsSync(FILE)) {
  console.error("No codes.json on this PC - there are no codes to reset.");
  process.exit(1);
}
let db;
try { db = JSON.parse(fs.readFileSync(FILE, "utf8")); }
catch (e) { console.error("codes.json is unreadable, refusing to touch it: " + e.message); process.exit(1); }
db.batches = db.batches || [];
db.codes = db.codes || {};

const all = Object.values(db.codes);
if (!all.length) { console.error("codes.json holds no codes - nothing to reset."); process.exit(1); }

const byBatch = {};
for (const e of all) {
  const k = e.batch == null ? "?" : e.batch;
  byBatch[k] = byBatch[k] || { total: 0, used: 0 };
  byBatch[k].total++;
  if (e.status === "used") byBatch[k].used++;
}
const used = all.filter(e => e.status === "used").length;

console.log("  What is in the store now:");
for (const [b, v] of Object.entries(byBatch)) {
  console.log(`    batch ${String(b).padEnd(4)} ${String(v.total).padStart(4)} codes   ${String(v.used).padStart(4)} used   ${String(v.total - v.used).padStart(4)} unused`);
}
console.log("");

const batch = db.batches.reduce((m, b) => Math.max(m, b.batch || 0), 0) + 1;
console.log(`  After the reset: all ${all.length} codes valid again, as batch ${batch}.`);
console.log("");

if (dryRun) { console.log("  --dry-run: nothing written."); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const backup = FILE + ".before-reset-" + stamp;
fs.copyFileSync(FILE, backup);

const now = new Date().toISOString();
for (const e of all) {
  e.status = "unused";
  e.usedAt = null;
  e.batch = batch;
}
db.batches = [{ batch, generatedAt: now, count: all.length, reissued: true }];

const tmp = FILE + ".tmp";
fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
fs.renameSync(tmp, FILE);

// One line in the redemption history, so a later look at the log can see
// where the run ended and the reprint began. A logging failure must never
// undo a reset that has already been written.
try {
  fs.appendFileSync(config.paths.redemptionsLog,
    `${now}  ALL ${all.length} CODES RESET  (${used} had been used)  batch:${batch}\n`);
} catch (e) {}

console.log(`  Done. ${used} redemption(s) cleared - all ${all.length} codes are valid again as batch ${batch}.`);
console.log("  The store as it was is kept as " + path.basename(backup));
console.log("");
console.log("  The booth reads codes.json on every entry, so this works immediately.");
console.log("  No restart needed.");
