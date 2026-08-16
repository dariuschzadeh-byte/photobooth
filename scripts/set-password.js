/* =====================================================================
   Change the control centre password.

   Usage:
     node scripts/set-password.js "my new password"
     node scripts/set-password.js "my new password" --user dariusch

   Rewrites the admin block in config.js in place. The password itself is
   never stored -- only a scrypt hash and its salt.
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const auth = require("../src/auth");

const args = process.argv.slice(2);
const password = args.find(a => !a.startsWith("--"));
const userIdx = args.indexOf("--user");
const user = userIdx >= 0 ? args[userIdx + 1] : null;

if (!password) {
  console.error('Usage: node scripts/set-password.js "new password" [--user name]');
  process.exit(1);
}
if (password.length < 8) {
  console.error("Refusing: use at least 8 characters. This guards code generation and printing.");
  process.exit(1);
}

const configPath = path.join(__dirname, "..", "config.js");
let src = fs.readFileSync(configPath, "utf8");

const { salt, hash } = auth.hashPassword(password);

const before = src;
src = src.replace(/(admin:\s*\{[\s\S]*?salt:\s*")[^"]*(")/, `$1${salt}$2`);
src = src.replace(/(admin:\s*\{[\s\S]*?hash:\s*")[^"]*(")/, `$1${hash}$2`);
if (user) src = src.replace(/(admin:\s*\{[\s\S]*?user:\s*")[^"]*(")/, `$1${user}$2`);

if (src === before) {
  console.error("Could not find the admin block in config.js -- nothing changed.");
  process.exit(1);
}

fs.writeFileSync(configPath + ".tmp", src);
fs.renameSync(configPath + ".tmp", configPath);

console.log("Password updated.");
if (user) console.log("  user: " + user);
console.log("  Restart the booth for it to take effect (icon 2, then icon 1).");
