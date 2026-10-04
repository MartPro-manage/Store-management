import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Percent, 
  Tag, 
  X, 
  Check, 
  AlertCircle, 
  Sparkles, 
  Trash2, 
  ArrowRight,
  TrendingDown,
  Coins,
  Calendar,
  Clock
} from 'lucide-react';
import { Product, Store } from '../types';
import { db, doc, updateDoc, cleanFirestoreData } from '../lib/firebase';
import { getProductDiscountInfo, formatShortDate, checkDiscountDateValidity } from '../utils/discountUtils';
import { playScanSuccessBeep } from '../lib/sound';

interface ItemDiscountModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  store: Store;
  onSuccess?: (updatedProduct: Product) => void;
}

export const ItemDiscountModal: React.FC<ItemDiscountModalProps> = ({
  isOpen,
  onClose,
  product,
  store,
  onSuccess
}) => {
  const getTodayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const [discountActive, setDiscountActive] = useState(false);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState<number | ''>(10);
  const [discountStartDate, setDiscountStartDate] = useState<string>(getTodayISO());
  const [discountEndDate, setDiscountEndDate] = useState<string>('');
  const [hasDateLimit, setHasDateLimit] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const curr = store?.currencySymbol || 'Rs.';

  // Quick preset helper
  const applyDatePreset = (days: number | 'today' | 'end_month' | 'none') => {
    const todayStr = getTodayISO();
    setDiscountStartDate(todayStr);

    if (days === 'none') {
      setHasDateLimit(false);
      setDiscountEndDate('');
      return;
    }

    setHasDateLimit(true);

    if (days === 'today') {
      setDiscountEndDate(todayStr);
      return;
    }

    if (days === 'end_month') {
      const today = new Date();
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      const endStr = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
      setDiscountEndDate(endStr);
      return;
    }

    const future = new Date();
    future.setDate(future.getDate() + (days - 1));
    const endStr = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`;
    setDiscountEndDate(endStr);
  };

  useEffect(() => {
    if (product) {
      setDiscountActive(Boolean(product.discountActive && (product.discountValue || 0) > 0));
      setDiscountType(product.discountType || 'percentage');
      setDiscountValue(
        product.discountValue !== undefined && product.discountValue > 0 
          ? product.discountValue 
          : 10
      );
      setDiscountStartDate(product.discountStartDate || getTodayISO());
      setDiscountEndDate(product.discountEndDate || '');
      setHasDateLimit(Boolean(product.discountEndDate));
      setErrorMsg(null);
    }
  }, [product]);

  if (!isOpen || !product) return null;

  const originalPrice = product.price || 0;
  const numValue = typeof discountValue === 'number' ? discountValue : parseFloat(discountValue) || 0;

  let calculatedSavings = 0;
  if (discountActive && numValue > 0) {
    if (discountType === 'percentage') {
      calculatedSavings = (originalPrice * Math.min(100, Math.max(0, numValue))) / 100;
    } else {
      calculatedSavings = Math.min(originalPrice, Math.max(0, numValue));
    }
  }
  const finalPrice = Math.max(0, originalPrice - calculatedSavings);

  const handleSaveDiscount = async () => {
    if (discountActive) {
      if (numValue <= 0) {
        setErrorMsg('Please enter a discount value greater than 0.');
        return;
      }
      if (discountType === 'percentage' && numValue > 95) {
        setErrorMsg('Percentage discount cannot exceed 95%.');
        return;
      }
      if (discountType === 'fixed' && numValue >= originalPrice) {
        setErrorMsg(`Fixed discount must be less than the product price (${curr} ${originalPrice.toFixed(2)}).`);
        return;
      }
      if (hasDateLimit && discountStartDate && discountEndDate && discountStartDate > discountEndDate) {
        setErrorMsg('Start date cannot be after expiry date.');
        return;
      }
    }

    setIsSaving(true);
    setErrorMsg(null);

    try {
      const productRef = doc(db, 'products', product.id);
      const updatePayload: Partial<Product> = {
        discountActive: discountActive,
        discountType: discountType,
        discountValue: discountActive ? numValue : 0,
        discountStartDate: discountActive && hasDateLimit && discountStartDate ? discountStartDate : null,
        discountEndDate: discountActive && hasDateLimit && discountEndDate ? discountEndDate : null,
        updatedAt: new Date().toISOString()
      };

      await updateDoc(productRef, cleanFirestoreData(updatePayload));
      playScanSuccessBeep();

      const updatedProduct: Product = {
        ...product,
        ...updatePayload
      };

      if (onSuccess) onSuccess(updatedProduct);
      onClose();
    } catch (err: any) {
      console.error('Failed to update product discount:', err);
      setErrorMsg(err.message || 'Failed to update discount.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveDiscount = async () => {
    setIsSaving(true);
    setErrorMsg(null);

    try {
      const productRef = doc(db, 'products', product.id);
      const updatePayload: Partial<Product> = {
        discountActive: false,
        discountType: 'percentage',
        discountValue: 0,
        discountStartDate: null,
        discountEndDate: null,
        updatedAt: new Date().toISOString()
      };

      await updateDoc(productRef, cleanFirestoreData(updatePayload));
      playScanSuccessBeep();

      const updatedProduct: Product = {
        ...product,
        ...updatePayload
      };

      if (onSuccess) onSuccess(updatedProduct);
      onClose();
    } catch (err: any) {
      console.error('Failed to remove discount:', err);
      setErrorMsg(err.message || 'Failed to remove discount.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto overscroll-contain">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl relative space-y-5 my-auto max-h-[92vh] overflow-y-auto overscroll-contain custom-scrollbar"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4 sticky top-0 bg-white z-10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-50 text-rose-600 rounded-2xl border border-rose-200 shadow-xs">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                Set Item Discount
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Configure promotional rate for this product
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Product Brief Details */}
        <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-center gap-3.5">
          {product.imageUrl ? (
            <img 
              src={product.imageUrl} 
              alt={product.name} 
              className="w-12 h-12 rounded-xl object-cover border border-slate-200 bg-white shrink-0" 
            />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-slate-200 flex items-center justify-center text-slate-400 shrink-0 font-black text-sm">
              {product.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h4 className="font-black text-slate-900 text-sm truncate">{product.name}</h4>
            <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
              <span className="font-mono text-[11px] bg-white px-1.5 py-0.5 rounded border border-slate-200">
                {product.barcode || 'No barcode'}
              </span>
              <span>{product.category || 'General'}</span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase font-bold text-slate-400">Regular Price</div>
            <div className="text-sm font-black font-mono text-slate-900">
              {curr} {originalPrice.toFixed(2)}
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Active Toggle */}
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3.5 bg-rose-50/50 rounded-2xl border border-rose-200/80">
            <label className="text-xs font-bold text-slate-900 flex items-center gap-2 cursor-pointer">
              <input 
                type="checkbox"
                checked={discountActive}
                onChange={(e) => setDiscountActive(e.target.checked)}
                className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500 cursor-pointer"
              />
              <span>Enable Active Discount for this Product</span>
            </label>
            <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
              discountActive ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-slate-100 text-slate-600'
            }`}>
              {discountActive ? 'Active' : 'Disabled'}
            </span>
          </div>

          {discountActive && (
            <div className="space-y-3.5 pt-1">
              {/* Discount Type Selector */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Discount Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDiscountType('percentage')}
                    className={`py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                      discountType === 'percentage'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Percent className="w-3.5 h-3.5" /> Percentage Off (%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscountType('fixed')}
                    className={`py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                      discountType === 'fixed'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Coins className="w-3.5 h-3.5" /> Flat Off ({curr})
                  </button>
                </div>
              </div>

              {/* Quick Presets */}
              {discountType === 'percentage' && (
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Quick % Presets
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {[5, 10, 15, 20, 25, 30, 50].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setDiscountValue(preset)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                          Number(discountValue) === preset
                            ? 'bg-rose-600 text-white border-rose-600'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {preset}%
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Discount Value Input */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  {discountType === 'percentage' ? 'Percentage Off (1% - 95%)' : `Discount Amount Off (${curr})`}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">
                    {discountType === 'percentage' ? '%' : curr}
                  </span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    max={discountType === 'percentage' ? 95 : originalPrice}
                    placeholder={discountType === 'percentage' ? 'e.g. 15' : 'e.g. 50'}
                    value={discountValue}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDiscountValue(val === '' ? '' : parseFloat(val) || 0);
                    }}
                    className="w-full pl-9 pr-3 py-2.5 bg-white border border-rose-300 rounded-xl text-sm font-mono font-black text-rose-700 focus:outline-none focus:border-rose-500 shadow-xs"
                  />
                </div>
              </div>

              {/* Time Limit & Date Range Settings */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasDateLimit}
                      onChange={(e) => {
                        setHasDateLimit(e.target.checked);
                        if (e.target.checked && !discountEndDate) {
                          applyDatePreset(7);
                        }
                      }}
                      className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500 cursor-pointer"
                    />
                    <Calendar className="w-3.5 h-3.5 text-rose-600" />
                    <span>Set Time Limit / Expiry Date</span>
                  </label>
                  {hasDateLimit && (
                    <span className="text-[10px] font-black uppercase text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full border border-rose-200">
                      Scheduled Sale
                    </span>
                  )}
                </div>

                {hasDateLimit ? (
                  <div className="space-y-2.5 pt-1">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                          From (Start Date) *
                        </label>
                        <input
                          type="date"
                          value={discountStartDate}
                          onChange={(e) => setDiscountStartDate(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:border-rose-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                          Until (Expiry Date) *
                        </label>
                        <input
                          type="date"
                          min={discountStartDate}
                          value={discountEndDate}
                          onChange={(e) => setDiscountEndDate(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white border border-rose-300 rounded-lg text-xs font-bold text-rose-800 focus:outline-none focus:border-rose-500"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {[
                        { label: 'Today Only', val: 'today' as const },
                        { label: '3 Days', val: 3 },
                        { label: '7 Days', val: 7 },
                        { label: '14 Days', val: 14 },
                        { label: '30 Days', val: 30 }
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => applyDatePreset(preset.val)}
                          className="px-2 py-0.5 rounded text-[10px] font-bold bg-white border border-slate-200 text-slate-600 hover:text-rose-600 hover:border-rose-300 transition-all cursor-pointer"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>

                    {discountStartDate && discountEndDate && (
                      <div className="text-[11px] text-rose-800 font-bold bg-rose-50 p-2 rounded-lg border border-rose-200 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        <span>Valid: <strong>{formatShortDate(discountStartDate)}</strong> to <strong>{formatShortDate(discountEndDate)}</strong></span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-500">
                    No time limit. Discount will remain active indefinitely until manually disabled.
                  </p>
                )}
              </div>

              {/* Calculation Preview */}
              {numValue > 0 && (
                <div className="p-3.5 bg-gradient-to-br from-rose-50 to-amber-50 rounded-2xl border border-rose-200 space-y-2">
                  <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center justify-between">
                    <span>Discount Preview</span>
                    <span className="text-rose-700 font-black">
                      {discountType === 'percentage' ? `${numValue}% OFF` : `${curr} ${numValue.toFixed(2)} OFF`}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-rose-200/60">
                    <div className="bg-white/80 p-2.5 rounded-xl border border-rose-100">
                      <span className="text-[10px] font-bold text-slate-500 uppercase block">Customer Pays</span>
                      <span className="text-base font-black font-mono text-slate-900 block mt-0.5">
                        {curr} {finalPrice.toFixed(2)}
                      </span>
                      <span className="text-[10px] text-slate-400 line-through">
                        Was {curr} {originalPrice.toFixed(2)}
                      </span>
                    </div>

                    <div className="bg-white/80 p-2.5 rounded-xl border border-rose-100">
                      <span className="text-[10px] font-bold text-emerald-700 uppercase block">Customer Saves</span>
                      <span className="text-base font-black font-mono text-emerald-700 block mt-0.5">
                        {curr} {calculatedSavings.toFixed(2)}
                      </span>
                      <span className="text-[10px] text-emerald-600 font-bold">
                        per {product.sellBy === 'weight' ? 'kg' : 'unit'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
          {product.discountActive && (
            <button
              type="button"
              disabled={isSaving}
              onClick={handleRemoveDiscount}
              className="py-2.5 px-3 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" /> Remove Discount
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-colors cursor-pointer ml-auto"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={isSaving}
            onClick={handleSaveDiscount}
            className="py-2.5 px-5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-black text-xs shadow-md shadow-rose-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            {isSaving ? (
              <span>Saving...</span>
            ) : (
              <>
                <Check className="w-4 h-4" /> Save Discount
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
