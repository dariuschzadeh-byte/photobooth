/* =====================================================================
   What has changed on the camera?

   Usage:
     node scripts/camera-settings.js              oldest vs newest session
     node scripts/camera-settings.js <a.jpg> <b.jpg>

   The booth writes no exposure settings at all -- src/camera.js calls
   digiCamControl with nothing but a filename -- so every exposure decision
   is made on the camera body or in digiCamControl's own saved profile.
   When prints suddenly look different, this is what tells you whether
   somebody turned a dial.

   outputRetentionDays is 0, so every guest photo since the booth was built
   is still on disk. That makes the comparison possible months later.
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const config = require("../config");
const exif = require("../src/exif");

const args = process.argv.slice(2).filter(a => !a.startsWith("--"));

/** First photo inside a session folder that actually carries EXIF. */
function photoIn(dir) {
  let names = [];
  try { names = fs.readdirSync(dir).filter(f => /\.jpe?g$/i.test(f)).sort(); } catch (e) { return null; }
  for (const n of names) {
    const p = path.join(dir, n);
    if (exif.read(p)) return p;
  }
  return names.length ? path.join(dir, names[0]) : null;
}

function sessionsByDate() {
  const base = config.paths.sessions;
  let dirs = [];
  try {
    dirs = fs.readdirSync(base)
      .map(n => path.join(base, n))
      .filter(p => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } })
      .map(p => ({ p, t: fs.statSync(p).mtimeMs }))
      .sort((a, b) => a.t - b.t);
  } catch (e) { return []; }
  return dirs.map(d => d.p);
}

let a, b;
if (args.length >= 2) {
  [a, b] = args;
} else {
  const s = sessionsByDate();
  if (s.length < 2) {
    console.error("Need at least two sessions in output/sessions to compare.");
    console.error("Found: " + s.length);
    process.exit(1);
  }
  // Oldest session that still has readable EXIF, against the newest.
  for (const dir of s) { const p = photoIn(dir); if (p && exif.read(p)) { a = p; break; } }
  for (let i = s.length - 1; i >= 0; i--) { const p = photoIn(s[i]); if (p && exif.read(p)) { b = p; break; } }
}

if (!a || !b) { console.error("Could not find two photos with EXIF data."); process.exit(1); }

const A = exif.describe(a), B = exif.describe(b);
if (!A || !B) {
  console.error("No EXIF in one of the files:");
  console.error("  " + a + (A ? "" : "   <- none"));
  console.error("  " + b + (B ? "" : "   <- none"));
  console.error("\nThe Canon writes EXIF, so a file without it did not come from the camera.");
  process.exit(1);
}

const label = f => path.basename(path.dirname(f)) + "/" + path.basename(f);

console.log("");
console.log("  EARLIER : " + label(a) + "   " + A.takenAt);
console.log("  NOW     : " + label(b) + "   " + B.takenAt);
console.log("  " + "=".repeat(74));

const ROWS = [
  ["camera", "Camera"],
  ["mode", "Exposure mode"],
  ["shutter", "Shutter"],
  ["aperture", "Aperture"],
  ["iso", "ISO"],
  ["exposureBias", "Exposure compensation"],
  ["whiteBalance", "White balance"],
  ["metering", "Metering"],
  ["flash", "Flash"],
  ["focalLength", "Focal length"],
];

let changed = 0;
for (const [key, title] of ROWS) {
  const same = String(A[key]) === String(B[key]);
  if (!same) changed++;
  console.log(
    "  " + (same ? "  " : ">>") + " " +
    title.padEnd(23) + String(A[key]).padEnd(22) + String(B[key])
  );
}

console.log("  " + "=".repeat(74));
console.log("");
if (!changed) {
  console.log("  Nothing changed on the camera between these two shots.");
  console.log("  If the prints look different, the cause is the light in the room,");
  console.log("  the flash itself, or the backdrop -- not a setting.");
} else {
  console.log("  " + changed + " setting(s) differ, marked >> above.");
  console.log("");
  console.log("  Reading them:");
  console.log("   - a wider aperture (smaller f number) lets in MORE light");
  console.log("   - higher ISO means MORE light");
  console.log("   - a longer shutter means MORE ambient light (flash is unaffected)");
  console.log("   - positive exposure compensation means MORE light");
  console.log("   - white balance off 'flash' shifts colour, not brightness --");
  console.log("     and the grade in config.js was measured against flash WB");
}
console.log("");
