/* =====================================================================
   How much paper is left in the printer.

   The printer knows exactly -- the ink ribbon carries a chip that counts
   every print -- but the only thing on this PC that ever asked it was DNP
   Hot Folder Print, which wrote the answer to printer_status.txt. Since
   printing goes straight to Windows, HFP no longer runs. Its file stays
   behind with the last count it read, frozen, and every number in it
   still looks current. The control page went on showing it as live.

   So the count now starts from the newest reading anybody can vouch for
   and is counted down with the booth's own record of every sheet it sent
   to the printer:

     readings, newest wins
       printer    HFP's printer_status.txt, dated by when HFP last wrote it
       new_roll   "New roll" pressed on /admin -- a full roll
       entered    a number typed in on /admin, e.g. off DNP's Status App
     minus
       every print_ok and test_print event marked printed:true after it

   It cannot see a sheet printed from outside the booth, or a roll changed
   without anyone pressing "New roll". The page always says which reading
   it counts from, so a wrong number is visibly wrong rather than quietly
   wrong -- which is the whole difference from what was there before.
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const config = require("../config");
const events = require("./events");

const FILE = path.join(config.paths.data, "media.json");
const PER_ROLL = (config.ops && config.ops.sheetsPerRoll) || 700;

function stored() {
  try {
    const m = JSON.parse(fs.readFileSync(FILE, "utf8"));
    if (Number.isFinite(m.remaining) && m.at && !isNaN(new Date(m.at))) return m;
  } catch (e) {}
  return null;
}

/** Record a reading: a fresh roll, or a number read off the printer. */
function set(remaining, source) {
  const v = Math.round(Number(remaining));
  if (!Number.isFinite(v) || v < 0 || v > PER_ROLL * 2) {
    throw new Error(`not a sensible sheet count: ${remaining}`);
  }
  const rec = { remaining: v, at: new Date().toISOString(), source };
  fs.mkdirSync(config.paths.data, { recursive: true });
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(rec, null, 2));
  fs.renameSync(tmp, FILE);
  events.log("media_set", { remaining: v, source });
  return rec;
}

/** Sheets that actually went to the printer after a moment in time. */
function sheetsPrintedSince(iso, evs) {
  const t = new Date(iso).getTime();
  return (evs || events.all()).filter(e =>
    (e.type === "print_ok" || e.type === "test_print") &&
    e.printed === true &&
    e.date.getTime() > t).length;
}

/**
 * The best count available right now.
 *
 * `hfp` is what stats.printer() read from Hot Folder Print's file. It is
 * only taken as a reading while the printer was reporting itself healthy
 * -- a status written while the printer was off says nothing about paper.
 */
function estimate(hfp, evs) {
  const readings = [];
  if (hfp && hfp.found && hfp.online && Number.isFinite(hfp.sheets) && hfp.at) {
    readings.push({ remaining: hfp.sheets, at: hfp.at, source: "printer" });
  }
  const s = stored();
  if (s) readings.push({ remaining: s.remaining, at: s.at, source: s.source });
  if (!readings.length) return { known: false, perRoll: PER_ROLL };

  readings.sort((a, b) => (a.at < b.at ? 1 : -1));
  const base = readings[0];
  const used = sheetsPrintedSince(base.at, evs);
  return {
    known: true,
    remaining: Math.max(0, base.remaining - used),
    base,
    printedSince: used,
    perRoll: PER_ROLL,
    // Only a printer reading with nothing printed since is the printer's
    // own number; everything else is counted.
    counted: !(base.source === "printer" && used === 0),
  };
}

module.exports = { estimate, set, sheetsPrintedSince, PER_ROLL, FILE };
