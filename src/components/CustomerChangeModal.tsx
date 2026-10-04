import React, { useEffect, useState } from 'react';
import { 
  Coins, 
  CheckCircle2, 
  ArrowRight, 
  Printer, 
  Receipt, 
  Banknote, 
  Sparkles,
  Volume2,
  X
} from 'lucide-react';
import { Sale, Store } from '../types';
import { speakMessage, speakCustomerChange } from '../lib/speech';
import { printThermalReceiptDirect } from '../utils/printThermalReceipt';

interface CustomerChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onViewReceipt: () => void;
  sale: Sale | null;
  store?: Store | null;
  cashReceived: number;
  changeReturned: number;
  voiceEnabled?: boolean;
}

// Calculate recommended Pakistani Rupee currency notes for change return
export function calculateChangeDenominations(changeAmount: number): { note: number; count: number; label: string }[] {
  if (changeAmount <= 0) return [];

  let remaining = Math.round(changeAmount);
  const denominations = [5000, 1000, 500, 100, 50, 20, 10, 5, 2, 1];
  const breakdown: { note: number; count: number; label: string }[] = [];

  for (const denom of denominations) {
    if (remaining >= denom) {
      const count = Math.floor(remaining / denom);
      remaining = remaining % denom;
      breakdown.push({
        note: denom,
        count,
        label: denom >= 10 ? `Rs. ${denom} Note` : `Rs. ${denom} Coin`
      });
    }
  }

  return breakdown;
}

export const CustomerChangeModal: React.FC<CustomerChangeModalProps> = ({
  isOpen,
  onClose,
  onViewReceipt,
  sale,
  store,
  cashReceived,
  changeReturned,
  voiceEnabled = true
}) => {
  const [isPrinting, setIsPrinting] = useState(false);
  const announcedSaleIdRef = React.useRef<string | null>(null);

  const handleDirectPrint = async () => {
    if (!sale) return;
    setIsPrinting(true);
    try {
      await printThermalReceiptDirect(sale, store);
    } catch (err) {
      console.warn('Direct print error:', err);
    } finally {
      setIsPrinting(false);
      onViewReceipt();
    }
  };

  const handleReplayVoice = () => {
    if (!sale) return;
    speakCustomerChange(sale.totalAmount || 0, cashReceived, changeReturned, sale.id, true);
  };

  useEffect(() => {
    if (isOpen && sale) {
      // Voice prompt to clearly announce total bill, cash received and change return strictly ONE time
      if (voiceEnabled && store?.voiceAnnouncementEnabled !== false) {
        if (announcedSaleIdRef.current !== sale.id) {
          announcedSaleIdRef.current = sale.id;
          speakCustomerChange(sale.totalAmount || 0, cashReceived, changeReturned, sale.id, false);
        }
      }

      // Keyboard listener: Enter or Space advances to receipt
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'v' || e.key === 'V') {
          e.preventDefault();
          handleReplayVoice();
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onViewReceipt();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onViewReceipt();
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, changeReturned, cashReceived, voiceEnabled, onViewReceipt, sale, store]);

  if (!isOpen || !sale) return null;

  const totalBill = sale.totalAmount || 0;
  const isExactPayment = changeReturned <= 0;
  const denominations = calculateChangeDenominations(changeReturned);

  return (
    <div className="fixed inset-0 z-[130] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto overscroll-contain animate-fade-in">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border-2 border-emerald-500 overflow-hidden my-auto flex flex-col relative animate-scale-up">
        
        {/* Top Header Bar */}
        <div className="bg-emerald-700 text-white px-6 py-4 flex items-center justify-between border-b border-emerald-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white text-emerald-700 flex items-center justify-center font-black text-2xl shadow-md">
              <Coins className="w-7 h-7 text-emerald-600 animate-bounce" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white tracking-wide flex items-center gap-2">
                <span>CHANGE TO GIVE TO CUSTOMER</span>
              </h2>
              <p className="text-xs text-emerald-100 font-medium">
                Receipt #{sale.receiptNumber} • Counter: {sale.counterName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReplayVoice}
              className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold"
              title="Replay audio announcement (V)"
            >
              <Volume2 className="w-4 h-4 text-amber-300" />
              <span className="hidden sm:inline">Replay Voice</span>
            </button>

            <button
              type="button"
              onClick={onViewReceipt}
              className="px-4 py-2 rounded-xl bg-white text-emerald-800 hover:bg-emerald-50 active:bg-emerald-100 font-black text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
              title="Access receipt (Enter)"
            >
              <span>Next</span>
              <ArrowRight className="w-4 h-4 text-emerald-700" />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-emerald-100 hover:text-white hover:bg-emerald-800/60 rounded-xl transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 sm:p-8 space-y-6 overflow-y-auto max-h-[80vh] custom-scrollbar">
          
          {/* GIANT CHANGE HERO CARD */}
          <div className={`p-6 sm:p-8 rounded-3xl text-center border-4 shadow-xl relative overflow-hidden ${
            isExactPayment
              ? 'bg-gradient-to-br from-blue-600 to-indigo-700 border-blue-400 text-white'
              : 'bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-800 border-emerald-400 text-white'
          }`}>
            <div className="text-xs sm:text-sm font-black uppercase tracking-widest text-emerald-100 mb-1">
              {isExactPayment ? 'Exact Payment Received' : 'RETURN THIS AMOUNT TO CUSTOMER:'}
            </div>

            <div className="text-5xl sm:text-6xl md:text-7xl font-black font-mono tracking-tight my-2 drop-shadow-lg text-white">
              Rs. {changeReturned.toFixed(2)}
            </div>

            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/20 backdrop-blur-md text-xs sm:text-sm font-extrabold mt-1">
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>
                {isExactPayment 
                  ? '✓ Exact Cash — No Change Needed' 
                  : `Please hand over Rs. ${changeReturned.toFixed(2)} to customer`}
              </span>
            </div>

            <div className="mt-4 pt-3 border-t border-white/20 flex items-center justify-center">
              <button
                type="button"
                onClick={onViewReceipt}
                className="px-6 py-2.5 rounded-2xl bg-white text-slate-900 hover:bg-slate-100 active:bg-slate-200 font-black text-xs sm:text-sm uppercase tracking-wider transition-all cursor-pointer inline-flex items-center gap-2 shadow-lg hover:scale-105"
              >
                <Receipt className="w-4 h-4 text-emerald-600" />
                <span>Next to Access Receipt</span>
                <ArrowRight className="w-4 h-4 text-slate-900" />
              </button>
            </div>
          </div>

          {/* 3 Key Financial Figures Comparison */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Bill Amount */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-center">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Total Bill Amount
              </span>
              <span className="text-xl sm:text-2xl font-black font-mono text-slate-900 mt-1 block">
                Rs. {totalBill.toFixed(2)}
              </span>
            </div>

            {/* Cash Received */}
            <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-200 text-center">
              <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">
                Cash Received
              </span>
              <span className="text-xl sm:text-2xl font-black font-mono text-emerald-900 mt-1 block">
                Rs. {cashReceived.toFixed(2)}
              </span>
            </div>

            {/* Change to Return */}
            <div className="bg-amber-50 p-4 rounded-2xl border-2 border-amber-300 text-center">
              <span className="text-[11px] font-black text-amber-900 uppercase tracking-wider block">
                Change to Customer
              </span>
              <span className="text-xl sm:text-2xl font-black font-mono text-amber-900 mt-1 block">
                Rs. {changeReturned.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Recommended Currency Notes Breakdown Assistant */}
          {changeReturned > 0 && denominations.length > 0 && (
            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Banknote className="w-4 h-4 text-emerald-600" />
                  Recommended Notes / Coins to Give:
                </span>
                <span className="text-[11px] text-slate-400 font-bold">Fast Cash Counter Guide</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {denominations.map((d) => (
                  <div 
                    key={d.note} 
                    className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="font-mono font-black text-slate-900 text-sm">
                        {d.label}
                      </div>
                      <div className="text-[10px] text-slate-400 font-medium">
                        Total: Rs. {d.note * d.count}
                      </div>
                    </div>
                    <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white font-black font-mono text-sm flex items-center justify-center shrink-0 shadow-xs">
                      {d.count}×
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer Actions */}
        <div className="bg-slate-50 p-5 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500 font-medium hidden sm:block">
            Press <kbd className="px-2 py-0.5 bg-slate-200 text-slate-800 rounded font-mono font-bold">P</kbd> to Print • <kbd className="px-2 py-0.5 bg-slate-200 text-slate-800 rounded font-mono font-bold">Enter</kbd> to proceed
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleDirectPrint}
              disabled={isPrinting}
              className="flex-1 sm:flex-none px-6 py-4 rounded-2xl bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white font-black text-sm uppercase tracking-wider shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Printer className="w-5 h-5 text-orange-400" />
              <span>{isPrinting ? 'Printing...' : 'Print Receipt (P)'}</span>
            </button>

            <button
              id="btn-next-access-receipt"
              type="button"
              onClick={onViewReceipt}
              className="flex-1 sm:flex-none px-8 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-black text-sm uppercase tracking-wider shadow-xl shadow-emerald-600/30 transition-all cursor-pointer flex items-center justify-center gap-2.5 group hover:scale-[1.02]"
              title="Next to access receipt (Enter / Space)"
            >
              <Receipt className="w-5 h-5 text-emerald-100 group-hover:scale-110 transition-transform" />
              <span>Next to Access Receipt</span>
              <ArrowRight className="w-5 h-5 text-white group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
