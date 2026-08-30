/* =====================================================================
   EXAMPLE-STRIP.png -- what a strip looks like with the settings that
   are in config.js right now, without a camera, a guest or a sheet of
   paper.

   Honest about what this is: the three frames are a MOCK, not a
   photograph. Nobody's face is in here. What it does reproduce is the
   part the colour settings actually act on --

     the fr-anz wall, lit brightly in the middle and falling away,
     skin, and light clothing,

   each of them run through the camera's own colour cast before the
   pipeline sees them, so the numbers going in are the numbers the
   software really gets. The cast is the one hard measurement on record:
   white cloth is written by this camera as 244,174,166 (see the note on
   rGain in config.js). White is 255 in all three channels, so that pixel
   IS the cast, and everything else the camera sees passes through the
   same filter.

   Use it to judge the gradient, the depth of the corners and the colour
   of the wall. Do NOT use it to judge skin tone -- a flat oval of one
   colour cannot tell you that. MATCH-LOOK on a real session can.

   Usage:  node scripts/example-strip.js
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const Jimp = require("jimp");
const config = require("../config");
const { buildStrip } = require("../src/strip");

const CAST = [244 / 255, 174 / 255, 166 / 255];
const shot = t => t.map((v, i) => Math.min(255, Math.round(v * CAST[i])));

// True colours, before the camera gets hold of them.
const WALL  = [242, 186, 198];   // solved so green-minus-blau lands on the documented -6
const SKIN  = [228, 182, 162];
const SHIRT = [252, 250, 246];
const HAIR  = [ 64,  48,  44];

/* One frame as the camera writes it: the wall lit from the flash, so
   bright in the middle and falling off to the sides, with a person in
   front of it. The falloff is put in here rather than left to the
   software on purpose -- the real wall is lit unevenly and a preview
   built on a perfectly flat wall flatters the settings. */
async function frame(w, h, pose) {
  const img = new Jimp(w, h);
  const cx = w * (0.5 + pose.dx), hy = h * (0.34 + pose.dy), hr = h * 0.21 * pose.scale;

  img.scan(0, 0, w, h, function (x, y, idx) {
    // flash falloff across the wall, strongest at the middle
    const d = Math.hypot((x - w * 0.5) / (w * 0.62), (y - h * 0.34) / (h * 0.85));
    const lit = 1 - 0.30 * Math.min(1, d) ** 1.6;

    const headD  = Math.hypot((x - cx) / (hr * 0.78), (y - hy) / hr);
    const hairD  = Math.hypot((x - cx) / (hr * 0.90), (y - (hy - hr * 0.30)) / (hr * 0.86));
    const body   = y > hy + hr * 1.15 && Math.abs(x - cx) < w * 0.20;
    const arms   = y > hy + hr * 1.45 && Math.abs(x - cx) < w * 0.31;

    let c = WALL, ownLit = lit;
    if (headD < 1)      { c = SKIN;  ownLit = lit * 1.04; }
    else if (hairD < 1) { c = HAIR;  ownLit = lit; }
    else if (body)      { c = SHIRT; ownLit = lit * 0.98; }
    else if (arms)      { c = SKIN;  ownLit = lit * 0.96; }

    const raw = shot(c.map(v => v * ownLit));
    this.bitmap.data[idx]     = raw[0];
    this.bitmap.data[idx + 1] = raw[1];
    this.bitmap.data[idx + 2] = raw[2];
    this.bitmap.data[idx + 3] = 255;
  });
  return img;
}

(async () => {
  const dir = path.join(config.paths.output, "analysis");
  fs.mkdirSync(dir, { recursive: true });

  // 3:2, the shape the Canon actually delivers.
  const W = 1200, H = 800;
  const poses = [
    { dx:  0.00, dy:  0.00, scale: 1.00 },
    { dx: -0.07, dy:  0.03, scale: 1.06 },
    { dx:  0.05, dy: -0.02, scale: 0.96 },
  ];

  const tmp = [];
  for (let i = 0; i < poses.length; i++) {
    const f = path.join(dir, `_example-frame-${i}.jpg`);
    await (await frame(W, H, poses[i])).quality(96).writeAsync(f);
    tmp.push(f);
  }

  const out = path.join(config.paths.root, "EXAMPLE-STRIP.png");
  await buildStrip(tmp, out);
  for (const f of tmp) { try { fs.unlinkSync(f); } catch (e) {} }

  const S = config.strip;
  console.log("\n  EXAMPLE-STRIP.png written to the photobooth folder.");
  console.log("  Built with the settings that are in config.js right now:");
  console.log(`    brightness  ${S.tone.exposure}`);
  console.log(`    gradient    ${S.backdrop.strength}   depth ${S.backdrop.satBoost}   falloff ${S.backdrop.falloff}`);
  console.log(`    shape       ${S.backdrop.sideBias}  (0 = circle, 1 = sideways only)`);
  console.log(`    tan         ${S.grade.warmth}  on light skin only, ramp ${S.grade.warmthFloor}-${S.grade.warmthFull}`);
  console.log(`    magenta     ${S.grade.magenta}   cool edges ${S.backdrop.coolEdges}`);
  console.log(`    cut offset  ${S.cutOffsetMM} mm`);
  console.log("\n  The three frames are a mock, not a photograph -- judge the");
  console.log("  wall, the gradient and the corners by it, never skin tone.\n");
})().catch(e => { console.error("  Failed: " + e.message); process.exit(1); });
