/* =====================================================================
   Render one session at several brightness settings, side by side.

   Usage:
     node scripts/try-exposure.js                 newest session
     node scripts/try-exposure.js output/sessions/<id>

   The colour grade is a look and should not be touched to fix brightness.
   strip.tone.exposure is the dial for that, and it changes only how bright
   the frame is -- never its colour. This renders the same three photos at
   a range of values so the right one can be picked by looking rather than
   by guessing, and without putting a single sheet through the printer.

   Pick the column that looks right, then set that number as
   strip.tone.exposure in config.js and restart the booth.
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const Jimp = require("jimp");
const config = require("../config");
const { buildStrip, STRIP_W, H } = require("../src/strip");

const STEPS = [1.00, 0.92, 0.84, 0.76, 0.68];

function newestSession() {
  const base = config.paths.sessions;
  try {
    const dirs = fs.readdirSync(base)
      .map(n => path.join(base, n))
      .filter(p => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } })
      .map(p => ({ p, t: fs.statSync(p).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    return dirs.length ? dirs[0].p : null;
  } catch (e) { return null; }
}

function photosIn(dir) {
  return fs.readdirSync(dir)
    .filter(f => /\.(jpe?g|png)$/i.test(f))
    .sort()
    .map(f => path.join(dir, f));
}

(async () => {
  const arg = process.argv.slice(2).find(a => !a.startsWith("--"));
  const dir = arg || newestSession();
  if (!dir || !fs.existsSync(dir)) {
    console.error("No session found. Pass one: node scripts/try-exposure.js output/sessions/<id>");
    process.exit(1);
  }

  const photos = photosIn(dir);
  if (!photos.length) { console.error("No photos in " + dir); process.exit(1); }
  while (photos.length < config.photos) photos.push(photos[photos.length - 1]);

  const outDir = path.join(config.paths.output, "analysis");
  fs.mkdirSync(outDir, { recursive: true });

  console.log("\n  session: " + path.basename(dir));
  console.log("  grade " + (config.strip.grade.enabled === false ? "OFF" : "ON") +
              ", vignette " + (config.strip.backdrop.enabled === false ? "OFF" : "ON") +
              "  (both left exactly as they are -- only brightness changes below)\n");

  // Put the live setting back whatever happens; this must never leave the
  // booth printing at a value nobody chose.
  const was = config.strip.tone.exposure;
  const built = [];
  try {
    for (const e of STEPS) {
      config.strip.tone.exposure = e;
      const file = path.join(outDir, "exposure-" + e.toFixed(2) + ".png");
      await buildStrip(photos, file);
      built.push({ e, file });
      console.log("  rendered " + e.toFixed(2) + (e === was ? "   <- current setting" : ""));
    }
  } finally {
    config.strip.tone.exposure = was;
  }

  const SCALE = 0.42;
  const colW = Math.round(STRIP_W * SCALE);
  const colH = Math.round(H * SCALE);
  const pad = 12, labelH = 26;

  const sheet = new Jimp(pad + built.length * (colW + pad), colH + labelH + pad * 2, 0xffffffff);
  const font = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);

  for (let i = 0; i < built.length; i++) {
    const img = await Jimp.read(built[i].file);
    img.crop(0, 0, STRIP_W, H).resize(colW, colH);
    const x = pad + i * (colW + pad);
    sheet.print(font, x, pad, built[i].e.toFixed(2) + (built[i].e === was ? "  (now)" : ""));
    sheet.composite(img, x, pad + labelH);
  }

  const out = path.join(outDir, "exposure-ladder.png");
  await sheet.writeAsync(out);

  console.log("\n  " + out);
  console.log("\n  Pick the column that looks right, then in config.js set");
  console.log("    strip.tone.exposure: <that number>");
  console.log("  and restart the booth (icon 2, then icon 1).");
  console.log("  It changes brightness only -- the colour look stays exactly as it is.\n");
})().catch(e => { console.error("Failed: " + e.message); process.exit(1); });
