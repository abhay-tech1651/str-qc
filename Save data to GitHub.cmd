@echo off
rem County Search QC: lock the dashboard's data with your passphrase and send it to GitHub (private repository).
title Save data to GitHub
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Install the LTS version from https://nodejs.org and double-click this again. & pause & exit /b 1)
node scripts\save.mjs
pause
