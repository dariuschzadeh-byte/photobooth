/* =====================================================================
   Preview mode — run a whole session for real, print nothing.

   The booth prints the moment the third photo is taken; build and print
   sit back to back in one request. So "look at it before it prints" was
   not something that could be answered by finding the right folder --
   there was no moment in between to look at.

   This makes one. The camera fires for real, the strip is built for real
   and lands in output/prints exactly as always. Only the sheet of paper
   is skipped.

   Deliberately NOT config.TEST_MODE, which fakes the camera as well and
   would have you grading placeholder images instead of your own photos.

   The flag lives in data/ rather than in config.js so it can be flipped
   from the admin page on a phone, and so an UPDATE-BOOTH never silently
   turns printing back on -- or leaves it off.
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const config = require("../config");

const FILE = path.join(config.paths.data, "preview-mode.json");

function read() {
  try {
    const j = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return { on: !!j.on, since: j.since || null };
  } catch (e) {
    return { on: false, since: null };   // missing or corrupt = printing normally
  }
}

function set(on) {
  const state = { on: !!on, since: on ? new Date().toISOString() : null };
  fs.mkdirSync(config.paths.data, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(state, null, 2));
  return state;
}

const isOn = () => read().on;

module.exports = { read, set, isOn };
