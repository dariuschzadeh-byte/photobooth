/* =====================================================================
   Strip builder — fr-anz photobooth
   Builds the full 4x6" sheet (1200x1800) = two identical 2x6" strips.
   LAYOUT: the 3 photos run FULL-BLEED to the top and both sides (no
   outer cream frame, square corners). Cream shows ONLY as a thin gap
   BETWEEN the photos, plus the footer band with the fr-anz logo.
   LOOK (baked per photo): clean flash grade (sharpen + color, NO grain)
   + a soft rhode-style backdrop gradient (bright centre, deeper pink
   towards the edges). No crop — the framing is left to the camera.
   Pure JS (Jimp), no native modules.
   ===================================================================== */

const Jimp = require("jimp");
const config = require("../config");

const S = config.strip;
const DPI = S.dpi;                   // 300
const STRIP_W = S.widthInch  * DPI;  // 600
const SHEET_W = STRIP_W * 2;         // 1200
const H       = S.heightInch * DPI;  // 1800

function rgba(a){ return Jimp.rgbaToInt(a[0], a[1], a[2], 255); }
function clamp(v){ return v < 0 ? 0 : v > 255 ? 255 : v; }

/**
 * Soft shoulder instead of a brick wall.
 *
 * Above `knee` the response bends over towards 255 rather than running
 * into it, so a bright area keeps some separation instead of turning into
 * one flat patch of white. It cannot invent detail that the camera never
 * recorded -- once a channel came out of the sensor at 255 there is
 * nothing left to recover -- but it stops the grade from pushing more of
 * the frame into that state.
 */
function shoulder(v, knee, strength){
  if (strength <= 0) return v;
  const k = knee * 255;
  if (v <= k) return v;
  const range = 255 - k;
  const over = (v - k) / range;
  return k + range * (1 - Math.pow(1 - Math.min(1, over), 1 + strength * 3));
}

/**
 * Brightness only: overall exposure and a soft top end.
 *
 * Deliberately NOT part of flashGrade. Exposure is not colour grading, and
 * bundling them meant that turning the grade off -- to get the plain look
 * the booth printed until June -- also silently removed the one thing
 * holding back a camera that is overexposing. Two questions, two switches.
 */
function toneStage(img){
  const t = S.tone || {};
  if (t.enabled === false) return img;

  const exposure = t.exposure == null ? 1 : t.exposure;
  const knee = t.highlightKnee == null ? 1 : t.highlightKnee;
  const shoulderAmt = t.highlightRolloff == null ? 0 : t.highlightRolloff;
  if (exposure === 1 && shoulderAmt <= 0) return img;   // nothing to do

  img.scan(0,0,img.bitmap.width,img.bitmap.height,function(x,y,idx){
    for(let c=0;c<3;c++){
      let v=this.bitmap.data[idx+c];
      if (exposure !== 1) v*=exposure;
      this.bitmap.data[idx+c]=clamp(shoulder(v,knee,shoulderAmt));
    }
  });
  return img;
}

/* ---- clean flash grade: colour + saturation + shadow lift + contrast + unsharp ---- */
function flashGrade(img){
  const g = S.grade;
  if (g.enabled === false) return img;

  const gainFalloff = g.gainFalloff == null ? 0 : g.gainFalloff;
  const warmth = g.warmth == null ? 0 : g.warmth;
  const magenta = g.magenta == null ? 0 : g.magenta;
  const warmthFloor = g.warmthFloor == null ? 0 : g.warmthFloor;
  const warmthFull  = g.warmthFull  == null ? 0 : g.warmthFull;
  const skinOnly = g.warmthSkinOnly !== false;
  const skinLo = g.warmthSkinLo == null ? 0 : g.warmthSkinLo;
  const skinHi = g.warmthSkinHi == null ? 12 : g.warmthSkinHi;

  img.scan(0,0,img.bitmap.width,img.bitmap.height,function(x,y,idx){
    let r=this.bitmap.data[idx], gr=this.bitmap.data[idx+1], b=this.bitmap.data[idx+2];

    /* The colour correction, weakened as the pixel gets bright.
     *
     * The gains are unequal by design -- they cancel a red cast measured
     * against a white t-shirt. That works in the midtones and backfires in
     * the highlights, and the reason is arithmetic: pink has red as its
     * highest channel, so red hits 255 first and stops, while green and
     * blue still have headroom AND get multiplied up. The brighter the
     * area, the more they catch up, until the pink is gone and what is
     * left reads white or faintly blue. Measured on the backdrop colour:
     * R-B falls from 60 at normal exposure to 0 at 1.45x.
     *
     * Fading the gains out towards white keeps the correction where it was
     * measured and takes it out of the range where it does damage.
     */
    const lum0 = (0.299*r + 0.587*gr + 0.114*b) / 255;
    const w = gainFalloff > 0 ? 1 - Math.pow(Math.min(1, Math.max(0, lum0)), gainFalloff) : 1;
    r*=1+(g.rGain-1)*w; gr*=1+(g.gGain-1)*w; b*=1+(g.bGain-1)*w;

    /* One dial for "warmer" / "cooler", on top of the measured gains.
     *
     * The gains above are a correction: they cancel a cast the camera
     * introduces, and they were measured against a white t-shirt. Nudging
     * them to taste destroys that measurement and nobody can tell later
     * which number was evidence and which was preference. This is the
     * preference dial, kept separate so the correction stays intact.
     *
     * It is weighted by how light the pixel already is, and that is not a
     * refinement -- it is what makes the filter usable on everybody who
     * walks into this booth. Warmth added evenly turns already-dark skin
     * muddy and orange while barely touching pale skin. Ramping it from
     * warmthFloor to warmthFull means light skin picks up the tan the dial
     * is there for, and dark skin is left as the camera saw it.
     *
     * Set warmthFloor equal to warmthFull to go back to a flat curve. */
    if (warmth) {
      const lum = (0.299*r + 0.587*gr + 0.114*b) / 255;
      let wt;
      if (warmthFull <= warmthFloor) wt = 1;
      else {
        wt = (lum - warmthFloor) / (warmthFull - warmthFloor);
        wt = wt < 0 ? 0 : wt > 1 ? 1 : wt;
        wt = wt * wt * (3 - 2 * wt);        // smoothstep: no visible edge
      }
      /* Keep the warmth off the backdrop.
       *
       * Warmth strong enough to tan light skin also turns the pink wall
       * orange and the white shirts cream, because both are bright and the
       * ramp above only looks at brightness. Measured at warmth 0.25 the
       * backdrop's R-B doubles, from 40 to 80 -- a different brand colour,
       * not a warmer photo.
       *
       * Skin and the backdrop separate cleanly on one number here. After
       * the gains, skin sits at green-minus-blue around +14, the fr-anz
       * pink at about -6, a white shirt near +4. Ramping across that gap
       * leaves the wall alone, warms skin fully, and gives shirts a third
       * of the effect, which reads as film warmth rather than a stain.
       *
       * skinOnly:false turns this off and warms everything evenly. */
      let skin = 1;
      if (skinOnly) {
        skin = ((gr - b) - skinLo) / (skinHi - skinLo);
        skin = skin < 0 ? 0 : skin > 1 ? 1 : skin;
        skin = skin * skin * (3 - 2 * skin);
      }

      const a = warmth * wt * skin;

      /* Pull green and blue DOWN rather than pushing red up.
       *
       * Lifting red is the obvious move and it does not work here: on light
       * skin red already sits near 240 and clips at 255 almost immediately,
       * so the pixel gets brighter and pinker instead of browner. Measured
       * on R240 G200 B185 at a=0.10, lifting red leaves mean brightness at
       * 207 against 208 -- no tan at all, just a sunburn.
       *
       * Taking green and blue down instead darkens and warms in one move,
       * which is what a tan actually is. Blue falls furthest (skin turns
       * yellow-brown, not red), green follows at about a third of that so
       * the result does not slide towards orange. */
      r *= 1 + a * 0.10;
      gr *= 1 - a * 0.35;
      b  *= 1 - a * 1.10;
    }

    /* The backdrop's hue, on the salmon <-> magenta axis.
     *
     * The strips kept as the reference have a luminous pink leaning
     * violet. What comes off the booth now is a duller salmon, leaning
     * orange -- and the grade is bit-identical to the one those strips
     * were printed with, so the difference is the wall itself: repainted
     * matte, quite possibly from a different tin.
     *
     * Salmon and magenta separate on the same number the warmth dial
     * uses, just the other way round: the backdrop has blue at or above
     * green, skin has green clearly above blue. So this rides the INVERSE
     * of the skin gate -- it moves the wall and leaves faces alone, which
     * is what stops the whole thing turning purple.
     */
    if (magenta) {
      let wall = 1;
      if (skinOnly) {
        wall = 1 - (((gr - b) - skinLo) / (skinHi - skinLo));
        wall = wall < 0 ? 0 : wall > 1 ? 1 : wall;
        wall = wall * wall * (3 - 2 * wall);
      }
      const m = magenta * wall;
      b  *= 1 + m * 1.00;
      gr *= 1 - m * 0.55;
    }

    r=clamp(r); gr=clamp(gr); b=clamp(b);
    let lum=0.299*r+0.587*gr+0.114*b;
    r=lum+(r-lum)*g.sat; gr=lum+(gr-lum)*g.sat; b=lum+(b-lum)*g.sat;
    // shadowLift is a FRACTION of the full range, hence the *255.
    //
    // The old code left that factor out, so the lever added at most 0.22 of
    // 255 levels while its comment claimed to be lifting faces and the navy
    // shirt. It never did. It was not quite nothing either: the values land
    // in a Uint8Array, which truncates, so a sub-level addition still
    // nudged about a tenth of all channels by one step. Measured against
    // the old build, turning it off moves 11% of channels by 1-2 of 255 --
    // far under anything a dye-sub printer can resolve.
    const mean=(r+gr+b)/3, m=Math.pow(1-mean/255,2), lift=g.shadowLift*255*m;
    r+=lift; gr+=lift; b+=lift;
    r=(r-128)*g.contrast+128; gr=(gr-128)*g.contrast+128; b=(b-128)*g.contrast+128;
    this.bitmap.data[idx]=clamp(r); this.bitmap.data[idx+1]=clamp(gr); this.bitmap.data[idx+2]=clamp(b);
  });
  // unsharp mask: original + amount * (original - blurred)
  const blur=img.clone().blur(g.sharpRadius);
  const amt=g.sharpAmount;
  img.scan(0,0,img.bitmap.width,img.bitmap.height,function(x,y,idx){
    for(let c=0;c<3;c++){
      const o=this.bitmap.data[idx+c], bl=blur.bitmap.data[idx+c];
      this.bitmap.data[idx+c]=clamp(o+amt*(o-bl));
    }
  });
  return img;
}

/* ---- soft rhode backdrop gradient: bright centre, deeper pink toward edges ---- */
function backdropGradient(img){
  if (S.backdrop.enabled === false) return img;
  const w=img.bitmap.width, h=img.bitmap.height;
  const cx=w/2, cy=h*S.backdrop.headBias;
  const str=S.backdrop.strength, satb=S.backdrop.satBoost, p=S.backdrop.falloff;
  /* How much of the falloff runs sideways.
   *
   * 0 measures distance from the centre in both directions at once, which
   * draws a circle -- a bright disc around the head with everything else
   * dimmed, and that circle is visible as a circle rather than as light.
   * 1 measures the horizontal distance only: bright down the middle where
   * the person stands, deepening towards the left and right edges where
   * the wall is actually in shot. In between mixes the two. */
  const side = S.backdrop.sideBias == null ? 0 : S.backdrop.sideBias;
  const vert = 1 - (side < 0 ? 0 : side > 1 ? 1 : side);
  const cool = S.backdrop.coolEdges == null ? 0 : S.backdrop.coolEdges;
  const gate = S.grade && S.grade.warmthSkinOnly !== false;
  const glo = S.grade && S.grade.warmthSkinLo != null ? S.grade.warmthSkinLo : 0;
  const ghi = S.grade && S.grade.warmthSkinHi != null ? S.grade.warmthSkinHi : 12;

  img.scan(0,0,w,h,function(x,y,idx){
    let dx=(x-cx)/(w/2), dy=((y-cy)/(h/2))*vert;
    let d=Math.sqrt(dx*dx+dy*dy); if(d>1)d=1;
    const m=Math.pow(d,p), fac=1-str*m;
    let r=this.bitmap.data[idx]*fac, gr=this.bitmap.data[idx+1]*fac, b=this.bitmap.data[idx+2]*fac;

    /* Cool the corners.
     *
     * The look being chased has a warm pink centre falling away to
     * something almost blue at the edges -- the wall lit from the middle
     * and going cold where the light does not reach. The vignette already
     * darkens by distance; this bends the hue by the same distance.
     *
     * Gated to the wall exactly as grade.magenta is: skin has green well
     * above blue, the backdrop does not. Without that, an arm near the
     * frame edge would turn blue while the same arm in the middle did
     * not, which reads as a fault rather than a look. */
    if (cool) {
      let wall = 1;
      if (gate) {
        wall = 1 - (((gr - b) - glo) / (ghi - glo));
        wall = wall < 0 ? 0 : wall > 1 ? 1 : wall;
        wall = wall * wall * (3 - 2 * wall);
      }
      const c = cool * m * wall;
      b  *= 1 + c;
      gr *= 1 - c * 0.45;
      r  *= 1 - c * 0.18;
    }
    const lum=0.299*r+0.587*gr+0.114*b, s=1+satb*m;
    r=lum+(r-lum)*s; gr=lum+(gr-lum)*s; b=lum+(b-lum)*s;
    this.bitmap.data[idx]=clamp(r); this.bitmap.data[idx+1]=clamp(gr); this.bitmap.data[idx+2]=clamp(b);
  });
  return img;
}

/* ---- one strip column: 3 full-bleed photos + cream gaps + logo footer ---- */
async function buildStripBlock(photoPaths, blockW){
  const n=config.photos;
  const gap=S.gap;                 // cream gap BETWEEN photos
  const footerH=S.footerHeight||0; // cream band at the bottom for the logo
  const block=new Jimp(blockW, H, rgba(S.paper));   // paper = cream

  const availH=H-footerH;          // photos start at the very top (full bleed)
  const cellH=Math.floor((availH-(n-1)*gap)/n);
  for(let i=0;i<n;i++){
    const src=photoPaths[i]||photoPaths[photoPaths.length-1];
    let photo=await Jimp.read(src);
    photo.cover(blockW, cellH);     // full width + height, square corners
    toneStage(photo);               // brightness first...
    flashGrade(photo);              // ...then colour...
    backdropGradient(photo);        // ...then the vignette
    block.composite(photo, 0, i*(cellH+gap));
  }

  if(footerH>0){
    try{
      const logo=await Jimp.read(config.paths.footer);
      const maxW=Math.round(blockW  * (S.logoWidthRatio  || 0.5));
      const maxH=Math.round(footerH * (S.logoHeightRatio || 0.78));
      logo.scaleToFit(maxW, maxH);
      const lx=Math.round((blockW-logo.bitmap.width)/2);
      const ly=(H-footerH)+Math.round((footerH-logo.bitmap.height)/2);
      block.composite(logo, lx, ly);
    }catch(e){ console.warn("[strip] logo missing, skipping footer:", e.message); }
  }
  return block;
}

/* Put a block into one cut piece of the sheet, centred on that piece.
 *
 * The block is built wider than a strip when the blade is off centre, so
 * there is material to give away on the side that gets eaten. Taking the
 * middle window of it keeps whoever is standing there in the middle of
 * the strip they end up holding. */
function placeInPiece(sheet, block, x0, pieceW){
  const bw = block.bitmap.width;
  const sx = Math.round((bw - pieceW) / 2);
  if (sx >= 0) {
    sheet.composite(block.clone().crop(sx, 0, Math.min(pieceW, bw - sx), H), x0, 0);
  } else {
    // Narrower than the piece: centre it and let the paper show. Only
    // reachable if someone sets a negative bleed by hand.
    sheet.composite(block, x0 + Math.round((pieceW - bw) / 2), 0);
  }
}

/* ---- full sheet: two identical strips, full-bleed, cut between them ----
 *
 * Both halves have always been the same block written twice, so a strip
 * that comes off the printer framed differently from its twin is never
 * the software -- it is the blade landing somewhere other than the middle
 * of the sheet. cutOffsetMM says where it really lands and the halves are
 * laid out around that instead of around the nominal centre.
 */
async function buildStrip(photoPaths, outPath){
  const mm = S.cutOffsetMM || 0;
  // Measured as the width difference between the two cut strips, so the
  // seam itself sits half of that off centre.
  const k = Math.round((mm * DPI / 25.4) / 2);
  const bleed = 2 * Math.abs(k);
  const block = await buildStripBlock(photoPaths, STRIP_W + bleed);
  const sheet = new Jimp(SHEET_W, H, rgba(S.paper));
  const cut = STRIP_W + k;                       // where the blade lands
  placeInPiece(sheet, block, 0,   cut);          // left piece
  placeInPiece(sheet, block, cut, SHEET_W - cut);// right piece
  sheet.quality(95);
  await sheet.writeAsync(outPath);
  return outPath;
}

module.exports = { buildStrip, toneStage, flashGrade, backdropGradient, W: SHEET_W, H, STRIP_W, SHEET_W };