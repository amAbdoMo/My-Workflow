# Deploying WorkflowY to workflow.abdom.me

## What this is

The same React app you run in Electron, served from a small Node.js backend:

- **Login**: first visit asks you to create the login (username + password, min 8 chars). Session cookie lasts 30 days and slides while you use the app — active months never log you out.
- **Data sync**: every schedule/client/todo/snippet/note/settings key syncs with last-write-wins per key. Change data on any device; other devices pick it up on load/focus/20 s interval.
- **IMAP migration/backups**: runs server-side now, so web and mobile get the same features as desktop (no folder picker — backup sets live on the server).
- **PWA**: installable on Android/iOS (Add to Home Screen), works offline for the shell.

## Hostinger setup (Deploy Web App)

1. Push this project to GitHub (the repo root is this folder).
2. In hPanel → Websites → **Add Website → Deploy Web App**, connect the GitHub repo.
   - Runtime: **Node.js**
   - Start command: `npm start` (runs `node server/index.js`)
   - Domain: `workflow.abdom.me`
3. Set environment variables:
   - `WIZARD_DATA_DIR` — a persistent path outside deploys if possible (defaults to `server/data`, which holds your login hash, store, and secret key).
   - `PORT` — usually injected by Hostinger automatically.
4. First deploy: build happens locally or in CI (`node ./node_modules/react-scripts/bin/react-scripts.js build`) — commit the built `build/` folder or add a build step. The server serves `build/` (falls back to `app-build/`).
5. Enable SSL (Let's Encrypt) so cookies are marked Secure.

### Updating code

Push to GitHub → Hostinger redeploys (code sync: local → hosting). Data lives in `WIZARD_DATA_DIR` and survives deploys.

## Desktop ↔ hosting data sync (enabled)

The desktop app now syncs too:

- On startup it checks `https://workflow.abdom.me`; the first run shows the same login screen, and the session token is stored locally in the desktop app.
- On first sync the desktop pushes its existing local data to the server (initial migration), then keeps both sides in sync with last-write-wins per key.
- If the server is unreachable, the desktop app simply runs standalone with local data — nothing breaks offline.

Server requirement for this to work: set `WIZARD_ALLOWED_ORIGIN=*` in the Hostinger environment variables (the desktop page is a `file://` origin, so its `Origin` header is `null`; `*` covers it — fine for a single-user API protected by your login).

## Local test

```
npm run build
npm start            # http://localhost:3001
```

## Files added for web/PWA

| File | Purpose |
| --- | --- |
| `server/index.js` | Express API: auth, LWW data store, IMAP, SSE progress |
| `server/auth.js` | scrypt credentials, HMAC 30-day sliding session, bearer tokens |
| `server/store.js` | JSON store, atomic writes, last-write-wins merge |
| `server/imap-service.js` | IMAP engine ported from Electron |
| `src/api.js` | API base + fetch helper (cookie on web, token in Electron) |
| `src/sync.js` | localStorage interceptor + LWW pull/push engine |
| `src/webShim.js` | Web implementations of wizardStorage/wizardApp/wizardImap |
| `src/LoginGate.js/.css` | Setup + login screen |
| `public/service-worker.js` | App-shell caching for offline PWA |

Desktop behavior is unchanged: Electron keeps its real bridges and never loads these shims.
