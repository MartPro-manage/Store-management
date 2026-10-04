/**
 * Direct 1-Click Software Installation Helper for Mart Pro
 * Automatically installs or sets up Mart Pro to launch in standalone software mode
 * without Google Chrome address bar, tabs, or browser navigation.
 */

export async function triggerDirectSoftwareInstall(deferredPrompt?: any) {
  const currentUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const userAgent = typeof window !== 'undefined' ? window.navigator.userAgent.toLowerCase() : '';
  const isWindows = /windows/.test(userAgent);
  const isAndroid = /android/.test(userAgent);
  const isMac = /macintosh|mac os x/.test(userAgent) && !/iphone|ipad|ipod/.test(userAgent);
  const isIOS = /iphone|ipad|ipod/.test(userAgent);

  // 1. If native PWA install prompt is ready (Chrome, Edge, Android), trigger it immediately
  if (deferredPrompt && typeof deferredPrompt.prompt === 'function') {
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice && choice.outcome === 'accepted') {
        return { success: true, method: 'pwa' };
      }
    } catch (err) {
      console.warn('Native PWA install error, falling back to direct setup:', err);
    }
  }

  // 2. Direct OS Software Setup (No questions asked, launches standalone app mode)
  if (isWindows) {
    // Windows Automated Standalone Software Installer (.cmd)
    // Creates Desktop shortcut and launches directly in borderless App Mode (no Google/Chrome UI)
    const cmdScript = `@echo off
setlocal enabledelayedexpansion
title Installing Mart Pro Software...
cls
echo ========================================================
echo        Mart Pro Supermarket POS - Software Setup
echo ========================================================
echo.
echo Installing Mart Pro to your computer...

set "APP_URL=${currentUrl}"
set "APP_NAME=Mart Pro POS"
set "DESKTOP_DIR=%USERPROFILE%\\Desktop"
set "START_MENU=%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs"

:: Find browser executable for standalone app mode (removes address bar, tabs, and browser interface)
set "APP_BIN="
if exist "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" set "APP_BIN=%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe"
if not defined APP_BIN if exist "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" set "APP_BIN=%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe"
if not defined APP_BIN if exist "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" set "APP_BIN=%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe"
if not defined APP_BIN if exist "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" set "APP_BIN=%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe"

:: Create Desktop and Start Menu Shortcuts using PowerShell WScript.Shell
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; " ^
  "$d = [System.Environment]::GetFolderPath('Desktop'); " ^
  "$sm = [System.Environment]::GetFolderPath('Programs'); " ^
  "if ('%APP_BIN%' -ne '') { " ^
  "  $s1 = $ws.CreateShortcut(\"$d\\%APP_NAME%.lnk\"); $s1.TargetPath = '%APP_BIN%'; $s1.Arguments = '--app=%APP_URL%'; $s1.Description = 'Mart Pro Supermarket POS Software'; $s1.Save(); " ^
  "  $s2 = $ws.CreateShortcut(\"$sm\\%APP_NAME%.lnk\"); $s2.TargetPath = '%APP_BIN%'; $s2.Arguments = '--app=%APP_URL%'; $s2.Description = 'Mart Pro Supermarket POS Software'; $s2.Save(); " ^
  "} else { " ^
  "  $s1 = $ws.CreateShortcut(\"$d\\%APP_NAME%.url\"); $s1.TargetPath = '%APP_URL%'; $s1.Save(); " ^
  "}" 2>nul

echo.
echo [OK] Mart Pro installed successfully!
echo [OK] Desktop shortcut created on your Desktop.
echo [OK] Launching Mart Pro in standalone software mode...
echo.

:: Launch immediately in standalone mode (no address bar, no tabs, no Google UI)
if defined APP_BIN (
    start "" "%APP_BIN%" --app="%APP_URL%"
) else (
    start "" "%APP_URL%"
)

timeout /t 2 /nobreak >nul
exit
`;

    const blob = new Blob([cmdScript], { type: 'text/plain;charset=utf-8' });
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = 'Install-MartPro.cmd';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);

    // Also download desktop .url shortcut for immediate double-click access
    const urlShortcut = `[InternetShortcut]\nURL=${currentUrl}\nIconIndex=0\nHotKey=0\n`;
    const shortcutBlob = new Blob([urlShortcut], { type: 'text/plain;charset=utf-8' });
    const shortcutUrl = URL.createObjectURL(shortcutBlob);
    const shortcutLink = document.createElement('a');
    shortcutLink.href = shortcutUrl;
    shortcutLink.download = 'MartPro-POS.url';
    document.body.appendChild(shortcutLink);
    shortcutLink.click();
    document.body.removeChild(shortcutLink);
    URL.revokeObjectURL(shortcutUrl);

    return { success: true, method: 'windows' };
  } else if (isAndroid) {
    // Android Instant PWA launcher (.html) that launches without browser chrome
    const androidLauncher = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mart Pro POS</title>
  <link rel="manifest" href="${currentUrl}/manifest.json">
  <meta name="theme-color" content="#f97316">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <style>
    body { font-family: system-ui, sans-serif; background: #0b0f19; color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; padding: 20px; }
    .btn { background: #ea580c; color: white; padding: 14px 28px; border-radius: 12px; font-weight: bold; text-decoration: none; font-size: 16px; margin-top: 20px; display: inline-block; }
  </style>
</head>
<body>
  <h2>Mart Pro Supermarket POS</h2>
  <p>Installing Mart Pro Software on your device...</p>
  <a class="btn" href="${currentUrl}">Launch Mart Pro Software</a>
  <script>
    window.location.href = "${currentUrl}";
  </script>
</body>
</html>`;

    const blob = new Blob([androidLauncher], { type: 'text/html;charset=utf-8' });
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = 'Install-MartPro-Android.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);

    return { success: true, method: 'android' };
  } else if (isMac) {
    // macOS Standalone Software Launcher script (.command)
    const macScript = `#!/bin/bash
# Mart Pro Supermarket POS Standalone Software Launcher
APP_URL="${currentUrl}"
if [ -d "/Applications/Microsoft Edge.app" ]; then
  open -na "Microsoft Edge" --args --app="$APP_URL"
elif [ -d "/Applications/Google Chrome.app" ]; then
  open -na "Google Chrome" --args --app="$APP_URL"
else
  open "$APP_URL"
fi
exit 0
`;
    const blob = new Blob([macScript], { type: 'text/plain;charset=utf-8' });
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = 'Install-MartPro-Mac.command';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);

    return { success: true, method: 'mac' };
  } else if (isIOS) {
    // iOS Safari Add to Home Screen instructions or shortcut
    const universalLauncher = `[InternetShortcut]\nURL=${currentUrl}\nIconIndex=0\n`;
    const blob = new Blob([universalLauncher], { type: 'text/plain;charset=utf-8' });
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = 'MartPro-iOS.url';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);

    return { success: true, method: 'ios' };
  } else {
    // Universal Linux / Desktop
    const linuxDesktop = `[Desktop Entry]\nVersion=1.0\nName=Mart Pro POS\nComment=Supermarket POS & Inventory Management\nExec=chromium --app=${currentUrl}\nTerminal=false\nType=Application\nCategories=Office;Finance;\n`;
    const blob = new Blob([linuxDesktop], { type: 'text/plain;charset=utf-8' });
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = 'MartPro-POS.desktop';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);

    return { success: true, method: 'linux' };
  }
}
