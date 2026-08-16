/* =====================================================================
   Generate a batch of unique, RANDOM 6-digit voucher codes.

   Usage:
     node scripts/generate-codes.js 250              add a new batch (default)
     node scripts/generate-codes.js 250 --replace    wipe the store first
                                                     (refused while the store
                                                      holds codes, unless you
                                                      also pass --force)

   Writes:
     - data/codes-batch<N>-<timestamp>.csv   (print these on the cards)
     - data/codes.json                       (the live store the booth checks)

   Uses the SAME schema as src/codes.js reads:
     { batches: [...], codes: { "012345": { status, usedAt, batch } } }
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const config = require("../config");
const { MASTER_CODE } = require("../src/codes");

const FILE = config.paths.codesFile;

const count = parseInt(process.argv[2], 10) || 100;
const replace = process.argv.includes("--replace");
const force = process.argv.includes("--force");
const LEN = config.codeLength;

const max = Math.pow(10, LEN);
if (count > max * 0.5) {
  console.error(`Refusing: ${count} codes is too many for ${LEN} digits (keep the active set small so codes stay hard to guess).`);
  process.exit(1);
}

// current live store
let db = { batches: [], codes: {} };
if (fs.existsSync(FILE)) db = JSON.parse(fs.readFileSync(FILE, "utf8"));

const existing = Object.keys(db.codes).length;
const redeemed = Object.values(db.codes).filter(e => e.status === "used").length;

if (replace) {
  if (existing && !force) {
    console.error(`Refusing to --replace: the live store holds ${existing} codes (${redeemed} redeemed).`);
    console.error("Replacing invalidates EVERY code already printed on a card. If you really mean it, add --force.");
    process.exit(1);
  }
  db = { batches: [], codes: {} };
}

// cryptographically-random, zero-padded, unique vs master code + existing store
const batch = db.batches.reduce((m, b) => Math.max(m, b.batch), 0) + 1;
const fresh = new Set();
while (fresh.size < count) {
  const code = String(crypto.randomInt(0, max)).padStart(LEN, "0");
  if (code === MASTER_CODE || db.codes[code] || fresh.has(code)) continue;
  fresh.add(code);
}
const codes = [...fresh];

for (const c of codes) db.codes[c] = { status: "unused", usedAt: null, batch };
db.batches.push({ batch, generatedAt: new Date().toISOString(), count: codes.length });

// CSV for printing on the cards
fs.mkdirSync(config.paths.data, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const csvPath = path.join(config.paths.data, `codes-batch${batch}-${stamp}.csv`);
fs.writeFileSync(csvPath, "code\n" + codes.join("\n") + "\n");

// atomic write of the live store (same pattern as src/codes.js)
const tmp = FILE + ".tmp";
fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
fs.renameSync(tmp, FILE);

console.log(`Generated ${codes.length} codes (batch ${batch}).`);
console.log(`  Cards CSV : ${csvPath}`);
console.log(`  Live store: ${FILE} (${replace ? "replaced" : "appended"}, total ${Object.keys(db.codes).length})`);
console.log(`  Sample    : ${codes.slice(0, 5).join(", ")} ...`);
