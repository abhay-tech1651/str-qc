@echo off
rem County Search QC: double-click to open the dashboard at http://127.0.0.1:3000. Close this window to stop it.
title County Search QC
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Install the LTS version from https://nodejs.org and double-click this again. & pause & exit /b 1)
node scripts\start.mjs
if errorlevel 1 pause
