$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location -LiteralPath $ProjectRoot

$env:BUILD_PATH = "app-build"
$env:GENERATE_SOURCEMAP = "false"

& node ".\node_modules\react-scripts\bin\react-scripts.js" build
