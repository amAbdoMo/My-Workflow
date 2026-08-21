// Resolves the persistent data directory.
//
// Priority:
//   1. WIZARD_DATA_DIR env var (explicit override).
//   2. ~/wizard-data — the OS home directory. Hosting platforms (Hostinger)
//      wipe the app/deploy directory on every release, but the account's home
//      directory persists, so credentials and synced data survive redeploys.
//
// One-time migration: when the target directory is missing a file that the
// legacy in-app server/data directory still has, copy it over so an upgrade
// never logs anyone out or loses data.
const fs = require("fs");
const os = require("os");
const path = require("path");

const LEGACY_DIR = path.join(__dirname, "data");
const PERSISTENT_FILES = ["auth.json", "secret.key", "store.json"];

function migrateLegacyFiles(targetDir) {
  try {
    if (!fs.existsSync(LEGACY_DIR)) return;
    fs.mkdirSync(targetDir, { recursive: true });
    for (const name of PERSISTENT_FILES) {
      const from = path.join(LEGACY_DIR, name);
      const to = path.join(targetDir, name);
      if (fs.existsSync(from) && !fs.existsSync(to)) {
        fs.copyFileSync(from, to);
      }
    }
  } catch (error) {
    console.error("[data-dir] legacy migration failed:", error.message);
  }
}

function resolveDataDir() {
  if (process.env.WIZARD_DATA_DIR) return process.env.WIZARD_DATA_DIR;
  const homeDataDir = path.join(os.homedir(), "wizard-data");
  migrateLegacyFiles(homeDataDir);
  return homeDataDir;
}

module.exports = { DATA_DIR: resolveDataDir() };
