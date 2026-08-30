/* =====================================================================
   Nine versions of the same photo: how far the backdrop falls away
   across, how deep the corners go down. Pick one, name the two numbers,
   done.

   This grid used to sweep magenta against saturation. That was the wrong
   pair. magenta pushed the wall's blue up, and the gate meant to hold it
   to the wall reads light clothing as three-quarters wall -- so it tinted
   shirts as much as it tinted the backdrop. It now sits at 0.

   What the reference strips actually have, and what these two dials
   reach, is a bright centre falling away to a deeper, warmer rose at the
   corners. `strength` is how far it falls; `satBoost` is whether the
   corner goes rich or grey on the way down. Both turn around whatever
   colour is already in the pixel, so neither of them stains cloth.

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

// Bracketed around the value now in config.js rather than spread wide: a
// grid is only worth printing once it already contains the answer.
const STRENGTHS = [0.30, 0.42, 0.54];   // gentle -> strong falloff, across
const DEPTHS    = [0.14, 0.26, 0.38];   // corner richness, down

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

  const B = config.strip.backdrop;
  console.log("\n  session: " + path.basename(dir) + "   photo: " + path.basename(src));
  console.log("  current: gradient " + B.strength + ", depth " + B.satBoost + "\n");

  const CELL_W = 380, pad = 10, labelH = 22, rowLabel = 92;
  const base = await Jimp.read(src);
  const cellH = Math.round(CELL_W * base.bitmap.height / base.bitmap.width);

  const sheet = new Jimp(
    rowLabel + STRENGTHS.length * (CELL_W + pad) + pad,
    labelH + DEPTHS.length * (cellH + pad) + pad,
    0xffffffff,
  );
  const font = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);

  // Put the live settings back no matter what happens.
  const wasStr = B.strength;
  const wasSat = B.satBoost;

  try {
    for (let c = 0; c < STRENGTHS.length; c++) {
      sheet.print(font, rowLabel + c * (CELL_W + pad), 2,
        "gradient " + STRENGTHS[c].toFixed(2) + (STRENGTHS[c] === wasStr ? "  (now)" : ""));
    }
    for (let r = 0; r < DEPTHS.length; r++) {
      const y = labelH + r * (cellH + pad);
      sheet.print(font, 4, y + Math.round(cellH / 2) - 8,
        "depth\n" + DEPTHS[r].toFixed(2) + (DEPTHS[r] === wasSat ? " (now)" : ""));
      for (let c = 0; c < STRENGTHS.length; c++) {
        B.strength = STRENGTHS[c];
        B.satBoost = DEPTHS[r];
        const img = base.clone();
        toneStage(img); flashGrade(img); backdropGradient(img);
        img.resize(CELL_W, cellH);
        sheet.composite(img, rowLabel + c * (CELL_W + pad), y);
      }
      console.log("  rendered depth " + DEPTHS[r].toFixed(2));
    }
  } finally {
    B.strength = wasStr;
    B.satBoost = wasSat;
  }

  const out = path.join(outDir, "color-grid.png");
  await sheet.writeAsync(out);

  console.log("\n  " + out);
  console.log("\n  Across = the backdrop falls away further from the centre.");
  console.log("  Down   = the corners go richer rather than grey.");
  console.log("  Hold the reference strip next to the screen and match it.");
  console.log("  Send both numbers -- e.g. \"gradient 0.42, depth 0.26\".\n");
})().catch(e => { console.error("Failed: " + e.message); process.exit(1); });
