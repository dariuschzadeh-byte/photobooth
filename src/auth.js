/* =====================================================================
   auth.js -- login for the control centre.

   Needed because the control centre can generate codes, release codes and
   trigger prints. The moment it is reachable from outside this PC, it needs
   a lock on the door.

   Deliberately dependency-free: scrypt and randomBytes ship with Node, so
   there is nothing here that can rot or need patching.

   - Password is stored as a scrypt hash + salt, never in clear text.
   - Sessions live in memory: restarting the server logs everyone out.
   - Failed logins are rate-limited per IP to make guessing impractical.
   ===================================================================== */

const crypto = require("crypto");

const SESSION_HOURS = 12;
const MAX_FAILS = 8;              // per IP, within the window below
const FAIL_WINDOW_MS = 15 * 60 * 1000;

const sessions = new Map();       // token -> { user, expires }
const fails = new Map();          // ip -> { count, until }

function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), s, 64).toString("hex");
  return { salt: s, hash };
}

/** Constant-time compare so timing cannot leak the password. */
function verifyPassword(password, salt, expectedHash) {
  try {
    const { hash } = hashPassword(password, salt);
    const a = Buffer.from(hash, "hex");
    const b = Buffer.from(expectedHash, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) { return false; }
}

function blocked(ip) {
  const f = fails.get(ip);
  if (!f) return false;
  if (Date.now() > f.until) { fails.delete(ip); return false; }
  return f.count >= MAX_FAILS;
}

function noteFail(ip) {
  const f = fails.get(ip) || { count: 0, until: Date.now() + FAIL_WINDOW_MS };
  f.count++;
  f.until = Date.now() + FAIL_WINDOW_MS;
  fails.set(ip, f);
}

function createSession(user) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { user, expires: Date.now() + SESSION_HOURS * 3600 * 1000 });
  return token;
}

function validSession(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() > s.expires) { sessions.delete(token); return null; }
  return s;
}

function destroySession(token) { sessions.delete(token); }

function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

module.exports = {
  hashPassword, verifyPassword, blocked, noteFail,
  createSession, validSession, destroySession, readCookie,
  SESSION_HOURS,
};
