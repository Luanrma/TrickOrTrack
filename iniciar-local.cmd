@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar-local.ps1" %*
set "LOCAL_TEST_EXIT=%ERRORLEVEL%"
if not "%LOCAL_TEST_EXIT%"=="0" pause
exit /b %LOCAL_TEST_EXIT%
