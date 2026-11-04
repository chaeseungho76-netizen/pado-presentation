@echo off
rem Pado presentation: start a no-cache local server in this folder; it opens the browser when ready.
cd /d "%~dp0"
python serve.py 8123
pause
