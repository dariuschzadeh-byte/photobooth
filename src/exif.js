/* =====================================================================
   exif.js -- just enough EXIF to answer "what changed on the camera?"

   Dependency-free on purpose, like the rest of this project. A JPEG's
   APP1 segment holds a little TIFF file; this walks it far enough to pull
   the dozen tags that matter for exposure and stops there. No orientation
   handling, no thumbnails, no MakerNote -- none of that is the question.

   Every guest photo since the booth was built is still on disk, so this
   turns "the prints look different now" into a side-by-side of the actual
   camera settings from then and now.
   ===================================================================== */

const fs = require("fs");

const TAGS = {
  0x010f: "Make",
  0x0110: "Model",
  0x829a: "ExposureTime",
  0x829d: "FNumber",
  0x8822: "ExposureProgram",
  0x8827: "ISO",
  0x9003: "TakenAt",
  0x9204: "ExposureBias",
  0x9207: "MeteringMode",
  0x9209: "Flash",
  0x920a: "FocalLength",
  0xa402: "ExposureMode",
  0xa403: "WhiteBalance",
  0xa406: "SceneCaptureType",
  0x8769: "__exifIFD",
};

const PROGRAM = { 0: "not defined", 1: "manual", 2: "program", 3: "aperture priority", 4: "shutter priority", 5: "creative", 6: "action", 7: "portrait", 8: "landscape" };
const EXP_MODE = { 0: "auto", 1: "MANUAL", 2: "auto bracket" };
const WB = { 0: "AUTO", 1: "manual/preset" };
const METERING = { 0: "unknown", 1: "average", 2: "centre-weighted", 3: "spot", 4: "multi-spot", 5: "pattern/evaluative", 6: "partial" };

function rational(buf, off, le, signed) {
  const a = signed ? buf.readInt32LE(off) : buf.readUInt32LE(off);
  const b = signed ? buf.readInt32LE(off + 4) : buf.readUInt32LE(off + 4);
  const n = le ? a : (signed ? buf.readInt32BE(off) : buf.readUInt32BE(off));
  const d = le ? b : (signed ? buf.readInt32BE(off + 4) : buf.readUInt32BE(off + 4));
  return d === 0 ? 0 : n / d;
}

function readIFD(buf, tiff, ifdOff, le, out) {
  const u16 = o => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = o => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));

  const count = u16(tiff + ifdOff);
  for (let i = 0; i < count; i++) {
    const e = tiff + ifdOff + 2 + i * 12;
    if (e + 12 > buf.length) return;
    const tag = u16(e), type = u16(e + 2), n = u32(e + 4);
    const name = TAGS[tag];
    if (!name) continue;

    const sizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
    const total = (sizes[type] || 1) * n;
    const valOff = total > 4 ? tiff + u32(e + 8) : e + 8;
    if (valOff < 0 || valOff + Math.min(total, 8) > buf.length) continue;

    let value;
    if (type === 2) value = buf.toString("ascii", valOff, valOff + Math.max(0, n - 1)).trim();
    else if (type === 3) value = u16(valOff);
    else if (type === 4) value = u32(valOff);
    else if (type === 5) value = rational(buf, valOff, le, false);
    else if (type === 10) value = rational(buf, valOff, le, true);
    else continue;

    // The Exif sub-IFD is where every exposure tag actually lives; the
    // first IFD only points at it.
    if (name === "__exifIFD") readIFD(buf, tiff, value, le, out);
    else out[name] = value;
  }
}

/** The exposure-relevant tags, or null if the file carries no EXIF. */
function read(file) {
  let buf;
  try { buf = fs.readFileSync(file); } catch (e) { return null; }
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;

  let p = 2;
  while (p + 4 < buf.length) {
    if (buf[p] !== 0xff) break;
    const marker = buf[p + 1];
    const len = buf.readUInt16BE(p + 2);
    if (marker === 0xe1 && buf.toString("ascii", p + 4, p + 10) === "Exif\0\0") {
      const tiff = p + 10;
      if (tiff + 8 > buf.length) return null;
      const le = buf.toString("ascii", tiff, tiff + 2) === "II";
      const first = le ? buf.readUInt32LE(tiff + 4) : buf.readUInt32BE(tiff + 4);
      const out = {};
      readIFD(buf, tiff, first, le, out);
      return out;
    }
    if (marker === 0xda) break;              // start of scan: no more headers
    p += 2 + len;
  }
  return null;
}

/** The same tags, formatted the way a photographer would say them. */
function describe(file) {
  const e = read(file);
  if (!e) return null;
  const shutter = e.ExposureTime ? (e.ExposureTime >= 1 ? e.ExposureTime + "s" : "1/" + Math.round(1 / e.ExposureTime)) : "?";
  return {
    camera: [e.Make, e.Model].filter(Boolean).join(" ").trim() || "?",
    takenAt: e.TakenAt || "?",
    shutter,
    aperture: e.FNumber ? "f/" + (Math.round(e.FNumber * 10) / 10) : "?",
    iso: e.ISO != null ? String(e.ISO) : "?",
    exposureBias: e.ExposureBias != null ? (e.ExposureBias > 0 ? "+" : "") + (Math.round(e.ExposureBias * 10) / 10) + " EV" : "?",
    mode: EXP_MODE[e.ExposureMode] ?? PROGRAM[e.ExposureProgram] ?? "?",
    whiteBalance: WB[e.WhiteBalance] ?? "?",
    metering: METERING[e.MeteringMode] ?? "?",
    flash: e.Flash != null ? ((e.Flash & 1) ? "fired" : "did NOT fire") : "?",
    focalLength: e.FocalLength ? Math.round(e.FocalLength) + "mm" : "?",
  };
}

module.exports = { read, describe };
