using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

internal static class DesktopLauncher
{
  [STAThread]
  private static void Main()
  {
    string[] appPaths =
    {
      Path.Combine(
        AppDomain.CurrentDomain.BaseDirectory,
        "Wizard Schedules",
        "Wizard Schedule & Snippets.exe"
      ),
      Path.Combine(
        AppDomain.CurrentDomain.BaseDirectory,
        "dist",
        "Wizard Schedules",
        "Wizard Schedule & Snippets.exe"
      )
    };

    string appPath = null;
    foreach (string candidate in appPaths)
    {
      if (File.Exists(candidate))
      {
        appPath = candidate;
        break;
      }
    }

    if (appPath == null)
    {
      MessageBox.Show(
        "Wizard Schedule & Snippets was not found. Rebuild the portable app first.",
        "Wizard Schedule & Snippets",
        MessageBoxButtons.OK,
        MessageBoxIcon.Error
      );
      return;
    }

    string workingDirectory = Path.GetDirectoryName(appPath);

    Process.Start(new ProcessStartInfo
    {
      FileName = appPath,
      WorkingDirectory = workingDirectory,
      UseShellExecute = true
    });
  }
}
