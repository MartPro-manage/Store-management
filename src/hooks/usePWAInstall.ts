import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() => {
    if (typeof window !== 'undefined' && (window as any).deferredPrompt) {
      return (window as any).deferredPrompt;
    }
    return null;
  });
  
  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return Boolean(
        (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
        (window.navigator as any)?.standalone === true ||
        (typeof document !== 'undefined' && document.referrer && document.referrer.includes('android-app://'))
      );
    } catch {
      return false;
    }
  });

  const [platform, setPlatform] = useState<{
    isIOS: boolean;
    isAndroid: boolean;
    isDesktop: boolean;
    isMac: boolean;
    isWindows: boolean;
    browser: 'chrome' | 'safari' | 'edge' | 'firefox' | 'other';
  }>({
    isIOS: false,
    isAndroid: false,
    isDesktop: true,
    isMac: false,
    isWindows: false,
    browser: 'other',
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Detect standalone mode
    const checkStandalone = () => {
      try {
        const isStandalone = Boolean(
          (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
          (window.navigator as any)?.standalone === true ||
          (typeof document !== 'undefined' && document.referrer && document.referrer.includes('android-app://'))
        );
        setIsInstalled(isStandalone);
      } catch {
        // fallback
      }
    };

    checkStandalone();

    let mediaQuery: MediaQueryList | null = null;
    const handleMediaChange = (e: MediaQueryListEvent) => {
      setIsInstalled(e.matches);
    };

    try {
      if (typeof window.matchMedia === 'function') {
        mediaQuery = window.matchMedia('(display-mode: standalone)');
        mediaQuery.addEventListener('change', handleMediaChange);
      }
    } catch {
      // fallback
    }

    // Detect platform and browser
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroidDevice = /android/.test(userAgent);
    const isWindowsOS = /windows/.test(userAgent);
    const isMacOS = /macintosh|mac os x/.test(userAgent) && !isIOSDevice;
    const isDesktopDevice = !isIOSDevice && !isAndroidDevice && !/mobile/.test(userAgent);

    let detectedBrowser: 'chrome' | 'safari' | 'edge' | 'firefox' | 'other' = 'other';
    if (/edg/.test(userAgent)) {
      detectedBrowser = 'edge';
    } else if (/chrome|crios/.test(userAgent) && !/edg/.test(userAgent)) {
      detectedBrowser = 'chrome';
    } else if (/safari/.test(userAgent) && !/chrome|crios|edg/.test(userAgent)) {
      detectedBrowser = 'safari';
    } else if (/firefox|fxios/.test(userAgent)) {
      detectedBrowser = 'firefox';
    }

    setPlatform({
      isIOS: isIOSDevice,
      isAndroid: isAndroidDevice,
      isDesktop: isDesktopDevice,
      isMac: isMacOS,
      isWindows: isWindowsOS,
      browser: detectedBrowser,
    });

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      (window as any).deferredPrompt = promptEvent;
      setDeferredPrompt(promptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      (window as any).deferredPrompt = null;
    };

    const handlePWAReady = () => {
      if ((window as any).deferredPrompt) {
        setDeferredPrompt((window as any).deferredPrompt);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('pwa-install-ready', handlePWAReady);

    // If global deferredPrompt exists from early main.tsx catch
    if ((window as any).deferredPrompt) {
      setDeferredPrompt((window as any).deferredPrompt);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('pwa-install-ready', handlePWAReady);
      try {
        mediaQuery?.removeEventListener('change', handleMediaChange);
      } catch {
        // fallback
      }
    };
  }, []);

  const install = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unsupported'> => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          setIsInstalled(true);
          setDeferredPrompt(null);
          (window as any).deferredPrompt = null;
        }
        return outcome;
      } catch (err) {
        console.warn('PWA install error:', err);
        return 'unsupported';
      }
    }
    return 'unsupported';
  }, [deferredPrompt]);

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    install,
    platform,
  };
}
