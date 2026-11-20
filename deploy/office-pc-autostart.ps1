<#
  County Search QC: keep the shared copy running on the office PC (docs/REMOTE_ACCESS.md, "Office PC", step 6).

  Docker Engine runs inside Ubuntu on WSL 2, and Windows stops WSL when nothing is using it. This adds one Windows
  scheduled task that starts Ubuntu when you sign in to the PC and keeps it running, hidden. Docker then restarts the
  dashboard by itself. Run once, in PowerShell as administrator, from the str-qc folder:
    powershell -ExecutionPolicy Bypass -File deploy\office-pc-autostart.ps1            add the task
    powershell -ExecutionPolicy Bypass -File deploy\office-pc-autostart.ps1 -Remove    remove it again
  It stores no password. Leave the PC signed in with the screen locked (Windows key + L).
#>
param([switch]$Remove, [string]$Distro = 'Ubuntu-24.04')
$ErrorActionPreference = 'Stop'
$name = 'County QC - keep Ubuntu running'
if ($Remove) {
  Unregister-ScheduledTask -TaskName $name -Confirm:$false
  Write-Host "Removed the task '$name'."
  exit 0
}
if ($Distro -notmatch '^[A-Za-z0-9._-]+$') { throw 'The distribution name has letters, digits, dots and dashes only.' }
$installed = @((& wsl.exe -l -q) -replace "`0", '' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if ($installed -notcontains $Distro) { throw "No WSL distribution named $Distro. Installed: $($installed -join ', '). Pass -Distro <name>." }

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -Command `"wsl.exe -d $Distro --exec sleep infinity`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Description 'Keeps WSL running so the County Search QC shared copy stays online (str-qc/deploy).' -Force | Out-Null
Start-ScheduledTask -TaskName $name
Write-Host "Added and started the task '$name'. It runs each time you sign in to this PC."
Write-Host 'Check after a restart: sign in, lock the screen, and open the dashboard from your phone.'
