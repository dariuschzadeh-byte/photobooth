/* =====================================================================
   Render the same three photos in every look, side by side.

   Usage:
     node scripts/compare-look.js output/sessions/<id>
     node scripts/compare-look.js a.jpg b.jpg c.jpg

   Produces one PNG with three full strips next to each other:

     1  UNBEARBEITET   the camera JPEG, printed as-is. This is exactly what
                       the booth did until June -- no grade, no vignette.
     2  NUR GRADING    colour, saturation, contrast, sharpening.
     3  WIE HEUTE      grading plus the background vignette. Live setting.

   No paper is used and no printer is touched. Look at the file, decide,
   then set strip.grade.enabled / strip.backdrop.enabled in config.js.

   Meant for exactly one question: when a print looks wrong, did the camera
   see it or did we make it? Column 1 is the camera's own answer.
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const Jimp = require("jimp");
const config = require("../config");
const { buildStrip, STRIP_W, H } = require("../src/strip");

const args = process.argv.slice(2);
if (!args.length) {
  console.error("Usage: node scripts/compare-look.js <session-folder | three photos>");
  console.error("Tip:   the newest session is the last folder in output/sessions/");
  process.exit(1);
}

/** Accept a session folder or three explicit files. */
function resolvePhotos(a) {
  if (a.length === 1 && fs.existsSync(a[0]) && fs.statSync(a[0]).isDirectory()) {
    const found = fs.readdirSync(a[0])
      .filter(f => /\.(jpe?g|png)$/i.test(f)).sort()
      .map(f => path.join(a[0], f));
    if (!found.length) throw new Error("no photos in " + a[0]);
    return found;
  }
  return a;
}

const VARIANTS = [
  { name: "1 UNBEARBEITET (wie im Juni)", grade: false, backdrop: false },
  { name: "2 NUR GRADING",                grade: true,  backdrop: false },
  { name: "3 WIE HEUTE",                  grade: true,  backdrop: true  },
];

(async () => {
  const photos = resolvePhotos(args);
  while (photos.length < config.photos) photos.push(photos[photos.length - 1]);

  const outDir = path.join(config.paths.output, "analysis");
  fs.mkdirSync(outDir, { recursive: true });

  // Remember the live settings and put them back no matter what happens --
  // this script must never leave the booth on a different look.
  const was = { grade: config.strip.grade.enabled, backdrop: config.strip.backdrop.enabled };

  const built = [];
  try {
    for (const v of VARIANTS) {
      config.strip.grade.enabled = v.grade;
      config.strip.backdrop.enabled = v.backdrop;
      const file = path.join(outDir, `look-${v.name.split(" ")[0]}.png`);
      await buildStrip(photos, file);
      built.push({ ...v, file });
      console.log("  gebaut: " + v.name);
    }
  } finally {
    config.strip.grade.enabled = was.grade;
    config.strip.backdrop.enabled = was.backdrop;
  }

  // buildStrip writes the full 4x6 sheet (two identical strips). Only the
  // left half is needed here -- three sheets side by side would be six
  // strips of duplication and unreadably wide.
  const SCALE = 0.55;                     // fits a laptop screen at a glance
  const colW = Math.round(STRIP_W * SCALE);
  const colH = Math.round(H * SCALE);
  const pad = 14, labelH = 30;

  const sheet = new Jimp(pad + built.length * (colW + pad), colH + labelH + pad * 2, 0xffffffff);
  const font = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);

  for (let i = 0; i < built.length; i++) {
    const img = await Jimp.read(built[i].file);
    img.crop(0, 0, STRIP_W, H).resize(colW, colH);
    const x = pad + i * (colW + pad);
    sheet.print(font, x, pad, built[i].name);
    sheet.composite(img, x, pad + labelH);
  }

  const out = path.join(outDir, "look-vergleich.png");
  await sheet.writeAsync(out);

  console.log("\n  Vergleichsbild: " + out);
  console.log("  Aktuell aktiv:  grade=" + was.grade + "  backdrop=" + was.backdrop);
  console.log("\n  Gefällt Spalte 1 besser, dann in config.js:");
  console.log("    strip.grade.enabled: false   und/oder   strip.backdrop.enabled: false");
  console.log("  Danach Booth neu starten (Icon 2, dann Icon 1).");
})().catch(e => { console.error("Fehler: " + e.message); process.exit(1); });
