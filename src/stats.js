/* =====================================================================
   stats.js -- every number the control centre and the cloud dashboard show.

   Sources, all already on disk:
     data/codes.json        which voucher was redeemed, and when
     data/redemptions.log   the same, plus history from earlier batches
     data/events.log        the full timeline (see src/events.js)
     output/prints/*.png    one file per strip built
     DNP printer_status.txt live media count straight from the printer
     the DNP hot folder      strips waiting to be printed

   Nothing here writes anything. Safe to call as often as you like.
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const config = require("../config");
const events = require("./events");
const special = require("./specialcodes");

const DNP_STATUS = "C:\\DNP\\HotFolderPrint\\Logs\\printer_status.txt";

// One 4x6 sheet is cut into two 2x6 strips.
const STRIPS_PER_SHEET = 2;

const ops = config.ops || {};
const LOW_MEDIA_SHEETS = ops.lowMediaSheets || 50;
const LEAD_TIME_DAYS = ops.mediaLeadTimeDays || 21;
const HOTFOLDER_STUCK_MIN = ops.hotFolderStuckMinutes || 2;
const LOW_CODES_PCT = ops.lowCodesPercent || 15;

/* ===================== printer ====================================== */

/**
 * Live printer state.
 *
 * `statusAgeMinutes` matters as much as the contents: DNP Hot Folder Print
 * rewrites this file continuously, so a file that has stopped changing means
 * HFP has stopped running -- even though every number inside it still looks
 * perfectly fine. That is the quiet failure we are hunting.
 */
function printer() {
  try {
    const st = fs.statSync(DNP_STATUS);
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
      statusAgeMinutes: Math.round((Date.now() - st.mtimeMs) / 60000),
    };
  } catch (e) {
    // No status file at all = Hot Folder Print is not running, or the
    // printer is off and HFP removed its folders.
    return {
      found: false, online: false, status: "offline", model: "?",
      sheets: 0, strips: 0, lifeCounter: 0, low: false, statusAgeMinutes: null,
    };
  }
}

/**
 * Strips sitting in the DNP hot folder. HFP deletes each file as it prints
 * it, so anything older than a couple of minutes was never picked up.
 */
function hotFolder() {
  // Not in use when printing goes straight through Windows. Reporting the
  // folder as missing would be true and useless -- it would raise a
  // critical alert about a route the booth is deliberately not taking.
  if (config.printer && config.printer.mode !== "hotfolder") {
    return { exists: true, waiting: 0, oldestMinutes: null, stuck: false, notInUse: true };
  }
  const dir = config.printer && config.printer.hotFolder;
  if (!dir) return { exists: false, waiting: 0, oldestMinutes: null, stuck: false };
  try {
    const names = fs.readdirSync(dir).filter(f => /\.(png|jpe?g)$/i.test(f));
    let oldest = null;
    for (const n of names) {
      try {
        const m = fs.statSync(path.join(dir, n)).mtimeMs;
        if (oldest === null || m < oldest) oldest = m;
      } catch (e) {}
    }
    const oldestMinutes = oldest === null ? null : Math.round((Date.now() - oldest) / 60000);
    return {
      exists: true,
      waiting: names.length,
      oldestMinutes,
      stuck: oldestMinutes !== null && oldestMinutes >= HOTFOLDER_STUCK_MIN,
    };
  } catch (e) {
    // A missing folder almost always means the printer is off or unplugged:
    // HFP deletes its watched folders when it loses the device.
    return { exists: false, waiting: 0, oldestMinutes: null, stuck: false };
  }
}

/* ===================== time helpers ================================= */

function ymd(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function isToday(d) {
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}
function sinceDays(d, n) { return (Date.now() - d.getTime()) < n * 24 * 60 * 60 * 1000; }

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

/**
 * Weekday x hour. "Busy at 5pm" is not actionable on its own -- 5pm Saturday
 * and 5pm Tuesday are different businesses. This is the grid that tells you
 * when to put a person next to the booth.
 */
function heatmap(dates) {
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const d of dates) grid[d.getDay()][d.getHours()]++;
  return grid;   // grid[0] = Sunday, matching Date.getDay()
}

/* ===================== prints ======================================= */

/**
 * Every strip built, split by who it was for.
 *
 * Staff and master strips are written with a "staff-"/"test-" prefix by
 * server.js. They burn paper exactly like a guest strip -- so they count
 * towards media -- but counting them as business would quietly inflate every
 * revenue number on the dashboard.
 */
function printFiles() {
  let guest = [], staff = [];
  try {
    for (const f of fs.readdirSync(config.paths.prints)) {
      if (!/\.png$/i.test(f)) continue;
      let mtime;
      try { mtime = fs.statSync(path.join(config.paths.prints, f)).mtime; } catch (e) { continue; }
      (/^(staff-|test-)/i.test(f) ? staff : guest).push(mtime);
    }
  } catch (e) { /* folder not there yet */ }
  return { guest, staff };
}

/**
 * Redemptions from the log. Only REDEEMED lines count: the same file also
 * carries RELEASED, STAFF USED and BATCH GENERATED lines, and the previous
 * version of this function counted every one of them as a guest redemption.
 */
function redemptionTimestamps() {
  try {
    return fs.readFileSync(config.paths.redemptionsLog, "utf8")
      .split(/\r?\n/)
      .map(line => {
        if (!/\bREDEEMED\b/.test(line)) return null;
        const m = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/);
        if (!m) return null;
        const d = new Date(m[1]);
        return isNaN(d) ? null : d;
      })
      .filter(Boolean);
  } catch (e) { return []; }
}

/* ===================== derived views ================================ */

/**
 * The guest funnel. A session that starts and never prints is the earliest
 * visible sign that the camera or printer is failing -- earlier than any
 * error, because a guest who walks away never files a complaint.
 */
function funnel(evs) {
  const started = evs.filter(e => e.type === "session_started" && e.kind === "guest").length;
  const printed = evs.filter(e => e.type === "print_ok" && e.kind === "guest").length;
  const failed = evs.filter(e => e.type === "print_failed" && e.kind === "guest").length;
  const captureFailed = evs.filter(e => e.type === "capture_failed").length;
  const released = evs.filter(e => e.type === "session_released" && e.kind === "guest").length;
  return {
    started, printed, failed, captureFailed, released,
    // Sessions that neither printed nor came back to hand the code over --
    // the guest simply left. Never negative, even mid-session.
    abandoned: Math.max(0, started - printed - released),
    completionRate: started ? Math.round((printed / started) * 100) : null,
  };
}

/**
 * Codes typed that did not work. A cluster of these usually means a batch of
 * cards printed badly -- guests reading a 5 as a 6 -- long before anyone
 * thinks to complain about it.
 */
function rejects(evs) {
  const of = r => evs.filter(e => e.type === "code_rejected" && e.result === r).length;
  return { invalid: of("invalid"), used: of("used"), staffLimit: of("staff_limit"), total: evs.filter(e => e.type === "code_rejected").length };
}

/**
 * Per batch: how far through the printed cards you are, and how long a card
 * takes to come back. Both feed the same decision -- when to send the next
 * run to the printers, given they need lead time too.
 */
function batchEconomics(codeStats) {
  const byBatch = new Map();
  for (const b of codeStats.batches || []) {
    byBatch.set(b.batch, {
      batch: b.batch,
      generatedAt: b.generatedAt,
      count: b.count,
      used: 0,
      delaysDays: [],
    });
  }
  for (const u of codeStats.usedList || []) {
    const b = byBatch.get(u.batch);
    if (!b) continue;
    b.used++;
    if (u.usedAt && b.generatedAt) {
      const d = (new Date(u.usedAt) - new Date(b.generatedAt)) / (24 * 3600 * 1000);
      if (d >= 0 && isFinite(d)) b.delaysDays.push(d);
    }
  }
  return [...byBatch.values()].map(b => {
    const sorted = b.delaysDays.slice().sort((x, y) => x - y);
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
    return {
      batch: b.batch,
      generatedAt: b.generatedAt,
      count: b.count,
      used: b.used,
      left: b.count - b.used,
      percentUsed: b.count ? Math.round((b.used / b.count) * 100) : 0,
      medianDaysToRedeem: median === null ? null : Math.round(median * 10) / 10,
    };
  }).sort((a, b) => b.batch - a.batch);
}

/* ===================== alerts ======================================= */

/**
 * Everything worth waking someone up for -- computed here so the control
 * centre and the Telegram alerts can never disagree about what is wrong.
 *
 * Not included: "the booth is offline". A booth that is down cannot report
 * its own silence; the cloud side raises that one from a missing heartbeat.
 */
function buildAlerts({ pr, hf, capacity, codeStats, evs7 }) {
  const a = [];
  const add = (severity, key, title, detail) => a.push({ severity, key, title, detail });

  // The printer status file is written by Hot Folder Print. With printing
  // routed straight through Windows there is nobody writing it, so its
  // absence says nothing about the printer and must not raise an alarm.
  const usingHotFolder = !config.printer || config.printer.mode === "hotfolder";

  if (hf.stuck) {
    add("critical", "hotfolder_stuck",
      `${hf.waiting} strip(s) stuck in the hot folder`,
      `The oldest has been waiting ${hf.oldestMinutes} minutes. DNP Hot Folder Print is almost certainly not running — ` +
      `the booth looks healthy and prints are going nowhere. Start it, or run START-BOOTH.bat again.`);
  }
  if (usingHotFolder && pr.found && pr.statusAgeMinutes !== null && pr.statusAgeMinutes > 15) {
    add("critical", "printer_status_stale",
      `Printer status has not updated in ${pr.statusAgeMinutes} min`,
      "Hot Folder Print writes this file continuously. It stopping means HFP stopped.");
  }
  if (!pr.found && usingHotFolder) {
    add("critical", "printer_offline",
      "No printer status file",
      "The printer is switched off or unplugged, or Hot Folder Print was never started.");
  } else if (pr.found && !pr.online) {
    add("critical", "printer_error", `Printer reports ${pr.status}`, `Model ${pr.model}.`);
  }

  const dark = evs7.filter(e => e.type === "photo_dark").length;
  if (dark) {
    add("warning", "flash_dark",
      `${dark} nearly black photo(s) in the last 7 days`,
      "The flash did not fire. Check the sync cable and both its plugs.");
  }

  const printFails = evs7.filter(e => e.type === "print_failed").length;
  if (printFails) {
    add("warning", "print_failures", `${printFails} failed print(s) in the last 7 days`, "See the event log for the reason.");
  }

  if (capacity.reorderNow) {
    add("warning", "media_reorder",
      `Order media now — ${capacity.daysLeft} days left, delivery takes ${LEAD_TIME_DAYS}`,
      `${pr.sheets} sheets (${pr.strips} strips) remaining at ${capacity.perDay}/day.`);
  } else if (pr.found && pr.low) {
    add("warning", "media_low", `Only ${pr.sheets} sheets left`, `Below the ${LOW_MEDIA_SHEETS}-sheet floor.`);
  }

  if (codeStats.total > 0) {
    const pct = Math.round((codeStats.unused / codeStats.total) * 100);
    if (pct < LOW_CODES_PCT) {
      add("info", "codes_low",
        `Only ${codeStats.unused} voucher codes left (${pct}%)`,
        "Generate a batch and send it to the printers — they need lead time too.");
    }
  }

  const f7 = funnel(evs7);
  if (f7.started >= 10 && f7.completionRate !== null && f7.completionRate < 70) {
    add("warning", "low_completion",
      `Only ${f7.completionRate}% of sessions produced a strip`,
      `${f7.abandoned} guest(s) typed a code and walked away without a photo in the last 7 days.`);
  }

  const order = { critical: 0, warning: 1, info: 2 };
  return a.sort((x, y) => order[x.severity] - order[y.severity]);
}

/** Recent flash misfires, read back out of the server log. */
function flashWarnings(limit = 5) {
  try {
    return fs.readFileSync(path.join(config.paths.data, "server.log"), "utf8")
      .split(/\r?\n/)
      .filter(l => /\[flash\] WARNING/.test(l))
      .slice(-limit)
      .reverse();
  } catch (e) { return []; }
}

/* ===================== the whole picture ============================ */

/**
 * What the cloud is allowed to see of the code store.
 *
 * codeStats.usedList carries every voucher ever redeemed, in plain text.
 * Two reasons it must not travel: a released code becomes redeemable
 * again, so that list is money in a table anyone signed in could read;
 * and it only ever grows, which would put an unbounded blob into every
 * one of the ~2,880 heartbeats a day.
 *
 * /admin still shows the full list: server.js hands it to the page
 * separately, straight from codes.stats(), so nothing on screen is lost
 * and nothing extra leaves the booth.
 */
function publicCodeStats(codeStats) {
  const { usedList, ...rest } = codeStats || {};
  return { ...rest, usedCount: Array.isArray(usedList) ? usedList.length : 0 };
}

function collect(codeStats) {
  const files = printFiles();
  const allPrints = files.guest.concat(files.staff);
  const redemptions = redemptionTimestamps();
  const pr = printer();
  const hf = hotFolder();
  const evs = events.all();
  const evs7 = evs.filter(e => sinceDays(e.date, 7));

  const guestToday = files.guest.filter(isToday).length;
  const guest7 = files.guest.filter(d => sinceDays(d, 7)).length;

  // Media burn uses every strip, guest and staff alike -- paper does not
  // care who it was for. Revenue counts guests only.
  const burn7 = allPrints.filter(d => sinceDays(d, 7)).length;
  const perDay = Math.round((burn7 / 7) * 10) / 10;
  const daysLeft = perDay > 0.2 ? Math.round(pr.strips / perDay) : null;

  const costPerSheet = Number(ops.costPerSheetIDR) || 0;
  const costPerStrip = costPerSheet ? Math.round(costPerSheet / STRIPS_PER_SHEET) : 0;

  const capacity = {
    strips: pr.strips,
    codesLeft: codeStats.unused,
    // The honest answer to "how many more photos can we make" is whichever
    // runs out first. It is almost always the printer.
    possible: Math.min(pr.strips, codeStats.unused),
    limitedBy: pr.strips <= codeStats.unused ? "printer" : "codes",
    perDay,
    daysLeft,
    leadTimeDays: LEAD_TIME_DAYS,
    // Ordering at "50 sheets left" is meaningless when delivery takes three
    // weeks. What matters is whether the stock outlasts the shipping time.
    //
    // Requires pr.found: with no printer we do not know the media count, and
    // "0 strips left, order now" on top of "printer offline" is two alarms
    // for one problem -- the fastest way to teach people to ignore alarms.
    reorderNow: pr.found && daysLeft !== null && daysLeft <= LEAD_TIME_DAYS,
    runsOutOn: daysLeft === null ? null : new Date(Date.now() + daysLeft * 86400000).toISOString(),
  };

  return {
    codes: publicCodeStats(codeStats),
    special: { staffQuota: special.staffQuota() },
    printer: pr,
    hotFolder: hf,
    capacity,
    prints: {
      total: allPrints.length,
      guest: files.guest.length,
      staff: files.staff.length,
      today: guestToday,
      last7: guest7,
      perDay,
      daysLeft,
    },
    redemptions: {
      total: redemptions.length,
      today: redemptions.filter(isToday).length,
      last7: redemptions.filter(d => sinceDays(d, 7)).length,
    },
    funnel: funnel(evs7),
    rejects: rejects(evs7),
    batches: batchEconomics(codeStats),
    money: {
      costPerSheetIDR: costPerSheet,
      costPerStripIDR: costPerStrip,
      costTodayIDR: costPerStrip * allPrints.filter(isToday).length,
      costLast7IDR: costPerStrip * burn7,
      configured: costPerSheet > 0,
    },
    charts: {
      printsByDay: byDay(files.guest, 14),
      printsByHour: byHour(files.guest),
      redemptionsByDay: byDay(redemptions, 14),
      heatmap: heatmap(files.guest),
    },
    alerts: buildAlerts({ pr, hf, capacity, codeStats, evs7 }),
    flashWarnings: flashWarnings(),
    lowMediaThreshold: LOW_MEDIA_SHEETS,
    stripsPerSheet: STRIPS_PER_SHEET,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { collect, printer, hotFolder };
