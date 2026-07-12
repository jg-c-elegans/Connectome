[CmdletBinding()]
param(
    [switch]$SkipBuild,
    [string]$OutputPath,
    [string]$CertificatePath,
    [securestring]$CertificatePassword
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$desktopDirectory = Join-Path $repoRoot 'applications\desktop'
$unpackedDirectory = Join-Path $desktopDirectory 'dist\win-unpacked'
$msixDirectory = Join-Path $repoRoot 'packaging\msix'
$identityPath = Join-Path $msixDirectory 'store-identity.json'
$templatePath = Join-Path $msixDirectory 'Package.appxmanifest.template'
$artifactDirectory = Join-Path $repoRoot 'artifacts\msix'
$stagingDirectory = Join-Path $artifactDirectory 'staging'

$desktopPackage = Get-Content (Join-Path $desktopDirectory 'package.json') -Raw | ConvertFrom-Json
$identity = Get-Content $identityPath -Raw | ConvertFrom-Json
$identityValues = @($identity.identityName, $identity.publisher, $identity.publisherDisplayName)
if ($identityValues | Where-Object { [string]::IsNullOrWhiteSpace($_) -or $_ -like 'REPLACE_WITH_*' }) {
    throw "Enter the exact Partner Center Product identity values in '$identityPath' before packaging."
}

$versionParts = @($desktopPackage.version.Split('.'))
if ($versionParts.Count -gt 4 -or $versionParts.Count -lt 1) {
    throw "The desktop version '$($desktopPackage.version)' cannot be converted to an MSIX version."
}
while ($versionParts.Count -lt 4) {
    $versionParts += '0'
}
$msixVersion = $versionParts -join '.'

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $artifactDirectory "Connectome-IDE-$msixVersion-x64.msix"
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

$connectomeExecutable = Join-Path $unpackedDirectory 'Connectome.exe'
if (-not (Test-Path -LiteralPath $connectomeExecutable -PathType Leaf)) {
    throw "The MSIX entry point was not found at '$connectomeExecutable'. Build the production package first."
}

$sdkBinRoot = 'C:\Program Files (x86)\Windows Kits\10\bin'
$sdkDirectory = Get-ChildItem -LiteralPath $sdkBinRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path (Join-Path $_.FullName 'x64\makeappx.exe') } |
    Sort-Object { [version]$_.Name } -Descending |
    Select-Object -First 1
if (-not $sdkDirectory) {
    throw 'makeappx.exe was not found. Install a Windows 10 or Windows 11 SDK with MSIX packaging tools.'
}
$makeAppx = Join-Path $sdkDirectory.FullName 'x64\makeappx.exe'
$signTool = Join-Path $sdkDirectory.FullName 'x64\signtool.exe'

New-Item -ItemType Directory -Path $artifactDirectory -Force | Out-Null
if (Test-Path -LiteralPath $stagingDirectory) {
    $resolvedStaging = (Resolve-Path -LiteralPath $stagingDirectory).Path
    $resolvedArtifacts = (Resolve-Path -LiteralPath $artifactDirectory).Path
    if (-not $resolvedStaging.StartsWith($resolvedArtifacts, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to clear staging outside '$resolvedArtifacts'."
    }
    Remove-Item -LiteralPath $resolvedStaging -Recurse -Force
}
New-Item -ItemType Directory -Path $stagingDirectory -Force | Out-Null

Write-Host 'Staging the Connectome application...' -ForegroundColor Cyan
Copy-Item -Path (Join-Path $unpackedDirectory '*') -Destination $stagingDirectory -Recurse -Force
Copy-Item -LiteralPath (Join-Path $msixDirectory 'Assets') -Destination $stagingDirectory -Recurse -Force
Copy-Item -LiteralPath (Join-Path $msixDirectory 'MSIX.AppInstaller.Data') -Destination $stagingDirectory -Recurse -Force

function ConvertTo-XmlText([string]$Value) {
    return [System.Security.SecurityElement]::Escape($Value)
}

$manifest = Get-Content $templatePath -Raw
$manifest = $manifest.Replace('{{IdentityName}}', (ConvertTo-XmlText $identity.identityName))
$manifest = $manifest.Replace('{{Publisher}}', (ConvertTo-XmlText $identity.publisher))
$manifest = $manifest.Replace('{{PublisherDisplayName}}', (ConvertTo-XmlText $identity.publisherDisplayName))
$manifest = $manifest.Replace('{{Version}}', $msixVersion)
$manifestPath = Join-Path $stagingDirectory 'AppxManifest.xml'
[System.IO.File]::WriteAllText($manifestPath, $manifest, [System.Text.UTF8Encoding]::new($false))

if (Test-Path -LiteralPath $OutputPath) {
    Remove-Item -LiteralPath $OutputPath -Force
}

Write-Host "Creating Connectome IDE $msixVersion MSIX..." -ForegroundColor Cyan
& $makeAppx pack /d $stagingDirectory /p $OutputPath /o
if ($LASTEXITCODE -ne 0) {
    throw "MakeAppx failed with exit code $LASTEXITCODE."
}

if (-not [string]::IsNullOrWhiteSpace($CertificatePath)) {
    if (-not (Test-Path -LiteralPath $CertificatePath -PathType Leaf)) {
        throw "The signing certificate was not found: '$CertificatePath'."
    }
    $signArguments = @('sign', '/fd', 'SHA256', '/a', '/f', $CertificatePath)
    if ($CertificatePassword) {
        $plainPassword = [System.Net.NetworkCredential]::new('', $CertificatePassword).Password
        $signArguments += @('/p', $plainPassword)
    }
    $signArguments += $OutputPath
    try {
        & $signTool @signArguments
        if ($LASTEXITCODE -ne 0) {
            throw "SignTool failed with exit code $LASTEXITCODE."
        }
    } finally {
        $plainPassword = $null
    }
}

$artifact = Get-Item -LiteralPath $OutputPath
$sizeMiB = [Math]::Round($artifact.Length / 1MB, 1)
Write-Host "MSIX created: $($artifact.FullName) ($sizeMiB MiB)" -ForegroundColor Green
