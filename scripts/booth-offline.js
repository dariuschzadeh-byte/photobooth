/* =====================================================================
   Tell the dashboard the booth is being shut down on purpose.

   Run by STOP-BOOTH.bat before it kills the server. Windows terminates
   processes without signals, so the server cannot announce its own exit --
   this runs while the batch file still has control.

   Silent and quick by design: it is in the way of staff going home, so it
   never prints noise, never asks anything, and gives up after a few seconds
   rather than holding up the shutdown.
   ===================================================================== */

const reporter = require("../src/reporter");

// Hard stop: closing time must not wait on a flaky cafe connection.
setTimeout(() => process.exit(0), 6000).unref();

reporter.notifyShutdown(process.argv[2] || "stop-booth")
  .then(ok => { if (ok) console.log("dashboard notified"); })
  .catch(() => {})
  .finally(() => process.exit(0));
