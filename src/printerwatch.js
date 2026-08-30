/* =====================================================================
   printerwatch.js -- ask Windows how the printer is, every few minutes.

   Two jobs, and the second one is the reason this exists at all.

   It watches. Routing printing away from Hot Folder Print took the media
   counter with it: HFP wrote printer_status.txt and nothing writes it
   now. So the booth lost every signal it had about the printer, and an
   empty roll or a sleeping device became invisible -- the job is accepted,
   the screen says printing, and no paper appears. This puts a signal back.

   And it keeps the port awake. A booth stands idle for hours between
   guests, Windows takes that as permission to power down the USB port,
   and the device does not reliably come back. Something touching the
   printer every few minutes stops that happening in the first place.

   Never throws, never blocks a session: a diagnostic that can end a
   session is worse than no diagnostic.
   ===================================================================== */

const { execFile } = require("child_process");
const config = require("../config");
const events = require("./events");

const EVERY_MS = 3 * 60 * 1000;

let last = null;      // { status, jobs, at, ok }
let timer = null;

function query() {
  return new Promise(resolve => {
    const name = (config.printer && config.printer.windowsPrinter) || "DS-RX1";
    const ps =
      "$p = Get-Printer -Name '*" + name + "*' -ErrorAction SilentlyContinue | Select-Object -First 1; " +
      "if (-not $p) { 'NONE'; exit }; " +
      "$j = @(Get-PrintJob -PrinterName $p.Name -ErrorAction SilentlyContinue).Count; " +
      "\"$($p.PrinterStatus)|$j\"";
    execFile("powershell.exe",
      ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", ps],
      { timeout: 25000, windowsHide: true },
      (err, stdout) => {
        if (err) return resolve(null);
        const line = String(stdout || "").trim().split(/\r?\n/).pop();
        if (!line || line === "NONE") return resolve({ status: "not listed", jobs: 0, ok: false });
        const [status, jobs] = line.split("|");
        return resolve({
          status: (status || "unknown").trim(),
          jobs: Number(jobs) || 0,
          ok: /^(Normal|Idle|Printing|Processing)$/i.test((status || "").trim()),
        });
      });
  });
}

async function tick() {
  const r = await query();
  if (!r) return;                       // could not ask; keep the last answer
  const changed = !last || last.status !== r.status || (last.jobs > 0) !== (r.jobs > 0);
  last = { ...r, at: new Date().toISOString() };
  if (changed) {
    events.log("printer_status", { status: r.status, jobs: r.jobs, ok: r.ok });
    if (!r.ok) console.warn(`[printer] Windows reports "${r.status}"` + (r.jobs ? `, ${r.jobs} job(s) waiting` : ""));
  }
}

function start() {
  if (process.platform !== "win32") return false;   // nothing to ask elsewhere
  const run = () => { tick().catch(() => {}); };
  setTimeout(run, 8000);                            // let the booth finish starting
  timer = setInterval(run, EVERY_MS);
  timer.unref && timer.unref();
  return true;
}

/** Last known state, or null if it has never been asked. */
function status() { return last; }

module.exports = { start, status, tick };
