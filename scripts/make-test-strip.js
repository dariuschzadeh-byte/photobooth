/* Builds one strip from the sample photos so the direct-print route can
   be tested without a guest, a voucher, or the camera. */
const fs = require("fs");
const path = require("path");
const config = require("../config");
const { buildStrip } = require("../src/strip");

(async () => {
  const pool = fs.readdirSync(config.paths.testPhotos)
    .filter(f => /\.(jpe?g|png)$/i.test(f)).sort()
    .map(f => path.join(config.paths.testPhotos, f));
  if (!pool.length) throw new Error("no test photos in assets/test-photos");
  fs.mkdirSync(config.paths.prints, { recursive: true });
  const out = path.join(config.paths.prints, "_directtest.png");
  await buildStrip([0, 1, 2].map(i => pool[i % pool.length]), out);
  console.log("  test strip: " + out);
})().catch(e => { console.error("  " + e.message); process.exit(1); });
