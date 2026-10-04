import React, { useState, useEffect, useRef } from 'react';
import { 
  Banknote, 
  CheckCircle2, 
  X, 
  Coins, 
  AlertCircle, 
  Sparkles, 
  RefreshCw, 
  Plus, 
  ArrowLeft,
  Receipt,
  Printer,
  Smartphone,
  Calculator,
  ShoppingBag
} from 'lucide-react';

interface CashPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  subtotalAmount?: number;
  discountAmount?: number;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  totalAmount: number;
  onConfirmPayment: (cashReceived: number, changeReturned: number) => void;
  loading: boolean;
  isFullScreen?: boolean;
  storeName?: string;
  counterName?: string;
  cashierName?: string;
  itemCount?: number;
}

export const CashPaymentModal: React.FC<CashPaymentModalProps> = ({
  isOpen,
  onClose,
  subtotalAmount,
  discountAmount = 0,
  discountType,
  discountValue,
  totalAmount,
  onConfirmPayment,
  loading,
  isFullScreen = false,
  storeName,
  counterName,
  cashierName,
  itemCount
}) => {
  const [receivedInput, setReceivedInput] = useState<string>('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setReceivedInput(totalAmount.toString());
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 100);
    }
  }, [isOpen, totalAmount]);

  if (!isOpen) return null;

  const numReceived = parseFloat(receivedInput) || 0;
  const changeToReturn = numReceived - totalAmount;
  const isSufficient = numReceived >= totalAmount && numReceived > 0;
  const isExact = Math.abs(numReceived - totalAmount) < 0.001;

  const quickNotes = [
    { label: 'Exact', value: totalAmount },
    { label: 'Rs. 100', value: 100 },
    { label: 'Rs. 500', value: 500 },
    { label: 'Rs. 1,000', value: 1000 },
    { label: 'Rs. 2,000', value: 2000 },
    { label: 'Rs. 5,000', value: 5000 },
  ];

  const handleQuickAdd = (val: number) => {
    if (val === totalAmount) {
      setReceivedInput(totalAmount.toString());
    } else {
      setReceivedInput(val.toString());
    }
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleIncrementReceived = (delta: number) => {
    const current = parseFloat(receivedInput) || 0;
    const next = Math.max(0, current + delta);
    setReceivedInput(next.toString());
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleClear = () => {
    setReceivedInput('');
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSufficient && !loading) {
      onConfirmPayment(numReceived, Math.max(0, changeToReturn));
    }
  };

  // Full Screen Cashier Checkout Experience
  if (isFullScreen) {
    return (
      <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-md flex flex-col overflow-y-auto overscroll-contain animate-fade-in">
        {/* Fullscreen Header Bar */}
        <div className="bg-slate-900 text-white px-4 sm:px-8 py-3 border-b border-slate-800 flex items-center justify-between shrink-0 shadow-lg">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-bold transition-all cursor-pointer border border-slate-700"
              title="Return to cashier counter"
            >
              <ArrowLeft className="w-4 h-4 text-orange-400" />
              <span>Back to Cart</span>
              <span className="text-[10px] bg-black/40 px-1.5 py-0.5 rounded font-mono font-normal">ESC</span>
            </button>
            <div className="border-l border-slate-700 pl-3">
              <h2 className="text-sm font-black text-white flex items-center gap-2">
                <span>{storeName || 'Store'}</span>
                <span className="text-orange-400">•</span>
                <span className="text-orange-400">Cash Checkout & Change Calculator</span>
              </h2>
              <p className="text-[11px] text-slate-400">
                {counterName || 'Counter #1'} {cashierName ? `• Cashier: ${cashierName}` : ''} {itemCount !== undefined ? `• ${itemCount} items` : ''}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Fullscreen Two-Column Scrollable Body */}
        <div className="flex-1 max-w-6xl mx-auto w-full p-4 sm:p-8 flex flex-col justify-start my-auto overflow-y-auto overscroll-contain custom-scrollbar">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* LEFT 6 COLS: Payable Amount & Quick Notes */}
            <div className="lg:col-span-6 space-y-5">
              
              {/* Grand Total Hero Card */}
              <div className="bg-slate-900 text-white p-6 rounded-3xl border border-slate-800 shadow-2xl relative overflow-hidden space-y-3">
                <div className="absolute right-0 top-0 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Total Payable Amount
                  </span>
                  <span className="text-[11px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-0.5 rounded-full font-mono font-bold">
                    CASH DUE
                  </span>
                </div>

                {discountAmount > 0 ? (
                  <div className="space-y-1.5 pt-2 border-t border-slate-800">
                    <div className="flex justify-between text-sm text-slate-300">
                      <span>Subtotal:</span>
                      <span className="font-mono font-bold">Rs. {(subtotalAmount ?? (totalAmount + discountAmount)).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-emerald-400 font-bold">
                      <span>Discount {discountType === 'percentage' && discountValue ? `(${discountValue}%)` : ''}:</span>
                      <span className="font-mono">-Rs. {discountAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-baseline pt-2 border-t border-slate-800">
                      <span className="text-sm text-amber-300 font-bold uppercase">Net Total:</span>
                      <div className="text-4xl sm:text-5xl font-black text-amber-400 tracking-tight font-mono">
                        Rs. {totalAmount.toFixed(2)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-4xl sm:text-5xl font-black text-amber-400 tracking-tight font-mono py-2">
                    Rs. {totalAmount.toFixed(2)}
                  </div>
                )}

                {itemCount !== undefined && (
                  <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5 pt-2 border-t border-slate-800/60">
                    <ShoppingBag className="w-3.5 h-3.5 text-orange-400" />
                    <span>Total items in this bill: <strong className="text-slate-200">{itemCount}</strong></span>
                  </div>
                )}
              </div>

              {/* Quick Select Currency Notes */}
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-3">
                <div className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center justify-between">
                  <span>Quick Currency Notes (Customer Note)</span>
                  <span className="text-[11px] text-slate-400 font-medium">Click to select</span>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {quickNotes.map((note) => (
                    <button
                      key={note.label}
                      type="button"
                      onClick={() => handleQuickAdd(note.value)}
                      className={`py-3 px-2 rounded-2xl text-xs font-black border transition-all cursor-pointer text-center ${
                        Math.abs(numReceived - note.value) < 0.01
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-md scale-105'
                          : 'bg-slate-50 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border-slate-200'
                      }`}
                    >
                      {note.label}
                    </button>
                  ))}
                </div>

                {/* Incremental Add Buttons */}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider shrink-0">
                    Add Note:
                  </span>
                  <div className="flex flex-wrap gap-1.5 flex-1">
                    {[50, 100, 500, 1000, 5000].map((addVal) => (
                      <button
                        key={addVal}
                        type="button"
                        onClick={() => handleIncrementReceived(addVal)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3 text-emerald-600" /> {addVal}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

            </div>

            {/* RIGHT 6 COLS: Cash Received Input & Big Change Due Card */}
            <div className="lg:col-span-6 space-y-5">
              
              {/* Cash Received Input Card */}
              <div className="bg-white p-6 rounded-3xl border-2 border-emerald-500/80 shadow-md space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Banknote className="w-5 h-5 text-emerald-600" />
                    <span>Cash Received From Customer (Rs.) *</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleClear}
                    className="text-xs font-bold text-slate-500 hover:text-red-600 transition-colors cursor-pointer"
                  >
                    Clear Input
                  </button>
                </div>

                <div className="relative">
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 text-2xl font-black text-slate-400">
                    Rs.
                  </span>
                  <input
                    ref={inputRef}
                    type="number"
                    step="any"
                    min="0"
                    required
                    placeholder="0.00"
                    value={receivedInput}
                    onChange={(e) => setReceivedInput(e.target.value)}
                    className="w-full pl-16 pr-5 py-4 bg-slate-50 border-2 border-emerald-500 focus:border-emerald-600 focus:bg-white rounded-2xl text-slate-900 text-3xl font-black focus:outline-none transition-all shadow-inner font-mono"
                  />
                </div>
              </div>

              {/* LIVE MONEY RETURN (CHANGE CALCULATION) - FULLSCREEN HERO DISPLAY */}
              <div className="space-y-2">
                <div className="text-xs font-black text-slate-200 uppercase tracking-wider flex items-center justify-between px-1">
                  <span>Change Calculation (Pay Back to Customer)</span>
                  <span className="text-[10px] font-bold text-slate-400">Real-Time</span>
                </div>

                {isSufficient ? (
                  <div className={`p-6 rounded-3xl border-2 transition-all shadow-xl ${
                    isExact 
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-700 border-blue-400 text-white'
                      : 'bg-gradient-to-r from-emerald-600 via-emerald-700 to-teal-700 border-emerald-400 text-white'
                  }`}>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="p-3.5 rounded-2xl bg-white/20 text-white backdrop-blur-md shrink-0 shadow-inner">
                          <Coins className="w-9 h-9 animate-bounce" />
                        </div>
                        <div>
                          <div className="text-xs font-black uppercase tracking-wider text-emerald-100">
                            {isExact ? 'Exact Cash Received' : 'Pay Back to Customer:'}
                          </div>
                          <div className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-white drop-shadow-md">
                            Rs. {changeToReturn.toFixed(2)}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className={`px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider inline-block ${
                          isExact 
                            ? 'bg-white text-blue-900 shadow-md' 
                            : 'bg-white text-emerald-900 font-extrabold shadow-md'
                        }`}>
                          {isExact ? '✓ No Change Needed' : '✓ Return to Customer'}
                        </span>
                        {!isExact && (
                          <p className="text-xs text-emerald-100 font-semibold mt-1.5">
                            Hand over Rs. {changeToReturn.toFixed(2)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-5 bg-amber-500/20 border-2 border-amber-400 text-amber-200 rounded-3xl flex items-center justify-between gap-3 shadow-lg">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-amber-500 text-slate-950 rounded-2xl shrink-0 font-black">
                        <AlertCircle className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="text-xs font-black text-amber-300 uppercase tracking-wider">
                          Short Cash Received
                        </div>
                        <div className="text-2xl font-black text-white font-mono">
                          Need Rs. {(totalAmount - numReceived).toFixed(2)} more
                        </div>
                      </div>
                    </div>
                    <span className="text-xs font-bold bg-amber-400 text-slate-950 px-3 py-1 rounded-xl">
                      Insufficient
                    </span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="flex-1 py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer border border-slate-700"
                >
                  Cancel / Return
                </button>

                <button
                  type="submit"
                  disabled={!isSufficient || loading}
                  className="flex-[2] py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl shadow-emerald-600/40 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Processing Sale...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-5 h-5" /> 
                      <span>
                        Complete Payment {changeToReturn > 0 ? `(Pay Back Rs. ${changeToReturn.toFixed(0)})` : ''}
                      </span>
                    </>
                  )}
                </button>
              </div>

            </div>

          </form>
        </div>
      </div>
    );
  }

  // Regular Modal View
  return (
    <div className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto overscroll-contain">
      <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-5 relative border border-slate-200 animate-fade-in my-auto max-h-[92vh] overflow-y-auto overscroll-contain custom-scrollbar">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-2xl border border-emerald-200 shadow-xs">
              <Banknote className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 tracking-tight">
                Cash Checkout & Change Calculator
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Enter amount received & calculate change to pay back to customer
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={loading}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Section 1: Total Customer Bill */}
          <div className="bg-slate-950 text-white p-4 sm:p-5 rounded-2xl shadow-inner space-y-2 border border-slate-800 relative overflow-hidden">
            <div className="absolute right-0 top-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Customer Bill Total</span>
              <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono font-bold">
                PAYABLE AMOUNT
              </span>
            </div>

            {discountAmount > 0 ? (
              <div className="space-y-1 pt-1 border-t border-slate-800/80">
                <div className="flex justify-between text-xs text-slate-300">
                  <span>Subtotal:</span>
                  <span className="font-mono font-semibold">Rs. {(subtotalAmount ?? (totalAmount + discountAmount)).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs text-emerald-400 font-bold">
                  <span>Discount {discountType === 'percentage' && discountValue ? `(${discountValue}%)` : ''}:</span>
                  <span className="font-mono">-Rs. {discountAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-baseline pt-1.5 border-t border-slate-800">
                  <span className="text-xs text-amber-300 font-bold uppercase">Net Payable Total:</span>
                  <div className="text-3xl font-black text-amber-400 tracking-tight font-mono">
                    Rs. {totalAmount.toFixed(2)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-3xl sm:text-4xl font-black text-amber-400 tracking-tight font-mono">
                Rs. {totalAmount.toFixed(2)}
              </div>
            )}
          </div>

          {/* Section 2: Cash Received Input */}
          <div className="space-y-2 bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Banknote className="w-4 h-4 text-emerald-600" />
                <span>Cash Received From Customer (Rs.) *</span>
              </label>
              <button
                type="button"
                onClick={handleClear}
                className="text-[11px] font-bold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              >
                Clear
              </button>
            </div>

            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-black text-slate-500">
                Rs.
              </span>
              <input
                ref={inputRef}
                type="number"
                step="any"
                min="0"
                required
                placeholder="0.00"
                value={receivedInput}
                onChange={(e) => setReceivedInput(e.target.value)}
                className="w-full pl-14 pr-4 py-3.5 bg-white border-2 border-emerald-500 focus:border-emerald-600 rounded-2xl text-slate-900 text-2xl font-black focus:outline-none transition-all shadow-sm font-mono"
              />
            </div>

            {/* Quick Currency Note Buttons */}
            <div className="space-y-1.5 pt-1">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Quick Select Note:
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {quickNotes.map((note) => (
                  <button
                    key={note.label}
                    type="button"
                    onClick={() => handleQuickAdd(note.value)}
                    className={`py-1.5 px-1 rounded-xl text-xs font-extrabold border transition-all cursor-pointer text-center ${
                      Math.abs(numReceived - note.value) < 0.01
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border-slate-200'
                    }`}
                  >
                    {note.label}
                  </button>
                ))}
              </div>

              {/* Incremental Add Buttons */}
              <div className="flex items-center gap-1.5 pt-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
                  Add:
                </span>
                <div className="flex flex-wrap gap-1 flex-1">
                  {[50, 100, 500, 1000].map((addVal) => (
                    <button
                      key={addVal}
                      type="button"
                      onClick={() => handleIncrementReceived(addVal)}
                      className="px-2 py-0.5 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-0.5"
                    >
                      <Plus className="w-2.5 h-2.5" /> {addVal}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Money Return (Change Calculation) - PROMINENT DISPLAY */}
          <div className="space-y-1.5">
            <div className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center justify-between">
              <span>Change Due (Money to Pay Back to Customer)</span>
              <span className="text-[10px] font-bold text-slate-400">Live Calculation</span>
            </div>

            {isSufficient ? (
              <div className={`p-4 rounded-2xl border-2 transition-all shadow-md ${
                isExact 
                  ? 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-400 text-blue-950'
                  : 'bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 border-emerald-500 text-white'
              }`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-3 rounded-2xl shrink-0 ${
                      isExact ? 'bg-blue-600 text-white' : 'bg-white/20 text-white backdrop-blur-xs'
                    }`}>
                      <Coins className="w-7 h-7 animate-bounce" />
                    </div>
                    <div>
                      <div className={`text-xs font-black uppercase tracking-wider ${
                        isExact ? 'text-blue-800' : 'text-emerald-100'
                      }`}>
                        {isExact ? 'Exact Amount Received' : 'Pay Back to Customer'}
                      </div>
                      <div className={`text-2xl sm:text-3xl font-black font-mono tracking-tight ${
                        isExact ? 'text-blue-900' : 'text-white drop-shadow-xs'
                      }`}>
                        Rs. {changeToReturn.toFixed(2)}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider inline-block ${
                      isExact 
                        ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                        : 'bg-white text-emerald-800 font-extrabold shadow-xs'
                    }`}>
                      {isExact ? 'No Change Due' : '✓ Return Cash'}
                    </span>
                    {!isExact && (
                      <p className="text-[11px] text-emerald-100 font-medium mt-1">
                        Hand over Rs. {changeToReturn.toFixed(2)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-amber-50 border-2 border-amber-400 rounded-2xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-amber-500 text-white rounded-2xl shrink-0">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-[11px] font-black text-amber-900 uppercase tracking-wider">
                      Short Cash Received
                    </div>
                    <div className="text-xl font-black text-amber-800 font-mono">
                      Need Rs. {(totalAmount - numReceived).toFixed(2)} more
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-bold bg-amber-200/80 text-amber-900 px-2.5 py-1 rounded-lg">
                  Insufficient
                </span>
              </div>
            )}
          </div>

          {/* Modal Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-3 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={!isSufficient || loading}
              className="px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-emerald-600/30 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" /> 
                  <span>
                    Complete Payment {changeToReturn > 0 ? `(Return Rs. ${changeToReturn.toFixed(0)})` : ''}
                  </span>
                </>
              )}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
