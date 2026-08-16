/* =====================================================================
   stats.js -- everything the control centre shows.

   Data comes from four places, all of them already on disk:
     - data/codes.json        who redeemed what, and when
     - data/redemptions.log   the same, plus history from earlier batches
     - output/prints/*.png    one file per printed strip, with a timestamp
     - DNP printer_status.txt live media count straight from the printer

   Nothing here writes anything. Safe to call as often as you like.
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const config = require("../config");

const DNP_STATUS = "C:\\DNP\\HotFolderPrint\\Logs\\printer_status.txt";

// One 4x6 sheet is cut into two 2x6 strips.
const STRIPS_PER_SHEET = 2;
// Below this many sheets, staff should order new media.
const LOW_MEDIA_SHEETS = 50;

/** Live printer state: media left, lifetime prints, online or not. */
function printer() {
  try {
    const raw = JSON.parse(fs.readFileSync(DNP_STATUS, "utf8"));
    const p = Array.isArray(raw) ? raw[0] : raw;
    const sheets = Number(p.MediaRemaining) || 0;
    return {
      found: true,
      online: p.Status === "STATUS_OK",
      status: p.Status || "unknown",
      model: p.Model || "?",
      sheets,
      strips: sheets * STRIPS_PER_SHEET,
      lifeCounter: Number(p.LifeCounter) || 0,
      low: sheets > 0 && sheets < LOW_MEDIA_SHEETS,
    };
  } catch (e) {
    // No status file = Hot Folder Print is not running or the printer is off.
    return { found: false, online: false, status: "offline", sheets: 0, strips: 0, lifeCounter: 0, low: false };
  }
}

/** Every printed strip we produced, as timestamps. */
function printTimestamps() {
  try {
    return fs.readdirSync(config.paths.prints)
      .filter(f => /\.png$/i.test(f))
      .map(f => {
        try { return fs.statSync(path.join(config.paths.prints, f)).mtime; }
        catch (e) { return null; }
      })
      .filter(Boolean);
  } catch (e) { return []; }
}

/** Redemptions from the log -- keeps history even after a batch is replaced. */
function redemptionTimestamps() {
  try {
    return fs.readFileSync(config.paths.redemptionsLog, "utf8")
      .split(/\r?\n/)
      .map(line => {
        const m = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/);
        if (!m) return null;
        if (/RELEASED/.test(line)) return null;      // a release is not a use
        const d = new Date(m[1]);
        return isNaN(d) ? null : d;
      })
      .filter(Boolean);
  } catch (e) { return []; }
}

function ymd(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

/** Count per day for the last `days` days, oldest first. */
function byDay(dates, days) {
  const buckets = new Map();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    buckets.set(ymd(d), { date: new Date(d), count: 0 });
  }
  for (const d of dates) {
    const k = ymd(d);
    if (buckets.has(k)) buckets.get(k).count++;
  }
  return [...buckets.values()];
}

/** Count per hour of day (0-23), across all data. */
function byHour(dates) {
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
  for (const d of dates) hours[d.getHours()].count++;
  return hours;
}

function isToday(d) {
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

function sinceDays(d, n) {
  return (Date.now() - d.getTime()) < n * 24 * 60 * 60 * 1000;
}

/** Recent flash misfires, read back out of the server log. */
function flashWarnings(limit = 5) {
  try {
    const logFile = path.join(config.paths.data, "server.log");
    return fs.readFileSync(logFile, "utf8")
      .split(/\r?\n/)
      .filter(l => /\[flash\] WARNING/.test(l))
      .slice(-limit)
      .reverse();
  } catch (e) { return []; }
}

function collect(codeStats) {
  const prints = printTimestamps();
  const redemptions = redemptionTimestamps();
  const pr = printer();

  const printsToday = prints.filter(isToday).length;
  const prints7 = prints.filter(d => sinceDays(d, 7)).length;

  // How long the media lasts at the current rate.
  const perDay = prints7 / 7;
  const daysLeft = perDay > 0.2 ? Math.round(pr.strips / perDay) : null;

  return {
    codes: codeStats,
    printer: pr,
    prints: {
      total: prints.length,
      today: printsToday,
      last7: prints7,
      perDay: Math.round(perDay * 10) / 10,
      daysLeft,
    },
    redemptions: {
      total: redemptions.length,
      today: redemptions.filter(isToday).length,
      last7: redemptions.filter(d => sinceDays(d, 7)).length,
    },
    charts: {
      printsByDay: byDay(prints, 14),
      printsByHour: byHour(prints),
      redemptionsByDay: byDay(redemptions, 14),
    },
    flashWarnings: flashWarnings(),
    lowMediaThreshold: LOW_MEDIA_SHEETS,
    stripsPerSheet: STRIPS_PER_SHEET,
  };
}

module.exports = { collect, printer };
