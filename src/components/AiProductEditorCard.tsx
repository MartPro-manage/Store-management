import React, { useState } from 'react';
import { 
  Check, 
  Sparkles, 
  AlertCircle, 
  Save, 
  RotateCcw, 
  Package, 
  DollarSign, 
  Tag, 
  Boxes, 
  Scale, 
  Plus, 
  Minus, 
  ArrowRight,
  RefreshCw,
  Coins,
  Percent,
  CheckCircle2,
  Hash,
  Wand2
} from 'lucide-react';
import { Product } from '../types';
import { db, doc, updateDoc, cleanFirestoreData } from '../lib/firebase';
import { playScanSuccessBeep } from '../lib/sound';

export interface ProductEditDraft {
  id: string;
  name: string;
  price: number;
  costPrice: number;
  stockQuantity: number;
  minStockLevel: number;
  category: string;
  barcode: string;
  shortcutCode?: string;
  serialNumber?: string;
  sellBy?: 'unit' | 'weight';
  unitType?: 'piece' | 'kg' | 'g' | 'liter' | 'dozen';
  weight?: string;
  changesSummary?: {
    field: string;
    label: string;
    from: string | number;
    to: string | number;
  }[];
  originalProduct: Product;
  saved?: boolean;
}

interface AiProductEditorCardProps {
  draft: ProductEditDraft;
  onSavedSuccess?: (updated: Product) => void;
}

export const AiProductEditorCard: React.FC<AiProductEditorCardProps> = ({
  draft,
  onSavedSuccess
}) => {
  const [name, setName] = useState(draft.name);
  const [price, setPrice] = useState<number | string>(draft.price);
  const [costPrice, setCostPrice] = useState<number | string>(draft.costPrice ?? 0);
  const [stockQuantity, setStockQuantity] = useState<number | string>(draft.stockQuantity);
  const [category, setCategory] = useState(draft.category || 'General');
  const [barcode, setBarcode] = useState(draft.barcode || '');
  const [shortcutCode, setShortcutCode] = useState(draft.shortcutCode || draft.originalProduct?.shortcutCode || '');
  const [sellBy, setSellBy] = useState<'unit' | 'weight'>(draft.sellBy || (draft.unitType === 'kg' ? 'weight' : 'unit'));
  const [unitType, setUnitType] = useState<string>(draft.unitType || (sellBy === 'weight' ? 'kg' : 'piece'));
  
  // Discount state
  const [discountActive, setDiscountActive] = useState<boolean>(Boolean(draft.originalProduct?.discountActive));
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>(draft.originalProduct?.discountType || 'percentage');
  const [discountValue, setDiscountValue] = useState<number | string>(draft.originalProduct?.discountValue ?? 10);

  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(draft.saved || false);
  const [error, setError] = useState<string | null>(null);

  // Financial calculations
  const numPrice = typeof price === 'number' ? price : parseFloat(price) || 0;
  const numCost = typeof costPrice === 'number' ? costPrice : parseFloat(costPrice) || 0;
  const numStock = typeof stockQuantity === 'number' ? stockQuantity : parseFloat(stockQuantity) || 0;
  const numDiscountVal = typeof discountValue === 'number' ? discountValue : parseFloat(discountValue) || 0;

  let calculatedDiscount = 0;
  if (discountActive && numDiscountVal > 0) {
    if (discountType === 'percentage') {
      calculatedDiscount = (numPrice * Math.min(100, Math.max(0, numDiscountVal))) / 100;
    } else {
      calculatedDiscount = Math.min(numPrice, Math.max(0, numDiscountVal));
    }
  }
  const effectiveFinalPrice = Math.max(0, numPrice - calculatedDiscount);
  const unitProfit = effectiveFinalPrice - numCost;
  const marginPercent = effectiveFinalPrice > 0 ? (unitProfit / effectiveFinalPrice) * 100 : 0;

  // Track differences from original
  const orig = draft.originalProduct;
  const priceChanged = numPrice !== orig.price;
  const costChanged = numCost !== (orig.costPrice || 0);
  const stockChanged = numStock !== orig.stockQuantity;
  const nameChanged = name.trim() !== orig.name.trim();
  const categoryChanged = category.trim() !== (orig.category || 'General').trim();
  const barcodeChanged = barcode.trim() !== (orig.barcode || '').trim();
  const shortcutChanged = shortcutCode.trim() !== (orig.shortcutCode || '').trim();
  const discountChanged = discountActive !== Boolean(orig.discountActive) || (discountActive && numDiscountVal !== (orig.discountValue || 0));

  const hasAnyChanges = priceChanged || costChanged || stockChanged || nameChanged || categoryChanged || barcodeChanged || shortcutChanged || discountChanged;

  const handleQuickStockAdjust = (delta: number) => {
    const current = typeof stockQuantity === 'number' ? stockQuantity : parseFloat(stockQuantity) || 0;
    const nextVal = Math.max(0, Math.round((current + delta) * 1000) / 1000);
    setStockQuantity(nextVal);
  };

  const handleGenerateShortcut = () => {
    const rand = Math.floor(1001 + Math.random() * 8998).toString();
    setShortcutCode(rand);
    setSaved(false);
  };

  const handleResetToOriginal = () => {
    setName(orig.name);
    setPrice(orig.price);
    setCostPrice(orig.costPrice || 0);
    setStockQuantity(orig.stockQuantity);
    setCategory(orig.category || 'General');
    setBarcode(orig.barcode || '');
    setShortcutCode(orig.shortcutCode || '');
    setSellBy(orig.sellBy || (orig.unitType === 'kg' ? 'weight' : 'unit'));
    setUnitType(orig.unitType || (orig.sellBy === 'weight' ? 'kg' : 'piece'));
    setDiscountActive(Boolean(orig.discountActive));
    setDiscountType(orig.discountType || 'percentage');
    setDiscountValue(orig.discountValue ?? 10);
    setError(null);
  };

  const handleSaveToFirestore = async () => {
    if (!name.trim()) {
      setError('Product name cannot be empty');
      return;
    }
    if (isNaN(numPrice) || numPrice < 0) {
      setError('Please enter a valid selling price (0 or greater)');
      return;
    }
    if (isNaN(numCost) || numCost < 0) {
      setError('Please enter a valid cost price (0 or greater)');
      return;
    }
    if (isNaN(numStock) || numStock < 0) {
      setError('Please enter a valid stock quantity (0 or greater)');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const productRef = doc(db, 'products', draft.id);
      const cleanShortcut = shortcutCode.trim();
      const updatedFields: Partial<Product> = {
        name: name.trim(),
        price: numPrice,
        pricePerKg: sellBy === 'weight' ? numPrice : undefined,
        costPrice: numCost,
        stockQuantity: numStock,
        category: category.trim() || 'General',
        barcode: barcode.trim(),
        shortcutCode: cleanShortcut || undefined,
        serialNumber: cleanShortcut || orig.serialNumber || '1001',
        sellBy: sellBy,
        unitType: unitType as any,
        discountActive: discountActive,
        discountType: discountType,
        discountValue: discountActive ? numDiscountVal : 0,
        updatedAt: new Date().toISOString()
      };

      await updateDoc(productRef, cleanFirestoreData(updatedFields));
      playScanSuccessBeep();
      setSaved(true);

      const completeUpdatedProduct: Product = {
        ...orig,
        ...updatedFields
      } as Product;

      if (onSavedSuccess) {
        onSavedSuccess(completeUpdatedProduct);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to update product in database');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mt-3 bg-white rounded-2xl border-2 border-orange-200/80 shadow-md overflow-hidden text-slate-800 transition-all">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-orange-600 text-white">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
          </div>
          <div>
            <div className="text-xs font-black tracking-wide flex items-center gap-1.5">
              <span>AI Product Editor</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] bg-orange-500/20 text-orange-300 border border-orange-500/30">
                Live Sync
              </span>
            </div>
            <div className="text-[10px] text-slate-300 font-mono">
              ID: {draft.id.slice(0, 14)}... • Barcode: {orig.barcode || 'N/A'}
            </div>
          </div>
        </div>

        {saved ? (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
            <Check className="w-3 h-3 text-emerald-400" /> Saved
          </span>
        ) : (
          <button
            type="button"
            onClick={handleResetToOriginal}
            title="Reset changes to original product"
            className="text-[10px] text-slate-400 hover:text-slate-200 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-700 transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        )}
      </div>

      {/* AI Changes Highlight Notice (if detected by query) */}
      {draft.changesSummary && draft.changesSummary.length > 0 && !saved && (
        <div className="bg-amber-50 border-b border-amber-200 px-3.5 py-2 text-[11px] text-amber-900 flex flex-wrap items-center gap-2">
          <span className="font-extrabold flex items-center gap-1 text-amber-800">
            <Sparkles className="w-3 h-3 text-orange-600" /> AI Parsed Updates:
          </span>
          {draft.changesSummary.map((c, i) => (
            <span key={i} className="inline-flex items-center gap-1 bg-white px-2 py-0.5 rounded-md border border-amber-300 font-medium">
              <strong className="text-slate-700">{c.label}:</strong>
              <span className="line-through text-slate-400">{c.from}</span>
              <ArrowRight className="w-2.5 h-2.5 text-amber-700" />
              <strong className="text-orange-700">{c.to}</strong>
            </span>
          ))}
        </div>
      )}

      {/* Form Fields */}
      <div className="p-3.5 space-y-3 text-xs">
        {/* Row 1: Product Name */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
            Product Name {nameChanged && <span className="text-orange-600 font-bold">• Edited</span>}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
            disabled={isSaving}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-bold text-slate-900 bg-slate-50/50"
            placeholder="e.g. Fresh Whole Milk 1 Liter"
          />
        </div>

        {/* Row 2: Price and Cost Price (with live Margin calculation) */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* Selling Price */}
          <div className="bg-orange-50/60 p-2.5 rounded-xl border border-orange-200">
            <div className="flex items-center justify-between text-[10px] font-bold text-orange-900 uppercase mb-1">
              <span>Retail Price (Rs.)</span>
              {priceChanged && <span className="text-orange-600">• Was {orig.price}</span>}
            </div>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-orange-700 font-bold text-xs">Rs.</span>
              <input
                type="number"
                step="any"
                value={price}
                onChange={(e) => {
                  setPrice(e.target.value);
                  setSaved(false);
                }}
                disabled={isSaving}
                className="w-full pl-9 pr-2 py-1.5 rounded-lg border border-orange-300 font-black text-orange-800 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
            <div className="text-[10px] text-orange-700 mt-1 font-semibold flex items-center justify-between">
              <span>Rate: Rs. {numPrice.toFixed(2)}</span>
              <span className="text-emerald-700 font-bold">+{marginPercent.toFixed(0)}% Margin</span>
            </div>
          </div>

          {/* Wholesale Cost Price */}
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-600 uppercase mb-1">
              <span>Cost Price (Rs.)</span>
              {costChanged && <span className="text-orange-600">• Was {orig.costPrice || 0}</span>}
            </div>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-xs">Rs.</span>
              <input
                type="number"
                step="any"
                value={costPrice}
                onChange={(e) => {
                  setCostPrice(e.target.value);
                  setSaved(false);
                }}
                disabled={isSaving}
                className="w-full pl-9 pr-2 py-1.5 rounded-lg border border-slate-300 font-bold text-slate-800 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
            <div className="text-[10px] text-slate-500 mt-1 font-medium">
              Profit / Unit: <strong className={unitProfit >= 0 ? 'text-emerald-700 font-mono' : 'text-red-700 font-mono'}>Rs. {unitProfit.toFixed(2)}</strong>
            </div>
          </div>
        </div>

        {/* Row 3: Stock Quantity with Quick Adjustment Badges */}
        <div className="bg-blue-50/50 p-2.5 rounded-xl border border-blue-200/80">
          <div className="flex items-center justify-between text-[10px] font-bold text-blue-900 uppercase mb-1">
            <div className="flex items-center gap-1">
              <Boxes className="w-3 h-3 text-blue-600" />
              <span>Available Stock ({sellBy === 'weight' ? 'kg' : 'units'})</span>
            </div>
            {stockChanged && <span className="text-orange-600 font-bold">• Was {orig.stockQuantity}</span>}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="number"
              step="any"
              value={stockQuantity}
              onChange={(e) => {
                setStockQuantity(e.target.value);
                setSaved(false);
              }}
              disabled={isSaving}
              className="w-32 px-2.5 py-1.5 rounded-lg border border-blue-300 font-black text-blue-900 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            
            {/* Quick Adjustment Badges */}
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => handleQuickStockAdjust(5)}
                disabled={isSaving}
                className="px-2 py-1 bg-white hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-md text-[10px] font-bold transition-colors cursor-pointer"
              >
                +5
              </button>
              <button
                type="button"
                onClick={() => handleQuickStockAdjust(10)}
                disabled={isSaving}
                className="px-2 py-1 bg-white hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-md text-[10px] font-bold transition-colors cursor-pointer"
              >
                +10
              </button>
              <button
                type="button"
                onClick={() => handleQuickStockAdjust(50)}
                disabled={isSaving}
                className="px-2 py-1 bg-white hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-md text-[10px] font-bold transition-colors cursor-pointer"
              >
                +50
              </button>
              <button
                type="button"
                onClick={() => setStockQuantity(0)}
                disabled={isSaving}
                className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-md text-[10px] font-bold transition-colors cursor-pointer"
              >
                Set to 0
              </button>
            </div>
          </div>
        </div>

        {/* Row 4: Barcode, 4-Digit Shortcut & Category */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
            Barcode (Full Barcode) {barcodeChanged && <span className="text-orange-600">• Edited</span>}
          </label>
          <input
            type="text"
            maxLength={50}
            value={barcode}
            placeholder="Full Barcode"
            onChange={(e) => {
              setBarcode(e.target.value);
              setSaved(false);
            }}
            disabled={isSaving}
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-mono font-bold text-slate-800 bg-white"
          />
        </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-700">
                4-Digit POS Code {shortcutChanged && <span className="text-orange-600">• Edited</span>}
              </label>
              <button
                type="button"
                onClick={handleGenerateShortcut}
                title="Generate new 4-digit code"
                className="text-[10px] text-amber-600 hover:text-amber-800 font-bold flex items-center gap-0.5"
              >
                <Wand2 className="w-2.5 h-2.5" /> Auto
              </button>
            </div>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-amber-600 font-mono font-bold text-xs">#</span>
              <input
                type="text"
                maxLength={4}
                value={shortcutCode}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setShortcutCode(cleaned);
                  setSaved(false);
                }}
                disabled={isSaving}
                placeholder="1001"
                className="w-full pl-6 pr-2 py-1.5 rounded-lg border border-amber-300 font-mono font-black text-amber-900 text-xs bg-amber-50/50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Category
            </label>
            <input
              type="text"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setSaved(false);
              }}
              disabled={isSaving}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-800 bg-white"
            />
          </div>
        </div>

        {/* Promotional Discount Section */}
        <div className="bg-rose-50/50 p-2.5 rounded-xl border border-rose-200/70 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={discountActive}
                onChange={(e) => {
                  setDiscountActive(e.target.checked);
                  setSaved(false);
                }}
                disabled={isSaving}
                className="w-3.5 h-3.5 text-rose-600 rounded border-slate-300 focus:ring-rose-500 cursor-pointer"
              />
              <span className="flex items-center gap-1">
                <Percent className="w-3 h-3 text-rose-600" />
                <span>Promotional Discount</span>
              </span>
            </label>
            {discountActive && (
              <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-rose-200 text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setDiscountType('percentage');
                    setSaved(false);
                  }}
                  className={`px-2 py-0.5 rounded ${discountType === 'percentage' ? 'bg-rose-600 text-white' : 'text-slate-600'}`}
                >
                  % Off
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDiscountType('fixed');
                    setSaved(false);
                  }}
                  className={`px-2 py-0.5 rounded ${discountType === 'fixed' ? 'bg-rose-600 text-white' : 'text-slate-600'}`}
                >
                  Flat Rs.
                </button>
              </div>
            )}
          </div>

          {discountActive && (
            <div className="flex items-center gap-2 pt-1">
              <div className="relative flex-1">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-rose-500">
                  {discountType === 'percentage' ? '%' : 'Rs.'}
                </span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  max={discountType === 'percentage' ? 95 : numPrice}
                  placeholder={discountType === 'percentage' ? '10' : '50'}
                  value={discountValue}
                  onChange={(e) => {
                    setDiscountValue(e.target.value);
                    setSaved(false);
                  }}
                  disabled={isSaving}
                  className="w-full pl-8 pr-2 py-1 rounded-lg border border-rose-300 font-mono font-bold text-rose-800 text-xs bg-white"
                />
              </div>

              <div className="text-[11px] font-bold text-rose-900 bg-white px-2.5 py-1 rounded-lg border border-rose-200 font-mono shrink-0">
                Pays: Rs. {effectiveFinalPrice.toFixed(2)}
              </div>
            </div>
          )}
        </div>

        {/* Error message if any */}
        {error && (
          <div className="p-2 rounded-lg bg-red-50 text-red-700 text-[11px] font-semibold flex items-center gap-1.5 border border-red-200">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Success Banner */}
        {saved && (
          <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-bold flex items-center justify-between border border-emerald-200">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Product successfully updated in Firestore & live in POS!</span>
            </div>
            <button
              type="button"
              onClick={() => setSaved(false)}
              className="text-[10px] text-emerald-700 underline font-semibold hover:text-emerald-900"
            >
              Edit Again
            </button>
          </div>
        )}

        {/* Save Action Buttons */}
        {!saved && (
          <div className="pt-1 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleResetToOriginal}
              disabled={isSaving}
              className="px-3 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-bold transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSaveToFirestore}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Saving to Store...
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  Apply & Save Changes to Store
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
