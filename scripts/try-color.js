/* =====================================================================
   Nine versions of the same photo: the backdrop's hue across, how vivid
   it is down. Pick one, name the two numbers, done.

   For the complaint that the wall comes out a dull salmon while the
   strips kept as the reference are a luminous pink leaning violet. The
   grade is already bit-identical to the one those strips were printed
   with, so what is left is the wall itself -- repainted matte, and quite
   possibly from a different tin. This corrects it back.

   The hue shift rides the inverse of the skin gate: it moves the wall and
   leaves faces alone. Watch the faces anyway while choosing -- if they go
   purple, the value is too high.

   Usage:
     node scripts/try-color.js                  newest session
     node scripts/try-color.js <session-folder>

   Uses no paper and touches neither printer nor camera.
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const Jimp = require("jimp");
const config = require("../config");
const { toneStage, flashGrade, backdropGradient } = require("../src/strip");

// Centred on the answer now that both ends have been seen on paper: 0
// printed too salmon, 0.50 printed hot pink. A grid is only useful once
// it brackets the target closely -- too wide and every square is wrong in
// a different direction.
const MAGENTAS = [0.10, 0.17, 0.26];   // gentle -> clear violet lean, across
const SATS     = [0.98, 1.03, 1.10];   // natural -> more glow, down

function newestSession() {
  try {
    return fs.readdirSync(config.paths.sessions)
      .map(n => path.join(config.paths.sessions, n))
      .filter(p => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } })
      .map(p => ({ p, t: fs.statSync(p).mtimeMs }))
      .sort((a, b) => b.t - a.t)
      .map(d => d.p)[0] || null;
  } catch (e) { return null; }
}

(async () => {
  const arg = process.argv.slice(2).find(a => !a.startsWith("--"));
  const dir = arg || newestSession();
  if (!dir || !fs.existsSync(dir)) {
    console.error("No session found. Pass one: node scripts/try-color.js output/sessions/<id>");
    process.exit(1);
  }

  const photos = fs.readdirSync(dir).filter(f => /\.(jpe?g|png)$/i.test(f)).sort();
  if (!photos.length) { console.error("No photos in " + dir); process.exit(1); }
  // The middle frame: guests have usually settled by then.
  const src = path.join(dir, photos[Math.min(1, photos.length - 1)]);

  const outDir = path.join(config.paths.output, "analysis");
  fs.mkdirSync(outDir, { recursive: true });

  console.log("\n  session: " + path.basename(dir) + "   photo: " + path.basename(src));
  console.log("  current: magenta " + (config.strip.grade.magenta || 0) +
              ", sat " + config.strip.grade.sat + "\n");

  const CELL_W = 380, pad = 10, labelH = 22, rowLabel = 92;
  const base = await Jimp.read(src);
  const cellH = Math.round(CELL_W * base.bitmap.height / base.bitmap.width);

  const sheet = new Jimp(
    rowLabel + MAGENTAS.length * (CELL_W + pad) + pad,
    labelH + SATS.length * (cellH + pad) + pad,
    0xffffffff,
  );
  const font = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);

  // Put the live settings back no matter what happens.
  const wasMag = config.strip.grade.magenta || 0;
  const wasSat = config.strip.grade.sat;

  try {
    for (let c = 0; c < MAGENTAS.length; c++) {
      sheet.print(font, rowLabel + c * (CELL_W + pad), 2,
        "magenta " + MAGENTAS[c].toFixed(2) + (MAGENTAS[c] === wasMag ? "  (now)" : ""));
    }
    for (let r = 0; r < SATS.length; r++) {
      const y = labelH + r * (cellH + pad);
      sheet.print(font, 4, y + Math.round(cellH / 2) - 8,
        "vivid\n" + SATS[r].toFixed(2) + (SATS[r] === wasSat ? " (now)" : ""));
      for (let c = 0; c < MAGENTAS.length; c++) {
        config.strip.grade.sat = SATS[r];
        config.strip.grade.magenta = MAGENTAS[c];
        const img = base.clone();
        toneStage(img); flashGrade(img); backdropGradient(img);
        img.resize(CELL_W, cellH);
        sheet.composite(img, rowLabel + c * (CELL_W + pad), y);
      }
      console.log("  rendered vividness " + SATS[r].toFixed(2));
    }
  } finally {
    config.strip.grade.sat = wasSat;
    config.strip.grade.magenta = wasMag;
  }

  const out = path.join(outDir, "color-grid.png");
  await sheet.writeAsync(out);

  console.log("\n  " + out);
  console.log("\n  Across = the wall towards violet pink. Down = more vivid.");
  console.log("  Hold the reference strip next to the screen and match it.");
  console.log("  Send both numbers -- e.g. \"magenta 0.10, vivid 1.06\".\n");
})().catch(e => { console.error("Failed: " + e.message); process.exit(1); });
