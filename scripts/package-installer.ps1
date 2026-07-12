# Creates the application payload consumed by the separate Avalonia installer.
# This script does not build or publish the installer itself.

[CmdletBinding()]
param(
    [switch]$SkipBuild,
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$desktopDirectory = Join-Path $repoRoot 'applications\desktop'
$unpackedDirectory = Join-Path $desktopDirectory 'dist\win-unpacked'

$desktopPackage = Get-Content (Join-Path $desktopDirectory 'package.json') -Raw | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $artifactDirectory = Join-Path $repoRoot 'artifacts\installer'
    $OutputPath = Join-Path $artifactDirectory "Connectome-$($desktopPackage.version)-win-x64.zip"
} elseif (-not [System.IO.Path]::IsPathRooted($OutputPath)) {
    $OutputPath = Join-Path $repoRoot $OutputPath
}

if (-not $SkipBuild) {
    Write-Host 'Building the unpacked production application...' -ForegroundColor Cyan
    Push-Location $repoRoot
    try {
        & yarn.cmd desktop:package:preview
        if ($LASTEXITCODE -ne 0) {
            throw "The production package build failed with exit code $LASTEXITCODE."
        }
    } finally {
        Pop-Location
    }
}

if (-not (Test-Path -LiteralPath $unpackedDirectory -PathType Container)) {
    throw "The unpacked application was not found at '$unpackedDirectory'. Run this script without -SkipBuild first."
}

$payloadFiles = Get-ChildItem -LiteralPath $unpackedDirectory -Force
if ($payloadFiles.Count -eq 0) {
    throw "The unpacked application directory is empty: '$unpackedDirectory'."
}

$outputDirectory = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
if (Test-Path -LiteralPath $OutputPath) {
    Remove-Item -LiteralPath $OutputPath -Force
}

Write-Host 'Creating the Avalonia installer payload...' -ForegroundColor Cyan
Compress-Archive -Path (Join-Path $unpackedDirectory '*') -DestinationPath $OutputPath -CompressionLevel Optimal

$archive = Get-Item -LiteralPath $OutputPath
$sizeMiB = [Math]::Round($archive.Length / 1MB, 1)
Write-Host "Payload created: $($archive.FullName) ($sizeMiB MiB)" -ForegroundColor Green
Write-Host 'Copy this ZIP into the Avalonia installer project and embed or package it according to that project''s design.'
