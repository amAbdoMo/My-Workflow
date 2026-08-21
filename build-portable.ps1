$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ElectronDist = Join-Path $ProjectRoot "node_modules\electron\dist"
$OutputRoot = Join-Path $ProjectRoot "dist"
$PortableDir = Join-Path $OutputRoot "WorkflowY"
$LegacyPortableDir = Join-Path $OutputRoot "Wizard Schedules"
$ResourcesDir = Join-Path $PortableDir "resources"
$AppDir = Join-Path $ResourcesDir "app"
$PackagedBuildDir = Join-Path $AppDir "app-build"
$ExePath = Join-Path $PortableDir "WorkflowY.exe"
$IconPath = Join-Path $ProjectRoot "public\wizard-schedules-transparent.ico"
$RceditPath = Join-Path $ProjectRoot "node_modules\rcedit\bin\rcedit-x64.exe"

if (-not (Test-Path -LiteralPath (Join-Path $ElectronDist "electron.exe"))) {
  throw "Electron runtime was not found. Run npm install first."
}

if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot "app-build\index.html"))) {
  throw "app-build was not found. Run npm run build first."
}

$ResolvedProject = (Resolve-Path -LiteralPath $ProjectRoot).Path
$NeedsRuntime = -not (Test-Path -LiteralPath $ExePath)

if ($NeedsRuntime -and (Test-Path -LiteralPath $PortableDir)) {
  $ResolvedPortable = (Resolve-Path -LiteralPath $PortableDir).Path
  if (-not $ResolvedPortable.StartsWith($ResolvedProject)) {
    throw "Refusing to remove path outside project: $ResolvedPortable"
  }
  Remove-Item -LiteralPath $ResolvedPortable -Recurse -Force
}

if ($NeedsRuntime -and (Test-Path -LiteralPath $LegacyPortableDir)) {
  $ResolvedLegacyPortable = (Resolve-Path -LiteralPath $LegacyPortableDir).Path
  if (-not $ResolvedLegacyPortable.StartsWith($ResolvedProject)) {
    throw "Refusing to remove path outside project: $ResolvedLegacyPortable"
  }
  Remove-Item -LiteralPath $ResolvedLegacyPortable -Recurse -Force
}

New-Item -ItemType Directory -Path $OutputRoot -Force | Out-Null

if ($NeedsRuntime) {
  Copy-Item -LiteralPath $ElectronDist -Destination $PortableDir -Recurse -Force

  $LocalesDir = Join-Path $PortableDir "locales"
  if (Test-Path -LiteralPath $LocalesDir) {
    Get-ChildItem -LiteralPath $LocalesDir -File |
      Where-Object { $_.Name -ne "en-US.pak" } |
      Remove-Item -Force
  }

  $DefaultApp = Join-Path $ResourcesDir "default_app.asar"
  if (Test-Path -LiteralPath $DefaultApp) {
    try {
      Remove-Item -LiteralPath $DefaultApp -Force
    } catch {
      Write-Warning "Could not remove Electron default app; continuing because resources\app will be used."
    }
  }

  Rename-Item -LiteralPath (Join-Path $PortableDir "electron.exe") -NewName "WorkflowY.exe"
}

New-Item -ItemType Directory -Path $AppDir -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $ProjectRoot "electron.js") -Destination (Join-Path $AppDir "electron.js") -Force
Copy-Item -LiteralPath (Join-Path $ProjectRoot "preload.js") -Destination (Join-Path $AppDir "preload.js") -Force
New-Item -ItemType Directory -Path $PackagedBuildDir -Force | Out-Null
Copy-Item -Path (Join-Path $ProjectRoot "app-build\*") -Destination $PackagedBuildDir -Recurse -Force

$PackagedPublicDir = Join-Path $AppDir "public"
New-Item -ItemType Directory -Path $PackagedPublicDir -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $ProjectRoot "public\wizard-schedules-transparent.ico") -Destination (Join-Path $PackagedPublicDir "wizard-schedules-transparent.ico") -Force

$SourceNodeModulesDir = Join-Path $ProjectRoot "node_modules"
$AppNodeModulesDir = Join-Path $AppDir "node_modules"
$ResolvedSourceNodeModules = (Resolve-Path -LiteralPath $SourceNodeModulesDir).Path
$CopiedRuntimeModules = New-Object 'System.Collections.Generic.HashSet[string]'

function Get-ModulePathFragment([string] $ModuleName) {
  return $ModuleName.Replace("/", [System.IO.Path]::DirectorySeparatorChar)
}

function Resolve-ModuleDirectory([string] $ModuleName, [string] $FromDirectory) {
  $CurrentDirectory = $FromDirectory

  while ($true) {
    $Candidate = Join-Path (Join-Path $CurrentDirectory "node_modules") (Get-ModulePathFragment $ModuleName)
    if (Test-Path -LiteralPath (Join-Path $Candidate "package.json")) {
      return (Resolve-Path -LiteralPath $Candidate).Path
    }

    $ParentDirectory = Split-Path -Parent $CurrentDirectory
    if ([string]::IsNullOrWhiteSpace($ParentDirectory) -or $ParentDirectory -eq $CurrentDirectory) {
      break
    }

    $CurrentDirectory = $ParentDirectory
  }

  throw "Runtime dependency was not found: $ModuleName"
}

function Copy-RuntimeModule([string] $ModuleName, [string] $FromDirectory) {
  $SourceModuleDir = Resolve-ModuleDirectory $ModuleName $FromDirectory

  if (-not $SourceModuleDir.StartsWith($ResolvedSourceNodeModules)) {
    throw "Refusing to copy dependency outside node_modules: $SourceModuleDir"
  }

  if (-not $CopiedRuntimeModules.Add($SourceModuleDir)) {
    return
  }

  $RelativeModulePath = $SourceModuleDir.Substring($ResolvedSourceNodeModules.Length).TrimStart([System.IO.Path]::DirectorySeparatorChar, '/', '\')
  $DestinationModuleDir = Join-Path $AppNodeModulesDir $RelativeModulePath
  New-Item -ItemType Directory -Path (Split-Path -Parent $DestinationModuleDir) -Force | Out-Null
  Copy-Item -LiteralPath $SourceModuleDir -Destination $DestinationModuleDir -Recurse -Force

  $PackageJson = Get-Content -LiteralPath (Join-Path $SourceModuleDir "package.json") -Raw | ConvertFrom-Json
  foreach ($DependencySection in @("dependencies", "optionalDependencies")) {
    if (-not $PackageJson.$DependencySection) {
      continue
    }

    foreach ($Dependency in $PackageJson.$DependencySection.PSObject.Properties.Name) {
      try {
        Copy-RuntimeModule $Dependency $SourceModuleDir
      } catch {
        if ($DependencySection -eq "dependencies") {
          throw
        }
      }
    }
  }
}

if (Test-Path -LiteralPath $AppNodeModulesDir) {
  Remove-Item -LiteralPath $AppNodeModulesDir -Recurse -Force
}
Copy-RuntimeModule "imapflow" $ProjectRoot

@'
{
  "name": "wizard-schedules",
  "version": "0.1.0",
  "productName": "WorkflowY",
  "main": "electron.js",
  "dependencies": {
    "imapflow": "^1.3.3"
  }
}
'@ | Set-Content -LiteralPath (Join-Path $AppDir "package.json") -Encoding UTF8

if ($NeedsRuntime -and (Test-Path -LiteralPath $RceditPath)) {
  & $RceditPath $ExePath `
    --set-icon $IconPath `
    --set-version-string "FileDescription" "WorkflowY" `
    --set-version-string "ProductName" "WorkflowY" `
    --set-version-string "OriginalFilename" "WorkflowY.exe" `
    --set-file-version "0.1.0" `
    --set-product-version "0.1.0"
} elseif ($NeedsRuntime) {
  Write-Warning "rcedit was not found; the portable exe will keep Electron's embedded icon."
}

if ($NeedsRuntime) {
  Write-Host "Created portable app: $ExePath"
} else {
  Write-Host "Updated portable app resources: $AppDir"
}
