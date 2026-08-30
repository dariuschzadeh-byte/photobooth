/* =====================================================================
   Work out the settings that make today's photos look like an old strip.

   Usage:
     node scripts/match-look.js <reference-strip.png> [session-folder]

   Every strip the booth has ever built is still on disk, so the look
   being asked for exists as an exact set of pixels rather than as a
   photograph of a print under a lamp. This measures the backdrop in that
   file, measures the backdrop in a recent photo, and searches the grade's
   parameters for the combination that maps one onto the other.

   It changes nothing. It prints the numbers to put in config.js.

   Why the backdrop and not the whole frame: it is the largest area, it is
   uniform, and it is what the complaint has been about every time. Skin
   is deliberately excluded -- the grade already treats it separately.
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const Jimp = require("jimp");
const config = require("../config");
const { toneStage, flashGrade, backdropGradient } = require("../src/strip");

const S = config.strip;
const CELL_W = S.widthInch * S.dpi;
const SHEET_H = S.heightInch * S.dpi;
const CELL_H = Math.floor((SHEET_H - S.footerHeight - (config.photos - 1) * S.gap) / config.photos);

/**
 * A grid of patch averages across the frame -- a fingerprint of the whole
 * picture, not one colour out of it.
 *
 * One colour is not enough to identify three parameters. Matching only the
 * wall, a first version of this happily reported magenta 0.37, sat 0.87,
 * exposure 1.12 for a strip actually built at 0.30, 1.10 and 0.95: the
 * wall came out within 0.6 of 255, and every number was wrong. Different
 * combinations land on the same pink.
 *
 * A grid fixes that by over-determining the problem. Thirty patches carry
 * wall, skin, hair and shirt at once, and only one setting reproduces all
 * of them together: exposure moves everything, saturation moves the
 * colourful patches more than the neutral ones, and magenta moves the wall
 * and not the faces.
 */
const GRID_X = 6, GRID_Y = 5;

function fingerprint(img, x0, y0, w, h) {
  const d = img.bitmap.data, W = img.bitmap.width;
  const out = [];
  for (let gy = 0; gy < GRID_Y; gy++) {
    for (let gx = 0; gx < GRID_X; gx++) {
      const bx = x0 + (w * gx) / GRID_X, by = y0 + (h * gy) / GRID_Y;
      const bw = w / GRID_X, bh = h / GRID_Y;
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = Math.round(by); y < Math.round(by + bh); y += 2) {
        for (let x = Math.round(bx); x < Math.round(bx + bw); x += 2) {
          const i = (y * W + x) * 4;
          r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
        }
      }
      if (n) out.push([r / n, g / n, b / n]);
    }
  }
  return out.length ? out : null;
}

/** Backwards-compatible single colour, for the report lines only. */
function backdropOf(img, x0, y0, w, h) {
  const fp = fingerprint(img, x0, y0, w, h);
  if (!fp) return null;
  // The top row of patches is wall on a photobooth frame.
  const top = fp.slice(0, GRID_X);
  return [0, 1, 2].map(k => top.reduce((s, c) => s + c[k], 0) / top.length);
}

/** Fingerprint of the middle photo cell of a finished strip. */
function fingerprintOfStrip(img, index) {
  const y = index * (CELL_H + S.gap);
  return fingerprint(img, 0, y, CELL_W, CELL_H);
}

function backdropOfStrip(img, index) {
  const y = index * (CELL_H + S.gap);
  return backdropOf(img, 0, y, CELL_W, CELL_H);
}

const dist = (a, b) => Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2);

/** Mean distance across every patch of the grid. */
const fpDist = (a, b) => {
  let sum = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) sum += dist(a[i], b[i]);
  return sum / Math.min(a.length, b.length);
};

(async () => {
  let [refArg, sessionArg] = process.argv.slice(2).filter(a => !a.startsWith("--"));

  // Listing what is available beats asking someone to type a path made of
  // a timestamp and a UUID on a touchscreen.
  const prints = (() => {
    try {
      return fs.readdirSync(config.paths.prints)
        .filter(f => /\.png$/i.test(f) && !f.startsWith("_"))
        .map(f => { const p = path.join(config.paths.prints, f);
                    return { f, p, t: fs.statSync(p).mtimeMs }; })
        .sort((a, b) => a.t - b.t);
    } catch (e) { return []; }
  })();

  if (!refArg) {
    console.error("\n  Which strip should today's photos be matched to?\n");
    if (!prints.length) { console.error("  No strips in " + config.paths.prints + "\n"); process.exit(1); }
    const byDay = new Map();
    for (const x of prints) {
      const d = new Date(x.t).toISOString().slice(0, 10);
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d).push(x);
    }
    console.error("  Strips on disk, by day:\n");
    for (const [d, list] of byDay) console.error("     " + d + "   " + String(list.length).padStart(4) + " strip(s)");
    console.error("\n  Run again with a date, e.g.:");
    console.error("     node scripts/match-look.js " + [...byDay.keys()][0] + "\n");
    process.exit(1);
  }

  let refPath = refArg;
  if (/^\d{4}-\d{2}-\d{2}$/.test(refArg)) {
    const day = prints.filter(x => new Date(x.t).toISOString().slice(0, 10) === refArg);
    if (!day.length) { console.error("  No strips from " + refArg); process.exit(1); }
    refPath = day[Math.floor(day.length / 2)].p;   // mid-day, likely a real guest
  }
  if (!fs.existsSync(refPath)) { console.error("Not found: " + refPath); process.exit(1); }

  const ref = await Jimp.read(refPath);
  // The middle photo of the strip: guests have usually settled by then, so
  // it is the most representative of the three.
  const targetFp = fingerprintOfStrip(ref, Math.min(1, config.photos - 1));
  const target = backdropOfStrip(ref, Math.min(1, config.photos - 1));
  if (!targetFp || !target) { console.error("Could not read that strip -- is it a full 1200x1800 sheet?"); process.exit(1); }

  // A recent frame, straight from the camera, before any grading.
  let dir = sessionArg;
  if (!dir) {
    const base = config.paths.sessions;
    const dirs = fs.readdirSync(base).map(n => path.join(base, n))
      .filter(p => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } })
      .map(p => ({ p, t: fs.statSync(p).mtimeMs })).sort((a, b) => b.t - a.t);
    if (!dirs.length) { console.error("No sessions in output/sessions."); process.exit(1); }
    dir = dirs[0].p;
  }
  const photos = fs.readdirSync(dir).filter(f => /\.(jpe?g|png)$/i.test(f)).sort()
    .map(f => path.join(dir, f));
  if (!photos.length) { console.error("No photos in " + dir); process.exit(1); }

  // Small copy: the grade is per-pixel, so scale does not affect colour,
  // and this makes a few hundred candidates take seconds rather than hours.
  const src = (await Jimp.read(photos[Math.min(1, photos.length - 1)]))
    .cover(Math.round(CELL_W / 3), Math.round(CELL_H / 3));

  console.log("\n  reference : " + path.basename(refPath));
  console.log("  session   : " + path.basename(dir) + "  (" + path.basename(photos[Math.min(1, photos.length-1)]) + ")");
  console.log("  target backdrop : R" + target.map(v => Math.round(v)).join(" G").replace(/ G/, " G") +
              "  -> R" + Math.round(target[0]) + " G" + Math.round(target[1]) + " B" + Math.round(target[2]));

  const raw = backdropOf(src, 0, 0, src.bitmap.width, src.bitmap.height);
  console.log("  today, ungraded : R" + Math.round(raw[0]) + " G" + Math.round(raw[1]) + " B" + Math.round(raw[2]));
  console.log("\n  searching...\n");

  const was = {
    magenta: S.grade.magenta, sat: S.grade.sat, warmth: S.grade.warmth,
    exposure: S.tone.exposure, cool: S.backdrop.coolEdges,
  };

  const score = async (magenta, sat, exposure) => {
    S.grade.magenta = magenta; S.grade.sat = sat; S.tone.exposure = exposure;
    const t = src.clone();
    toneStage(t); flashGrade(t); backdropGradient(t);
    const fp = fingerprint(t, 0, 0, t.bitmap.width, t.bitmap.height);
    return { d: fpDist(fp, targetFp), got: backdropOf(t, 0, 0, t.bitmap.width, t.bitmap.height) };
  };

  let best = null;
  try {
    // Coarse pass, then a fine pass around the winner. A plain grid is
    // enough here -- three parameters, and the surface is smooth.
    const coarse = { m: [0, .08, .16, .24, .32, .4, .5], s: [.9, 1, 1.1, 1.2], e: [.85, .95, 1.05, 1.15] };
    for (const m of coarse.m) for (const s of coarse.s) for (const e of coarse.e) {
      const r = await score(m, s, e);
      if (!best || r.d < best.d) best = { d: r.d, m, s, e, got: r.got };
    }
    const around = (v, step, lo, hi) => [v - step, v - step / 2, v, v + step / 2, v + step]
      .filter(x => x >= lo && x <= hi);
    for (const m of around(best.m, .05, 0, .7))
      for (const s of around(best.s, .06, .8, 1.35))
        for (const e of around(best.e, .06, .7, 1.3)) {
          const r = await score(m, s, e);
          if (r.d < best.d) best = { d: r.d, m, s, e, got: r.got };
        }
  } finally {
    S.grade.magenta = was.magenta; S.grade.sat = was.sat; S.grade.warmth = was.warmth;
    S.tone.exposure = was.exposure; S.backdrop.coolEdges = was.cool;
  }

  console.log("  best match:");
  console.log("     backdrop would be  R" + Math.round(best.got[0]) + " G" + Math.round(best.got[1]) + " B" + Math.round(best.got[2]));
  console.log("     target was         R" + Math.round(target[0]) + " G" + Math.round(target[1]) + " B" + Math.round(target[2]));
  console.log("     average error across the whole frame: " + best.d.toFixed(1) + " of 255\n");
  console.log("  Put these in config.js:\n");
  console.log("     strip.grade.magenta : " + best.m.toFixed(3));
  console.log("     strip.grade.sat     : " + best.s.toFixed(3));
  console.log("     strip.tone.exposure : " + best.e.toFixed(3));
  console.log("\n  Send these three numbers to Dariusch.\n");
})().catch(e => { console.error("  Failed: " + e.message); process.exit(1); });
