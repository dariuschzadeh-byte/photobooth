/* =====================================================================
   Connect this booth to the cloud dashboard.

   Writes data/cloud.json, then actually calls the endpoint and reports
   which step of the setup is still outstanding. The three steps fail in
   ways that look identical from the booth -- the reporter swallows them
   all as "cannot reach the dashboard" -- so this asks once, loudly, and
   names the one that is missing.

   Run again any time to check the connection. It changes nothing but
   data/cloud.json, which git never sees.
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { URL } = require("url");
const cloudkey = require("../src/cloudkey");
const config = require("../config");

/* The key is NOT in here, and that is the whole point.
 *
 * It was, for about twenty minutes, and this file is committed to a public
 * repository -- so it was readable by anyone who found the repo, while
 * SETUP.md was busy claiming the key never goes through git. That key has
 * been retired. Since the function is deployed --no-verify-jwt and trusts
 * this header alone, whoever holds it can file fabricated readings and,
 * via cleanShutdown, mute the offline alarm for the rest of the day.
 *
 * It is passed in instead: as the first argument, or typed once when
 * prompted. It lands in data/cloud.json, which git does ignore. */
const SETTINGS = {
  url: "https://mktfgaxmwvotzlqckxnd.supabase.co/functions/v1/booth-report",
  boothSlug: "fr-anz",
  intervalSeconds: 30,
};

const CONF = path.join(config.paths.data, "cloud.json");

function post(body, headers) {
  return new Promise(resolve => {
    const u = new URL(SETTINGS.url);
    const payload = Buffer.from(JSON.stringify(body), "utf8");
    const req = https.request({
      method: "POST", hostname: u.hostname, path: u.pathname,
      headers: { "Content-Type": "application/json", "Content-Length": payload.length, ...headers },
      timeout: 15000,
    }, res => {
      let raw = "";
      res.on("data", c => raw += c);
      res.on("end", () => resolve({ status: res.statusCode, body: raw }));
    });
    req.on("timeout", () => { req.destroy(); resolve({ status: 0, body: "timed out" }); });
    req.on("error", e => resolve({ status: 0, body: e.message }));
    req.end(payload);
  });
}

async function askForKey() {
  const arg = process.argv.slice(2).find(a => a && !a.startsWith("--"));
  if (arg) return cloudkey.normalize(arg);

  /* A saved key used to be reused without asking, so that re-running only
     re-checked. That made it impossible to hand this PC a NEW key: it never
     asked, sent the old one, got "bad booth key", and every re-run did the
     same. Now it always asks -- Enter keeps what is saved. */
  let prev = null;
  try {
    const p = JSON.parse(fs.readFileSync(CONF, "utf8"));
    if (p.boothKey && p.boothKey.length > 8) prev = p.boothKey;
  } catch (e) {}

  process.stdout.write(prev
    ? "  A booth key is already saved on this PC.\n  Press Enter to keep it, or type the new key and press Enter:\n  > "
    : "  Type the booth key (or right-click to paste), then press Enter:\n  > ");
  const typed = await new Promise(resolve => {
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    process.stdin.once("data", d => { process.stdin.pause(); resolve(String(d).trim()); });
  });
  if (!typed && prev) return prev;
  return cloudkey.normalize(typed);
}

(async () => {
  SETTINGS.boothKey = await askForKey();
  if (!SETTINGS.boothKey) {
    console.log("\n  No key given - nothing was changed.\n");
    process.exit(1);
  }
  fs.mkdirSync(config.paths.data, { recursive: true });
  fs.writeFileSync(CONF, JSON.stringify(SETTINGS, null, 2));
  console.log("  Wrote " + CONF);
  console.log("  Reporting to " + new URL(SETTINGS.url).host + " as \"" + SETTINGS.boothSlug + "\"\n");

  console.log("  Testing the connection...\n");
  // probe:true -- the function authenticates and answers without writing
  // anything. A test that filed a heartbeat would make a switched-off booth
  // look alive and would close open alerts just by being run.
  const r = await post(
    { boothSlug: SETTINGS.boothSlug, probe: true },
    { "x-booth-key": SETTINGS.boothKey },
  );

  const line = "  " + "-".repeat(62);
  if (r.status === 200) {
    console.log(line);
    console.log("   CONNECTED. The dashboard is receiving from this booth.");
    console.log(line);
    console.log("\n   Restart the booth (icon 2, then icon 1) and the numbers");
    console.log("   appear on the dashboard within 30 seconds.\n");
    process.exit(0);
  }

  console.log(line);
  console.log("   NOT CONNECTED YET  (HTTP " + r.status + ")");
  console.log(line + "\n");

  if (r.status === 404) {
    console.log("   The edge function has not been published yet.");
    console.log("   In Supabase: Edge Functions > Deploy a new function > Via Editor,");
    console.log("   name it exactly  booth-report , paste the code, deploy,");
    console.log("   then switch OFF \"Verify JWT\" in its settings.\n");
  } else if (r.status === 401 && /not enrolled/i.test(r.body)) {
    console.log("   The function is live but this booth is not enrolled.");
    console.log("   Run once in the Supabase SQL editor:\n");
    console.log("     update booths set key_hash =");
    console.log("       'd0715ffd5530b1a6026fac6905df1d5cd16b04274fdf117d4c3de5a0595baf79'");
    console.log("     where slug = 'fr-anz';\n");
  } else if (r.status === 401) {
    console.log("   The function is live but rejected our key. Either the wrong");
    console.log("   key is enrolled, or \"Verify JWT\" is still switched ON --");
    console.log("   the booth signs in with its own key, not a Supabase token.\n");
    console.log("   Reply from the server: " + r.body.slice(0, 200) + "\n");
  } else if (r.status === 0) {
    console.log("   Could not reach Supabase at all: " + r.body);
    console.log("   Check this PC's internet connection.\n");
  } else {
    console.log("   Unexpected reply: " + r.body.slice(0, 300) + "\n");
  }

  console.log("   The booth keeps working normally either way -- it simply");
  console.log("   sends nothing until this is sorted. Run this again to recheck.\n");
  process.exit(1);
})();
