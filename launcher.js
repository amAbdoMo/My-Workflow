// Single entry point for both runtimes:
// - Electron desktop (npm run desktop / packaged app): process.versions.electron exists
//   -> boot the full desktop shell.
// - Plain Node (Hostinger / any web host running `node .`): no Electron
//   -> boot the Express web server instead.
if (process.versions && process.versions.electron) {
  require("./electron.js");
} else {
  require("./server/index.js");
}
