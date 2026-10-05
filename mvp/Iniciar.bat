@echo off
title Vela Inbound
cd /d "%~dp0"
start "" http://localhost:3400/
node server.js
pause
