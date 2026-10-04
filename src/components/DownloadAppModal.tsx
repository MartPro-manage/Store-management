import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import QRCode from 'qrcode';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { 
  Download, 
  Smartphone, 
  Monitor, 
  Apple, 
  CheckCircle2, 
  X, 
  Copy, 
  Check, 
  QrCode, 
  Share2, 
  PlusSquare, 
  Zap, 
  Wifi, 
  Layers,
  ShieldCheck,
  ExternalLink
} from 'lucide-react';

interface DownloadAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DownloadAppModal: React.FC<DownloadAppModalProps> = ({ isOpen, onClose }) => {
  const { isInstallable, isInstalled, install, platform } = usePWAInstall();
  const [activeTab, setActiveTab] = useState<'desktop' | 'android' | 'ios'>(() => {
    if (platform.isIOS) return 'ios';
    if (platform.isAndroid) return 'android';
    return 'desktop';
  });

  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installSuccessMessage, setInstallSuccessMessage] = useState<string | null>(null);

  const currentUrl = typeof window !== 'undefined' ? (window.location.origin || window.location.href) : '';

  useEffect(() => {
    if (isOpen && currentUrl) {
      QRCode.toDataURL(currentUrl, {
        width: 260,
        margin: 1.5,
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      })
      .then(url => setQrCodeUrl(url))
      .catch(err => console.warn('QR Code generation error:', err));
    }
  }, [isOpen, currentUrl]);

  useEffect(() => {
    if (platform.isIOS) setActiveTab('ios');
    else if (platform.isAndroid) setActiveTab('android');
    else setActiveTab('desktop');
  }, [platform.isIOS, platform.isAndroid]);

  if (!isOpen) return null;

  const handleNativeInstall = async () => {
    setIsInstalling(true);
    try {
      const outcome = await install();
      if (outcome === 'accepted') {
        setInstallSuccessMessage('Mart Pro has been added to your device applications!');
        setTimeout(() => {
          onClose();
        }, 2200);
      } else {
        setInstallSuccessMessage('Follow the quick 1-click step below to complete setup.');
        setTimeout(() => setInstallSuccessMessage(null), 3500);
      }
    } finally {
      setIsInstalling(false);
    }
  };

  const handleOpenDirectWindow = () => {
    window.open(currentUrl, '_blank');
  };

  const handleCopyLink = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-md overflow-y-auto overscroll-contain">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.2 }}
        className="bg-slate-900 border border-slate-800 text-white rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden my-auto flex flex-col"
      >
        {/* Header */}
        <div className="relative px-6 py-5 bg-gradient-to-r from-orange-600 via-amber-600 to-orange-700 text-white flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-inner">
              <Download className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 bg-white/20 rounded-full">
                  Progressive Web App
                </span>
                {isInstalled && (
                  <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 bg-emerald-500 text-slate-950 rounded-full flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Installed
                  </span>
                )}
              </div>
              <h2 className="text-xl font-black tracking-tight mt-0.5">
                Install Mart Pro App
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Toast Banner */}
        {installSuccessMessage && (
          <div className="bg-emerald-600/90 text-white px-5 py-2.5 text-xs font-bold flex items-center gap-2 border-b border-emerald-500 shadow-inner">
            <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
            <span>{installSuccessMessage}</span>
          </div>
        )}

        {/* Body Content */}
        <div className="p-5 sm:p-6 space-y-6 overflow-y-auto max-h-[calc(85vh-120px)] custom-scrollbar">
          
          {/* Quick 1-Click Install or Open Clean Window */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-orange-950/70 to-amber-950/70 border border-orange-500/40 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
            <div className="space-y-0.5 text-center sm:text-left">
              <h3 className="text-sm font-black text-white flex items-center gap-2 justify-center sm:justify-start">
                <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
                Direct Application Install
              </h3>
              <p className="text-xs text-orange-200/80">
                Installs as a native desktop or phone app with official Mart Pro logo.
              </p>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              {isInstallable ? (
                <button
                  type="button"
                  onClick={handleNativeInstall}
                  disabled={isInstalling}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-black text-xs shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  <span>1-Click Install Now</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleOpenDirectWindow}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-black text-xs shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Open Full Window to Install</span>
                </button>
              )}
            </div>
          </div>

          {/* Quick Platform Tabs */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                Installation Guides by Device
              </span>
              <span className="text-[11px] text-orange-400 font-semibold">
                Desktop, Android & iOS
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 p-1 bg-slate-950/60 rounded-2xl border border-slate-800">
              <button
                type="button"
                onClick={() => setActiveTab('desktop')}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'desktop'
                    ? 'bg-orange-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Monitor className="w-4 h-4" />
                <span>Desktop (PC/Mac)</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('android')}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'android'
                    ? 'bg-orange-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Smartphone className="w-4 h-4" />
                <span>Android Mobile</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('ios')}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'ios'
                    ? 'bg-orange-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Apple className="w-4 h-4" />
                <span>iPhone / iPad</span>
              </button>
            </div>

            {/* Tab Panels */}
            <div className="p-4 rounded-2xl bg-slate-950/40 border border-slate-800 text-xs space-y-3">
              {activeTab === 'desktop' && (
                <div className="space-y-3 text-slate-300">
                  <div className="flex items-center gap-2 text-sm font-black text-white">
                    <Monitor className="w-4 h-4 text-orange-400" /> Windows, macOS & Linux PC
                  </div>
                  <ol className="list-decimal list-inside space-y-2 text-slate-300 pl-1 leading-relaxed">
                    <li>
                      <strong>Address Bar 1-Click Install:</strong> Click the <span className="text-orange-400 font-bold">Install</span> icon (⊕ or 💻) on the right side of the URL bar.
                    </li>
                    <li>
                      <strong>Browser Menu:</strong> Click the 3 dots (<span className="font-mono bg-slate-800 px-1.5 py-0.5 rounded text-amber-300">⋮</span>) &rarr; <em>Save and share</em> &rarr; <em>Install Mart Pro</em>.
                    </li>
                    <li>
                      Once installed, double click the <strong>Mart Pro Logo icon</strong> on your Desktop. It will open directly without browser bars!
                    </li>
                  </ol>
                  {isInstallable && (
                    <button
                      onClick={handleNativeInstall}
                      className="mt-2 w-full py-2.5 px-4 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-md"
                    >
                      <Download className="w-4 h-4" /> Click to Install Desktop App Now
                    </button>
                  )}
                </div>
              )}

              {activeTab === 'android' && (
                <div className="space-y-3 text-slate-300">
                  <div className="flex items-center gap-2 text-sm font-black text-white">
                    <Smartphone className="w-4 h-4 text-emerald-400" /> Android Smartphones & Tablets
                  </div>
                  <ol className="list-decimal list-inside space-y-2 text-slate-300 pl-1 leading-relaxed">
                    <li>
                      Open this app in <strong>Google Chrome</strong> or <strong>Samsung Internet</strong>.
                    </li>
                    <li>
                      Tap the <strong>three dots menu (⋮)</strong> in the top right corner.
                    </li>
                    <li>
                      Tap <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.
                    </li>
                    <li>
                      The Mart Pro logo icon will appear on your phone home screen with full offline POS support!
                    </li>
                  </ol>
                  {isInstallable && (
                    <button
                      onClick={handleNativeInstall}
                      className="mt-2 w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-md"
                    >
                      <Download className="w-4 h-4" /> Install on Android Device
                    </button>
                  )}
                </div>
              )}

              {activeTab === 'ios' && (
                <div className="space-y-3 text-slate-300">
                  <div className="flex items-center gap-2 text-sm font-black text-white">
                    <Apple className="w-4 h-4 text-slate-200" /> Apple iPhone & iPad (Safari)
                  </div>
                  <div className="space-y-2.5 text-slate-300 leading-relaxed bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                    <div className="flex items-start gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-orange-500/20 text-orange-400 flex items-center justify-center shrink-0 font-bold text-xs mt-0.5">
                        1
                      </div>
                      <p>
                        Open this page in <strong>Safari</strong> on your iPhone or iPad.
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-orange-500/20 text-orange-400 flex items-center justify-center shrink-0 font-bold text-xs mt-0.5">
                        2
                      </div>
                      <p className="flex items-center gap-1.5 flex-wrap">
                        Tap the <strong>Share</strong> button <Share2 className="w-3.5 h-3.5 inline text-blue-400" /> at the bottom bar.
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-orange-500/20 text-orange-400 flex items-center justify-center shrink-0 font-bold text-xs mt-0.5">
                        3
                      </div>
                      <p className="flex items-center gap-1.5 flex-wrap">
                        Scroll down and tap <strong>Add to Home Screen</strong> <PlusSquare className="w-3.5 h-3.5 inline text-emerald-400" />.
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-orange-500/20 text-orange-400 flex items-center justify-center shrink-0 font-bold text-xs mt-0.5">
                        4
                      </div>
                      <p>
                        Tap <strong>Add</strong> in the top right. The Mart Pro icon will appear on your iOS home screen!
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* QR Code & Mobile Fast Connect Section */}
          <div className="p-4 rounded-2xl bg-slate-950/50 border border-slate-800 flex flex-col sm:flex-row items-center gap-5">
            {qrCodeUrl ? (
              <div className="p-2.5 bg-white rounded-2xl shadow-md shrink-0">
                <img src={qrCodeUrl} alt="Mart Pro App QR Code" className="w-32 h-32 object-contain" />
              </div>
            ) : (
              <div className="w-32 h-32 rounded-2xl bg-slate-800 animate-pulse shrink-0 flex items-center justify-center text-slate-500">
                <QrCode className="w-8 h-8" />
              </div>
            )}

            <div className="space-y-2 flex-1 text-center sm:text-left">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-950 text-orange-400 border border-orange-800 text-[10px] font-black uppercase">
                <QrCode className="w-3 h-3" /> Scan from Phone or Tablet
              </div>
              <h4 className="font-bold text-white text-sm">Download on Mobile via QR Code</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Scan this code with your smartphone camera to immediately open and install Mart Pro on your phone.
              </p>

              <div className="flex items-center gap-2 pt-1">
                <input 
                  type="text" 
                  readOnly 
                  value={currentUrl} 
                  className="bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded-xl px-3 py-1.5 flex-1 select-all font-mono truncate"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copy Link
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* App Key Capabilities Highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className="p-3 rounded-2xl bg-slate-950/40 border border-slate-800/80 flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">Instant Launch</div>
                <div className="text-[11px] text-slate-400">Opens directly with Mart Pro logo</div>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-slate-950/40 border border-slate-800/80 flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <Wifi className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">Offline POS</div>
                <div className="text-[11px] text-slate-400">Works seamlessly even if offline</div>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-slate-950/40 border border-slate-800/80 flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">No Browser Bars</div>
                <div className="text-[11px] text-slate-400">Pure standalone application window</div>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Encrypted & Verified PWA</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
};


