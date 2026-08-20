/* =====================================================================
   events.js -- one append-only line per thing that happens.

   WHY THIS EXISTS
   ---------------------------------------------------------------------
   The old numbers were reverse-engineered from whatever happened to be on
   disk: prints were counted by listing *.png, redemptions by running a
   regex over redemptions.log. That works until you ask a sharper question.
   Two it could not answer, both of which matter:

     - "A guest typed a code but no strip came out" -- the single best early
       warning that the camera or printer is dying. Invisible, because a
       failed session leaves no file behind.
     - "How many of today's 14 prints were staff tests?" -- also invisible,
       because a test strip is just another PNG.

   So: every meaningful step appends one JSON line here. Cheap to write,
   trivial to read back, and it is what the cloud dashboard ships upstream.

   Format is JSON Lines (one object per line). A half-written line at the
   end -- power cut mid-append -- is skipped on read rather than throwing,
   which is the whole reason for not using a single big JSON array.
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const config = require("../config");

const FILE = path.join(config.paths.data, "events.log");

// Roughly 60 days of a busy booth. Read is capped so /admin stays instant
// even if nobody ever rotates the file.
const MAX_READ_BYTES = 8 * 1024 * 1024;

/**
 * Append one event. Never throws: a booth that cannot log must still take
 * photos. Every call site is inside the guest flow.
 */
function log(type, data = {}) {
  try {
    // The id is generated here, at write time, and never changes. That is
    // what makes shipping events to the cloud idempotent: the booth can
    // resend the last few minutes after a dropped connection and the
    // database simply ignores the ones it already has.
    const line = JSON.stringify({ id: crypto.randomUUID(), at: new Date().toISOString(), type, ...data });
    fs.appendFileSync(FILE, line + "\n");
  } catch (e) { /* logging must never break a session */ }
}

/** All events, oldest first. Bad lines are skipped, never fatal. */
function all() {
  let raw = "";
  try {
    const size = fs.statSync(FILE).size;
    const fd = fs.openSync(FILE, "r");
    try {
      // Read only the tail if the file has grown large, then drop the first
      // (probably partial) line.
      const start = Math.max(0, size - MAX_READ_BYTES);
      const buf = Buffer.alloc(size - start);
      fs.readSync(fd, buf, 0, buf.length, start);
      raw = buf.toString("utf8");
      if (start > 0) raw = raw.slice(raw.indexOf("\n") + 1);
    } finally { fs.closeSync(fd); }
  } catch (e) { return []; }

  const out = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      const d = new Date(e.at);
      if (isNaN(d)) continue;
      e.date = d;
      out.push(e);
    } catch (e2) { /* torn line, skip */ }
  }
  return out;
}

/** Events newer than `days` days, oldest first. */
function since(days) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return all().filter(e => e.date.getTime() >= cutoff);
}

module.exports = { log, all, since, FILE };
