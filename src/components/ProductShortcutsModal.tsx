import React, { useState, useMemo, useEffect } from 'react';
import { Product } from '../types';
import * as XLSX from 'xlsx';
import { 
  X, 
  Search, 
  Download, 
  FileSpreadsheet,
  Hash, 
  Sparkles, 
  Plus, 
  Check, 
  Layers, 
  Barcode as BarcodeIcon,
  Keyboard,
  RefreshCw,
  Wand2,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { syncMissingShortcutCodesInFirestore } from '../utils/productShortcuts';
import { playScanSuccessBeep } from '../lib/sound';

interface ProductShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onSelectProduct?: (product: Product) => void;
}

export const ProductShortcutsModal: React.FC<ProductShortcutsModalProps> = ({
  isOpen,
  onClose,
  products,
  onSelectProduct
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);

  // Check how many products are missing a 4-digit shortcut code
  const missingCount = useMemo(() => {
    return products.filter(p => !p.shortcutCode || !/^\d{4}$/.test(p.shortcutCode)).length;
  }, [products]);

  // Auto-sync missing codes on opening if any products are missing
  useEffect(() => {
    if (isOpen && missingCount > 0 && !isSyncing) {
      handleSyncAllCodes(true);
    }
  }, [isOpen]);

  const handleSyncAllCodes = async (isAuto = false) => {
    setIsSyncing(true);
    try {
      const updated = await syncMissingShortcutCodesInFirestore(products);
      if (updated > 0) {
        playScanSuccessBeep();
        setSyncStatusMsg(`✨ Successfully assigned unique 4-digit shortcut keys to ${updated} product${updated > 1 ? 's' : ''}!`);
        setTimeout(() => setSyncStatusMsg(null), 4000);
      } else if (!isAuto) {
        setSyncStatusMsg('All products already have unique 4-digit shortcut codes.');
        setTimeout(() => setSyncStatusMsg(null), 3000);
      }
    } catch (e) {
      console.warn('Failed to sync shortcuts:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  // Extract unique categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set).sort();
  }, [products]);

  // Filter products by search term and category
  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return products.filter(p => {
      const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
      if (!matchesCategory) return false;

      if (!term) return true;
      const codeMatch = p.shortcutCode?.toLowerCase().includes(term);
      const nameMatch = p.name?.toLowerCase().includes(term);
      const barcodeMatch = p.barcode?.toLowerCase().includes(term);
      const catMatch = p.category?.toLowerCase().includes(term);
      return codeMatch || nameMatch || barcodeMatch || catMatch;
    });
  }, [products, searchTerm, selectedCategory]);

  // Export shortcuts list as .xlsx (Product Name & Short Code only)
  const handleDownloadXlsx = () => {
    const data = products.map(p => ({
      'Product Name': p.name || '',
      'Short Code': p.shortcutCode || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Product Shortcuts');

    // Auto-fit column widths for crisp reading
    worksheet['!cols'] = [
      { wch: 40 }, // Product Name
      { wch: 18 }  // Short Code
    ];

    XLSX.writeFile(workbook, `Product_Shortcuts_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard?.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 1500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-4 bg-slate-900/75 backdrop-blur-xs overflow-y-auto overscroll-contain">
      <motion.div 
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white w-full max-w-4xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-y-auto overscroll-contain custom-scrollbar border border-slate-200 my-auto"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-slate-50 to-orange-50/40 sticky top-0 bg-white z-10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-600 text-white flex items-center justify-center shadow-md shadow-orange-600/20">
              <Hash className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-900">Product Shortcuts Directory</h2>
                <span className="px-2 py-0.5 rounded-md bg-orange-100 text-orange-800 text-[11px] font-mono font-bold">
                  S + K
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Type the 4-digit code anywhere at the cashier screen to instantly add item to cart
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSyncAllCodes(false)}
              disabled={isSyncing}
              id="sync-shortcuts-btn"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
              title="Assign 4-digit shortcut codes to all products missing one"
            >
              {isSyncing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-700" />
                  <span>Syncing...</span>
                </>
              ) : (
                <>
                  <Wand2 className="w-3.5 h-3.5 text-amber-700" />
                  <span>{missingCount > 0 ? `Assign (${missingCount} missing)` : 'Sync 4-Digit Codes'}</span>
                </>
              )}
            </button>
            <button
              onClick={handleDownloadXlsx}
              id="download-shortcuts-btn"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold transition-all cursor-pointer shadow-2xs"
              title="Download shortcuts list as .xlsx (Product Name & Short Code)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              <span className="hidden sm:inline">Download .xlsx</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sync Status Banner */}
        {syncStatusMsg && (
          <div className="bg-amber-100 border-b border-amber-200 px-4 py-2 text-xs font-bold text-amber-900 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-amber-700 shrink-0" />
            <span>{syncStatusMsg}</span>
          </div>
        )}

        {/* Search & Category Filter */}
        <div className="p-4 border-b border-slate-100 bg-white flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by 4-digit code (e.g. 1001), name, or barcode..."
              className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-hidden focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              autoFocus
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All ({products.length})
            </button>
            {categories.slice(0, 5).map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${
                  selectedCategory === cat
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Shortcuts Grid / Table */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {filteredProducts.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Search className="w-10 h-10 mx-auto mb-2 text-slate-300" />
              <p className="font-bold text-slate-600 text-sm">No products found matching your search</p>
              <p className="text-xs text-slate-400 mt-1">Try a different 4-digit code or name</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {filteredProducts.map((product) => {
                const code = product.shortcutCode || '----';
                return (
                  <div
                    key={product.id}
                    className="p-3 rounded-xl border border-slate-200 hover:border-orange-300 hover:shadow-xs transition-all bg-white flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopyCode(code)}
                          title="Click to copy shortcut code"
                          className="px-2 py-0.5 rounded-lg bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 font-mono font-black text-xs tracking-wider cursor-pointer transition-colors"
                        >
                          #{code}
                        </button>
                        <span className="text-[11px] text-slate-400 truncate">{product.category || 'General'}</span>
                      </div>
                      <p className="font-bold text-slate-800 text-xs sm:text-sm truncate mt-1" title={product.name}>
                        {product.name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                        <span className="font-bold text-emerald-700">Rs. {Number(product.price || 0).toFixed(2)}</span>
                        <span>•</span>
                        <span className={product.stockQuantity <= 5 ? 'text-amber-600 font-bold' : ''}>
                          Stock: {product.stockQuantity || 0}
                        </span>
                      </div>
                    </div>

                    {onSelectProduct ? (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectProduct(product);
                          onClose();
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs cursor-pointer flex items-center gap-1 shadow-2xs shrink-0"
                        title="Add to active cart"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleCopyCode(code)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-orange-600 hover:bg-orange-50 transition-colors cursor-pointer shrink-0"
                        title="Copy code"
                      >
                        {copiedCode === code ? (
                          <Check className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <span className="text-[10px] font-bold text-slate-400">Copy</span>
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 sm:p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-orange-600" />
            <span>Shortkeys: <strong>H+D</strong> Hold Bill • <strong>A+S</strong> Held Receipts • <strong>S+K</strong> Shortcuts</span>
          </div>
          <span className="font-bold text-slate-700">Showing {filteredProducts.length} items</span>
        </div>
      </motion.div>
    </div>
  );
};
