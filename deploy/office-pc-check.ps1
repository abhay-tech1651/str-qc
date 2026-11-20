<#
  County Search QC: is this Windows PC ready to run the always-on shared copy? (docs/REMOTE_ACCESS.md, "Office PC")

  Run on the office PC, ideally as administrator (needed only to read the disk-encryption state):
    powershell -ExecutionPolicy Bypass -File deploy\office-pc-check.ps1          plain list
    powershell -ExecutionPolicy Bypass -File deploy\office-pc-check.ps1 -Json    one JSON object
  It only reads settings. It changes nothing, installs nothing, and prints no names, accounts or secrets,
  so the output is safe to paste back to Claude.
  Exit code: 0 ready, 1 something needs doing.
#>
param([switch]$Json)
$ErrorActionPreference = 'SilentlyContinue'
$checks = New-Object System.Collections.Generic.List[object]
function Add-Check([string]$name, [string]$state, [string]$detail, [string]$fix = '') {
  $checks.Add([pscustomobject]@{ check = $name; state = $state; detail = $detail; fix = $fix })
}
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

# 1. Windows edition and build (WSL 2 needs build 19041 or later)
$os = Get-CimInstance Win32_OperatingSystem
$build = [int]$os.BuildNumber
$edition = [string]$os.Caption
if ($build -ge 19041) { Add-Check 'Windows' 'ok' "$edition, build $build" }
else { Add-Check 'Windows' 'needs' "$edition, build $build" 'Update Windows (WSL 2 needs build 19041 or later).' }

# 2. Disk encryption of C:
$enc = $null
if ($isAdmin) {
  $v = Get-BitLockerVolume -MountPoint 'C:'
  if ($v) { $enc = [string]$v.ProtectionStatus }
  else {
    $m = (& manage-bde -status C: 2>$null) -join "`n"
    if ($m -match 'Protection Status:\s*Protection On') { $enc = 'On' } elseif ($m -match 'Protection Status:\s*Protection Off') { $enc = 'Off' }
  }
}
if (-not $isAdmin) { Add-Check 'Disk encryption' 'unknown' 'Run this check as administrator to read it.' 'Right-click PowerShell > Run as administrator, then run the check again.' }
elseif ($enc -eq 'On') { Add-Check 'Disk encryption' 'ok' 'C: is encrypted (BitLocker or Device encryption).' }
elseif ($edition -match 'Home') { Add-Check 'Disk encryption' 'needs' 'C: is not encrypted. Windows Home has no BitLocker.' 'Settings > Privacy & security > Device encryption, turn On (if listed); otherwise upgrade to Windows Pro and turn on BitLocker.' }
else { Add-Check 'Disk encryption' 'needs' 'C: is not encrypted.' 'Control Panel > BitLocker Drive Encryption > Turn on BitLocker for C:. Keep the recovery key somewhere safe, away from this PC.' }

# 3. Virtualisation (WSL 2 and Docker need it)
$hv = (Get-CimInstance Win32_ComputerSystem).HypervisorPresent
$fw = (Get-CimInstance Win32_Processor | Select-Object -First 1).VirtualizationFirmwareEnabled
if ($hv -or $fw) { Add-Check 'Virtualisation' 'ok' 'Turned on.' }
else { Add-Check 'Virtualisation' 'needs' 'Turned off in the PC firmware.' 'Restart into BIOS/UEFI setup and enable Intel VT-x or AMD-V (SVM).' }

# 4. Memory and free space
$ramGb = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
$freeGb = [math]::Round((Get-PSDrive C).Free / 1GB, 1)
if ($ramGb -ge 8) { Add-Check 'Memory' 'ok' "$ramGb GB" } elseif ($ramGb -ge 4) { Add-Check 'Memory' 'ok' "$ramGb GB (enough; 8 GB is more comfortable)" } else { Add-Check 'Memory' 'needs' "$ramGb GB" 'At least 4 GB of memory is needed.' }
if ($freeGb -ge 15) { Add-Check 'Free space (C drive)' 'ok' "$freeGb GB" } else { Add-Check 'Free space (C drive)' 'needs' "$freeGb GB" 'Free at least 15 GB on C:.' }

# 5. Sleep when plugged in (must be Never, or the dashboard goes offline)
$q = (& powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE 2>$null) -join "`n"
if ($q -match 'Current AC Power Setting Index:\s*0x([0-9a-fA-F]+)') {
  $sec = [Convert]::ToInt32($Matches[1], 16)
  if ($sec -eq 0) { Add-Check 'Sleep (plugged in)' 'ok' 'Never.' }
  else { Add-Check 'Sleep (plugged in)' 'needs' "Sleeps after $([math]::Round($sec / 60)) minutes." 'Settings > System > Power > Screen and sleep: "When plugged in, put my device to sleep after" = Never. The screen may still turn off.' }
} else { Add-Check 'Sleep (plugged in)' 'unknown' 'Could not read the power plan.' 'Check Settings > System > Power: sleep when plugged in = Never.' }

# 6. WSL and a Linux distribution (the free route: Docker Engine inside Ubuntu)
$wslOk = $false; $distros = @()
if (Get-Command wsl.exe) {
  $null = & wsl.exe --status 2>$null
  if ($LASTEXITCODE -eq 0) {
    $wslOk = $true
    $distros = @((& wsl.exe -l -q 2>$null) -replace "`0", '' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  }
}
if (-not $wslOk) { Add-Check 'WSL 2' 'needs' 'Not installed.' 'As administrator: wsl --install -d Ubuntu-24.04, then restart.' }
elseif (-not ($distros | Where-Object { $_ -match 'Ubuntu' })) { Add-Check 'WSL 2' 'needs' "Installed; no Ubuntu yet ($($distros -join ', '))." 'wsl --install -d Ubuntu-24.04' }
else { Add-Check 'WSL 2' 'ok' "Installed: $($distros -join ', ')." }

# 7. Docker: Docker Engine inside Ubuntu (free) or Docker Desktop (paid for a company of County's size)
$ubuntu = $distros | Where-Object { $_ -match 'Ubuntu' } | Select-Object -First 1
$engine = $false
if ($ubuntu) { $null = & wsl.exe -d $ubuntu -e sh -c 'command -v docker >/dev/null && docker compose version >/dev/null' 2>$null; $engine = ($LASTEXITCODE -eq 0) }
$desktop = Test-Path "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
if ($engine) { Add-Check 'Docker' 'ok' "Docker Engine and Compose in $ubuntu." }
elseif ($desktop) { Add-Check 'Docker' 'ok' 'Docker Desktop is installed. A company of 250+ staff or $10M+ revenue needs a paid Docker subscription for it.' 'Either confirm a paid Docker seat, or use the free route: Docker Engine inside Ubuntu.' }
else { Add-Check 'Docker' 'needs' 'Not installed.' 'Free route: install Docker Engine inside Ubuntu (docs/REMOTE_ACCESS.md, Office PC, step 3).' }

# 8. Git inside Ubuntu (to download and update the dashboard code)
if ($ubuntu) {
  $null = & wsl.exe -d $ubuntu -e sh -c 'command -v git >/dev/null' 2>$null
  if ($LASTEXITCODE -eq 0) { Add-Check 'Git (in Ubuntu)' 'ok' 'Installed.' } else { Add-Check 'Git (in Ubuntu)' 'needs' 'Not installed.' 'In Ubuntu: sudo apt install -y git' }
}

# 9. Is the shared copy already running?
if ($ubuntu -and $engine) {
  $ps = (& wsl.exe -d $ubuntu -e sh -c 'docker ps --format "{{.Names}} {{.Status}}" 2>/dev/null' 2>$null) -join '; '
  if ($ps -match 'qc' -and $ps -match 'tailscale') { Add-Check 'Shared copy' 'ok' "Running: $ps" }
  else { Add-Check 'Shared copy' 'not yet' 'Not running.' 'In Ubuntu, in the str-qc folder: sh deploy/setup.sh, then docker compose up -d --build' }
}

$ready = -not ($checks | Where-Object { $_.state -in @('needs') })
if ($Json) {
  [pscustomobject]@{ ready = $ready; admin = $isAdmin; checks = $checks } | ConvertTo-Json -Depth 4
} else {
  Write-Host "County Search QC: office PC check`n"
  foreach ($c in $checks) {
    $mark = switch ($c.state) { 'ok' { '[ok]   ' } 'needs' { '[needs]' } default { '[?]    ' } }
    Write-Host "$mark $($c.check): $($c.detail)"
    if ($c.fix -and $c.state -ne 'ok') { Write-Host "        -> $($c.fix)" }
  }
  Write-Host ''
  if ($ready) { Write-Host 'Ready (anything marked [?] is still worth a look).' } else { Write-Host 'Not ready yet: do the [needs] items above, then run this check again.' }
}
if ($ready) { exit 0 } else { exit 1 }
