# WorkflowY

WorkflowY is a small Windows desktop dashboard for tracking website project deadlines and managing WordPress code snippets.

## Run The Desktop App

Use the desktop shortcut named `WorkflowY`, or run:

```powershell
npm run package:portable
.\dist\Wizard Schedules\WorkflowY.exe
```

This builds the React app into `app-build` and creates a portable Windows app at `dist\Wizard Schedules\WorkflowY.exe`.

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

Recreate the Windows desktop shortcut with the project icon:

```powershell
npm run package:portable
npm run install:shortcut
```

## Build And Test

```powershell
npm run build
npm test -- --watchAll=false --runInBand
```
