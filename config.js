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

  // ---- the two codes that are not vouchers ---------------------------
  // MASTER: unlimited, never burned. STAFF: works staffUsesPerDay times
  // per calendar day, for the morning sample strip.
  //
  // Set here on purpose, which means they are committed and this repo is
  // public: anyone who finds it can print for free with the master code
  // until it is changed. That was a deliberate call -- it saves typing
  // them on the booth's 7" screen, and the codes are cheap to rotate.
  //
  // To take them back out of git: delete this block. The booth then falls
  // back to data/secrets.json, which is gitignored, generating its own
  // pair on first start and showing them via SHOW-CODES.bat.
  codes: {
    master: "903671",
    staff: "480215",
  },

  codeLength: 6,
  photos: 3,

  // ---- operations ----------------------------------------------------
  // What turns a number into a decision. "50 sheets left" says nothing on
  // its own; "9 days left, delivery takes 21" says order today.
  ops: {
    // Cafe opening hours, booth PC local time (24h). The dashboard only
    // raises the offline alarm inside this window -- a dark booth at 3am is
    // the PC being switched off for the night, not a fault.
    openFrom: 7,
    openTo: 22,
    timezone: "Asia/Makassar",     // WITA, for the cloud dashboard's labels

    mediaLeadTimeDays: 21,         // how long DNP media takes to reach Bali
    costPerSheetIDR: 0,            // paper + ribbon per 4x6 sheet (= 2 strips)
    lowMediaSheets: 50,            // hard floor, whatever the lead-time maths says
    lowCodesPercent: 15,           // warn below this share of a batch unused

    // A strip that has sat unprinted in the hot folder for longer than this
    // means Hot Folder Print is not running. This is the failure that cost
    // us every print after 13 Jul 2026 -- it looks perfectly healthy.
    hotFolderStuckMinutes: 2,
  },

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

    // ---- brightness ----------------------------------------------
    // Separate from the grade on purpose. Switching the colour grading
    // off to get the plain look must not also remove the only brake on a
    // camera that is overexposing -- those are two different questions.
    //
    // exposure          1.00 = untouched. 0.93 is roughly a tenth of a
    //                   stop down. Lower this only if prints are too
    //                   bright AND the camera cannot be fixed.
    // highlightKnee /   above `knee` (as a fraction of white) the response
    // highlightRolloff  bends over instead of hitting 255 flat. Cannot
    //                   recover a highlight the camera already clipped.
    tone: {
      // Neutral, so the grade above is exactly what it was. This is the one
      // dial to reach for if the camera is running hot: 0.95 is about a
      // twentieth of a stop down, 0.85 clearly darker. It changes only
      // brightness and never colour, so the look stays put.
      enabled: true,
      exposure: 1.00,
      highlightKnee: 0.72,
      highlightRolloff: 0,
    },

    // Clean grade -- SOFT (less contrast, gentle sharpen)
    grade: {
      // ON. It was briefly switched off on the assumption that the grade
      // was what made recent prints look wrong. It was not: the strip the
      // owner points to as correct was printed WITH this on, and without
      // it the prints look unprocessed rather than better. Restored to
      // exactly the values that produced those prints -- see commit
      // 76fff51. scripts/compare-look.js shows both without using paper.
      enabled: true,
      // These gains are deliberately UNEQUAL -- they cancel a red cast coming
      // from the camera, measured against the white t-shirt (R244 G174 B166).
      // Only valid while the camera's white balance is set to FLASH. If the
      // camera WB ever changes, re-measure instead of tweaking blindly:
      // a neutral 1.10/1.10/1.10 would bring the red cast straight back.
      rGain: 1.00, gGain: 1.10, bGain: 1.13,

      // ---- highlight control -------------------------------------
      // Added after prints came out overexposed, with the backdrop
      // washing to white and a cool blue cast in the brightest areas.
      //
      // exposure     pulls the whole frame down before anything else.
      //              1.00 = untouched. Every 0.05 is about half a stop
      //              of headroom back.
      // highlightKnee / highlightRolloff
      //              above `knee` (as a fraction of full white) the
      //              response bends over instead of hitting 255 flat.
      //              rolloff 0 = off, 1 = very soft.
      // gainFalloff  fades the rGain/gGain/bGain correction out towards
      //              white. 0 = always full (the old behaviour, which is
      //              what turned bright pink into blue-white). Higher =
      //              the correction stays in the midtones where it was
      //              measured. 2 is gentle, 4 is strict.
      //
      // None of this recovers a clipped highlight -- if the camera wrote
      // 255 there is nothing underneath. Fix the flash or the exposure
      // for that. This only stops the software making it worse.
      // 0 = the gains apply at full strength everywhere, which is how the
      // good prints were made. Raising it fades the colour correction out
      // towards white and stops bright pink collapsing to blue-white -- use
      // it only if that patch comes back, and change one thing at a time.
      gainFalloff: 0,
      sat: 0.94,              // lower = softer pastel (was 0.97)

      // Fraction of the full range added to the darkest areas. This stood
      // at 0.22 and never lifted anything: the code treated it as raw
      // levels, so it added 0.22 of 255. Now that it works it starts at 0,
      // which keeps the print as it is today (measured: 1-2 levels of 255
      // on a tenth of the pixels, invisible in dye-sub). 0.03-0.06 is a
      // gentle but real lift -- set it while looking at an actual photo.
      shadowLift: 0,
      contrast: 0.98,         // less contrast, eases the hot top frame (was 0.97)
      sharpRadius: 2,
      sharpAmount: 0.07,      // main softness lever: lower = hazier / film-soft (was 0.12)
    },

    // Soft backdrop gradient -- bright centre, deeper pink toward the edges.
    //
    // Careful with this one when the background looks wrong: the bright
    // spot it protects sits at headBias, i.e. right where the backdrop
    // shows above people's heads, while everything around it is dimmed by
    // up to `strength`. A reflection landing there is made more prominent,
    // not less. That is exactly why it is off: it was making the glare
    // on the backdrop stand out. Left ON regardless: the prints the owner
    // wants back were made with it, and switching it off made them look
    // flat rather than clean.
    backdrop: {
      enabled: true,
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

    // In manual mode the camera fires whether or not the flash has
    // recharged, so a frame occasionally comes back unlit -- and the guest
    // takes it home like that. The booth now looks at each photo straight
    // after taking it and, if it is nearly black, waits and takes that one
    // again. Checked on the EXIF thumbnail, which costs about 20ms rather
    // than the seconds a full 6MB frame would.
    flashRetry: {
      enabled: true,
      darkThreshold: 30,   // mean brightness 0-255. Lit frames measure ~170.
      waitMs: 4500,        // time for the flash to charge before retrying
      attempts: 1,         // extra tries beyond the first
    },
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
