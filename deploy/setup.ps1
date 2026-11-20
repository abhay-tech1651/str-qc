<#
  County Search QC: prepare the always-on shared copy on a Windows machine with Docker Desktop (docs/REMOTE_ACCESS.md).

  Run once, from the str-qc folder:   powershell -ExecutionPolicy Bypass -File deploy\setup.ps1
  It asks for four things and writes them where only Docker reads them:
    tailnet name          ->  .env                        (QC_TAILNET=..., ignored by git)
    GitHub token          ->  deploy\secrets\github_token (read-only token for this one repository)
    data passphrase       ->  deploy\secrets\qc_passphrase
    Tailscale auth key    ->  deploy\secrets\ts_authkey
  Typed secrets are hidden on screen, never echoed, never put in history or on a command line.
  Each secret file is locked to the current Windows user. Run it again to replace any of them.
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$secrets = Join-Path $PSScriptRoot 'secrets'
$utf8 = New-Object System.Text.UTF8Encoding $false

function Read-Hidden([string]$prompt) {
  $s = Read-Host -Prompt $prompt -AsSecureString
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}

function Save-Secret([string]$name, [string]$value) {
  $p = Join-Path $secrets $name
  [IO.File]::WriteAllText($p, $value, $utf8)
  # only this Windows user (and the system) may read the file
  & icacls $p /inheritance:r /grant:r "$($env:USERNAME):(R,W)" /grant:r "SYSTEM:(R)" | Out-Null
  Write-Host "  saved $name"
}

Write-Host "County Search QC: always-on copy setup`n"

$tailnet = (Read-Host 'Tailnet name, from Tailscale admin > DNS (for example tail1234ab)').Trim().ToLower() -replace '\.ts\.net$', ''
if ($tailnet -notmatch '^[a-z0-9-]+$') { throw 'The tailnet name has letters, digits and dashes only, for example tail1234ab.' }
[IO.File]::WriteAllText((Join-Path $root '.env'), "QC_TAILNET=$tailnet`n", $utf8)
Write-Host "  saved .env (the dashboard will answer at https://county-qc.$tailnet.ts.net)"

$token = (Read-Hidden 'GitHub fine-grained token (only str-qc, Contents: Read-only)').Trim()
if ($token -notmatch '^(github_pat_|ghp_)[A-Za-z0-9_]+$') { throw 'That does not look like a GitHub token (it starts with github_pat_).' }
if ($token.StartsWith('ghp_')) { Write-Warning 'This is a classic token, which can reach every repository you own. A fine-grained token limited to str-qc is safer.' }
Save-Secret 'github_token' $token

$pass = Read-Hidden 'Data passphrase (the one you type for "Save data to GitHub")'
if ($pass.Length -lt 12) { throw 'The data passphrase has at least 12 characters.' }
if ($pass -ne (Read-Hidden 'Same passphrase again')) { throw 'The two passphrases differ. Nothing about the passphrase was saved.' }
Save-Secret 'qc_passphrase' $pass

$ts = (Read-Hidden 'Tailscale auth key (Tailscale admin > Settings > Keys)').Trim()
if ($ts -notmatch '^tskey-') { throw 'A Tailscale auth key starts with tskey-.' }
Save-Secret 'ts_authkey' $ts

$token = $null; $pass = $null; $ts = $null
Write-Host "`nDone. Next, in this folder:"
Write-Host '  docker compose up -d --build'
Write-Host '  docker compose logs -f qc        (wait for "data updated", then Ctrl+C)'
Write-Host "Then open https://county-qc.$tailnet.ts.net and share the machine with Bhavik (docs/REMOTE_ACCESS.md, step 6)."
