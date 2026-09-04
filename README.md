# WorkflowY

WorkflowY is a small Windows desktop dashboard for tracking website project deadlines and managing WordPress code snippets.

## Run The Desktop App

Use the desktop shortcut named `WorkflowY`, or run:

```powershell
npm run package:portable
.\dist\WorkflowY\WorkflowY.exe
```

This builds the React app into `app-build` and creates a portable Windows app at `dist\WorkflowY\WorkflowY.exe`.

## Development

Start the React dev server without opening a browser:

```powershell
npm start
```

Then open the Electron shell against the dev server:

```powershell
npm run dev:electron
```

## Desktop Shortcut

Recreate the Windows desktop, Start menu, and startup shortcuts:

```powershell
npm run package:portable
npm run install:shortcut
```

The startup shortcut launches WorkflowY hidden in the system tray. Closing the window also keeps it in the tray so Windows reminders continue; use **Quit** from the tray menu to stop it completely.

## Build And Test

```powershell
npm run build
npm test -- --watchAll=false --runInBand
npm run test:notifications
```
