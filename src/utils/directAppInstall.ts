/**
 * Direct Native PWA Installation Utility for Mart Pro
 * Triggers the browser's native OS installation prompt (Chrome / Edge / Android / Safari)
 * Once installed, Mart Pro launches as a standalone app with its own icon, window, and no browser UI.
 */

export interface InstallResult {
  status: 'accepted' | 'dismissed' | 'already_installed' | 'prompt_unavailable';
  message?: string;
}

export async function triggerDirectAppInstall(): Promise<InstallResult> {
  if (typeof window === 'undefined') {
    return { status: 'prompt_unavailable', message: 'Window not defined' };
  }

  // 1. Check if already running as a standalone app
  const isStandalone = Boolean(
    (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
    (window.navigator as any)?.standalone === true ||
    (typeof document !== 'undefined' && document.referrer && document.referrer.includes('android-app://'))
  );

  if (isStandalone) {
    return {
      status: 'already_installed',
      message: 'Mart Pro is already running as a standalone application on your device.'
    };
  }

  // 2. Trigger native PWA install prompt if captured
  const promptEvent = (window as any).deferredPrompt;
  if (promptEvent && typeof promptEvent.prompt === 'function') {
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice && choice.outcome === 'accepted') {
        (window as any).deferredPrompt = null;
        return { 
          status: 'accepted', 
          message: 'Mart Pro is now installed on your device with full standalone support.' 
        };
      } else {
        return { status: 'dismissed' };
      }
    } catch (err) {
      console.warn('Native install prompt error:', err);
    }
  }

  return {
    status: 'prompt_unavailable',
    message: 'To install Mart Pro directly, click the Install (⊕) icon in the browser address bar or use the install menu.'
  };
}


