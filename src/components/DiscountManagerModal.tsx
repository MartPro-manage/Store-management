import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Percent, 
  Coins, 
  Search, 
  CheckCircle2, 
  X, 
  Tag, 
  Trash2, 
  Sparkles, 
  Check, 
  AlertCircle,
  TrendingDown,
  Layers,
  ArrowRight,
  Filter,
  Calendar,
  Clock
} from 'lucide-react';
import { Product, Store } from '../types';
import { db, doc, updateDoc, writeBatch, cleanFirestoreData } from '../lib/firebase';
import { getEffectiveProductPrice, getProductDiscountInfo, formatShortDate, checkDiscountDateValidity } from '../utils/discountUtils';

interface DiscountManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  store: Store;
  onRefresh?: () => void;
}

export const DiscountManagerModal: React.FC<DiscountManagerModalProps> = ({
  isOpen,
  onClose,
  products,
  store,
  onRefresh
}) => {
  const [activeTab, setActiveTab] = useState<'apply' | 'active_discounts'>('apply');
  const [targetScope, setTargetScope] = useState<'all' | 'selected'>('selected');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState<number | ''>(10);
  
  // Date limit controls
  const getTodayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const [discountStartDate, setDiscountStartDate] = useState<string>(getTodayISO());
  const [discountEndDate, setDiscountEndDate] = useState<string>('');
  const [hasDateLimit, setHasDateLimit] = useState<boolean>(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isConfirmClearAllOpen, setIsConfirmClearAllOpen] = useState(false);

  const curr = store?.currencySymbol || 'Rs.';

  // Quick Date Range Presets Helper
  const applyDatePreset = (days: number | 'today' | 'end_month' | 'none') => {
    const today = new Date();
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

  // All distinct categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.category) set.add(p.category);
    });
    return ['All', ...Array.from(set)];
  }, [products]);

  // Filtered products for selection
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchCat = categoryFilter === 'All' || p.category === categoryFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchQuery = !q || 
        p.name.toLowerCase().includes(q) || 
        (p.barcode && p.barcode.toLowerCase().includes(q)) ||
        (p.shortcutCode && p.shortcutCode.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q));
      return matchCat && matchQuery;
    });
  }, [products, categoryFilter, searchQuery]);

  // Products with active discounts
  const discountedProducts = useMemo(() => {
    return products.filter(p => p.discountActive === true && p.discountValue !== undefined && p.discountValue > 0);
  }, [products]);

  const showStatus = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 4500);
  };

  const handleToggleSelectProduct = (id: string) => {
    setSelectedProductIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectAllFiltered = () => {
    const allFilteredIds = filteredProducts.map(p => p.id);
    const allSelected = allFilteredIds.every(id => selectedProductIds.includes(id));
    if (allSelected) {
      setSelectedProductIds(prev => prev.filter(id => !allFilteredIds.includes(id)));
    } else {
      setSelectedProductIds(prev => Array.from(new Set([...prev, ...allFilteredIds])));
    }
  };

  // Apply discount in bulk (either to ALL or SELECTED products)
  const handleApplyDiscount = async () => {
    const numValue = Number(discountValue);
    if (!discountValue || isNaN(numValue) || numValue <= 0) {
      showStatus('error', 'Please enter a valid discount amount greater than 0.');
      return;
    }

    if (discountType === 'percentage' && numValue > 95) {
      showStatus('error', 'Percentage discount cannot exceed 95%.');
      return;
    }

    const targetList = targetScope === 'all' 
      ? products 
      : products.filter(p => selectedProductIds.includes(p.id));

    if (targetList.length === 0) {
      showStatus('error', 'No products selected. Please select at least one product.');
      return;
    }

    setIsProcessing(true);
    try {
      const finalStartDate = hasDateLimit && discountStartDate ? discountStartDate : undefined;
      const finalEndDate = hasDateLimit && discountEndDate ? discountEndDate : undefined;

      // Use batch writes in chunks of 450 to adhere to Firestore limits
      const chunkSize = 400;
      for (let i = 0; i < targetList.length; i += chunkSize) {
        const chunk = targetList.slice(i, i + chunkSize);
        const batch = writeBatch(db);

        chunk.forEach(prod => {
          const docRef = doc(db, 'products', prod.id);
          batch.update(docRef, cleanFirestoreData({
            discountActive: true,
            discountType: discountType,
            discountValue: numValue,
            discountStartDate: finalStartDate || null,
            discountEndDate: finalEndDate || null,
            updatedAt: new Date().toISOString()
          }));
        });

        await batch.commit();
      }

      const dateLimitInfo = hasDateLimit && finalEndDate
        ? ` (Valid: ${formatShortDate(finalStartDate || getTodayISO())} → ${formatShortDate(finalEndDate)})`
        : ' (Ongoing promotion)';

      showStatus(
        'success',
        `Successfully applied ${numValue}${discountType === 'percentage' ? '%' : ` ${curr}`} discount to ${targetList.length} product${targetList.length > 1 ? 's' : ''}${dateLimitInfo}!`
      );
      if (onRefresh) onRefresh();
      setSelectedProductIds([]);
    } catch (err: any) {
      console.error('Failed to apply discount:', err);
      showStatus('error', 'Failed to update products: ' + (err.message || 'Unknown error'));
    } finally {
      setIsProcessing(false);
    }
  };

  // Remove discount from single product
  const handleRemoveSingleDiscount = async (productId: string, productName: string) => {
    try {
      const docRef = doc(db, 'products', productId);
      await updateDoc(docRef, cleanFirestoreData({
        discountActive: false,
        discountType: 'percentage',
        discountValue: 0,
        discountStartDate: null,
        discountEndDate: null,
        updatedAt: new Date().toISOString()
      }));
      showStatus('success', `Removed discount from "${productName}".`);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.error('Failed to remove discount:', err);
      showStatus('error', 'Failed to remove discount.');
    }
  };

  // Remove all discounts from all products
  const handleClearAllDiscounts = async () => {
    if (discountedProducts.length === 0) return;

    setIsProcessing(true);
    try {
      const chunkSize = 400;
      for (let i = 0; i < discountedProducts.length; i += chunkSize) {
        const chunk = discountedProducts.slice(i, i + chunkSize);
        const batch = writeBatch(db);

        chunk.forEach(prod => {
          const docRef = doc(db, 'products', prod.id);
          batch.update(docRef, cleanFirestoreData({
            discountActive: false,
            discountType: 'percentage',
            discountValue: 0,
            discountStartDate: null,
            discountEndDate: null,
            updatedAt: new Date().toISOString()
          }));
        });

        await batch.commit();
      }

      showStatus('success', `Successfully removed discounts from all ${discountedProducts.length} products.`);
      setIsConfirmClearAllOpen(false);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.error('Failed to clear all discounts:', err);
      showStatus('error', 'Failed to reset discounts.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-4xl w-full p-5 sm:p-7 shadow-2xl relative space-y-6 max-h-[92vh] flex flex-col my-auto overflow-hidden">
        
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl border border-rose-200 shadow-xs">
              <Tag className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                Discounts & Promotions Manager
                {discountedProducts.length > 0 && (
                  <span className="px-2.5 py-0.5 bg-rose-100 text-rose-700 text-xs font-black rounded-full">
                    {discountedProducts.length} Active
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Create percentage or fixed cash discounts for all products or selected catalog items.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* NOTIFICATION MESSAGE */}
        {statusMessage && (
          <div className={`p-3.5 rounded-2xl text-xs font-bold flex items-center gap-2.5 shrink-0 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}>
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* TABS NAVIGATION */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-3 shrink-0">
          <button
            onClick={() => setActiveTab('apply')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'apply'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4" /> Apply New Discount
          </button>
          
          <button
            onClick={() => setActiveTab('active_discounts')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'active_discounts'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Tag className="w-4 h-4" /> Active Discounts List ({discountedProducts.length})
          </button>
        </div>

        {/* TAB 1: APPLY DISCOUNT */}
        {activeTab === 'apply' && (
          <div className="space-y-5 overflow-y-auto overscroll-contain pr-1 custom-scrollbar flex-1">
            
            {/* 1. CHOOSE SCOPE: ALL OR SELECTED */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTargetScope('selected')}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                  targetScope === 'selected'
                    ? 'border-rose-500 bg-rose-50/50 ring-2 ring-rose-500/20 shadow-xs'
                    : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100/60'
                }`}
              >
                <div className={`p-2 rounded-xl shrink-0 ${targetScope === 'selected' ? 'bg-rose-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                  <Filter className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-900">Discount On Selected Products</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">Search and pick specific products from your catalog.</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setTargetScope('all')}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                  targetScope === 'all'
                    ? 'border-rose-500 bg-rose-50/50 ring-2 ring-rose-500/20 shadow-xs'
                    : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100/60'
                }`}
              >
                <div className={`p-2 rounded-xl shrink-0 ${targetScope === 'all' ? 'bg-rose-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-900">Discount On All Products (Storewide)</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">Apply promotional sale across all {products.length} catalog items.</p>
                </div>
              </button>
            </div>

            {/* 2. CHOOSE DISCOUNT TYPE & VALUE */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Discount Configuration
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1.5">Discount Format</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDiscountType('percentage')}
                      className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                        discountType === 'percentage'
                          ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <Percent className="w-4 h-4" /> Percentage (%)
                    </button>

                    <button
                      type="button"
                      onClick={() => setDiscountType('fixed')}
                      className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                        discountType === 'fixed'
                          ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <Coins className="w-4 h-4" /> Fixed Amount ({curr})
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1.5">
                    {discountType === 'percentage' ? 'Discount Percentage (%)' : `Discount Rupees (${curr})`} *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0.1"
                      step={discountType === 'percentage' ? '1' : '0.5'}
                      max={discountType === 'percentage' ? 95 : 100000}
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder={discountType === 'percentage' ? 'e.g. 10 for 10% OFF' : 'e.g. 50 for Rs. 50 OFF'}
                      className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-xs font-extrabold focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10"
                    />
                    <div className="absolute right-3 top-2.5 text-xs font-extrabold text-slate-400">
                      {discountType === 'percentage' ? '%' : curr}
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick presets */}
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">Quick Presets:</span>
                {discountType === 'percentage' ? (
                  [5, 10, 15, 20, 25, 30, 50].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setDiscountValue(val)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                        discountValue === val 
                          ? 'bg-rose-600 text-white' 
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {val}% OFF
                    </button>
                  ))
                ) : (
                  [10, 20, 50, 100, 200, 500].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setDiscountValue(val)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                        discountValue === val 
                          ? 'bg-rose-600 text-white' 
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {curr} {val} OFF
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* 3. TIME LIMIT & SCHEDULE DURATION (FROM DATE TO TO DATE) */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-rose-600" />
                  <span>Discount Time Limit / Validity Period</span>
                </div>
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasDateLimit}
                    onChange={(e) => {
                      setHasDateLimit(e.target.checked);
                      if (e.target.checked && !discountEndDate) {
                        applyDatePreset(7); // Default 7 days
                      }
                    }}
                    className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500 cursor-pointer"
                  />
                  <span>Set Expiration / Date Range</span>
                </label>
              </div>

              {hasDateLimit ? (
                <div className="space-y-3 pt-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>Valid From (Start Date) *</span>
                      </label>
                      <input
                        type="date"
                        value={discountStartDate}
                        onChange={(e) => setDiscountStartDate(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-rose-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-rose-500" />
                        <span>Valid Until (Expiry Date) *</span>
                      </label>
                      <input
                        type="date"
                        min={discountStartDate}
                        value={discountEndDate}
                        onChange={(e) => setDiscountEndDate(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-rose-300 rounded-xl text-xs font-bold text-rose-800 focus:outline-none focus:border-rose-500"
                      />
                    </div>
                  </div>

                  {/* Quick Duration Presets */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">Quick Durations:</span>
                    {[
                      { label: 'Today Only (1 Day)', val: 'today' as const },
                      { label: '3 Days', val: 3 },
                      { label: '1 Week (7 Days)', val: 7 },
                      { label: '15 Days', val: 15 },
                      { label: '1 Month (30 Days)', val: 30 },
                      { label: 'End of Month', val: 'end_month' as const }
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => applyDatePreset(preset.val)}
                        className="px-2 py-1 rounded-lg text-[10px] font-bold bg-white border border-slate-200 text-slate-700 hover:border-rose-300 hover:text-rose-600 transition-all cursor-pointer"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  {discountStartDate && discountEndDate && (
                    <div className="p-2.5 bg-rose-50/80 border border-rose-200 rounded-xl text-xs flex items-center justify-between">
                      <span className="text-rose-950 font-bold flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-rose-600" />
                        Active Period: <strong>{formatShortDate(discountStartDate)}</strong> to <strong>{formatShortDate(discountEndDate)}</strong>
                      </span>
                      <span className="text-[10px] font-black uppercase text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full border border-rose-200">
                        Auto-Expires After {formatShortDate(discountEndDate)}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-2.5 bg-white rounded-xl border border-slate-200 text-[11px] text-slate-500 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Ongoing promotion without end date. Enable checkbox above to limit discounts to specific dates.</span>
                </div>
              )}
            </div>

            {/* 4. PRODUCT SELECTOR (When targetScope === 'selected') */}
            {targetScope === 'selected' && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                  <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                    Search & Choose Products ({selectedProductIds.length} Selected)
                  </div>

                  <button
                    type="button"
                    onClick={handleSelectAllFiltered}
                    className="text-[11px] font-extrabold text-rose-600 hover:text-rose-700 transition-colors cursor-pointer"
                  >
                    {filteredProducts.every(p => selectedProductIds.includes(p.id)) && filteredProducts.length > 0
                      ? 'Deselect All Filtered'
                      : 'Select All Filtered'}
                  </button>
                </div>

                {/* Search & Category Filter */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="sm:col-span-2 relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search product name, barcode, code..."
                      className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 text-xs font-bold focus:outline-none focus:border-rose-500"
                    />
                  </div>

                  <div>
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 text-xs font-bold focus:outline-none focus:border-rose-500"
                    >
                      {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Product List Table / Grid */}
                <div className="max-h-56 overflow-y-auto overscroll-contain border border-slate-200 rounded-xl bg-white divide-y divide-slate-100 custom-scrollbar">
                  {filteredProducts.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400 font-medium">
                      No products found matching your search.
                    </div>
                  ) : (
                    filteredProducts.map(product => {
                      const isSelected = selectedProductIds.includes(product.id);
                      const originalPrice = product.price;
                      const hasActiveDiscount = product.discountActive && product.discountValue;
                      
                      // Calculate what price would be with current draft discount
                      let sampleDiscountAmount = 0;
                      if (discountValue && Number(discountValue) > 0) {
                        if (discountType === 'percentage') {
                          sampleDiscountAmount = (originalPrice * Number(discountValue)) / 100;
                        } else {
                          sampleDiscountAmount = Math.min(originalPrice, Number(discountValue));
                        }
                      }
                      const sampleFinalPrice = Math.max(0, originalPrice - sampleDiscountAmount);

                      return (
                        <div
                          key={product.id}
                          onClick={() => handleToggleSelectProduct(product.id)}
                          className={`p-2.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                            isSelected ? 'bg-rose-50/70' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500"
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-slate-900 truncate flex items-center gap-1.5">
                                <span>{product.name}</span>
                                {product.shortcutCode && (
                                  <span className="px-1.5 py-0.2 bg-slate-100 text-slate-600 font-mono text-[9px] rounded font-bold">
                                    #{product.shortcutCode}
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {product.category} &bull; Barcode: {product.barcode || 'N/A'}
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div className="text-xs font-black text-slate-900 font-mono">
                              {curr} {originalPrice.toFixed(2)}
                            </div>
                            {isSelected && discountValue && Number(discountValue) > 0 && (
                              <div className="text-[10px] font-bold text-rose-600 flex items-center gap-1 justify-end">
                                <TrendingDown className="w-3 h-3" />
                                <span>{curr} {sampleFinalPrice.toFixed(2)}</span>
                              </div>
                            )}
                            {hasActiveDiscount && !isSelected && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded font-extrabold">
                                Active: {product.discountValue}{product.discountType === 'percentage' ? '%' : curr}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* ACTION BUTTON */}
            <div className="pt-2">
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleApplyDiscount}
                className="w-full py-3.5 px-4 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-300 text-white font-black rounded-2xl shadow-md transition-all text-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                {isProcessing ? (
                  <span>Applying Discounts...</span>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>
                      Apply {discountValue}{discountType === 'percentage' ? '%' : ` ${curr}`} Discount to {
                        targetScope === 'all' ? `All (${products.length}) Products` : `${selectedProductIds.length} Selected Products`
                      }
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: ACTIVE DISCOUNTS OVERVIEW */}
        {activeTab === 'active_discounts' && (
          <div className="space-y-4 overflow-y-auto overscroll-contain pr-1 custom-scrollbar flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
              <div>
                <h4 className="text-xs font-black text-slate-900">Active Discounted Products</h4>
                <p className="text-[11px] text-slate-500">
                  Store admin can view all products currently on promotional sale and remove discounts individually or in bulk.
                </p>
              </div>

              {discountedProducts.length > 0 && (
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => setIsConfirmClearAllOpen(true)}
                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-extrabold text-[11px] rounded-xl border border-rose-200 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove All Discounts ({discountedProducts.length})
                </button>
              )}
            </div>

            {discountedProducts.length === 0 ? (
              <div className="p-12 text-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl space-y-3">
                <Tag className="w-8 h-8 text-slate-300 mx-auto" />
                <div className="text-xs font-extrabold text-slate-700">No active discounts right now</div>
                <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                  Click on "Apply New Discount" to run a promotional sale on selected or storewide products.
                </p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600 font-extrabold border-b border-slate-200">
                    <tr>
                      <th className="p-3">Product Name</th>
                      <th className="p-3">Category</th>
                      <th className="p-3 text-right">Original Price</th>
                      <th className="p-3 text-center">Discount</th>
                      <th className="p-3 text-right">Discounted Price</th>
                      <th className="p-3 text-center">Time Limit / Validity</th>
                      <th className="p-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {discountedProducts.map(product => {
                      const discountInfo = getProductDiscountInfo(product);
                      const finalPrice = discountInfo.discountedPrice;
                      const discountBadgeText = product.discountType === 'percentage' 
                        ? `${product.discountValue}% OFF` 
                        : `-${curr} ${product.discountValue}`;

                      return (
                        <tr key={product.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3">
                            <div className="font-bold text-slate-900">{product.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              Code: #{product.shortcutCode || 'N/A'} &bull; Barcode: {product.barcode || 'N/A'}
                            </div>
                          </td>
                          <td className="p-3 text-slate-600 font-medium">
                            {product.category || 'General'}
                          </td>
                          <td className="p-3 text-right font-mono text-slate-500 line-through">
                            {curr} {product.price.toFixed(2)}
                          </td>
                          <td className="p-3 text-center">
                            <span className="px-2 py-0.5 bg-rose-100 text-rose-700 font-black text-[10px] rounded-full inline-flex items-center gap-1">
                              <Tag className="w-3 h-3" /> {discountBadgeText}
                            </span>
                          </td>
                          <td className="p-3 text-right font-black font-mono text-emerald-700 text-xs">
                            {curr} {finalPrice.toFixed(2)}
                          </td>
                          <td className="p-3 text-center">
                            {product.discountEndDate ? (
                              <div className="space-y-0.5">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black inline-flex items-center gap-1 ${
                                  discountInfo.isExpired
                                    ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                    : discountInfo.isUpcoming
                                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                }`}>
                                  <Clock className="w-2.5 h-2.5" />
                                  {discountInfo.dateStatusMessage}
                                </span>
                                <div className="text-[9px] text-slate-400 font-mono">
                                  {formatShortDate(product.discountStartDate || '')} → {formatShortDate(product.discountEndDate)}
                                </div>
                              </div>
                            ) : (
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[10px] font-bold">
                                Ongoing (No Expiry)
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveSingleDiscount(product.id, product.name)}
                              title="Remove discount from this product"
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Confirmation Modal: Remove All Discounts */}
      {isConfirmClearAllOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-scale-up">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto shadow-inner">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-black text-slate-900">Remove All Discounts?</h3>
              <p className="text-xs text-slate-500">
                Are you sure you want to remove active promotional discounts from all <strong className="text-slate-900 font-bold">{discountedProducts.length} products</strong>?
              </p>
              <div className="text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-200 mt-2">
                All products will revert back to their standard original retail prices.
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmClearAllOpen(false)}
                disabled={isProcessing}
                className="w-1/2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearAllDiscounts}
                disabled={isProcessing}
                className="w-1/2 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs transition-colors cursor-pointer shadow-sm disabled:opacity-50"
              >
                {isProcessing ? 'Removing...' : 'Yes, Remove All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
