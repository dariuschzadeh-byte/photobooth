/* =====================================================================
   admin.js -- the control centre page.

   Self-contained HTML: no CDN, no build step, works offline on the booth
   PC. Charts are plain SVG generated here, so there is no chart library
   that can break after an update.
   ===================================================================== */

const esc = t => String(t == null ? "" : t).replace(/[&<>"']/g, ch =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

const dayLabel = d => String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0");

/** Vertical bar chart as inline SVG. */
function barChart(points, labelFn, opts = {}) {
  const w = opts.width || 640, h = opts.height || 150;
  const pad = { l: 30, r: 8, t: 10, b: 22 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const max = Math.max(1, ...points.map(p => p.count));
  const bw = iw / points.length;
  const bars = points.map((p, i) => {
    const bh = (p.count / max) * ih;
    const x = pad.l + i * bw, y = pad.t + ih - bh;
    const label = labelFn(p, i);
    const showLabel = points.length <= 14 || i % 3 === 0;
    return `<g>
      <rect x="${(x + bw * 0.15).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${Math.max(bh, p.count ? 2 : 0).toFixed(1)}"
            rx="3" class="${p.count ? "bar" : "bar zero"}"><title>${esc(label)}: ${p.count}</title></rect>
      ${p.count && bh > 16 ? `<text x="${(x + bw / 2).toFixed(1)}" y="${(y + 12).toFixed(1)}" class="barval">${p.count}</text>` : ""}
      ${showLabel ? `<text x="${(x + bw / 2).toFixed(1)}" y="${h - 7}" class="axis">${esc(label)}</text>` : ""}
    </g>`;
  }).join("");
  const gridY = [0, 0.5, 1].map(f => {
    const y = pad.t + ih - f * ih;
    return `<line x1="${pad.l}" y1="${y.toFixed(1)}" x2="${w - pad.r}" y2="${y.toFixed(1)}" class="grid"/>
            <text x="${pad.l - 6}" y="${(y + 4).toFixed(1)}" class="axis right">${Math.round(f * max)}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${w} ${h}" class="chart" role="img">${gridY}${bars}</svg>`;
}

function page(s, opts) {
  const { msg, testMode, host, port, special } = opts;
  const sq = (special && special.staffQuota) || { used: 0, limit: 0, left: 0 };
  const pr = s.printer;

  const mediaPct = Math.min(100, Math.round((pr.sheets / 700) * 100));
  const mediaState = !pr.found ? "bad" : pr.low ? "warn" : "good";
  const codesPct = s.codes.total ? Math.round((s.codes.remaining / s.codes.total) * 100) : 0;
  const codesState = s.codes.remaining === 0 ? "bad" : s.codes.remaining < 25 ? "warn" : "good";

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>fr-anz Booth Control</title>
<style>
:root{
  --ground:#F7F1E6; --surface:#fff; --surface-2:#F3EADC; --line:#E4D7C4; --line-soft:#F0E6D6;
  --ink:#2A231E; --ink-soft:#786A5E; --rose:#BE867F; --rose-deep:#8C4F49;
  --good:#4E7A4A; --good-bg:#EDF3EC; --warn:#B77A28; --warn-bg:#FBF2E2; --bad:#B0453A; --bad-bg:#FBEBE9;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --ground:#181310; --surface:#221B16; --surface-2:#2B221B; --line:#3B3028; --line-soft:#2A211B;
  --ink:#F1E8DB; --ink-soft:#A5947F; --rose:#D6ABA5; --rose-deep:#E7C3BD;
  --good:#8CB587; --good-bg:#1D261C; --warn:#D9A85B; --warn-bg:#2A2115; --bad:#E28577; --bad-bg:#2E1B18;
}}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.55}
.wrap{max-width:1100px;margin:0 auto;padding:26px 20px 70px}
a{color:var(--rose-deep)}
h1{margin:0;font-size:26px;font-weight:600;color:var(--rose-deep);letter-spacing:-.01em}
.sub{color:var(--ink-soft);font-size:13px;margin-top:2px}
header{display:flex;flex-wrap:wrap;gap:12px;align-items:baseline;justify-content:space-between;
  padding-bottom:16px;border-bottom:2px solid var(--rose);margin-bottom:22px}
.chips{display:flex;gap:8px;flex-wrap:wrap}
.chip{font-size:12px;font-weight:700;padding:4px 11px;border-radius:20px;background:var(--surface-2);color:var(--ink-soft);white-space:nowrap}
.chip.good{background:var(--good-bg);color:var(--good)} .chip.warn{background:var(--warn-bg);color:var(--warn)} .chip.bad{background:var(--bad-bg);color:var(--bad)}
.msg{background:var(--surface);border-left:4px solid var(--rose);border-radius:10px;padding:12px 16px;margin-bottom:20px;font-size:14px;box-shadow:0 1px 3px rgba(120,90,70,.07)}

.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));margin-bottom:26px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:13px;padding:17px 19px;box-shadow:0 1px 3px rgba(120,90,70,.05)}
.card .lbl{font-size:11px;letter-spacing:.11em;text-transform:uppercase;color:var(--ink-soft);font-weight:700}
.card .num{font-size:35px;font-weight:700;line-height:1.15;margin-top:5px;font-variant-numeric:tabular-nums;color:var(--rose-deep)}
.card .num.good{color:var(--good)} .card .num.warn{color:var(--warn)} .card .num.bad{color:var(--bad)}
.card .foot{font-size:12.5px;color:var(--ink-soft);margin-top:3px}
.meter{height:6px;border-radius:6px;background:var(--surface-2);overflow:hidden;margin-top:11px}
.meter i{display:block;height:100%;border-radius:6px;background:var(--good)}
.meter i.warn{background:var(--warn)} .meter i.bad{background:var(--bad)}

section{background:var(--surface);border:1px solid var(--line);border-radius:13px;padding:19px 21px;margin-bottom:16px;box-shadow:0 1px 3px rgba(120,90,70,.05)}
section h2{margin:0 0 3px;font-size:16px;font-weight:700}
section .hint{margin:0 0 15px;font-size:13px;color:var(--ink-soft)}
.two{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(330px,1fr))}

.chart{width:100%;height:auto;display:block}
.bar{fill:var(--rose)} .bar.zero{fill:var(--line)}
.barval{fill:#fff;font-size:10px;font-weight:700;text-anchor:middle}
.axis{fill:var(--ink-soft);font-size:10px;text-anchor:middle}
.axis.right{text-anchor:end}
.grid{stroke:var(--line-soft);stroke-width:1}

form{display:inline-flex;gap:8px;align-items:center;flex-wrap:wrap}
button,.btn{font:inherit;font-size:13.5px;font-weight:600;padding:9px 16px;border-radius:9px;border:1px solid var(--rose);
  background:var(--rose);color:#fff;cursor:pointer;text-decoration:none;display:inline-block}
button:hover,.btn:hover{filter:brightness(1.07)}
button.ghost,.btn.ghost{background:var(--surface);color:var(--rose-deep)}
button.ghost:hover{background:var(--surface-2)}
button.danger{background:var(--bad);border-color:var(--bad)}
input[type=number],input[type=text]{font:inherit;padding:8px 11px;border-radius:9px;border:1px solid var(--line);background:var(--surface);color:var(--ink);width:110px}
.actions{display:flex;gap:9px;flex-wrap:wrap;align-items:center}

.tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:11px}
table{border-collapse:collapse;width:100%;min-width:420px;font-size:13.5px}
th,td{padding:9px 14px;text-align:left;border-bottom:1px solid var(--line-soft)}
th{background:var(--surface-2);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--rose-deep)}
tbody tr:last-child td{border-bottom:none}
td.mono,.mono{font-family:ui-monospace,Consolas,monospace;font-variant-numeric:tabular-nums}
.warnbox{background:var(--warn-bg);border-left:4px solid var(--warn);border-radius:9px;padding:12px 15px;font-size:13.5px;margin-bottom:12px}
.warnbox .mono{font-size:12.5px;color:var(--ink-soft);display:block;margin-top:3px}
.empty{color:var(--ink-soft);font-size:13.5px;padding:6px 0}
</style></head><body><div class="wrap">

<header>
  <div>
    <h1>fr-anz &mdash; booth control</h1>
    <div class="sub">${testMode ? "TEST mode (no hardware)" : "LIVE"} &middot; http://${esc(host)}:${port} &middot; staff code <b class="mono">${esc(special.staffCode)}</b> (${sq.left} of ${sq.limit} left today)</div>
  </div>
  <div class="chips">
    <span class="chip ${pr.online ? "good" : "bad"}">printer ${pr.online ? "online" : "offline"}</span>
    <span class="chip ${codesState}">${s.codes.remaining} codes left</span>
    <span class="chip ${mediaState}">${pr.strips} strips left</span>
  </div>
</header>

${msg ? `<div class="msg">${esc(msg)}</div>` : ""}

<div class="grid">
  <div class="card">
    <div class="lbl">Strips left</div>
    <div class="num ${mediaState}">${pr.found ? pr.strips : "&mdash;"}</div>
    <div class="foot">${pr.found ? `${pr.sheets} sheets &times; ${s.stripsPerSheet}` : "printer offline &mdash; no reading"}</div>
    <div class="meter"><i class="${mediaState === "good" ? "" : mediaState}" style="width:${mediaPct}%"></i></div>
  </div>
  <div class="card">
    <div class="lbl">Codes left</div>
    <div class="num ${codesState}">${s.codes.remaining}</div>
    <div class="foot">${s.codes.used} of ${s.codes.total} used</div>
    <div class="meter"><i class="${codesState === "good" ? "" : codesState}" style="width:${codesPct}%"></i></div>
  </div>
  <div class="card">
    <div class="lbl">Printed today</div>
    <div class="num">${s.prints.today}</div>
    <div class="foot">${s.prints.last7} in the last 7 days</div>
  </div>
  <div class="card">
    <div class="lbl">Printed in total</div>
    <div class="num">${s.prints.total}</div>
    <div class="foot">${s.prints.perDay}/day average${s.prints.daysLeft ? ` &middot; media lasts ~${s.prints.daysLeft} days` : ""}</div>
  </div>
</div>

${pr.low ? `<div class="warnbox"><b>Order new media.</b> Only ${pr.sheets} sheets (${pr.strips} strips) left &mdash; below the ${s.lowMediaThreshold}-sheet mark.</div>` : ""}
${!pr.found ? `<div class="warnbox"><b>No printer reading.</b> DNP Hot Folder Print is not running, or the printer is off / unplugged. Nothing will print in this state.</div>` : ""}
${s.flashWarnings.length ? `<div class="warnbox"><b>The flash misfired recently.</b> Photos came out black. Check the sync cable and secure its plugs.
  ${s.flashWarnings.slice(0, 3).map(w => `<span class="mono">${esc(w.trim())}</span>`).join("")}</div>` : ""}

<section>
  <h2>Usage</h2>
  <p class="hint">Printed strips per day (last 14 days) and by time of day &mdash; useful for staffing and for judging when to restock.</p>
  <div class="two">
    <div>
      <div class="lbl" style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-soft);font-weight:700;margin-bottom:6px">Strips per day</div>
      ${barChart(s.charts.printsByDay, p => dayLabel(p.date))}
    </div>
    <div>
      <div class="lbl" style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-soft);font-weight:700;margin-bottom:6px">By hour of day</div>
      ${barChart(s.charts.printsByHour, p => String(p.hour).padStart(2, "0"))}
    </div>
  </div>
</section>

<section>
  <h2>Everyday actions</h2>
  <p class="hint">Nothing here touches guest data except releasing a code.</p>
  <div class="actions">
    <form method="post" action="/admin/testprint" onsubmit="return confirm('Print a test strip now? This uses one sheet.')">
      <button type="submit">Print test strip</button>
    </form>
    <a class="btn ghost" href="/handbook" target="_blank">Open handbook</a>
    <a class="btn ghost" href="/admin/export">Download unused codes (CSV)</a>
    <a class="btn ghost" href="/admin/stats">Raw data (JSON)</a>
    <form method="post" action="/logout" style="margin-left:auto">
      <button class="ghost" type="submit">Sign out</button>
    </form>
  </div>
</section>

<section>
  <h2>Voucher cards</h2>
  <p class="hint">Generating adds a new batch and keeps every existing code valid. The CSV holds the codes to print on the cards.</p>
  <form method="post" action="/admin/generate" onsubmit="return confirm('Generate a new batch of codes?')">
    <input type="number" name="count" value="250" min="1" max="5000" required>
    <button type="submit">Generate new batch</button>
  </form>
  <div style="margin-top:14px" class="tablewrap">
    <table>
      <thead><tr><th>Batch</th><th>Created</th><th>Codes</th></tr></thead>
      <tbody>
        ${(s.codes.batches || []).map(b => `<tr><td>${esc(b.batch)}</td><td>${new Date(b.generatedAt).toLocaleString()}</td><td class="mono">${esc(b.count)}</td></tr>`).join("") || `<tr><td colspan="3" class="empty">no batches yet</td></tr>`}
      </tbody>
    </table>
  </div>
</section>

<section>
  <h2>Redeemed codes</h2>
  <p class="hint">Press <b>release</b> to make a code valid again &mdash; for instance when a guest lost their print.</p>
  <div class="tablewrap">
    <table>
      <thead><tr><th>Code</th><th>Used at</th><th>Batch</th><th></th></tr></thead>
      <tbody>
        ${s.codes.usedList.length ? s.codes.usedList.slice(0, 60).map(u => `<tr>
          <td class="mono">${esc(u.code)}</td>
          <td>${new Date(u.usedAt).toLocaleString()}</td>
          <td>${esc(u.batch == null ? "?" : u.batch)}</td>
          <td><form method="post" action="/admin/release" onsubmit="return confirm('Release code ${esc(u.code)}? It becomes valid again.')">
            <input type="hidden" name="code" value="${esc(u.code)}"><button class="ghost" type="submit">release</button></form></td>
        </tr>`).join("") : `<tr><td colspan="4" class="empty">no redemptions yet</td></tr>`}
      </tbody>
    </table>
  </div>
</section>

<section>
  <h2>How the booth is run</h2>
  <p class="hint">The full handbook covers the daily routine, camera settings, focus and printer cleaning.</p>
  <div class="tablewrap"><table><tbody>
    <tr><td><b>Start</b></td><td>Desktop icon <b>1 - START PHOTOBOOTH</b> (or it starts by itself when the PC boots)</td></tr>
    <tr><td><b>Stop</b></td><td>Desktop icon <b>2 - STOP PHOTOBOOTH</b></td></tr>
    <tr><td><b>Back to desktop</b></td><td><b>Windows + D</b> &mdash; the booth keeps running</td></tr>
    <tr><td><b>Staff code</b></td><td><span class="mono">${esc(special.staffCode)}</span> &mdash; for the morning sample strip.
        Works <b>${sq.limit}&times; a day</b>, resets at midnight. Used today: <b>${sq.used} of ${sq.limit}</b>.</td></tr>
    <tr><td><b>Master code</b></td><td><span class="mono">${esc(special.masterCode)}</span> &mdash; owner only, unlimited, never uses up a voucher.
        Keep it off the cards and out of git.</td></tr>
    <tr><td><b>Nothing prints</b></td><td>DNP Hot Folder Print is not running &mdash; start the booth again via icon 1</td></tr>
    <tr><td><b>Black photos</b></td><td>The flash did not fire &mdash; check the sync cable and its plugs</td></tr>
  </tbody></table></div>
</section>

<p class="sub" style="text-align:center;margin-top:26px">
  fr-anz photobooth &middot; ${pr.found ? `${esc(pr.model)} &middot; lifetime prints ${pr.lifeCounter}` : "printer not reachable"}
</p>
</div></body></html>`;
}

/** Sign-in page. Same palette as the control centre, nothing else on it. */
function loginPage({ error, next }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>fr-anz Booth Control</title>
<style>
:root{--ground:#F7F1E6;--surface:#fff;--line:#E4D7C4;--ink:#2A231E;--ink-soft:#786A5E;--rose:#BE867F;--rose-deep:#8C4F49;--bad:#B0453A;--bad-bg:#FBEBE9}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --ground:#181310;--surface:#221B16;--line:#3B3028;--ink:#F1E8DB;--ink-soft:#A5947F;--rose:#D6ABA5;--rose-deep:#E7C3BD;--bad:#E28577;--bad-bg:#2E1B18}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:var(--ground);color:var(--ink);
  font-family:system-ui,-apple-system,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;padding:24px}
.box{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:34px 32px;width:100%;max-width:380px;
  box-shadow:0 8px 34px rgba(120,90,70,.12)}
.logo{color:var(--rose);font-size:38px;font-weight:500;line-height:1;text-align:center}
.logo .sub{display:block;font-size:10px;letter-spacing:.5em;padding-left:.5em;margin-top:7px;opacity:.85}
h1{font-size:15px;font-weight:600;text-align:center;margin:20px 0 22px;color:var(--ink-soft);letter-spacing:.02em}
label{display:block;font-size:11px;letter-spacing:.11em;text-transform:uppercase;color:var(--ink-soft);font-weight:700;margin-bottom:6px}
input{width:100%;font:inherit;padding:11px 13px;border-radius:10px;border:1px solid var(--line);
  background:var(--surface);color:var(--ink);margin-bottom:16px}
input:focus{outline:2px solid var(--rose);outline-offset:1px;border-color:var(--rose)}
button{width:100%;font:inherit;font-weight:600;padding:12px;border-radius:10px;border:none;background:var(--rose);color:#fff;cursor:pointer}
button:hover{filter:brightness(1.07)}
.err{background:var(--bad-bg);color:var(--bad);border-radius:9px;padding:10px 13px;font-size:13.5px;margin-bottom:18px;font-weight:600}
</style></head><body>
<form class="box" method="post" action="/login">
  <div class="logo">fr-anz<span class="sub">with benefits</span></div>
  <h1>booth control</h1>
  ${error ? `<div class="err">${esc(error)}</div>` : ""}
  <input type="hidden" name="next" value="${esc(next || "/admin")}">
  <label for="u">User</label>
  <input id="u" name="user" autocomplete="username" autocapitalize="none" autofocus required>
  <label for="p">Password</label>
  <input id="p" name="password" type="password" autocomplete="current-password" required>
  <button type="submit">Sign in</button>
</form>
</body></html>`;
}

module.exports = { page, loginPage, esc };
