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

  // "default": hand the file to Windows to print on the default printer
  return new Promise((resolve, reject) => {
    execFile("mspaint.exe", ["/pt", stripPath], (err) => {
      if (err) return reject(new Error("Print failed: " + err.message));
      resolve({ printed: true, via: "default" });
    });
  });
}

module.exports = { printStrip };
