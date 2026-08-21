Dim WshShell
Dim Fso
Dim ScriptDir
Set WshShell = CreateObject("WScript.Shell")
Set Fso = CreateObject("Scripting.FileSystemObject")

ScriptDir = Fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = ScriptDir
WshShell.Run """" & ScriptDir & "\dist\Wizard Schedules\Wizard Schedule & Snippets.exe""", 0, False
