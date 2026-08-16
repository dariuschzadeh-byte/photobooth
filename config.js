/* =====================================================================
   fr-anz photobooth -- central configuration
   ===================================================================== */

const path = require("path");

module.exports = {
  TEST_MODE: false,
  PORT: 3000,
  HOST: "127.0.0.1",        // localhost only: kiosk + admin run on this PC.
                            // Set to "0.0.0.0" to reach /admin from other devices.

  // ---- control centre login ------------------------------------------
  // Guards /admin. Required as soon as the booth is reachable from outside
  // this PC, because the control centre can generate codes and start prints.
  // To change the password: node scripts/set-password.js <new password>
  admin: {
    user: "franz",
    salt: "03f2aabc4acb954e9ce50ddb3b6e85ac",
    hash: "7404f80981de8e9ba90c688f9a7025e320b14feb3c2f157698efb5915f2a0c3f1b2fde8a7ea0e53ad9d80c842c40684ee935e40978e8f05262166e3435e66f55",
    // On the booth PC itself the login is skipped -- staff should not have to
    // type a password to reach the test print. Set to false to require it there too.
    trustLocalhost: true,
  },

  codeLength: 6,
  photos: 3,

  // Auto-delete session photos + prints older than this many days on startup.
  // 0 = keep everything forever (current setting -- the cafe may want the photos).
  outputRetentionDays: 0,

  // ---- print strip ---------------------------------------------------
  strip: {
    dpi: 300,
    widthInch: 2,
    heightInch: 6,

    // Layout: full-bleed photos, cream only between photos + footer band
    paper: [250, 243, 233],   // fr-anz cream (#FAF3E9)
    gap: 14,                  // cream gap BETWEEN the 3 photos
    footerHeight: 300,        // cream band at the bottom for the logo
    logoWidthRatio: 0.46,
    logoHeightRatio: 0.78,

    // Clean grade -- SOFT (less contrast, gentle sharpen)
    grade: {
      // These gains are deliberately UNEQUAL -- they cancel a red cast coming
      // from the camera, measured against the white t-shirt (R244 G174 B166).
      // Only valid while the camera's white balance is set to FLASH. If the
      // camera WB ever changes, re-measure instead of tweaking blindly:
      // a neutral 1.10/1.10/1.10 would bring the red cast straight back.
      rGain: 1.00, gGain: 1.10, bGain: 1.13,
      sat: 0.94,              // lower = softer pastel (was 0.97)
      shadowLift: 0.22,       // lifts dark areas: faces, navy shirt (was 0)
      contrast: 0.98,         // less contrast, eases the hot top frame (was 0.97)
      sharpRadius: 2,
      sharpAmount: 0.07,      // main softness lever: lower = hazier / film-soft (was 0.12)
    },

    // Soft backdrop gradient -- bright centre, deeper pink toward the edges
    backdrop: {
      strength: 0.18,         // lower = lighter, more even background (was 0.20)
      satBoost: 0.0,
      headBias: 0.42,
      falloff: 1.8,
    },

    sheetOuterMarginMM: 0,
    sheetGutterMM: 0,
  },

  camera: {
    cmdPath: "C:\\Program Files (x86)\\digiCamControl\\CameraControlCmd.exe",
    // 20s, not 12s: the camera shoots large JPEGs (L) now, ~6 MB each.
    // Transferring those over USB takes noticeably longer than the old 0.5 MB files.
    captureTimeoutMs: 20000,
  },

  printer: {
    mode: "hotfolder",
    hotFolder: "C:\\DNP\\HotFolderPrint\\Prints\\s6x2_2",
    copies: 1,
  },

  paths: {
    root: __dirname,
    data: path.join(__dirname, "data"),
    codesFile: path.join(__dirname, "data", "codes.json"),
    redemptionsLog: path.join(__dirname, "data", "redemptions.log"),
    output: path.join(__dirname, "output"),
    prints: path.join(__dirname, "output", "prints"),
    sessions: path.join(__dirname, "output", "sessions"),
    assets: path.join(__dirname, "assets"),
    footer: path.join(__dirname, "assets", "footer.png"),
    testPhotos: path.join(__dirname, "assets", "test-photos"),
    public: path.join(__dirname, "public"),
  },
};
