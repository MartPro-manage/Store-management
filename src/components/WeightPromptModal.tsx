import React, { useState, useEffect, useRef } from 'react';
import { Product } from '../types';
import { Scale, Plus, Sparkles, X, Calculator, Banknote, RotateCcw } from 'lucide-react';

interface WeightPromptModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (product: Product, quantityInKg: number, totalPrice: number) => void;
  title?: string;
  confirmLabel?: string;
  isReturnMode?: boolean;
}

export const WeightPromptModal: React.FC<WeightPromptModalProps> = ({
  product,
  isOpen,
  onClose,
  onConfirm,
  title,
  confirmLabel,
  isReturnMode = false
}) => {
  const [entryMode, setEntryMode] = useState<'weight' | 'price'>('weight');
  const [weightKg, setWeightKg] = useState<string>('1');
  const [priceRs, setPriceRs] = useState<string>('0');
  const [error, setError] = useState<string | null>(null);

  const weightInputRef = useRef<HTMLInputElement | null>(null);
  const priceInputRef = useRef<HTMLInputElement | null>(null);

  const perKgRate = product ? (product.price || product.pricePerKg || 0) : 0;

  // Initialize defaults whenever product changes or modal opens
  useEffect(() => {
    if (product && isOpen) {
      setWeightKg('1');
      const initialPrice = (1 * perKgRate).toFixed(2);
      setPriceRs(initialPrice);
      setError(null);
      setEntryMode('weight');

      // Auto-focus input for rapid cashier workflow
      setTimeout(() => {
        if (weightInputRef.current) {
          weightInputRef.current.focus();
          weightInputRef.current.select();
        }
      }, 80);
    }
  }, [product, isOpen, perKgRate]);

  if (!isOpen || !product) return null;

  const effectiveWeightKg = parseFloat(weightKg) || 0;
  const effectivePriceRs = parseFloat(priceRs) || 0;
  const isOutOfStock = !isReturnMode && product.stockQuantity <= 0;
  const exceedsStock = !isReturnMode && effectiveWeightKg > product.stockQuantity;

  // Handler when typing in Weight (KG)
  const handleWeightChange = (rawVal: string) => {
    setWeightKg(rawVal);
    const val = parseFloat(rawVal);
    if (!isNaN(val) && val >= 0) {
      setPriceRs((val * perKgRate).toFixed(2));
    } else {
      setPriceRs('0.00');
    }
  };

  // Handler when typing in Price (Rs.)
  const handlePriceChange = (rawVal: string) => {
    setPriceRs(rawVal);
    const val = parseFloat(rawVal);
    if (!isNaN(val) && val >= 0 && perKgRate > 0) {
      const calcKg = (val / perKgRate).toFixed(3);
      setWeightKg(calcKg);
    } else {
      setWeightKg('0.000');
    }
  };

  const handleApplyWeight = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    if (effectiveWeightKg <= 0) {
      setError('Please enter a valid weight or price greater than 0.');
      return;
    }

    if (exceedsStock) {
      setError(`Cannot add ${effectiveWeightKg.toFixed(3)} kg. Only ${product.stockQuantity} kg available in store stock!`);
      return;
    }

    onConfirm(product, effectiveWeightKg, effectivePriceRs);
    onClose();
  };

  const modalTitle = title || (isReturnMode ? 'Return Weighted Product' : 'Weight-Based Item Entry');
  const modalBtnLabel = confirmLabel || (isReturnMode ? 'Add Weight to Return List' : 'Add Weight to Bill (Enter)');

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-900/80 backdrop-blur-xs animate-fade-in overflow-y-auto overscroll-contain">
      <div 
        className="bg-white w-full max-w-md rounded-3xl border border-slate-200 shadow-2xl overflow-hidden animate-scale-up my-auto max-h-[94vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`p-5 text-white flex items-center justify-between shrink-0 ${
          isReturnMode ? 'bg-gradient-to-r from-rose-600 to-amber-600' : 'bg-gradient-to-r from-orange-600 to-amber-600'
        }`}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/20 rounded-2xl backdrop-blur-md">
              {isReturnMode ? <RotateCcw className="w-6 h-6 text-white" /> : <Scale className="w-6 h-6 text-white" />}
            </div>
            <div>
              <div className="text-[11px] font-extrabold uppercase tracking-widest text-amber-200">
                {modalTitle}
              </div>
              <h3 className="text-lg font-black tracking-tight line-clamp-1">
                {product.name}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleApplyWeight} className="p-5 sm:p-6 space-y-4 overflow-y-auto custom-scrollbar">
          {/* Product Meta Banner */}
          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 flex items-center justify-between text-xs">
            <div>
              <span className="text-slate-500 font-medium">Rate per KG:</span>{' '}
              <strong className="text-slate-900 font-extrabold text-sm font-mono">
                Rs. {perKgRate.toFixed(2)} / kg
              </strong>
            </div>
            {!isReturnMode && (
              <div className="text-right">
                <span className="text-slate-500 font-medium">Store Stock:</span>{' '}
                <strong className={`font-extrabold font-mono ${product.stockQuantity <= 5 ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {product.stockQuantity % 1 === 0 ? product.stockQuantity : product.stockQuantity.toFixed(3)} kg
                </strong>
              </div>
            )}
          </div>

          {/* Mode Tabs: Enter Weight vs Enter Price */}
          <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-2xl border border-slate-200 text-xs font-extrabold">
            <button
              type="button"
              onClick={() => {
                setEntryMode('weight');
                setTimeout(() => {
                  if (weightInputRef.current) {
                    weightInputRef.current.focus();
                    weightInputRef.current.select();
                  }
                }, 50);
              }}
              className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                entryMode === 'weight'
                  ? 'bg-white text-orange-600 shadow-xs font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Scale className="w-4 h-4" /> Enter Weight (KG)
            </button>
            <button
              type="button"
              onClick={() => {
                setEntryMode('price');
                setTimeout(() => {
                  if (priceInputRef.current) {
                    priceInputRef.current.focus();
                    priceInputRef.current.select();
                  }
                }, 50);
              }}
              className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                entryMode === 'price'
                  ? 'bg-white text-orange-600 shadow-xs font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Banknote className="w-4 h-4" /> Enter Price (Rs.)
            </button>
          </div>

          {/* Dual Inputs for Weight and Price */}
          <div className="space-y-3">
            {entryMode === 'weight' ? (
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Enter Measured Weight (KG / Decimal):
                </label>
                <div className="relative">
                  <input
                    ref={weightInputRef}
                    type="number"
                    step="0.001"
                    min="0.001"
                    required
                    placeholder="e.g. 1.500, 0.750, 2.250"
                    value={weightKg}
                    onChange={(e) => handleWeightChange(e.target.value)}
                    className="w-full pl-4 pr-16 py-3 bg-slate-50 border border-slate-300 rounded-2xl text-2xl font-black text-slate-900 text-center focus:outline-none focus:border-orange-500 focus:bg-white transition-all font-mono shadow-inner"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-extrabold text-slate-500">
                    KG
                  </span>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Enter Total Price / Amount (Rs.):
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-extrabold text-slate-500">
                    Rs.
                  </span>
                  <input
                    ref={priceInputRef}
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="e.g. 150, 300, 500"
                    value={priceRs}
                    onChange={(e) => handlePriceChange(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-2xl text-2xl font-black text-slate-900 text-center focus:outline-none focus:border-orange-500 focus:bg-white transition-all font-mono shadow-inner"
                  />
                </div>
              </div>
            )}

            {/* Quick Presets */}
            <div className="flex flex-wrap gap-1.5 justify-center pt-1">
              {[
                { label: '250g', val: 0.25 },
                { label: '500g', val: 0.5 },
                { label: '750g', val: 0.75 },
                { label: '1 kg', val: 1.0 },
                { label: '2 kg', val: 2.0 },
                { label: '5 kg', val: 5.0 },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    handleWeightChange(item.val.toString());
                    setEntryMode('weight');
                    if (weightInputRef.current) weightInputRef.current.focus();
                  }}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-orange-100 text-slate-700 hover:text-orange-800 font-bold text-xs rounded-xl border border-slate-200 transition-all cursor-pointer"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Realtime Dual Calculation Display Card */}
          <div className="p-4 bg-orange-50/80 rounded-2xl border border-orange-200 text-center space-y-1 shadow-2xs">
            <div className="text-[11px] font-extrabold text-orange-900 uppercase tracking-wider flex items-center justify-center gap-1.5">
              <Calculator className="w-3.5 h-3.5 text-orange-600" /> Auto-Calculated Summary
            </div>
            <div className="text-2xl font-black text-orange-600 font-mono">
              {effectiveWeightKg.toFixed(3)} KG &bull; Rs. {effectivePriceRs.toFixed(2)}
            </div>
            <div className="text-xs text-slate-600 font-semibold pt-0.5">
              {entryMode === 'price' ? (
                <span>Entered Price <strong>Rs. {effectivePriceRs.toFixed(2)}</strong> ➔ Calculated Weight: <strong className="text-orange-700 font-mono text-sm">{effectiveWeightKg.toFixed(3)} KG</strong></span>
              ) : (
                <span>Entered Weight <strong>{effectiveWeightKg.toFixed(3)} KG</strong> ➔ Calculated Price: <strong className="text-orange-700 font-mono text-sm">Rs. {effectivePriceRs.toFixed(2)}</strong></span>
              )}
            </div>
          </div>

          {/* Validation Feedback */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold">
              {error}
            </div>
          )}

          {exceedsStock && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs font-semibold">
              ⚠️ Warning: Requested weight ({effectiveWeightKg.toFixed(3)} kg) exceeds current available stock ({product.stockQuantity} kg).
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs transition-colors cursor-pointer"
            >
              Cancel (Esc)
            </button>

            <button
              type="submit"
              disabled={isOutOfStock || effectiveWeightKg <= 0 || exceedsStock}
              className={`flex-2 py-3 disabled:opacity-50 text-white font-black rounded-2xl text-xs uppercase tracking-wider shadow-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                isReturnMode
                  ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/20'
                  : 'bg-orange-600 hover:bg-orange-500 shadow-orange-600/20'
              }`}
            >
              <Plus className="w-4 h-4" /> {modalBtnLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
