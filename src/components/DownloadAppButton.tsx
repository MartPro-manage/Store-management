import React, { useState } from 'react';
import { Download, CheckCircle2, Share2, PlusSquare, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface DownloadAppButtonProps {
  className?: string;
  variant?: 'primary' | 'secondary' | 'compact' | 'header' | 'sidebar';
  showInstalledBadge?: boolean;
}

export const DownloadAppButton: React.FC<DownloadAppButtonProps> = ({
  className = '',
  variant = 'primary',
  showInstalledBadge = false,
}) => {
  const { isInstallable, isInstalled, install, platform } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showGenericTip, setShowGenericTip] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  // If running inside the installed standalone app
  if (isInstalled) {
    if (showInstalledBadge) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>App Installed</span>
        </span>
      );
    }
    return null;
  }

  const handleDownloadClick = async () => {
    // 1. If native PWA install prompt is ready (Chrome, Edge, Android, etc.)
    if (isInstallable) {
      setIsInstalling(true);
      try {
        await install();
      } finally {
        setIsInstalling(false);
      }
      return;
    }

    // 2. If on iOS (iPhone / iPad) - WebKit Safari manual flow
    if (platform.isIOS) {
      setShowIOSGuide(true);
      return;
    }

    // 3. Fallback for desktop where beforeinstallprompt hasn't fired or requires browser menu
    setShowGenericTip(true);
  };

  // Render based on variant
  const renderButton = () => {
    if (variant === 'sidebar') {
      return (
        <button
          type="button"
          onClick={handleDownloadClick}
          disabled={isInstalling}
          title="Download Mart Pro App on your device"
          className={`
            w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer
            bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white shadow-sm hover:shadow-orange-950/30
            ${className}
          `}
        >
          <div className="flex items-center gap-2.5 truncate">
            <Download className="w-4 h-4 shrink-0" />
            <span className="truncate">Download App</span>
          </div>
          <span className="text-[10px] uppercase font-black bg-white/20 px-1.5 py-0.5 rounded text-white">
            {platform.isIOS ? 'iOS' : platform.isAndroid ? 'Android' : 'PC'}
          </span>
        </button>
      );
    }

    if (variant === 'header') {
      return (
        <button
          type="button"
          onClick={handleDownloadClick}
          disabled={isInstalling}
          title="Download Mart Pro App"
          className={`
            flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs shadow-xs transition-all cursor-pointer
            ${className}
          `}
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Download App</span>
        </button>
      );
    }

    if (variant === 'compact') {
      return (
        <button
          type="button"
          onClick={handleDownloadClick}
          disabled={isInstalling}
          title="Download App"
          className={`
            flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-600/20 hover:bg-orange-600 text-orange-400 hover:text-white border border-orange-500/30 text-xs font-semibold transition-colors cursor-pointer
            ${className}
          `}
        >
          <Download className="w-3.5 h-3.5" />
          <span>Download App</span>
        </button>
      );
    }

    // Default primary button (e.g. for Login or landing)
    return (
      <button
        type="button"
        onClick={handleDownloadClick}
        disabled={isInstalling}
        title="Download & Install Mart Pro as an App"
        className={`
          flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-extrabold text-xs shadow-sm transition-all cursor-pointer
          ${className}
        `}
      >
        <Download className="w-3.5 h-3.5" />
        <span>Download App</span>
      </button>
    );
  };

  return (
    <>
      {renderButton()}

      {/* iOS Safari Installation Guide Sheet */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-2xl text-white">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <img src="/icon-192.png" alt="Mart Pro" className="w-7 h-7 rounded-lg object-contain" />
                <h3 className="font-black text-sm">Install Mart Pro on iOS</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-3 text-xs text-slate-300">
              <p>Install Mart Pro on your iPhone / iPad home screen in 2 quick steps:</p>
              
              <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-orange-500/20 text-orange-400 shrink-0">
                  <Share2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-white">1. Tap Share Button</div>
                  <div className="text-slate-400 text-[11px] mt-0.5">Tap the Share icon at the bottom of Safari.</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0">
                  <PlusSquare className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-white">2. Add to Home Screen</div>
                  <div className="text-slate-400 text-[11px] mt-0.5">Scroll down and tap <strong>"Add to Home Screen"</strong>.</div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2 rounded-xl bg-orange-600 hover:bg-orange-500 font-bold text-xs text-white"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Desktop / Browser Address Bar Guide */}
      {showGenericTip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-2xl text-white">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <img src="/icon-192.png" alt="Mart Pro" className="w-7 h-7 rounded-lg object-contain" />
                <h3 className="font-black text-sm">Download Mart Pro</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGenericTip(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-3 text-xs text-slate-300">
              <p>To install Mart Pro on your browser or device:</p>
              <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60 space-y-2">
                <div className="flex items-center gap-2 text-white font-bold">
                  <Download className="w-4 h-4 text-orange-400" />
                  <span>Address Bar Install</span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  Click the <strong>Install / Download</strong> icon (<span className="text-orange-400">⊕</span> or <span className="text-orange-400">💻</span>) located on the right side of your browser URL address bar, or click browser menu (⋮) &rarr; <em>Install Mart Pro</em>.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowGenericTip(false)}
              className="w-full py-2 rounded-xl bg-orange-600 hover:bg-orange-500 font-bold text-xs text-white"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
};
