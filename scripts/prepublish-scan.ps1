# Quick local scan before publishing to a public repository.
# This is best-effort and should complement (not replace) your org's security tooling.

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "Scanning for common secrets/keys..." -ForegroundColor Cyan

$excludePathRegex = '(\\|/)(node_modules|\.git|volumes|dist|build)(\\|/)'
$selfPath = (Resolve-Path $PSCommandPath).Path

$demoAllowlistMarkers = @(
  'TEST000001',
  'PATIENT^TEST',
  '(555)0100',
  '100 TEST STREET',
  'TESTVILLE'
)

# Allowlist emails that are expected to be public in this repo (e.g., author/contact placeholders).
$emailAllowlist = @(
  'your-email@example.com',
  'example.com'
)

function Find-Matches([string]$pattern, [string]$label) {
  $matches = Get-ChildItem -Recurse -File -Force |
    Where-Object { $_.FullName -notmatch $excludePathRegex } |
    Select-String -Pattern $pattern -AllMatches -SimpleMatch:$false -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -ne $selfPath }

  if ($matches) {
    Write-Host "FAIL: Found $label" -ForegroundColor Red
    $matches | Select-Object -First 30 | ForEach-Object {
      Write-Host ("  {0}:{1}: {2}" -f $_.Path, $_.LineNumber, $_.Line.Trim())
    }
    throw "Prepublish scan failed: $label"
  }
}

function Find-Warnings([string]$pattern, [string]$label) {
  $matches = Get-ChildItem -Recurse -File -Force |
    Where-Object { $_.FullName -notmatch $excludePathRegex } |
    Select-String -Pattern $pattern -AllMatches -SimpleMatch:$false -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -ne $selfPath }

  if ($matches) {
    $filtered = $matches | Where-Object {
      $line = $_.Line
      -not ($demoAllowlistMarkers | Where-Object { $line -like "*$_*" })
    }

    if ($filtered) {
      Write-Host "WARN: Found $label (review before publishing)" -ForegroundColor Yellow
      $filtered | Select-Object -First 30 | ForEach-Object {
        Write-Host ("  {0}:{1}: {2}" -f $_.Path, $_.LineNumber, $_.Line.Trim())
      }
    }
  }
}

# Private keys / PEM blocks
Find-Matches -pattern "-----BEGIN (RSA|DSA|EC|OPENSSH) PRIVATE KEY-----|-----BEGIN PRIVATE KEY-----" -label "private key blocks"

# Common access tokens
Find-Matches -pattern "AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}" -label "cloud or SaaS access tokens"

# JWT-looking tokens
Find-Matches -pattern "eyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}" -label "JWT-like tokens"

Write-Host "Scanning for PHI-like patterns in repo files..." -ForegroundColor Cyan

# High-confidence PHI-like patterns
Find-Matches -pattern "\b\d{3}-\d{2}-\d{4}\b" -label "SSN-like patterns"
$emailHits = Get-ChildItem -Recurse -File -Force |
  Where-Object { $_.FullName -notmatch $excludePathRegex } |
  Select-String -Pattern "[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}" -AllMatches -SimpleMatch:$false -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -ne $selfPath }

if ($emailHits) {
  $unexpected = $emailHits | Where-Object {
    $line = $_.Line
    -not ($emailAllowlist | Where-Object { $line -like "*$_*" })
  }

  if ($unexpected) {
    Write-Host "FAIL: Found unexpected email addresses" -ForegroundColor Red
    $unexpected | Select-Object -First 30 | ForEach-Object {
      Write-Host ("  {0}:{1}: {2}" -f $_.Path, $_.LineNumber, $_.Line.Trim())
    }
    throw "Prepublish scan failed: email addresses"
  }
}

# Lower-confidence patterns: warn unless obviously synthetic demo values
Find-Warnings -pattern "\(\d{3}\)\s?\d{3}-\d{4}" -label "US phone-like patterns"
Find-Warnings -pattern "\+\d{1,3}[\d\s\-]{7,}" -label "international phone-like patterns"

Write-Host "OK: No obvious secrets/PHI patterns found." -ForegroundColor Green
