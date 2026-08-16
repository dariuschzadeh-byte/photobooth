/* =====================================================================
   Camera — captures one photo per call.

   TEST_MODE: returns a placeholder photo (cycles through assets/test-photos).
   REAL MODE: triggers the Canon EOS 1300D via digiCamControl's CLI and
              returns the saved JPEG.

   >>> The ONLY hardware-specific part of the whole app is in captureReal(). <<<
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const config = require("../config");

function testPhotos() {
  try {
    return fs.readdirSync(config.paths.testPhotos)
      .filter(f => /\.(jpe?g|png)$/i.test(f))
      .map(f => path.join(config.paths.testPhotos, f))
      .sort();
  } catch (e) { return []; }
}

/** TEST: hand back a placeholder image for photo #index. */
async function captureTest(sessionDir, index) {
  const pool = testPhotos();
  if (!pool.length) throw new Error("No test photos found in assets/test-photos");
  const src = pool[index % pool.length];
  const dest = path.join(sessionDir, `photo_${index + 1}.jpg`);
  fs.copyFileSync(src, dest);
  // small artificial delay so the flow feels real
  await new Promise(r => setTimeout(r, 250));
  return dest;
}

/** REAL: fire the shutter on the Canon and download the JPEG to sessionDir. */
function captureReal(sessionDir, index) {
  return new Promise((resolve, reject) => {
    const dest = path.join(sessionDir, `photo_${index + 1}.jpg`);
    // digiCamControl CLI: capture + download to a target file
    //   CameraControlCmd.exe /capture /filename "C:\...\photo_1.jpg"
    const args = ["/filename", dest, "/capture"];
    execFile(config.camera.cmdPath, args, { timeout: config.camera.captureTimeoutMs },
      (err, stdout, stderr) => {
        const output = String(stdout || "") + String(stderr || "");
        // Canon refuses to fire in AF mode when it cannot find focus -- and the
        // plain pink backdrop gives autofocus nothing to lock onto. Name the
        // real cause instead of a generic failure, it costs hours otherwise.
        if (/Auto Focus Failed|Failed to press fully/i.test(output)) {
          return reject(new Error(
            "Camera could not focus, so it refused to fire. " +
            "Set the switch on the lens to MF (see handbook: Setting the focus)."));
        }
        if (err) return reject(new Error("Camera capture failed: " + err.message));
        if (!fs.existsSync(dest)) return reject(new Error("Camera did not produce a file"));
        try {
          if (fs.statSync(dest).size === 0) return reject(new Error("Camera produced an empty file"));
        } catch (e) { return reject(new Error("Camera file unreadable: " + e.message)); }
        resolve(dest);
      });
  });
}

async function capture(sessionDir, index) {
  return config.TEST_MODE ? captureTest(sessionDir, index) : captureReal(sessionDir, index);
}

module.exports = { capture };
