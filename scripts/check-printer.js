/* =====================================================================
   Why is nothing printing?

   Walks the print path in the order it actually runs and reports the
   first thing that is wrong. Reads only, except for one probe file it
   writes into the hot folder and deletes again -- named so that Hot
   Folder Print ignores it, so nothing gets printed by running this.

   Worth knowing before reading the output: an EMPTY PAPER ROLL does not
   produce an error in the booth. The strip still lands in the hot folder
   and the booth reports success; the printer simply never prints it. So
   if guests see the error screen, the file could not be written at all --
   which is a different fault, and this says which.
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const config = require("../config");
const { buildStrip } = require("../src/strip");

const DNP_STATUS = "C:\\DNP\\HotFolderPrint\\Logs\\printer_status.txt";
const HFP_EXE = "HotFolderPrint.exe";

const ok = m => console.log("   OK    " + m);
const bad = m => { console.log("   FAULT " + m); problems.push(m); };
const info = m => console.log("         " + m);
const problems = [];

function freeSpaceGB(dir) {
  try {
    if (fs.statfsSync) {
      const s = fs.statfsSync(dir);
      return (s.bsize * s.bavail) / (1024 ** 3);
    }
  } catch (e) {}
  try {
    const drive = path.parse(path.resolve(dir)).root.replace(/\\$/, "");
    const out = execSync(`wmic logicaldisk where "DeviceID='${drive}'" get FreeSpace /value`, { encoding: "utf8" });
    const m = out.match(/FreeSpace=(\d+)/);
    if (m) return Number(m[1]) / (1024 ** 3);
  } catch (e) {}
  return null;
}

(async () => {
  console.log("\n  fr-anz photobooth - printer check\n");

  /* 1 -- is Hot Folder Print running at all? ------------------------- */
  console.log("  1. Hot Folder Print");
  let hfpRunning = null;
  try {
    const out = execSync(`tasklist /fi "IMAGENAME eq ${HFP_EXE}"`, { encoding: "utf8" });
    hfpRunning = out.toLowerCase().includes(HFP_EXE.toLowerCase());
  } catch (e) { hfpRunning = null; }
  if (hfpRunning === true) ok("running");
  else if (hfpRunning === false) bad("NOT running - nothing in the hot folder will ever print. Start the booth again with icon 1.");
  else info("could not check (not Windows?)");

  /* 1b -- does WINDOWS see the printer at all? ------------------------ */
  //
  // The decisive split. "Power" being lit only means the printer has
  // electricity; it says nothing about whether the PC can reach it. If
  // Windows lists the device, the fault is between Hot Folder Print and a
  // printer that is present. If Windows does not, it is USB -- cable,
  // port, or a device Windows suspended and never woke.
  console.log("\n  1b. Does Windows see the printer?");
  let winSees = null;
  try {
    const ps = 'Get-Printer | Where-Object { $_.Name -match \'DP-|DS-RX|DNP|CITIZEN\' } | ' +
               'ForEach-Object { $_.Name + \'  |  \' + $_.PrinterStatus }';
    const out = execSync('powershell -NoProfile -Command "' + ps + '"', { encoding: "utf8", timeout: 20000 }).trim();
    if (out) { winSees = true; out.split(/\r?\n/).forEach(l => info(l.trim())); ok("Windows lists the printer"); }
    else { winSees = false; bad("Windows lists NO DNP printer - this is a USB or driver problem, not Hot Folder Print."); }
  } catch (e) { info("could not check (" + String(e.message).split("\n")[0].slice(0, 60) + ")"); }

  // And is it attached as a USB device, regardless of the print queue?
  try {
    const ps = 'Get-PnpDevice -PresentOnly | Where-Object { $_.FriendlyName -match \'DP-|DS-RX|DNP|CITIZEN\' } | ' +
               'ForEach-Object { $_.Status + \'  \' + $_.FriendlyName }';
    const out = execSync('powershell -NoProfile -Command "' + ps + '"', { encoding: "utf8", timeout: 20000 }).trim();
    if (out) out.split(/\r?\n/).forEach(l => info("USB: " + l.trim()));
    else if (winSees === false) info("USB: nothing attached either - the PC cannot see the hardware at all.");
  } catch (e) {}

  /* 2 -- the printer's own status file ------------------------------- */
  console.log("\n  2. What the printer reports");
  try {
    const st = fs.statSync(DNP_STATUS);
    const ageMin = Math.round((Date.now() - st.mtimeMs) / 60000);
    const raw = JSON.parse(fs.readFileSync(DNP_STATUS, "utf8"));
    const p = Array.isArray(raw) ? raw[0] : raw;
    const sheets = Number(p.MediaRemaining);
    info("model      " + (p.Model || "?"));
    info("status     " + (p.Status || "?"));
    info("media left " + (isNaN(sheets) ? "?" : sheets + " sheets  (" + sheets * 2 + " strips)"));
    info("file age   " + ageMin + " min");

    if (ageMin > 15) bad("this file stopped updating " + ageMin + " min ago - Hot Folder Print is not talking to the printer.");
    if (p.Status && p.Status !== "STATUS_OK") bad("printer reports " + p.Status);
    if (!isNaN(sheets) && sheets <= 0) bad("MEDIA IS EMPTY - load a new roll of paper and ribbon.");
    else if (!isNaN(sheets) && sheets < 20) info("running low: " + sheets + " sheets left");
    if (ageMin <= 15 && p.Status === "STATUS_OK" && sheets > 0) ok("printer is online and has media");
  } catch (e) {
    bad("no status file at " + DNP_STATUS);
    info("Hot Folder Print writes this continuously. Missing = it is not running,");
    info("or the printer is switched off / unplugged from USB.");
  }

  /* 3 -- the folder the booth drops strips into ---------------------- */
  console.log("\n  3. The hot folder");
  const dir = config.printer.hotFolder;
  info(dir);
  if (!fs.existsSync(dir)) {
    bad("DOES NOT EXIST - this is what makes the booth show the error screen.");
    info("Hot Folder Print deletes its folders when it loses the printer, so this");
    info("almost always means the printer is off or unplugged. Turn the printer on");
    info("FIRST, then start Hot Folder Print - the other way round it finds no");
    info("device and never creates the folder.");
  } else {
    ok("exists");
    const waiting = fs.readdirSync(dir).filter(f => /\.(png|jpe?g)$/i.test(f));
    if (waiting.length) {
      let oldest = Infinity;
      for (const f of waiting) {
        try { oldest = Math.min(oldest, fs.statSync(path.join(dir, f)).mtimeMs); } catch (e) {}
      }
      const min = Math.round((Date.now() - oldest) / 60000);
      if (min >= 2) bad(waiting.length + " strip(s) stuck here, oldest " + min + " min - they are not being picked up.");
      else info(waiting.length + " strip(s) waiting, being processed");
    } else ok("empty - everything has been picked up");

    // Can the booth actually write here? A probe name Hot Folder Print ignores.
    const probe = path.join(dir, "_boothcheck.tmp");
    try {
      fs.writeFileSync(probe, "check");
      fs.rmSync(probe, { force: true });
      ok("the booth can write into it");
    } catch (e) {
      bad("CANNOT WRITE into it: " + e.message);
    }
  }

  /* 3b -- Hot Folder Print's own logs -------------------------------- */
  //
  // HFP reads these when it starts. On a machine that has run for months
  // they grow without limit, and a few gigabytes here is enough to leave
  // the splash screen hanging for minutes with nothing actually broken.
  console.log("\n  3b. Hot Folder Print's log folder");
  const LOGDIR = "C:\\DNP\\HotFolderPrint\\Logs";
  try {
    let total = 0;
    const files = fs.readdirSync(LOGDIR).map(f => {
      let size = 0;
      try { size = fs.statSync(path.join(LOGDIR, f)).size; } catch (e) {}
      total += size;
      return { f, size };
    }).sort((a, b) => b.size - a.size);

    const mb = total / (1024 * 1024);
    info(files.length + " file(s), " + (mb > 1024 ? (mb / 1024).toFixed(1) + " GB" : Math.round(mb) + " MB"));
    files.slice(0, 3).forEach(x => info("   " + Math.round(x.size / (1024 * 1024)) + " MB  " + x.f));

    if (mb > 500) bad("these logs are huge (" + Math.round(mb) + " MB) - this alone can leave Hot Folder Print stuck on its splash screen. Run CLEAN-PRINTER-LOGS.bat.");
    else ok("a sensible size");
  } catch (e) {
    info("no log folder found at " + LOGDIR);
  }

  /* 4 -- disk space -------------------------------------------------- */
  console.log("\n  4. Disk space");
  const gb = freeSpaceGB(config.paths.output);
  if (gb === null) info("could not measure");
  else if (gb < 1) bad("only " + gb.toFixed(2) + " GB free - too little to write a strip.");
  else if (gb < 5) { info(gb.toFixed(1) + " GB free"); info("getting tight. Guest photos are never deleted (outputRetentionDays is 0)."); }
  else ok(gb.toFixed(1) + " GB free");

  /* 5 -- can we build a strip at all? -------------------------------- */
  console.log("\n  5. Building a strip");
  try {
    let pool = fs.readdirSync(config.paths.testPhotos)
      .filter(f => /\.(jpe?g|png)$/i.test(f)).sort()
      .map(f => path.join(config.paths.testPhotos, f));
    if (!pool.length) throw new Error("no test photos in assets/test-photos");
    const out = path.join(config.paths.prints, "_check-" + Date.now() + ".png");
    await buildStrip([0, 1, 2].map(i => pool[i % pool.length]), out);
    const kb = Math.round(fs.statSync(out).size / 1024);
    fs.rmSync(out, { force: true });
    ok("built and written (" + kb + " KB) - the image side is fine");
  } catch (e) {
    bad("CANNOT BUILD a strip: " + e.message);
  }

  /* verdict ---------------------------------------------------------- */
  console.log("\n  " + "=".repeat(62));
  if (!problems.length) {
    console.log("   Nothing wrong found. If guests still see the error screen,");
    console.log("   photograph the small grey line under \"oops\" and send it.");
  } else {
    console.log("   " + problems.length + " problem(s) found:\n");
    problems.forEach((p, i) => console.log("     " + (i + 1) + ". " + p));
  }
  console.log("  " + "=".repeat(62) + "\n");
})().catch(e => { console.error("  Check failed: " + e.message); process.exit(1); });
