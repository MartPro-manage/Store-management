import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  db, 
  collection, 
  onSnapshot, 
  query, 
  where, 
  handleFirestoreError,
  OperationType 
} from '../lib/firebase';
import { Product, Store, UserAccount, Sale } from '../types';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { UniversalBackButton } from './UniversalBackButton';
import { speakMessage } from '../lib/speech';
import { playScanSuccessBeep, playScanErrorBeep } from '../lib/sound';
import { processStoreAiQuery, AiQueryResult } from '../lib/storeAiEngine';
import { 
  ScanLine, 
  Barcode as BarcodeIcon, 
  Camera, 
  Sparkles, 
  ShoppingBag, 
  Tag, 
  Scale, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  Volume2, 
  VolumeX, 
  Package,
  Layers,
  ArrowRight,
  Image as ImageIcon,
  Flame,
  Mic,
  MicOff,
  X,
  MessageSquare,
  Hash,
  Calculator,
  Delete
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface CustomerPriceCheckerViewProps {
  store: Store;
  currentUser: UserAccount;
  onBack?: () => void;
}

export const CustomerPriceCheckerView: React.FC<CustomerPriceCheckerViewProps> = ({ store, currentUser, onBack }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [scannedProduct, setScannedProduct] = useState<Product | null>(null);
  const [scanStatus, setScanStatus] = useState<'idle' | 'found' | 'not_found' | 'out_of_stock'>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  // Short Code Touch Keypad State
  const [isKeypadOpen, setIsKeypadOpen] = useState(false);
  const [keypadInput, setKeypadInput] = useState('');

  // AI Query Assistant States for Buyers
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiResult, setAiResult] = useState<AiQueryResult | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const barcodeInputRef = useRef<HTMLInputElement | null>(null);
  const scannerBufferRef = useRef<string>('');
  const lastKeyTimestampRef = useRef<number>(0);
  const autoResetTimerRef = useRef<any>(null);
  const speechRecognitionRef = useRef<any>(null);

  const isCameraScannerAllowed = store?.cameraScannerEnabled !== false;
  const isVoiceAllowed = store?.voiceAnnouncementEnabled !== false;
  const curr = store?.currencySymbol || 'Rs.';

  // Real-time subscribe to products for this store
  useEffect(() => {
    if (!store?.id) return;
    const q = query(
      collection(db, 'products'),
      where('storeId', '==', store.id)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const list: Product[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Product);
      });
      setProducts(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'products');
    });

    return () => unsub();
  }, [store?.id]);

  // Real-time subscribe to sales for this store (for top selling calculations)
  useEffect(() => {
    if (!store?.id) return;
    const q = query(collection(db, 'sales'), where('storeId', '==', store.id));
    const unsub = onSnapshot(q, (snapshot) => {
      const list: Sale[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Sale);
      });
      setSales(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'sales');
    });
    return () => unsub();
  }, [store?.id]);

  // Clean codes
  const cleanCode = (v: any) => String(v ?? '').replace(/[\r\n\t\s]/g, '').trim().toLowerCase();
  const cleanName = (v: any) => String(v ?? '').trim().toLowerCase();

  // AI Shopping Assistant Query Execution
  const handleAskAi = useCallback((questionText: string) => {
    const q = (questionText || '').trim();
    if (!q) return;

    setIsAiLoading(true);
    if (autoResetTimerRef.current) {
      clearTimeout(autoResetTimerRef.current);
    }

    const res = processStoreAiQuery(q, products, sales);
    setAiResult(res);
    setIsAiLoading(false);

    if (voiceEnabled && isVoiceAllowed) {
      speakMessage(res.speechText);
    }

    if (res.highlightedProduct) {
      setScannedProduct(res.highlightedProduct);
      setScanStatus(res.highlightedProduct.stockQuantity > 0 ? 'found' : 'out_of_stock');
      setStatusMessage(res.speechText);
      playScanSuccessBeep();
    }
  }, [products, sales, voiceEnabled, isVoiceAllowed]);

  // Voice speech recognition for buyer questions
  const handleToggleVoiceRecognition = () => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      return;
    }

    if (isListening) {
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRec();
      recognition.lang = 'en-US';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript || '';
        if (transcript) {
          setAiQuestion(transcript);
          handleAskAi(transcript);
        }
        setIsListening(false);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      speechRecognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  // Handle Barcode & Short Code Look up
  const handleLookupBarcode = useCallback((targetBarcode: string) => {
    const rawCode = targetBarcode ? targetBarcode.replace(/[\r\n\t]/g, '').trim() : '';
    if (!rawCode) return;

    if (autoResetTimerRef.current) {
      clearTimeout(autoResetTimerRef.current);
    }

    const cleanInput = cleanCode(rawCode);
    const targetCode = cleanInput.replace(/^#/, ''); // Strip leading hash e.g. #1001 -> 1001
    const targetName = cleanName(rawCode);

    // 1. Exact Match on Short Code, Barcode, Serial Number, ID, or Product Name
    let found = products.find(p => {
      const pShortcut = cleanCode(p.shortcutCode).replace(/^#/, '');
      const pBarcode = cleanCode(p.barcode);
      const pSerial = cleanCode(p.serialNumber);
      const pId = cleanCode(p.id);
      const pName = cleanName(p.name);

      // Match short code (with or without #)
      if (pShortcut && (pShortcut === targetCode || pShortcut === cleanInput)) return true;
      if (pBarcode && (pBarcode === targetCode || pBarcode === cleanInput)) return true;
      if (pSerial && (pSerial === targetCode || pSerial === cleanInput)) return true;
      if (pId && (pId === targetCode || pId === cleanInput)) return true;
      if (pName && pName === targetName) return true;
      return false;
    });

    // 2. Fallback for leading zeros in barcodes or short codes
    if (!found) {
      const targetDigitsNoZero = targetCode.replace(/^0+/, '');
      if (targetDigitsNoZero.length >= 2) {
        found = products.find(p => {
          const pShortcutDigits = cleanCode(p.shortcutCode).replace(/^#/, '').replace(/^0+/, '');
          const pBarcodeDigits = cleanCode(p.barcode).replace(/^0+/, '');
          const pSerialDigits = cleanCode(p.serialNumber).replace(/^0+/, '');
          return (pShortcutDigits && pShortcutDigits === targetDigitsNoZero) ||
                 (pBarcodeDigits && pBarcodeDigits === targetDigitsNoZero) ||
                 (pSerialDigits && pSerialDigits === targetDigitsNoZero);
        });
      }
    }

    // 3. Fallback partial name search if 3+ chars
    if (!found && targetCode.length >= 3) {
      found = products.find(p => {
        const pName = cleanName(p.name);
        return pName.includes(targetName) || targetName.includes(pName);
      });
    }

    if (!found) {
      playScanErrorBeep();
      setScannedProduct(null);
      setScanStatus('not_found');
      const isShortCodeLike = /^\d{2,6}$/.test(targetCode);
      const notFoundMsg = isShortCodeLike
        ? `Short Code "#${targetCode}" is not registered in this store. Please ask a staff member for assistance.`
        : `Item / Barcode "${rawCode}" is not registered in this store. Please ask a staff member for assistance.`;
      setStatusMessage(notFoundMsg);
      if (isVoiceAllowed && voiceEnabled) {
        speakMessage(isShortCodeLike ? `Short code ${targetCode} not found.` : `Item not found in store database.`);
      }
    } else {
      playScanSuccessBeep();
      setScannedProduct(found);
      const isWeight = found.sellBy === 'weight' || found.unitType === 'kg' || Boolean(found.pricePerKg);
      const priceVal = (found.price || found.pricePerKg || 0);
      const formattedPrice = priceVal % 1 === 0 ? priceVal.toFixed(0) : priceVal.toFixed(2);

      if (found.stockQuantity <= 0) {
        setScanStatus('out_of_stock');
        setStatusMessage(`Item is currently OUT OF STOCK.`);
        if (isVoiceAllowed && voiceEnabled) {
          speakMessage(`${found.name}. Price is ${formattedPrice} rupees, but it is currently out of stock.`);
        }
      } else {
        setScanStatus('found');
        setStatusMessage(`Price verified.`);
        if (isVoiceAllowed && voiceEnabled) {
          speakMessage(`${found.name}. Price is ${formattedPrice} rupees ${isWeight ? 'per kilogram' : ''}.`);
        }
      }
    }

    setBarcodeInput('');
    if (barcodeInputRef.current) {
      barcodeInputRef.current.value = '';
      barcodeInputRef.current.focus();
    }

    // Auto clear scanned display after 15 seconds to return to welcome screen
    autoResetTimerRef.current = setTimeout(() => {
      setScanStatus('idle');
      setScannedProduct(null);
      setStatusMessage('');
    }, 15000);
  }, [products, isVoiceAllowed, voiceEnabled]);

  // Keep input focused for instant barcode scanning
  useEffect(() => {
    if (!isScannerOpen && barcodeInputRef.current) {
      barcodeInputRef.current.focus();
    }
  }, [isScannerOpen, scanStatus]);

  // Global hardware scanner listener
  useEffect(() => {
    if (isScannerOpen) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const tagName = activeEl?.tagName?.toUpperCase();
      const isInputActive = tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';

      if (isInputActive && activeEl !== barcodeInputRef.current) {
        return;
      }

      const now = Date.now();
      const timeDiff = now - lastKeyTimestampRef.current;
      lastKeyTimestampRef.current = now;

      if (e.key === 'Enter') {
        const isFocused = activeEl === barcodeInputRef.current;
        const scannedText = isFocused
          ? (barcodeInputRef.current?.value || barcodeInput || '').trim()
          : scannerBufferRef.current.trim();

        if (scannedText) {
          e.preventDefault();
          handleLookupBarcode(scannedText);
          scannerBufferRef.current = '';
          setBarcodeInput('');
          if (barcodeInputRef.current) {
            barcodeInputRef.current.value = '';
            barcodeInputRef.current.focus();
          }
        }
        return;
      }

      if (!isInputActive && e.key.length === 1) {
        if (timeDiff > 250) {
          scannerBufferRef.current = e.key;
        } else {
          scannerBufferRef.current += e.key;
        }

        if (barcodeInputRef.current) {
          barcodeInputRef.current.focus();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isScannerOpen, barcodeInput, handleLookupBarcode]);

  // Infinite ticker items list (doubled for seamless infinite scroll)
  const tickerProducts = products.length > 0 
    ? [...products, ...products] 
    : [];

  // Match keypad product in real-time
  const cleanKeypadCode = cleanCode(keypadInput).replace(/^#/, '');
  const matchedKeypadProduct = cleanKeypadCode
    ? products.find(p => {
        const pShortcut = cleanCode(p.shortcutCode).replace(/^#/, '');
        return pShortcut && pShortcut === cleanKeypadCode;
      })
    : null;

  return (
    <div className="h-screen max-h-screen w-screen overflow-hidden bg-slate-950 text-white flex flex-col justify-between selection:bg-orange-500 selection:text-white relative select-none">
      {/* Background Ambience / Subtle Grid */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#334155_1px,transparent_1px),linear-gradient(to_bottom,#334155_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-15 pointer-events-none" />

      {/* Top Store Header Bar */}
      <header className="relative z-10 px-4 sm:px-6 py-2.5 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md shrink-0">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {onBack && (
              <UniversalBackButton onBack={onBack} label="Back to Main Panel" />
            )}
            <div className="w-10 h-10 rounded-xl bg-orange-600/20 border border-orange-500/40 text-orange-400 flex items-center justify-center font-bold shadow-md shadow-orange-600/10 shrink-0">
              <ScanLine className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Store Self-Service Kiosk
                </span>
                <span className="text-xs text-slate-400 font-medium truncate max-w-[200px]">{store.name}</span>
              </div>
              <h1 className="text-base sm:text-lg font-black text-white tracking-tight">
                Customer <span className="text-orange-400">Price Checker</span>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Touch Keypad Button for Short Code */}
            <button
              type="button"
              onClick={() => {
                setKeypadInput('');
                setIsKeypadOpen(true);
              }}
              className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-bold text-xs rounded-xl border border-amber-500/30 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Enter 4-digit short code using touch screen keypad"
            >
              <Calculator className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Short Code Keypad</span>
            </button>

            {/* Audio Voice Announcement Toggle */}
            {isVoiceAllowed && (
              <button
                type="button"
                onClick={() => setVoiceEnabled(!voiceEnabled)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  voiceEnabled
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                }`}
                title={voiceEnabled ? "Mute audio voice announcement" : "Enable voice announcement"}
              >
                {voiceEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{voiceEnabled ? 'Voice ON' : 'Voice Muted'}</span>
              </button>
            )}

            {/* Inbuilt Camera Scanner (if enabled for this store) */}
            {isCameraScannerAllowed && (
              <button
                type="button"
                onClick={() => setIsScannerOpen(true)}
                className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white font-black text-xs rounded-xl shadow-md shadow-orange-600/30 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Camera Scanner</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Interactive Scanner Area (Fit directly into viewport) */}
      <main className="relative z-10 flex-1 max-w-5xl w-full mx-auto px-4 py-2 sm:py-3 flex flex-col justify-between overflow-hidden">
        
        {/* Top Section: Barcode Scanner Input + Ask AI Assistant Bar + Continuous Scrolling Ticker */}
        <div className="w-full shrink-0 space-y-2">
          
          {/* Dual Inputs: Barcode & Short Code Scanner & AI Shopping Assistant */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-w-4xl mx-auto">
            
            {/* 1. Barcode & Short Code Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const val = (barcodeInput || barcodeInputRef.current?.value || '').trim();
                if (val) {
                  handleLookupBarcode(val);
                }
              }}
              className="w-full"
            >
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center gap-1.5 pointer-events-none text-slate-400">
                  <BarcodeIcon className="w-4 h-4 text-orange-400" />
                  <span className="text-[11px] font-mono text-amber-400 font-black border-l border-slate-700 pl-1.5">#</span>
                </div>
                <input
                  id="kiosk-barcode-input"
                  ref={barcodeInputRef}
                  type="text"
                  autoFocus
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  placeholder="Scan barcode or enter short code (e.g. 1001)..."
                  className="w-full pl-14 pr-28 py-2 sm:py-2.5 bg-slate-900/90 border-2 border-slate-700 focus:border-orange-500 focus:bg-slate-800 rounded-2xl text-white placeholder-slate-400 text-xs sm:text-sm font-mono focus:outline-none transition-all shadow-lg backdrop-blur-sm"
                />
                <div className="absolute right-1 top-1 bottom-1 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setKeypadInput(barcodeInput.replace(/^#/, ''));
                      setIsKeypadOpen(true);
                    }}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 font-mono text-xs font-bold rounded-lg border border-slate-700 transition-all cursor-pointer flex items-center gap-1"
                    title="Open on-screen touch keypad"
                  >
                    <Calculator className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[10px] hidden xs:inline">123</span>
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1"
                  >
                    <span>Check</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </form>

            {/* 2. Ask AI Question Form */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-amber-400">
                <Sparkles className="w-4 h-4 animate-pulse" />
              </div>
              <input
                id="kiosk-ai-input"
                type="text"
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAskAi(aiQuestion);
                  }
                }}
                placeholder="Ask AI: 'Top selling oil', 'Price of zeera biscuit'..."
                className="w-full pl-10 pr-24 py-2 sm:py-2.5 bg-slate-900/90 border-2 border-amber-500/60 focus:border-amber-400 focus:bg-slate-800 rounded-2xl text-white placeholder-slate-400 text-xs sm:text-sm font-medium focus:outline-none transition-all shadow-lg backdrop-blur-sm"
              />
              <div className="absolute right-1 top-1 bottom-1 flex items-center gap-1">
                {/* Voice Input Mic */}
                <button
                  type="button"
                  onClick={handleToggleVoiceRecognition}
                  className={`p-1.5 rounded-lg transition-all ${isListening ? 'bg-rose-600 text-white animate-pulse' : 'bg-slate-800 hover:bg-slate-700 text-amber-400'}`}
                  title={isListening ? "Listening... click to stop" : "Speak to AI"}
                >
                  {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => handleAskAi(aiQuestion)}
                  disabled={isAiLoading || !aiQuestion.trim()}
                  className="px-3 py-1 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 disabled:opacity-50 text-white font-black rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                >
                  <span>Ask AI</span>
                </button>
              </div>
            </div>
          </div>

          {/* Quick AI Question Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar py-0.5 max-w-4xl mx-auto select-none">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 shrink-0 flex items-center gap-1 pl-1">
              <Sparkles className="w-3 h-3" /> Quick Ask:
            </span>
            {[
              { label: '🔥 Top selling oil', q: 'Top selling oil' },
              { label: '🍪 Price of zeera biscuit', q: 'Price of zeera biscuit' },
              { label: '🛢️ Cheapest oil', q: 'Cheapest oil' },
              { label: '🧈 Cheapest ghee', q: 'Cheapest ghee' },
              { label: '☕ Cheapest tea', q: 'Cheapest tea' },
              { label: '🧼 Cheapest soap', q: 'Cheapest soap' },
              { label: '🧺 Cheapest laundry', q: 'Cheapest laundry' },
              { label: '🧸 Popular toys', q: 'Popular toys' },
              { label: '🌾 Cheapest grain', q: 'Cheapest grain' }
            ].map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setAiQuestion(item.q);
                  handleAskAi(item.q);
                }}
                className="px-2.5 py-1 bg-slate-800/90 hover:bg-amber-500/20 text-slate-300 hover:text-amber-200 border border-slate-700 hover:border-amber-400/50 rounded-full text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer shrink-0 shadow-xs"
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* ALWAYS SCROLLING LEFT TICKER: Items with Name, Pics, and Price (Extra Large Size) */}
          <div className="w-full overflow-hidden relative py-2.5 border-y border-slate-800 bg-slate-900/70 rounded-2xl backdrop-blur-md group shadow-inner">
            <div className="flex items-center justify-between px-3 pb-2 text-xs uppercase tracking-wider font-extrabold text-orange-400">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-500 animate-pulse" />
                <span className="text-xs sm:text-sm font-black">Store Featured Products & Live Pricing</span>
              </div>
              <span className="text-[11px] text-slate-400 font-semibold normal-case hidden sm:inline">
                👈 Auto-scrolling live catalog &bull; Click any item to inspect
              </span>
            </div>

            {tickerProducts.length > 0 ? (
              <div className="flex gap-4 overflow-hidden select-none py-1">
                <div className="flex gap-4 shrink-0 animate-scroll-ticker group-hover:[animation-play-state:paused]">
                  {tickerProducts.map((p, idx) => {
                    const isWeighted = p.sellBy === 'weight' || p.unitType === 'kg' || !!p.pricePerKg;
                    const priceVal = p.price || p.pricePerKg || 0;
                    return (
                      <button
                        type="button"
                        key={`${p.id}-${idx}`}
                        onClick={() => handleLookupBarcode(p.shortcutCode || p.barcode || p.serialNumber || p.name)}
                        className="flex items-center gap-4.5 px-5 py-4 bg-slate-800/95 hover:bg-slate-700/95 border-2 border-slate-700 hover:border-orange-500 rounded-3xl transition-all text-left shrink-0 cursor-pointer shadow-xl hover:shadow-orange-500/20 min-w-[330px] sm:min-w-[400px] md:min-w-[450px]"
                      >
                        {/* Extra Large Product Pic */}
                        <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden bg-slate-950 border-2 border-slate-700/80 shrink-0 flex items-center justify-center shadow-inner relative group-hover:border-orange-400 transition-colors">
                          {p.imageUrl ? (
                            <img
                              src={p.imageUrl}
                              alt={p.name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as any).style.display = 'none';
                              }}
                            />
                          ) : (
                            <ImageIcon className="w-12 h-12 text-slate-500" />
                          )}
                        </div>

                        {/* Extra Large Info & Pricing */}
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="text-lg sm:text-xl font-black text-white truncate leading-tight tracking-tight">
                            {p.name}
                          </p>
                          <div className="flex items-baseline gap-2 pt-0.5">
                            <span className="text-2xl sm:text-3xl font-black text-amber-400 font-mono tracking-tight">
                              {curr} {priceVal.toFixed(2)}
                            </span>
                            {isWeighted && (
                              <span className="text-sm font-bold text-slate-400">/kg</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            {p.shortcutCode && (
                              <span className="text-xs font-bold font-mono text-amber-300 bg-amber-950/80 px-2.5 py-1 rounded-xl border border-amber-700/60 shadow-xs flex items-center gap-1">
                                <Hash className="w-3 h-3 text-amber-400" />
                                <span>{p.shortcutCode}</span>
                              </span>
                            )}
                            {p.weight && (
                              <span className="text-xs font-bold text-slate-200 bg-slate-950 px-2.5 py-1 rounded-xl border border-slate-800 font-mono">
                                {p.weight}
                              </span>
                            )}
                            {p.category && (
                              <span className="text-xs font-bold text-orange-300 bg-orange-950/70 px-2.5 py-1 rounded-xl border border-orange-800/60 truncate max-w-[130px]">
                                {p.category}
                              </span>
                            )}
                            {p.barcode && (
                              <span className="text-xs font-mono text-slate-400 hidden sm:inline">
                                BC: {p.barcode}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center py-2 text-xs text-slate-500 font-medium">
                Store catalog ready for barcode scanning...
              </div>
            )}
          </div>
        </div>

        {/* Dynamic Display State (Centered in available viewport) */}
        <div className="flex-1 flex flex-col justify-center items-center py-2 overflow-hidden w-full">
          
          {/* AI ANSWER BANNER */}
          {aiResult && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-2xl mx-auto mb-3 p-4 bg-gradient-to-br from-slate-900 via-slate-800 to-amber-950/40 border-2 border-amber-500/50 rounded-3xl shadow-2xl backdrop-blur-xl relative"
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-700/80 mb-2">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-black uppercase tracking-wider text-amber-300">
                    Store AI Assistant
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setAiResult(null)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-all cursor-pointer"
                  title="Dismiss Answer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Formatted Text */}
              <div className="text-sm font-semibold text-white leading-relaxed whitespace-pre-line mb-2.5">
                {aiResult.reply}
              </div>

              {/* Matched Product Fast-Inspect Chips */}
              {aiResult.matchedProducts.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-slate-700/60">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                    Matching Store Inventory ({aiResult.matchedProducts.length} items):
                  </span>
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
                    {aiResult.matchedProducts.map((p) => {
                      const priceVal = p.price || p.pricePerKg || 0;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setScannedProduct(p);
                            setScanStatus(p.stockQuantity > 0 ? 'found' : 'out_of_stock');
                            setStatusMessage(`Inspecting ${p.name}`);
                            playScanSuccessBeep();
                            if (voiceEnabled && isVoiceAllowed) {
                              speakMessage(`${p.name}, Price ${curr} ${priceVal.toFixed(2)}`);
                            }
                          }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer shrink-0 ${
                            scannedProduct?.id === p.id 
                              ? 'bg-orange-600 text-white border-orange-400 shadow-md' 
                              : 'bg-slate-800/90 hover:bg-slate-700 text-slate-200 border-slate-700'
                          }`}
                        >
                          <Tag className="w-3 h-3 text-amber-400" />
                          <span className="max-w-[140px] truncate">{p.name}</span>
                          <span className="font-mono text-emerald-300 font-extrabold">{curr} {priceVal.toFixed(0)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          <AnimatePresence mode="wait">
            
            {/* IDLE / WELCOME STATE */}
            {scanStatus === 'idle' && (
              <motion.div
                key="idle-state"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.25 }}
                className="bg-slate-900/70 border border-slate-800 rounded-3xl p-5 sm:p-6 text-center max-w-xl mx-auto w-full shadow-xl backdrop-blur-md space-y-4"
              >
                <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-tr from-orange-600/20 to-amber-500/20 border border-orange-500/30 flex items-center justify-center text-orange-400 shadow-inner">
                  <ScanLine className="w-8 h-8 animate-pulse" />
                </div>

                <div className="space-y-1">
                  <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                    Scan Barcode or Enter Short Code
                  </h2>
                  <p className="text-slate-400 text-xs sm:text-sm max-w-md mx-auto leading-relaxed">
                    Scan any product barcode, type or dial a 4-digit Short Code (e.g. 1001), or tap items from the live scrolling catalog.
                  </p>
                </div>

                {/* Quick Shelf Short Code Pills to try */}
                {products.filter(p => p.shortcutCode).length > 0 && (
                  <div className="pt-2 border-t border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-amber-400">
                      <Hash className="w-3.5 h-3.5" />
                      <span>Quick Check by Shelf Short Code:</span>
                    </div>
                    <div className="flex items-center justify-center gap-2 flex-wrap max-h-16 overflow-y-auto">
                      {products.filter(p => p.shortcutCode).slice(0, 6).map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handleLookupBarcode(p.shortcutCode!)}
                          className="px-2.5 py-1 rounded-xl bg-slate-800/90 hover:bg-amber-500/20 text-amber-300 hover:text-amber-200 border border-amber-500/30 font-mono text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shadow-xs"
                        >
                          <span>#{p.shortcutCode}</span>
                          <span className="text-[10px] text-slate-400 truncate max-w-[85px]">({p.name})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-800 text-[11px] text-slate-300">
                  <div className="p-2 bg-slate-950/60 rounded-xl border border-slate-800/80 flex flex-col items-center gap-1">
                    <Tag className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="font-medium">Live Store Pricing</span>
                  </div>
                  <div className="p-2 bg-slate-950/60 rounded-xl border border-slate-800/80 flex flex-col items-center gap-1">
                    <Hash className="w-3.5 h-3.5 text-amber-400" />
                    <span className="font-medium">Short Code (#1001)</span>
                  </div>
                  <div className="p-2 bg-slate-950/60 rounded-xl border border-slate-800/80 flex flex-col items-center gap-1">
                    <Volume2 className="w-3.5 h-3.5 text-orange-400" />
                    <span className="font-medium">Voice Audio</span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* PRODUCT FOUND STATE */}
            {(scanStatus === 'found' || scanStatus === 'out_of_stock') && scannedProduct && (
              <motion.div
                key="found-state"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="bg-slate-900/90 border border-slate-700/80 rounded-3xl p-5 sm:p-6 max-w-2xl mx-auto w-full shadow-2xl backdrop-blur-xl space-y-4 relative overflow-hidden"
              >
                {/* Top Accent bar */}
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-600" />

                <div className="flex items-center gap-4 border-b border-slate-800 pb-4">
                  {/* Product Picture Display */}
                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-slate-950 border border-slate-700 shrink-0 flex items-center justify-center shadow-md">
                    {scannedProduct.imageUrl ? (
                      <img
                        src={scannedProduct.imageUrl}
                        alt={scannedProduct.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as any).style.display = 'none';
                        }}
                      />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-slate-600" />
                    )}
                  </div>

                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/20 text-orange-300 border border-orange-500/30 uppercase">
                        {scannedProduct.category || 'General Item'}
                      </span>
                      {scannedProduct.shortcutCode && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 shadow-xs">
                          <Hash className="w-3 h-3 text-amber-400" /> Short Code: #{scannedProduct.shortcutCode}
                        </span>
                      )}
                      {scannedProduct.sellBy === 'weight' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                          <Scale className="w-2.5 h-2.5" /> Sold by Weight
                        </span>
                      )}
                      {scannedProduct.stockQuantity > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" /> In Stock
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-bold">
                          <AlertCircle className="w-3 h-3 text-rose-400" /> Out of Stock
                        </span>
                      )}
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight truncate">
                      {scannedProduct.name}
                    </h2>
                    <p className="text-[11px] text-slate-400 font-mono flex items-center gap-2 flex-wrap">
                      {scannedProduct.shortcutCode && (
                        <span className="text-amber-300 font-bold flex items-center gap-0.5">
                          <Hash className="w-3 h-3 text-amber-400" /> Code: <strong>#{scannedProduct.shortcutCode}</strong>
                        </span>
                      )}
                      {scannedProduct.shortcutCode && <span>&bull;</span>}
                      <span>BC: <strong className="text-slate-200">{scannedProduct.barcode || 'N/A'}</strong></span>
                      {scannedProduct.serialNumber && (
                        <span>&bull; S/N: <strong className="text-slate-200">{scannedProduct.serialNumber}</strong></span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Price Callout Banner */}
                <div className="bg-gradient-to-br from-slate-950 to-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-800 flex items-center justify-between gap-4 shadow-inner">
                  <div>
                    <span className="text-[10px] font-black tracking-wider text-slate-400 uppercase block">
                      Official Retail Price
                    </span>
                    <div className="text-3xl sm:text-4xl font-black text-amber-400 tracking-tight mt-0.5">
                      {curr} {(scannedProduct.price || scannedProduct.pricePerKg || 0).toFixed(2)}
                      {scannedProduct.sellBy === 'weight' && (
                        <span className="text-base font-bold text-slate-400 ml-1">/kg</span>
                      )}
                    </div>
                  </div>

                  {scannedProduct.weight && (
                    <div className="p-2.5 bg-slate-900/90 rounded-xl border border-slate-700/80 text-xs text-slate-300 text-right shrink-0">
                      <span className="text-slate-400 block font-medium text-[10px]">Pack / Weight Info</span>
                      <span className="font-black text-white">{scannedProduct.weight}</span>
                    </div>
                  )}
                </div>

                {/* Guidance & Voice Replay */}
                <div className="flex items-center justify-between gap-3 text-xs text-slate-400 pt-1">
                  <span className="flex items-center gap-1.5 text-[11px]">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" /> Resets in 15s or scan another item
                  </span>

                  {isVoiceAllowed && voiceEnabled && (
                    <button
                      type="button"
                      onClick={() => {
                        const isWeight = scannedProduct.sellBy === 'weight';
                        const p = (scannedProduct.price || scannedProduct.pricePerKg || 0);
                        speakMessage(`${scannedProduct.name}. Price is ${p.toFixed(0)} rupees ${isWeight ? 'per kilogram' : ''}.`);
                      }}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Volume2 className="w-3 h-3 text-amber-400" /> Replay Voice
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {/* ITEM NOT FOUND STATE */}
            {scanStatus === 'not_found' && (
              <motion.div
                key="not-found-state"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.25 }}
                className="bg-rose-950/40 border border-rose-800/80 rounded-3xl p-5 sm:p-6 text-center max-w-md mx-auto w-full shadow-xl backdrop-blur-md space-y-3"
              >
                <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center">
                  <AlertCircle className="w-7 h-7 animate-bounce" />
                </div>
                <h3 className="text-lg font-black text-white">Item Not Found</h3>
                <p className="text-slate-300 text-xs leading-relaxed max-w-sm mx-auto">
                  {statusMessage}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setScanStatus('idle');
                    setScannedProduct(null);
                    if (barcodeInputRef.current) barcodeInputRef.current.focus();
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl border border-slate-700 transition-colors cursor-pointer"
                >
                  Scan Another Item
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

      </main>

      {/* Footer Instructions Bar */}
      <footer className="relative z-10 px-4 py-2 border-t border-slate-800/80 bg-slate-950/90 backdrop-blur-md text-center text-[11px] text-slate-500 shrink-0">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
          <span>Customer Price Checker Kiosk &bull; {store.name}</span>
          <span className="text-slate-400 font-medium">Logged in as: <strong className="text-slate-200">{currentUser.name}</strong> ({currentUser.username})</span>
        </div>
      </footer>

      {/* Camera Barcode Scanner Modal */}
      {isCameraScannerAllowed && (
        <BarcodeScannerModal
          isOpen={isScannerOpen}
          onClose={() => setIsScannerOpen(false)}
          onScanSuccess={(code) => {
            handleLookupBarcode(code);
            setIsScannerOpen(false);
          }}
          title="Price Checker Barcode Scanner"
          subtitle="Point camera at product barcode or enter code & press Send"
        />
      )}

      {/* TOUCH SCREEN SHORT CODE KEYPAD MODAL */}
      <AnimatePresence>
        {isKeypadOpen && (
          <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 15 }}
              className="bg-slate-900 border-2 border-amber-500/40 rounded-3xl max-w-sm w-full p-5 shadow-2xl space-y-4 relative"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                    <Calculator className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white">Enter Product Short Code</h3>
                    <p className="text-[10px] text-slate-400">Dial 4-digit code (e.g. 1001) from shelf label</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsKeypadOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Display Screen */}
              <div className="bg-slate-950 rounded-2xl border-2 border-amber-500/50 p-3.5 text-center">
                <span className="text-[10px] font-black uppercase text-amber-400/80 tracking-widest block mb-0.5">
                  Shelf Short Code
                </span>
                <div className="text-3xl font-black font-mono tracking-wider text-amber-300">
                  #{keypadInput || '----'}
                </div>
                {/* Real-time match preview */}
                {matchedKeypadProduct ? (
                  <div className="mt-2 text-xs font-bold text-emerald-400 bg-emerald-950/60 py-1.5 px-2.5 rounded-xl border border-emerald-800/60 truncate flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="truncate">{matchedKeypadProduct.name}</span>
                    <span className="font-mono text-emerald-300 font-extrabold shrink-0">
                      &bull; {curr} {(matchedKeypadProduct.price || matchedKeypadProduct.pricePerKg || 0).toFixed(2)}
                    </span>
                  </div>
                ) : keypadInput.length >= 2 ? (
                  <div className="mt-1.5 text-[11px] text-slate-400 font-medium">
                    Searching for #{keypadInput}...
                  </div>
                ) : null}
              </div>

              {/* 3x4 Numeric Keypad */}
              <div className="grid grid-cols-3 gap-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digit => (
                  <button
                    key={digit}
                    type="button"
                    onClick={() => {
                      if (keypadInput.length < 8) {
                        setKeypadInput(keypadInput + digit);
                      }
                    }}
                    className="py-3 bg-slate-800 hover:bg-slate-700 active:bg-amber-600 text-white font-mono text-xl font-black rounded-2xl border border-slate-700 transition-all cursor-pointer shadow-sm active:scale-95"
                  >
                    {digit}
                  </button>
                ))}
                {/* Clear Button */}
                <button
                  type="button"
                  onClick={() => setKeypadInput('')}
                  className="py-3 bg-rose-950/60 hover:bg-rose-900 text-rose-300 font-bold text-xs uppercase tracking-wider rounded-2xl border border-rose-800/60 transition-all cursor-pointer active:scale-95"
                >
                  Clear
                </button>
                {/* Zero */}
                <button
                  type="button"
                  onClick={() => {
                    if (keypadInput.length < 8) {
                      setKeypadInput(keypadInput + '0');
                    }
                  }}
                  className="py-3 bg-slate-800 hover:bg-slate-700 active:bg-amber-600 text-white font-mono text-xl font-black rounded-2xl border border-slate-700 transition-all cursor-pointer shadow-sm active:scale-95"
                >
                  0
                </button>
                {/* Backspace */}
                <button
                  type="button"
                  onClick={() => setKeypadInput(keypadInput.slice(0, -1))}
                  className="py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm rounded-2xl border border-slate-700 transition-all cursor-pointer active:scale-95 flex items-center justify-center"
                  title="Backspace"
                >
                  <Delete className="w-5 h-5" />
                </button>
              </div>

              {/* Check Price Submit Button */}
              <button
                type="button"
                onClick={() => {
                  if (keypadInput.trim()) {
                    handleLookupBarcode(keypadInput.trim());
                    setIsKeypadOpen(false);
                  }
                }}
                disabled={!keypadInput.trim()}
                className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 disabled:opacity-40 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-orange-600/30 transition-all cursor-pointer active:scale-98 flex items-center justify-center gap-2"
              >
                <Search className="w-4 h-4" />
                <span>Check Price for #{keypadInput || '----'}</span>
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
