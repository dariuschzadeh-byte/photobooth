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
      // 0.94. Asked for directly -- the prints read pale next to the
      // reference. Brightness only, never colour, so the look stays put.
      exposure: 0.94,
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
      // Warmer / cooler, to taste. Positive = more red, less blue, i.e.
      // more tan in skin and a warmer backdrop. Kept separate from the
      // gains above on purpose: those are a measured correction for the
      // camera's own cast, and mixing preference into them means nobody
      // can tell later which number was evidence and which was taste.
      // 0.06 is a gentle step, past ~0.15 the pink turns orange.
      // Switched on. Works by pulling green and blue down rather than
      // pushing red up -- see the note in src/strip.js. At 0.25 light skin
      // moves from red-minus-blue 40 to 89 and drops 19 in brightness --
      // a clear tan. Past about 0.40 it reads orange rather than tanned.
      // 0.22. Asked for: light skin a little browner and a little darker,
      // dark skin left alone -- guests here should not come out looking
      // darker than they walked in.
      //
      // That split is the whole reason the ramp below exists, and it is
      // measured rather than hoped for. Through the camera's own cast, at
      // 0.22:
      //
      //   very light   brightness -8.9   red-minus-blue  79 -> 115
      //   light                   -7.6                   87 -> 117
      //   mid                     -2.3                   85 ->  93
      //   tanned                  -0.7                   77 ->  78
      //   dark                     0.0                   58 ->  58
      //   very dark                0.0                   41 ->  41
      //
      // The two darkest rows are untouched, not nearly untouched: the ramp
      // floor sits above where they land, so the dial cannot reach them.
      // Raising warmthFloor moves that cutoff lighter. Past about 0.40 on
      // warmth itself, light skin reads orange rather than tanned.
      warmth: 0.22,

      // The backdrop's hue: 0 leaves it as photographed, higher pushes it
      // from salmon towards the luminous violet-pink of the reference
      // strips. Rides the inverse of the skin gate, so it moves the wall
      // and not the faces. Around 0.10 is a clear shift; past 0.25 the
      // wall starts reading purple. Use TRY-COLOR.bat to choose.
      // Landed by bracketing rather than guessing: 0 printed too salmon,
      // 0.50 printed hot pink. Both were seen on paper, so the answer sits
      // between them and much nearer the bottom -- the reference strips
      // are a light pink with a violet lean, not a violet wall.
      //
      // Skin is untouched at any value here: measured identical at 0.00
      // and at 0.80, because the gate keys on the one number that
      // separates a face from that wall.
      //
      // Back to 0. Two reasons, both checked rather than felt. The strips
      // kept as the reference have no violet lean at all -- the wall there
      // is a deep warm rose. And the gate that is meant to hold this to
      // the wall does not: light clothing sits at green-minus-blue +3,
      // which the gate reads as three-quarters wall, so a white shirt got
      // its blue pushed up and its green pulled down along with it. The
      // depth this was reaching for now comes from backdrop.satBoost,
      // which turns around whatever hue is already there and so leaves
      // near-neutral cloth alone.
      magenta: 0,

      // How the warmth is spread across the tonal range, as a fraction of
      // full white. Below `warmthFloor` nothing is warmed at all; above
      // `warmthFull` it is applied fully; in between it eases in.
      //
      // This is what lets one setting work for everyone who uses the
      // booth. Warmth applied evenly turns already-dark skin muddy and
      // orange while doing very little for pale skin. With the ramp, light
      // skin gets the tan the dial exists for and dark skin comes out as
      // the camera saw it.
      //
      // Set them equal to disable the ramp and warm everything evenly.
      warmthFloor: 0.30,
      warmthFull: 0.62,

      // Keep the warmth off the backdrop. Skin and the fr-anz pink split
      // cleanly on green-minus-blue: after the gains, skin sits near +14,
      // the wall near -6, a white shirt near +4. The ramp below leaves the
      // wall alone, warms skin fully, and gives shirts about a third --
      // film warmth rather than a stain. Set warmthSkinOnly false to warm
      // the whole frame evenly instead.
      warmthSkinOnly: true,
      warmthSkinLo: 0,
      warmthSkinHi: 12,

      /* Second half of the same question, and the half that was missing.
       *
       * Green-minus-blue cannot separate an arm from an olive t-shirt.
       * Measured through this camera: skin 17, that shirt 23 -- the shirt
       * reads as more skin than skin, so it got the tan meant for the
       * person wearing it, and its folds and lit patches each got a
       * different amount of it.
       *
       * How far red sits above green does separate them. Light skin 76,
       * an olive shirt 23 to 38, a white shirt 50, the wall 87. Both
       * tests have to pass now. warmthRedHi 0 asks only the old question.
       */
      warmthRedLo: 46,
      warmthRedHi: 66,

      /* How big a hole in the answer counts as a hole, as a fraction of
       * the photo's width.
       *
       * A specular highlight -- a forehead or a nose catching the flash --
       * washes towards the flash's own white. Green-minus-blue collapses
       * there, so the test above decides it is not skin and leaves it pale
       * while the face around it tans. That is the white patch.
       *
       * No per-pixel test can see past this: the pixel really has gone
       * neutral. Blurring the answer was tried and traded one fault for
       * another -- measured, it filled the highlight and dragged the wall
       * into the edge of the face, taking the warmth there down to 5
       * percent. A ring around the head instead of a patch inside it.
       *
       * So the hole is filled rather than smeared: spread the answer out
       * by this radius, then pull it back in by the same amount. Holes
       * smaller than the radius close; every real edge lands back exactly
       * where it was. 0.025 of a 600px photo is 15px, which covers the
       * highlights this flash makes at this distance.
       *
       * 0 goes back to deciding per pixel.
       */
      warmthGateHole: 0.025,

      // 0.94 printed flat, 1.12 printed garish, 1.03 still pushed the wall.
      // Barely above neutral now -- the glow is meant to come from the
      // light, not from the saturation slider.
      sat: 0.98,

      // Fraction of the full range added to the darkest areas. This stood
      // at 0.22 and never lifted anything: the code treated it as raw
      // levels, so it added 0.22 of 255. Now that it works it starts at 0,
      // which keeps the print as it is today (measured: 1-2 levels of 255
      // on a tenth of the pixels, invisible in dye-sub). 0.03-0.06 is a
      // gentle but real lift -- set it while looking at an actual photo.
      shadowLift: 0,
      // Back to the reference value. 1.06 was a reasonable guess at "more
      // contrast" and it is not what made the strips the owner likes.
      contrast: 0.98,
      sharpRadius: 2,
      // Back to the reference value, same reason as contrast above.
      sharpAmount: 0.07,
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
      // 0.42, up from 0.18. At 0.18 the falloff was barely visible and the
      // wall printed as one flat sheet of pink. The reference strips have
      // an obvious bright centre going deep towards the corners, and that
      // gradient is most of what separates them from a snapshot.
      strength: 0.42,

      // Warm pink in the middle, drifting almost blue at the edges -- the
      // wall lit from the centre and going cold where the light thins out.
      // Rides the same distance as the vignette and the same wall gate as
      // grade.magenta, so it never lands on an arm near the frame edge.
      // 0. The corners in the reference are not cold -- they are a deeper,
      // warmer rose than the centre, which is the opposite of what this
      // does. It also rides the same wall gate as grade.magenta did, so it
      // carried the same fault: light clothing near the frame edge picked
      // up the blue. Turning it negative was tried and is worse -- it
      // sends a white shirt sage green. Left in place at 0 so TRY-COLOUR
      // can still reach it.
      coolEdges: 0,

      // 0.26. This is what makes the corners go deep instead of grey.
      // Saturation turns around the hue that is already in the pixel, so
      // a pink wall gets more pink while near-neutral cloth barely moves
      // -- which is exactly why it, and not magenta, is the right dial for
      // depth. Measured on the wall patch: corner saturation rises by
      // about a quarter, a white shirt by under 2 percent.
      satBoost: 0.26,

      // 0.85. The falloff used to be measured from the centre in both
      // directions at once, which is a circle -- and it read as a circle:
      // a lit disc around the head rather than light on a wall. This runs
      // it sideways instead. Bright down the middle where the person
      // stands, deepening towards the left and right edges, which is where
      // the wall is actually in shot. 0 is the old circle, 1 is purely
      // sideways; 0.85 keeps a trace of the vertical so the top corners
      // still settle rather than ending in a hard band.
      sideBias: 0.85,

      // Where the bright part sits vertically. Nearly inert at a high
      // sideBias, which is rather the point -- the bright spot above the
      // head was half of what made the circle read as a circle.
      headBias: 0.42,
      // 1.4, from 1.8. A lower power starts the falloff earlier, so the
      // gradient reads across the whole frame rather than only in the
      // last corner.
      falloff: 1.4,
    },

    /* Where the blade really cuts the sheet in two.
     *
     * The two halves of a sheet are the same block written twice, pixel
     * for pixel, so twins that come off the printer framed differently
     * were never the software -- the cut is not landing in the middle, and
     * whichever strip sits on the short side loses a slice of wall.
     *
     * Measure it with a ruler: the width of the LEFT strip minus the width
     * of the right, in millimetres. Positive when the left one is wider.
     * A strip is 50 mm, so half a millimetre already shows, and past about
     * 3 mm it is worth having the printer looked at rather than corrected
     * here.
     *
     * The block is built wider by exactly what gets eaten and its middle
     * is used, so nobody is moved off centre and no cream edge appears.
     * 0 lays the sheet out exactly as before -- verified bit for bit,
     * 0 differing channels out of 8,640,000.
     *
     * Replaces two settings that sat here looking like this one and were
     * read by nothing at all.
     */
    cutOffsetMM: 0,
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
    // "hotfolder" -- the normal route: drop the sheet into the folder DNP
    //               Hot Folder Print watches, and it prints at the right
    //               size with the cut.
    // "windows"   -- straight to the Windows printer, no HFP involved.
    //               For when HFP breaks, which it did for three days
    //               while Windows reported the printer perfectly ready.
    //               Test it first with TRY-DIRECT-PRINT.bat, then set the
    //               paper size that came out right.
    // Switched to "windows" on 29 Aug 2026, after Hot Folder Print stopped
    // working entirely -- no log written since the 26th, splash screen
    // hanging forever -- while Windows reported the printer Idle the whole
    // time. Verified on paper: two clean strips, correct cut, correct
    // orientation, footer intact. Switch back to "hotfolder" once HFP has
    // been reinstalled and CHECK-PRINTER shows its folder again.
    mode: "windows",
    windowsPrinter: "DS-RX1",
    windowsPaperSize: "PR (4x6) x 2",   // the 2 inch cut: one sheet, two strips
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
