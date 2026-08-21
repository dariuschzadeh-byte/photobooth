/* =====================================================================
   Show exactly what the strip builder does to a photo.

   Usage:
     node scripts/analyse-photo.js output/sessions/<id>/photo_1.jpg
     node scripts/analyse-photo.js output/sessions/<id>/*.jpg

   Why this exists: the booth used to print the camera JPEG essentially
   untouched. Since then a colour grade and a background vignette were
   added, and when a print suddenly looks wrong there is no way to tell
   from the strip alone whether the camera saw it or the software made it.
   This runs the real pipeline stage by stage and reports the difference.

   The original camera files are still on disk -- outputRetentionDays is 0,
   so nothing has ever been deleted -- which means this can be run on any
   session, including one from months ago.

   Writes a side-by-side PNG to output/analysis/ so you can look as well
   as read: left = what the camera saw, right = what got printed.
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const Jimp = require("jimp");
const config = require("../config");
const { flashGrade, backdropGradient } = require("../src/strip");

const args = process.argv.slice(2).filter(a => !a.startsWith("--"));
if (!args.length) {
  console.error("Usage: node scripts/analyse-photo.js <photo.jpg | session-folder>");
  console.error("Tip:   the newest session is the last folder in output/sessions/");
  process.exit(1);
}

/** A whole session folder is the normal case -- accept it as well as files. */
const files = args.flatMap(a => {
  try {
    if (fs.statSync(a).isDirectory()) {
      return fs.readdirSync(a)
        .filter(f => /\.(jpe?g|png)$/i.test(f))
        .sort()
        .map(f => path.join(a, f));
    }
  } catch (e) { /* fall through: report it as missing below */ }
  return [a];
});

const OUT = path.join(config.paths.output, "analysis");
fs.mkdirSync(OUT, { recursive: true });

/** Stats over a rectangle given as fractions of the image. */
function region(img, x0, y0, x1, y1) {
  const { width: w, height: h, data } = img.bitmap;
  const X0 = Math.floor(x0 * w), X1 = Math.floor(x1 * w);
  const Y0 = Math.floor(y0 * h), Y1 = Math.floor(y1 * h);
  let r = 0, g = 0, b = 0, n = 0, clipped = 0, maxLum = 0, maxPx = null;
  for (let y = Y0; y < Y1; y += 2) {
    for (let x = X0; x < X1; x += 2) {
      const i = (y * w + x) * 4;
      const R = data[i], G = data[i + 1], B = data[i + 2];
      r += R; g += G; b += B; n++;
      if (R >= 253 || G >= 253 || B >= 253) clipped++;
      const l = 0.299 * R + 0.587 * G + 0.114 * B;
      if (l > maxLum) { maxLum = l; maxPx = [R, G, B]; }
    }
  }
  if (!n) return null;
  const avg = [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  return {
    avg,
    warmth: avg[0] - avg[2],          // >0 pink/warm, ~0 neutral, <0 cool/blue
    clippedPct: Math.round((clipped / n) * 1000) / 10,
    brightest: maxPx,
    brightestLum: Math.round(maxLum),
  };
}

function describeWarmth(v) {
  return v > 45 ? "kräftig rosa" : v > 25 ? "rosa" : v > 10 ? "blass rosa"
       : v > 2 ? "fast neutral" : v > -6 ? "NEUTRAL/GRAU" : "KÜHL / BLAUSTICH";
}

function line(label, s) {
  if (!s) return;
  console.log(
    "  " + label.padEnd(22) +
    ("R" + s.avg[0] + " G" + s.avg[1] + " B" + s.avg[2]).padEnd(20) +
    ("R-B " + String(s.warmth).padStart(4)).padEnd(10) +
    describeWarmth(s.warmth).padEnd(18) +
    "geklippt " + s.clippedPct + "%"
  );
}

(async () => {
  for (const f of files) {
    if (!fs.existsSync(f)) { console.error("nicht gefunden: " + f); continue; }
    console.log("\n" + "=".repeat(92));
    console.log(path.basename(f));
    console.log("=".repeat(92));

    const src = await Jimp.read(f);
    console.log(`  ${src.bitmap.width}x${src.bitmap.height}px\n`);

    // Same crop the strip builder uses, so we compare like for like.
    const cellH = Math.floor(((config.strip.heightInch * config.strip.dpi) - config.strip.footerHeight
                  - (config.photos - 1) * config.strip.gap) / config.photos);
    const cellW = config.strip.widthInch * config.strip.dpi;

    const original = src.clone().cover(cellW, cellH);
    const graded   = original.clone(); flashGrade(graded);
    const finished = graded.clone();   backdropGradient(finished);

    // The band above head height is where the backdrop shows, and where a
    // flash reflection lands. That is the number we actually care about.
    const ZONES = [
      ["Hintergrund oben", 0.15, 0.02, 0.85, 0.30],
      ["Bildmitte",        0.25, 0.35, 0.75, 0.65],
      ["Ränder unten",     0.00, 0.75, 1.00, 1.00],
    ];

    for (const [name, ...box] of ZONES) {
      console.log("  " + name);
      line("wie die Kamera sah", region(original, ...box));
      line("nach Grading",       region(graded,   ...box));
      line("nach Vignette",      region(finished, ...box));
      console.log();
    }

    const a = region(original, 0.15, 0.02, 0.85, 0.30);
    const c = region(finished, 0.15, 0.02, 0.85, 0.30);
    console.log("  BEFUND für den oberen Hintergrund:");
    if (a.clippedPct > 3) {
      console.log(`    Die Kamera hat hier bereits ${a.clippedPct}% ausgefressene Pixel — die Reflexion`);
      console.log("    steckt im ORIGINAL. Das ist ein Licht-/Aufbau-Problem, keine Software.");
    } else if (c.warmth < a.warmth - 12) {
      console.log(`    Das Original ist ${describeWarmth(a.warmth)} (R-B ${a.warmth}), nach der Verarbeitung`);
      console.log(`    ${describeWarmth(c.warmth)} (R-B ${c.warmth}). Die SOFTWARE zieht die Farbe raus.`);
    } else {
      console.log(`    Original ${describeWarmth(a.warmth)} (R-B ${a.warmth}), fertig ${describeWarmth(c.warmth)}`);
      console.log(`    (R-B ${c.warmth}), ${a.clippedPct}% geklippt. Kein auffälliger Eingriff der Software.`);
    }

    // Side by side: what the camera saw, and what came out of the printer.
    const pad = 16;
    const sheet = new Jimp(cellW * 2 + pad * 3, cellH + pad * 2, 0xffffffff);
    sheet.composite(original, pad, pad);
    sheet.composite(finished, pad * 2 + cellW, pad);
    const outFile = path.join(OUT, path.basename(f).replace(/\.[^.]+$/, "") + "-vergleich.png");
    await sheet.writeAsync(outFile);
    console.log("\n  Vergleichsbild (links Kamera, rechts gedruckt): " + outFile);
  }
})().catch(e => { console.error("Fehler: " + e.message); process.exit(1); });
