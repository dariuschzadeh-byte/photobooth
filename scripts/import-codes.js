/* =====================================================================
   Import voucher codes that were printed elsewhere.

   Usage:
     node scripts/import-codes.js data/import-codes.txt
     node scripts/import-codes.js data/import-codes.txt --dry-run
     node scripts/import-codes.js data/import-codes.txt --reset [--dry-run]

   --reset is for a new card batch that REPLACES the old one: every code
   already in the store is retired first, then the list goes in as the
   only live batch. RESET-CODES.bat runs it with a check and a prompt.

   For cards that already exist on paper -- a batch sent to the printers
   before the booth knew about them. Reads one six-digit code per line
   (also accepts CSV with a header, and ignores blank lines).

   Three rules it will not break:

     - It never overwrites. A code already in the store keeps its state,
       so importing a list that overlaps an old batch cannot resurrect a
       voucher somebody already spent.
     - It never imports a special code. If the master or staff code
       appeared on a printed card, that card would print forever without
       ever burning, so those are refused loudly.
     - It writes atomically, via a temp file and a rename, exactly as
       codes.js does. A crash mid-import cannot leave a half-written
       store behind.

   Safe to run twice: the second run reports everything as already
   present and changes nothing.

   And for --reset, one more:

     - A new batch must not share a single code with ANY batch the store
       has ever held, used or not, retired or not. A shared code would
       either be dead on arrival on the new card or bring the old card
       back to life. The whole list is refused rather than trimmed, so the
       printed cards and the store can never disagree.
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const config = require("../config");
const special = require("../src/specialcodes");
const codes = require("../src/codes");

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");
const reset = args.includes("--reset");

if (!file) {
  console.error("Usage: node scripts/import-codes.js <file with one code per line> [--reset] [--dry-run]");
  process.exit(1);
}
if (!fs.existsSync(file)) {
  console.error("Not found: " + file);
  process.exit(1);
}

/* ---------- read and validate the list ------------------------------ */

const raw = fs.readFileSync(file, "utf8");
const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

const wanted = [];
const rejected = [];
for (const line of lines) {
  const cell = line.split(/[,;\t]/)[0].trim();
  if (/^\d{6}$/.test(cell)) wanted.push(cell);
  else if (!/^code$/i.test(cell)) rejected.push(line);
}

if (rejected.length) {
  console.log(`  ${rejected.length} line(s) ignored (not a six-digit code):`);
  for (const r of rejected.slice(0, 5)) console.log("    " + r.slice(0, 60));
  if (rejected.length > 5) console.log("    ...");
  console.log("");
}

if (!wanted.length) { console.error("No six-digit codes found in " + file); process.exit(1); }

const dupesInFile = wanted.filter((c, i) => wanted.indexOf(c) !== i);
if (dupesInFile.length) {
  console.error(`REFUSING: the file itself contains ${new Set(dupesInFile).size} duplicated code(s), e.g. ${[...new Set(dupesInFile)].slice(0,3).join(", ")}`);
  console.error("A printed batch should never repeat a code. Check the source before importing.");
  process.exit(1);
}

/* ---------- refuse anything that collides with a special code ------- */

const reserved = special.reserved();
const clashes = wanted.filter(c => reserved.has(c));
if (clashes.length) {
  console.error("REFUSING: these are the booth's own special codes and must not be printed on a card:");
  for (const c of clashes) console.error("    " + c);
  console.error("A card carrying one of these would print forever without ever being used up.");
  process.exit(1);
}

/* ---------- merge into the store ------------------------------------ */

const FILE = config.paths.codesFile;
let db = { batches: [], codes: {} };
if (fs.existsSync(FILE)) {
  try { db = JSON.parse(fs.readFileSync(FILE, "utf8")); }
  catch (e) { console.error("codes.json is unreadable, refusing to touch it: " + e.message); process.exit(1); }
}
db.batches = db.batches || [];
db.codes = db.codes || {};

const batch = db.batches.reduce((m, b) => Math.max(m, b.batch), 0) + 1;

/* A code from a retired batch cannot go on a new card: the store would
   refuse it at the booth. Refused here instead, where it is still cheap. */
const retiredHits = wanted.filter(c => db.codes[c] && db.codes[c].retired);
if (retiredHits.length && !reset) {
  console.error(`REFUSING: ${retiredHits.length} code(s) belong to a retired batch, e.g. ${retiredHits.slice(0, 3).join(", ")}`);
  console.error("The booth will not accept them, so a card carrying one would never work.");
  process.exit(1);
}

if (reset) {
  const live = Object.values(db.codes).filter(e => !e.retired);
  const liveUsed = live.filter(e => e.status === "used").length;
  const byBatch = {};
  for (const e of live) {
    const k = e.batch == null ? "?" : e.batch;
    byBatch[k] = byBatch[k] || { total: 0, used: 0 };
    byBatch[k].total++; if (e.status === "used") byBatch[k].used++;
  }
  console.log("  RESET - what is in the store now:");
  for (const [b, v] of Object.entries(byBatch)) {
    console.log(`    batch ${String(b).padEnd(4)} ${String(v.total).padStart(4)} codes   ${String(v.used).padStart(4)} used   ${String(v.total - v.used).padStart(4)} unused`);
  }
  if (!live.length) console.log("    (no live codes)");
  const already = Object.values(db.codes).length - live.length;
  if (already) console.log(`    plus ${already} code(s) retired by an earlier reset`);
  console.log("");

  const clash = wanted.filter(c => db.codes[c]);
  if (clash.length) {
    console.error(`REFUSING: ${clash.length} code(s) in the new list are already known to this booth, e.g. ${clash.slice(0, 3).join(", ")}`);
    console.error("A new batch has to be new. Make a fresh list rather than trimming this one,");
    console.error("so the cards that get printed and the codes the booth accepts are the same list.");
    process.exit(1);
  }

  console.log("  new batch                : " + wanted.length + " codes, none known to this booth");
  console.log("  will be retired          : " + live.length + " (" + liveUsed + " used, " + (live.length - liveUsed) + " never used)");
  if (live.length - liveUsed > 0) {
    console.log("");
    console.log(`  NOTE: ${live.length - liveUsed} old card(s) were never used. After the reset they stop working.`);
  }
  console.log("");
  if (dryRun) { console.log("  --dry-run: nothing written."); process.exit(0); }

  // Keep the whole store as it was, byte for byte, before touching it.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backup = FILE + ".before-reset-" + stamp;
  if (fs.existsSync(FILE)) fs.copyFileSync(FILE, backup);

  const r = codes.retireAll(db);
  for (const c of wanted) db.codes[c] = { status: "unused", usedAt: null, batch, importedFrom: path.basename(file) };
  db.batches.push({ batch, generatedAt: new Date().toISOString(), count: wanted.length, imported: true, source: path.basename(file) });

  const tmp = FILE + ".tmp";
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, FILE);

  console.log(`  Retired ${r.used + r.unused} old code(s). Batch ${batch} is live with ${wanted.length} codes.`);
  console.log("  The old store is kept as " + path.basename(backup));
  console.log("");
  console.log("  The booth reads codes.json on every entry, so this works immediately.");
  console.log("  No restart needed.");
  process.exit(0);
}

const fresh = [], already = [], alreadyUsed = [];
for (const c of wanted) {
  const existing = db.codes[c];
  if (!existing) fresh.push(c);
  else if (existing.status === "used") alreadyUsed.push(c);
  else already.push(c);
}

console.log("  in the file            : " + wanted.length);
console.log("  new, will be added     : " + fresh.length);
console.log("  already present, unused: " + already.length);
console.log("  already present, USED  : " + alreadyUsed.length + (alreadyUsed.length ? "   (left as used -- not resurrected)" : ""));
console.log("");

if (dryRun) { console.log("  --dry-run: nothing written."); process.exit(0); }
if (!fresh.length) { console.log("  Nothing to do -- every code is already in the store."); process.exit(0); }

for (const c of fresh) db.codes[c] = { status: "unused", usedAt: null, batch, importedFrom: path.basename(file) };
db.batches.push({ batch, generatedAt: new Date().toISOString(), count: fresh.length, imported: true, source: path.basename(file) });

const tmp = FILE + ".tmp";
fs.mkdirSync(path.dirname(FILE), { recursive: true });
fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
fs.renameSync(tmp, FILE);

const totals = Object.values(db.codes);
console.log("  Imported " + fresh.length + " code(s) as batch " + batch + ".");
console.log("  Store now holds " + totals.length + " codes, " +
            totals.filter(c => c.status !== "used").length + " still unused.");
console.log("");
console.log("  The booth reads codes.json on every entry, so these work immediately.");
console.log("  No restart needed.");
