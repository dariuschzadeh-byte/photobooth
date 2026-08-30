/* =====================================================================
   Printer — sends the finished strip to the Citizen / DNP DS-RX1.

   TEST_MODE: just keeps the strip in /output/prints (nothing physical).
   REAL MODE (recommended): copy the strip into the "DNP Hot Folder Print"
              watched folder. That tool auto-prints it at the correct 2x6
              size with the cut — so we never touch printer drivers directly.

   Alternative real mode ("default"): print to the Windows default printer
   via the OS print verb (less control over exact sizing — hot folder is better).
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const config = require("../config");

async function printStrip(stripPath) {
  if (config.TEST_MODE) {
    // nothing physical — the strip already lives in /output/prints
    return { printed: false, test: true, file: stripPath };
  }

  if (config.printer.mode === "hotfolder") {
    if (!fs.existsSync(config.printer.hotFolder)) {
      // Hot Folder Print deletes these folders when it loses the printer,
      // so a missing folder almost always means the printer is unplugged
      // or switched off -- not that the software is gone.
      throw new Error(
        "Printer hot folder not found: " + config.printer.hotFolder +
        " - the printer is most likely switched off or unplugged from USB. " +
        "Reconnect it, then restart DNP Hot Folder Print.");
    }
    const dest = path.join(
      config.printer.hotFolder,
      `${Date.now()}_${path.basename(stripPath)}`
    );
    for (let c = 0; c < (config.printer.copies || 1); c++) {
      fs.copyFileSync(stripPath, c === 0 ? dest : dest.replace(/\.png$/i, `_${c}.png`));
    }
    return { printed: true, via: "hotfolder", file: dest };
  }

  if (config.printer.mode === "windows") {
    /* Straight to the Windows printer, no Hot Folder Print involved.
     *
     * The booth does not actually need HFP: it needs the sheet on paper.
     * When HFP breaks -- which it did, taking three days of printing with
     * it while Windows reported the printer perfectly ready -- this route
     * keeps the booth earning. It prints edge to edge with no margins,
     * because the strip is already built at the exact sheet size and any
     * margin would shift it relative to the printer's cut.
     *
     * config.printer.windowsPrinter   name, or part of it
     * config.printer.windowsPaperSize the driver's size, e.g. one with a
     *                                 2 inch cut. Empty = printer default.
     */
    const script = path.join(__dirname, "..", "scripts", "print-windows.ps1");
    const args = ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden",
                  "-ExecutionPolicy", "Bypass", "-File", script, "-Image", stripPath];
    if (config.printer.windowsPrinter) args.push("-Printer", config.printer.windowsPrinter);
    if (config.printer.windowsPaperSize) args.push("-PaperSize", config.printer.windowsPaperSize);

    return new Promise((resolve, reject) => {
      /* windowsHide, or a black console window flashes across the guest
       * screen at the exact moment the strip is printing -- which is the
       * one moment guests are watching, and it gives away that there is a
       * Windows PC behind the booth. */
      execFile("powershell.exe", args, { timeout: 60000, windowsHide: true }, (err, stdout, stderr) => {
        const out = String(stdout || "") + String(stderr || "");
        if (err) return reject(new Error("Windows print failed: " + (out.trim() || err.message)));
        if (/not found/i.test(out)) return reject(new Error(out.trim()));
        /* "printed" here means Windows accepted the job, not that paper
         * came out. With Hot Folder Print bypassed there is no media
         * counter left, so an empty roll is invisible: the job queues,
         * this resolves, the booth says printing, and nothing appears.
         * Passing the queue state back at least puts it in the event log,
         * where CHECK-PRINTER and the dashboard can find it. */
        resolve({ printed: true, via: "windows", queued: true, detail: out.trim().slice(0, 200) });
      });
    });
  }

  // "default": hand the file to Windows to print on the default printer.
  // Kept for completeness; "windows" above gives control over the paper
  // size, which this cannot.
  return new Promise((resolve, reject) => {
    execFile("mspaint.exe", ["/pt", stripPath], { windowsHide: true }, (err) => {
      if (err) return reject(new Error("Print failed: " + err.message));
      resolve({ printed: true, via: "default" });
    });
  });
}

module.exports = { printStrip };
