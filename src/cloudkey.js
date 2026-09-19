/* =====================================================================
   The booth key, as a person has to hand it over.

   It reaches the booth PC by voice as often as by paste -- read out on a
   call from Europe to a PC in Bali -- and a 32-character mixed-case string
   does not survive that. So booth keys are four groups of four, from an
   alphabet with nothing that can be mistaken for something else: no 0/O,
   1/I/L, 2/Z, 5/S, 6/G, 8/B, and no Q next to O.

   However it is typed -- any case, with or without dashes or spaces -- it
   comes out as the same canonical XXXX-XXXX-XXXX-XXXX, and that exact
   string is what gets hashed on both sides. Anything that is not in this
   shape is kept exactly as given, so an older long key still works.
   ===================================================================== */

const ALPHABET = "ACDEFHJKMNPRTUVWXY34679";

function normalize(raw) {
  const s = String(raw == null ? "" : raw).trim();
  if (/^[A-Za-z0-9]{4}(?:[\s-]*[A-Za-z0-9]{4}){3}$/.test(s)) {
    const u = s.replace(/[\s-]/g, "").toUpperCase();
    return `${u.slice(0, 4)}-${u.slice(4, 8)}-${u.slice(8, 12)}-${u.slice(12)}`;
  }
  return s;
}

/** A fresh key in the canonical form. ~72 bits. */
function generate() {
  const crypto = require("crypto");
  let out = "";
  for (let i = 0; i < 16; i++) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return normalize(out);
}

/** What the database stores for a key: the same hash the Edge Function makes. */
function hash(key) {
  return require("crypto").createHash("sha256").update(normalize(key), "utf8").digest("hex");
}

module.exports = { normalize, generate, hash, ALPHABET };
