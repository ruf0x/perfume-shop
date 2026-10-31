@echo off
rem Opens the admin app without the installer (Windows "Smart App Control" blocks unsigned installers).
rem Needs Node.js on this computer. Double-click it. The first time it also builds the admin screens.
cd /d "%~dp0"
if not exist node_modules call npm install
call npm run ensure
if not exist web call npm run web
start "" "node_modules\electron\dist\electron.exe" .
