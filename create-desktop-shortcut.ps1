$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ShortcutName = "Wizard Schedule & Snippets.lnk"
$DesktopShortcutPath = Join-Path ([Environment]::GetFolderPath("Desktop")) $ShortcutName
$StartMenuDir = Join-Path ([Environment]::GetFolderPath("Programs")) "Wizard Schedule & Snippets"
$StartMenuShortcutPath = Join-Path $StartMenuDir $ShortcutName
$StartupShortcutPath = Join-Path ([Environment]::GetFolderPath("Startup")) $ShortcutName
$AppPath = Join-Path $ProjectRoot "dist\Wizard Schedules\Wizard Schedule & Snippets.exe"
$IconPath = Join-Path $ProjectRoot "public\wizard-schedules-transparent.ico"
$AppDirectory = Split-Path -Parent $AppPath
$AppUserModelId = "com.wizardschedule.snippets.transparent"

if (-not (Test-Path -LiteralPath $AppPath)) {
  throw "Portable app was not found at $AppPath. Run npm run package:portable first."
}

New-Item -ItemType Directory -Path $StartMenuDir -Force | Out-Null
$Shell = New-Object -ComObject WScript.Shell

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

[ComImport]
[Guid("00021401-0000-0000-C000-000000000046")]
public class ShellLink
{
}

[ComImport]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
[Guid("0000010b-0000-0000-C000-000000000046")]
public interface IPersistFile
{
  void GetClassID(out Guid pClassID);
  void IsDirty();
  void Load([MarshalAs(UnmanagedType.LPWStr)] string pszFileName, uint dwMode);
  void Save([MarshalAs(UnmanagedType.LPWStr)] string pszFileName, bool fRemember);
  void SaveCompleted([MarshalAs(UnmanagedType.LPWStr)] string pszFileName);
  void GetCurFile([MarshalAs(UnmanagedType.LPWStr)] out string ppszFileName);
}

[ComImport]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
[Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99")]
public interface IPropertyStore
{
  void GetCount(out uint cProps);
  void GetAt(uint iProp, out PROPERTYKEY pkey);
  void GetValue(ref PROPERTYKEY key, out PROPVARIANT pv);
  void SetValue(ref PROPERTYKEY key, ref PROPVARIANT pv);
  void Commit();
}

[StructLayout(LayoutKind.Sequential, Pack = 4)]
public struct PROPERTYKEY
{
  public Guid fmtid;
  public uint pid;
}

[StructLayout(LayoutKind.Sequential)]
public struct PROPVARIANT
{
  public ushort vt;
  public ushort wReserved1;
  public ushort wReserved2;
  public ushort wReserved3;
  public IntPtr p;

  public static PROPVARIANT FromString(string value)
  {
    PROPVARIANT variant = new PROPVARIANT();
    variant.vt = 31;
    variant.p = Marshal.StringToCoTaskMemUni(value);
    return variant;
  }

  public void Clear()
  {
    if (p != IntPtr.Zero)
    {
      Marshal.FreeCoTaskMem(p);
      p = IntPtr.Zero;
    }
  }
}

public static class ShortcutProperties
{
  public static void SetAppUserModelId(string shortcutPath, string appUserModelId)
  {
    var shellLink = new ShellLink();
    var persistFile = (IPersistFile)shellLink;
    persistFile.Load(shortcutPath, 2);

    var propertyStore = (IPropertyStore)shellLink;
    var appIdKey = new PROPERTYKEY();
    appIdKey.fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");
    appIdKey.pid = 5;

    var appId = PROPVARIANT.FromString(appUserModelId);
    try
    {
      propertyStore.SetValue(ref appIdKey, ref appId);
      propertyStore.Commit();
      persistFile.Save(shortcutPath, true);
    }
    finally
    {
      appId.Clear();
      Marshal.FinalReleaseComObject(shellLink);
    }
  }
}
"@

$ShortcutDefinitions = @(
  @{ Path = $DesktopShortcutPath; Arguments = ""; Description = "Open Wizard Schedule & Snippets" },
  @{ Path = $StartMenuShortcutPath; Arguments = ""; Description = "Open Wizard Schedule & Snippets" },
  @{ Path = $StartupShortcutPath; Arguments = "--hidden"; Description = "Preload Wizard Schedule & Snippets in the tray" }
)

foreach ($Definition in $ShortcutDefinitions) {
  $ShortcutPath = $Definition.Path
  $Shortcut = $Shell.CreateShortcut($ShortcutPath)
  $Shortcut.TargetPath = $AppPath
  $Shortcut.Arguments = $Definition.Arguments
  $Shortcut.WorkingDirectory = $AppDirectory
  $Shortcut.IconLocation = "$IconPath,0"
  $Shortcut.Description = $Definition.Description
  $Shortcut.Hotkey = ""
  $Shortcut.WindowStyle = 1
  $Shortcut.Save()
  [ShortcutProperties]::SetAppUserModelId($ShortcutPath, $AppUserModelId)
  Write-Host "Created shortcut: $ShortcutPath"
}
