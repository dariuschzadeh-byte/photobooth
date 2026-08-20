/* =====================================================================
   Set the booth's two special codes by hand.

   Usage:
     node scripts/set-codes.js                          show the current codes
     node scripts/set-codes.js --staff 480215           set the staff code
     node scripts/set-codes.js --master 902731          set the master code
     node scripts/set-codes.js --new-master             roll a random one
     node scripts/set-codes.js --uses 3                 staff uses per day

   You normally never need this: the booth generates both codes on its first
   start and /admin shows them. Use it when you want a code you can remember,
   or when one has been shared too widely and needs rolling.

   Writes data/secrets.json, which git never sees. Restart the booth after.
   ===================================================================== */

const crypto = require("crypto");
const special = require("../src/specialcodes");
const codes = require("../src/codes");

const argv = process.argv.slice(2);
const flag = name => { const i = argv.indexOf("--" + name); return i >= 0 ? argv[i + 1] : null; };
const has = name => argv.includes("--" + name);

if (has("help") || has("h")) {
  console.log(require("fs").readFileSync(__filename, "utf8").split("*/")[0].replace(/^\/\*[= ]*\n?/, ""));
  process.exit(0);
}

const randomCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, "0");

// A special code that is also a printed voucher would burn a real card on
// every test, so refuse those outright rather than discover it later.
const taken = new Set(codes.unusedCodes());
const store = codes.stats();
for (const u of store.usedList) taken.add(u.code);

function pick(explicit, wantRandom) {
  if (explicit) return String(explicit).trim();
  if (!wantRandom) return null;
  let c; do { c = randomCode(); } while (taken.has(c));
  return c;
}

const master = pick(flag("master"), has("new-master"));
const staff  = pick(flag("staff"),  has("new-staff"));
const uses   = flag("uses");

if (!master && !staff && !uses) {
  const c = special.codes();
  const q = special.staffQuota();
  console.log("Current booth codes (from " + special.FILE + "):");
  console.log("  master  " + c.masterCode + "   unlimited, owner only");
  console.log("  staff   " + c.staffCode + "   " + q.used + " of " + q.limit + " used today");
  process.exit(0);
}

for (const [label, c] of [["master", master], ["staff", staff]]) {
  if (!c) continue;
  if (!/^\d{6}$/.test(c)) { console.error(`Refusing: ${label} code must be exactly 6 digits (got "${c}")`); process.exit(1); }
  if (taken.has(c)) { console.error(`Refusing: ${c} is already a printed voucher code.`); process.exit(1); }
}

try {
  const now = special.setCodes({ masterCode: master, staffCode: staff, staffUsesPerDay: uses });
  console.log("Updated. The booth now uses:");
  console.log("  master  " + now.masterCode);
  console.log("  staff   " + now.staffCode + "   " + now.staffUsesPerDay + "x per day");
  console.log("\n  Restart the booth for it to take effect (icon 2, then icon 1).");
  console.log("  The old codes stop working immediately after that restart.");
} catch (e) {
  console.error("Refusing: " + e.message);
  process.exit(1);
}
