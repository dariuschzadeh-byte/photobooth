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

/* ---- clean flash grade: colour + saturation + shadow lift + contrast + unsharp ---- */
function flashGrade(img){
  const g = S.grade;
  img.scan(0,0,img.bitmap.width,img.bitmap.height,function(x,y,idx){
    let r=this.bitmap.data[idx], gr=this.bitmap.data[idx+1], b=this.bitmap.data[idx+2];
    r*=g.rGain; gr*=g.gGain; b*=g.bGain;
    r=clamp(r); gr=clamp(gr); b=clamp(b);
    let lum=0.299*r+0.587*gr+0.114*b;
    r=lum+(r-lum)*g.sat; gr=lum+(gr-lum)*g.sat; b=lum+(b-lum)*g.sat;
    const mean=(r+gr+b)/3, m=Math.pow(1-mean/255,2), lift=g.shadowLift*m;
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
  const w=img.bitmap.width, h=img.bitmap.height;
  const cx=w/2, cy=h*S.backdrop.headBias;
  const str=S.backdrop.strength, satb=S.backdrop.satBoost, p=S.backdrop.falloff;
  img.scan(0,0,w,h,function(x,y,idx){
    let dx=(x-cx)/(w/2), dy=(y-cy)/(h/2);
    let d=Math.sqrt(dx*dx+dy*dy); if(d>1)d=1;
    const m=Math.pow(d,p), fac=1-str*m;
    let r=this.bitmap.data[idx]*fac, gr=this.bitmap.data[idx+1]*fac, b=this.bitmap.data[idx+2]*fac;
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
    flashGrade(photo);
    backdropGradient(photo);
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

/* ---- full sheet: two identical strips, full-bleed, centre cut between them ---- */
async function buildStrip(photoPaths, outPath){
  const block=await buildStripBlock(photoPaths, STRIP_W);
  const sheet=new Jimp(SHEET_W, H, rgba(S.paper));
  sheet.composite(block, 0, 0);          // left strip
  sheet.composite(block, STRIP_W, 0);    // right strip
  sheet.quality(95);
  await sheet.writeAsync(outPath);
  return outPath;
}

module.exports = { buildStrip, W: SHEET_W, H, STRIP_W, SHEET_W };