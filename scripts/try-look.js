/* =====================================================================
   Nine versions of the same photo: brighter/darker across, cooler/warmer
   down. Pick one, name the two numbers, done.

   Usage:
     node scripts/try-look.js                  newest session
     node scripts/try-look.js <session-folder>

   Deliberately ONE photo rather than whole strips. Skin tone and
   brightness are judged by comparing faces side by side, and nine tall
   strips force the eye to travel too far to do that honestly.

   Uses no paper and touches neither printer nor camera.
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const Jimp = require("jimp");
const config = require("../config");
const { toneStage, flashGrade, backdropGradient } = require("../src/strip");

const EXPOSURES = [1.00, 0.92, 0.84];
const WARMTHS   = [0, 0.06, 0.12];

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
    console.error("No session found. Pass one: node scripts/try-look.js output/sessions/<id>");
    process.exit(1);
  }

  const photos = fs.readdirSync(dir).filter(f => /\.(jpe?g|png)$/i.test(f)).sort();
  if (!photos.length) { console.error("No photos in " + dir); process.exit(1); }
  // The middle frame: guests have usually settled by then.
  const src = path.join(dir, photos[Math.min(1, photos.length - 1)]);

  const outDir = path.join(config.paths.output, "analysis");
  fs.mkdirSync(outDir, { recursive: true });

  console.log("\n  session: " + path.basename(dir) + "   photo: " + path.basename(src));
  console.log("  current: exposure " + config.strip.tone.exposure +
              ", warmth " + (config.strip.grade.warmth || 0) + "\n");

  const CELL_W = 380, pad = 10, labelH = 22, rowLabel = 92;
  const base = await Jimp.read(src);
  const cellH = Math.round(CELL_W * base.bitmap.height / base.bitmap.width);

  const sheet = new Jimp(
    rowLabel + WARMTHS.length * (CELL_W + pad) + pad,
    labelH + EXPOSURES.length * (cellH + pad) + pad,
    0xffffffff,
  );
  const font = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);

  // Put the live settings back no matter what happens.
  const wasExp = config.strip.tone.exposure;
  const wasWarm = config.strip.grade.warmth;

  try {
    for (let c = 0; c < WARMTHS.length; c++) {
      sheet.print(font, rowLabel + c * (CELL_W + pad), 2,
        "warmth " + WARMTHS[c].toFixed(2) + (WARMTHS[c] === wasWarm ? "  (now)" : ""));
    }
    for (let r = 0; r < EXPOSURES.length; r++) {
      const y = labelH + r * (cellH + pad);
      sheet.print(font, 4, y + Math.round(cellH / 2) - 8,
        "bright\n" + EXPOSURES[r].toFixed(2) + (EXPOSURES[r] === wasExp ? " (now)" : ""));
      for (let c = 0; c < WARMTHS.length; c++) {
        config.strip.tone.exposure = EXPOSURES[r];
        config.strip.grade.warmth = WARMTHS[c];
        const img = base.clone();
        toneStage(img); flashGrade(img); backdropGradient(img);
        img.resize(CELL_W, cellH);
        sheet.composite(img, rowLabel + c * (CELL_W + pad), y);
      }
      console.log("  rendered brightness " + EXPOSURES[r].toFixed(2));
    }
  } finally {
    config.strip.tone.exposure = wasExp;
    config.strip.grade.warmth = wasWarm;
  }

  const out = path.join(outDir, "look-grid.png");
  await sheet.writeAsync(out);

  console.log("\n  " + out);
  console.log("\n  Across = warmer (more tan). Down = darker.");
  console.log("  Pick the one you like and send both numbers -- e.g. \"0.92 and 0.06\".\n");
})().catch(e => { console.error("Failed: " + e.message); process.exit(1); });
