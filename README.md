# fr-anz photobooth

The complete on-screen flow + backend for the fr-anz photobooth.
One Windows mini-PC runs everything; the 7" touchscreen (HDMI) is the guest display.

**Flow:** guest enters a 6-digit voucher code → 3 photos with countdown → a printed
2×6" strip (3 photos + fr-anz logo). Each code works exactly once.

No native dependencies (Node + Express + Jimp), so it installs on the booth PC
with a plain `npm install`.

---

## 0. Daily operation (staff)

**The booth starts by itself when the PC boots.** Nothing to type.

| | |
|---|---|
| Start manually | Desktop icon **1 - START PHOTOBOOTH** |
| Stop | Desktop icon **2 - STOP PHOTOBOOTH** (or `Alt+F4` on the guest screen) |
| Staff code | for the morning sample strip — works **2× a day**, resets at midnight |
| Master code | yours, unlimited, never uses up a voucher |
| Where are the codes? | `config.js` → `codes`, and on the **admin page** |
| Admin page | <http://localhost:3000/admin> — codes left, release a code, test print |

The printed staff guide is `BOOTH-GUIDE.html` (open it and press Ctrl+P).

**Files behind this:**
- `START-BOOTH.bat` — starts **DNP Hot Folder Print + server + kiosk screen**. Safe to run twice.
- `STOP-BOOTH.bat` — stops both. Leaves other browser windows alone.
- `_server-loop.bat` — keeps the server alive (restarts it automatically); logs to `data/server.log`.
- Autostart shortcut: `…/Start Menu/Programs/Startup/fr-anz Photobooth.lnk`
  Delete that shortcut to disable autostart. **Note:** it runs after *login*, so the
  booth PC needs auto-login enabled to come up unattended after a power cut.

---

## 1. Developer quick start (TEST mode — any laptop, no hardware)

Set `TEST_MODE: true` in **`config.js`** (there is no environment variable), then:

```bash
npm install
npm start
```

Open <http://localhost:3000>, press **F11** for full screen. In TEST mode the camera
returns placeholder photos and "printing" just saves the strip to `output/prints/`.

- `GET /api/health` — mode + code stats
- `GET /admin` — visual overview · `GET /admin/stats` — JSON

By default the server binds to **127.0.0.1** (this PC only). To reach `/admin` from
another device, set `HOST: "0.0.0.0"` in `config.js` — be aware this also exposes the
booth to everyone on the café Wi-Fi.

---

## 2. Voucher codes

```bash
node scripts/generate-codes.js 250              # add a NEW batch of 250 (keeps existing)
node scripts/generate-codes.js 250 --replace    # wipe the store first (refused unless --force)
```

Writes `data/codes-batch<N>-<date>.csv` (print these on the cards) and updates
`data/codes.json` (the live store).

**Adding is the default on purpose.** `--replace` invalidates every card already
printed, so it refuses to run while the store holds codes unless you add `--force`.

A code is **burned when it is accepted**, so it can never be used twice. If the
camera or printer then fails, the booth **gives the code back automatically** and the
guest sees "your code is still valid — please try again". Staff can also release a
code by hand from `/admin`. Everything is logged to `data/redemptions.log`.

---

## 3. Going LIVE on the booth (camera + printer)

Everything hardware-specific lives in **`config.js`**; `TEST_MODE: false` is live.

### a) Camera — Canon EOS 1300D
1. Install **digiCamControl** on the booth PC.
2. Connect the Canon by USB, set it to **JPEG**, disable auto-power-off,
   and use a **dummy battery / AC adapter** so it never sleeps.
3. `config.camera.cmdPath` must point at `CameraControlCmd.exe`
   (default: `C:\Program Files (x86)\digiCamControl\CameraControlCmd.exe`).
   The real capture call lives in `src/camera.js → captureReal()`.

### b) Printer — DNP DS-RX1HS
1. Install the **DNP driver** + **DNP Hot Folder Print**.
2. Set a watched folder for **2×6 with cut** and point `config.printer.hotFolder` at it
   (currently `C:\DNP\HotFolderPrint\Prints\s6x2_2`).
3. The app drops each finished strip into that folder; Hot Folder Print does the
   sizing + cut. If the folder is missing, the booth now says so instead of failing silently.

**Hot Folder Print must be running or nothing ever prints.** It does not add itself
to autostart, and when it is closed the booth looks completely healthy — photos are
taken, strips are built — while the files just pile up unprinted in the hot folder.
This actually happened: the app was last started on 13 Jul 2026, and every print
after that silently went nowhere. `START-BOOTH.bat` now launches it automatically
(and skips it if it is already running).

Useful for diagnosing remotely, both written by the DNP app:
- `C:\DNP\HotFolderPrint\Logs\printer_status.txt` — live status, media left, life counter
- `C:\DNP\HotFolderPrint\Logs\log-<date>.txt` — one line per print job

### c) Display / kiosk
The 7" touchscreen is 1024×600 and the UI is built natively at that size → 1:1.
`START-BOOTH.bat` opens Chrome in kiosk mode with its **own profile folder**
(`.kiosk-profile`, wiped on every start). That matters: it forces a real kiosk window
even when a normal browser is already open, prevents the "restore pages?" bar after a
power cut, and lets `STOP-BOOTH.bat` close only the booth window.

---

## 4. Adjusting things

- **Look / grade** (softness, contrast, colour): `config.js → strip.grade`.
  Keep `rGain`/`gGain`/`bGain` **equal** — warmth on the pink backdrop drifts orange.
- **Strip layout** (gaps, footer height): `config.js → strip`.
- **Logo on the strip**: replace `assets/footer.png` (transparent PNG, 600px wide).
- **Countdown length**: `public/index.html → CONFIG.countdownFrom` (currently 5).
- **Printed copies**: `config.printer.copies`.
- **Housekeeping**: `config.outputRetentionDays` (0 = keep all photos forever).
  Set to e.g. 30 to auto-delete sessions/prints older than 30 days on startup.

**Always restart the server after changing `config.js`** — the running process holds
the old values. Check syntax first with `node --check config.js`.

---

## 5. Project map

```
config.js            all settings + hardware paths + TEST_MODE + HOST
server.js            web server + API (validate / capture / print / release) + /admin
src/codes.js         voucher store: single-use codes, atomic writes, release
src/camera.js        capture — TEST stub + real digiCamControl hook
src/strip.js         builds the 2×6 strip (3 photos + footer)
src/printer.js       print — TEST stub + DNP Hot Folder hook
scripts/generate-codes.js   make a batch of card codes
public/index.html    the kiosk UI (guest flow, incl. error screen)
assets/footer.png    fr-anz logo footer for the strip
data/                codes.json + CSVs + redemptions.log + server.log
output/              prints/ and sessions/ (guest photos)
_attic/              retired files, kept for reference — not used by the app
```

---

## 6. Gotchas that have bitten us

1. **`.bat` files need CRLF line endings.** Saved with Unix (LF) endings they die
   instantly with no error. If a `.bat` "does nothing", check this first.
2. **`timeout` fails when stdin is redirected** — the batch files use `ping -n` instead.
3. **PowerShell's `Invoke-WebRequest` routes localhost through the system proxy** on this
   PC and times out. `START-BOOTH.bat` uses `netstat` to detect the running server.
4. **Template literals break on manual paste.** Pasting `.js` into Notepad/a terminal can
   strip backticks. Edit files directly on the booth PC.
5. **Codes can have leading zeros** — always treat them as strings, never numbers.
6. **Restart the server after any config change.**

---

## 7. The only 3 places that touch hardware

1. `src/camera.js → captureReal()` — fire the Canon shutter, get the JPEG.
2. `src/printer.js → printStrip()` — drop the strip into the DNP hot folder.
3. `config.js` — the paths for the two above.

Everything else (UI, flow, timings, voucher logic, strip building) runs the same in
TEST and LIVE mode.
