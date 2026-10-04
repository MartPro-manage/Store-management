import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Upload, 
  FileSpreadsheet, 
  Table, 
  Plus, 
  Trash2, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  Barcode as BarcodeIcon, 
  Download, 
  RefreshCw, 
  ArrowRight,
  Boxes,
  Layers,
  Check,
  FolderUp,
  Percent,
  DollarSign,
  Coins
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Product, Store } from '../types';
import { BatchProductRow, parseExcelProductFile, generateRandomBarcode } from '../lib/excelParser';
import { getAllCategories, saveNewCategoryToStore, DEFAULT_PRESET_CATEGORIES } from '../lib/categories';
import { playScanSuccessBeep } from '../lib/sound';
import { ScannableBarcodePreview } from './ScannableBarcodePreview';
import { db, doc, setDoc, cleanFirestoreData } from '../lib/firebase';
import { generateNextShortcutCode } from '../utils/productShortcuts';

export interface SpreadsheetRowItem {
  id: string;
  name: string;
  costPrice: number | '';
  margin: number | '';
  price: number | '';
  quantity: number | '';
  category: string;
  barcode: string;
}

interface ExcelManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  store: Store;
  existingProducts?: Product[];
  onSendToAi: (parsedProducts: BatchProductRow[]) => void;
  onDirectRegisterSuccess?: (count: number) => void;
  onProductsSaved?: (count?: number) => void;
  onOpenBatchModal?: () => void;
}

const DEFAULT_EXISTING_PRODUCTS: Product[] = [];

export const ExcelManagerModal: React.FC<ExcelManagerModalProps> = ({
  isOpen,
  onClose,
  store,
  existingProducts = DEFAULT_EXISTING_PRODUCTS,
  onSendToAi,
  onDirectRegisterSuccess,
  onProductsSaved,
  onOpenBatchModal
}) => {
  // Step/Mode: 'choose_option' | 'create_now'
  const [activeTab, setActiveTab] = useState<'choose_option' | 'create_now'>('choose_option');
  
  // Categories
  const [categoriesList, setCategoriesList] = useState<string[]>([]);
  const [newCatInput, setNewCatInput] = useState('');
  const [isAddingNewCat, setIsAddingNewCat] = useState(false);
  const [newCatRowTargetIndex, setNewCatRowTargetIndex] = useState<number | null>(null);

  // Rows for In-App Spreadsheet Creator - costPrice, margin %, price, quantity are supported
  const [rows, setRows] = useState<SpreadsheetRowItem[]>([
    { id: 'row-1', name: '', costPrice: '', margin: '', price: '', quantity: '', category: 'Grain', barcode: '' },
    { id: 'row-2', name: '', costPrice: '', margin: '', price: '', quantity: '', category: 'Oil', barcode: '' },
    { id: 'row-3', name: '', costPrice: '', margin: '', price: '', quantity: '', category: 'Biscuit', barcode: '' },
    { id: 'row-4', name: '', costPrice: '', margin: '', price: '', quantity: '', category: 'Ghee', barcode: '' },
    { id: 'row-5', name: '', costPrice: '', margin: '', price: '', quantity: '', category: 'Tea', barcode: '' },
  ]);

  // Uploading status
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingDirectly, setIsSavingDirectly] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Direct Save to Firestore Stock with Automatic Barcode Matching & Stock Increments
  const handleSaveDirectToStock = async () => {
    setHasAttemptedSubmit(true);
    setUploadError(null);

    const rowsWithData = rows.filter(r => 
      r.name.trim().length > 0 || 
      r.costPrice !== '' ||
      r.price !== '' || 
      r.quantity !== '' || 
      r.barcode.trim().length > 0
    );

    if (rowsWithData.length === 0) {
      setUploadError('Please fill in product details (Name, Cost Price, Selling Price, and Quantity) for at least one item before saving.');
      return;
    }

    const incompleteRows = rowsWithData.filter(r => {
      const hasName = r.name.trim().length > 0;
      const numCost = typeof r.costPrice === 'number' ? r.costPrice : parseFloat(String(r.costPrice));
      const hasValidCost = !isNaN(numCost) && numCost > 0;
      const numPrice = typeof r.price === 'number' ? r.price : parseFloat(String(r.price));
      const hasValidPrice = !isNaN(numPrice) && numPrice > 0;
      const numQty = typeof r.quantity === 'number' ? r.quantity : parseFloat(String(r.quantity));
      const hasValidQty = r.quantity !== '' && !isNaN(numQty) && numQty >= 0;
      
      return !hasName || !hasValidCost || !hasValidPrice || !hasValidQty;
    });

    if (incompleteRows.length > 0) {
      setUploadError(`Cannot proceed: ${incompleteRows.length} product row(s) are missing required fields. Cost Price (> 0) and Selling Price (> 0) are compulsory for every row.`);
      return;
    }

    setIsSavingDirectly(true);
    try {
      let savedCount = 0;
      const assignedPool = [...(existingProducts || [])];

      for (const r of rowsWithData) {
        const barcodeTrimmed = r.barcode ? r.barcode.trim() : '';
        const pCost = typeof r.costPrice === 'number' ? r.costPrice : parseFloat(String(r.costPrice)) || 0;
        const pPrice = typeof r.price === 'number' ? r.price : parseFloat(String(r.price)) || 0;
        const pQty = typeof r.quantity === 'number' ? r.quantity : parseFloat(String(r.quantity)) || 0;
        const rowCategory = r.category.trim() || 'General';

        // Match existing product in store database by barcode
        const existing = barcodeTrimmed 
          ? (existingProducts || []).find(prod => prod.barcode && prod.barcode.trim().toLowerCase() === barcodeTrimmed.toLowerCase())
          : undefined;

        const prodId = existing ? existing.id : `prod_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const shortcutCode = existing?.shortcutCode || generateNextShortcutCode(assignedPool);

        if (!existing) {
          assignedPool.push({ shortcutCode } as Product);
        }

        const updatedQty = existing ? (existing.stockQuantity || 0) + pQty : pQty;

        await setDoc(doc(db, 'products', prodId), cleanFirestoreData({
          id: prodId,
          storeId: store.id,
          barcode: barcodeTrimmed || (existing?.barcode || ''),
          serialNumber: barcodeTrimmed || (existing?.serialNumber || shortcutCode),
          shortcutCode: shortcutCode,
          name: r.name.trim() || existing?.name || 'Unnamed Product',
          category: rowCategory || existing?.category || 'General',
          sellBy: 'unit',
          unitType: 'piece',
          price: pPrice,
          costPrice: pCost,
          stockQuantity: updatedQty,
          minStockLevel: existing?.minStockLevel || 5,
          createdAt: existing?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }), { merge: true });

        savedCount++;
      }

      playScanSuccessBeep();
      onClose();
      if (onProductsSaved) {
        onProductsSaved(savedCount);
      }
      if (onDirectRegisterSuccess) {
        onDirectRegisterSuccess(savedCount);
      }
    } catch (err: any) {
      setUploadError(`Failed to save products to database: ${err?.message || 'Firestore write error'}`);
    } finally {
      setIsSavingDirectly(false);
    }
  };
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // References to input elements for precise Enter key navigation
  const cellRefs = useRef<{ [key: string]: HTMLInputElement | HTMLSelectElement | null }>({});

  useEffect(() => {
    if (isOpen) {
      setCategoriesList(getAllCategories(store, existingProducts));
      setUploadError(null);
      setHasAttemptedSubmit(false);
    }
  }, [isOpen, store?.id, existingProducts.length]);

  if (!isOpen) return null;

  // Add 1 empty row
  const handleAddRow = () => {
    const newId = `row-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const defaultCat = categoriesList[0] || 'General';
    setRows(prev => [
      ...prev,
      { id: newId, name: '', costPrice: '', margin: '', price: '', quantity: '', category: defaultCat, barcode: '' }
    ]);
  };

  // Add 5 empty rows
  const handleAdd5Rows = () => {
    const defaultCat = categoriesList[0] || 'General';
    const newRows: SpreadsheetRowItem[] = [];
    for (let i = 0; i < 5; i++) {
      newRows.push({
        id: `row-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        name: '',
        costPrice: '',
        margin: '',
        price: '',
        quantity: '',
        category: defaultCat,
        barcode: ''
      });
    }
    setRows(prev => [...prev, ...newRows]);
  };

  // Delete row
  const handleDeleteRow = (id: string) => {
    if (rows.length <= 1) {
      setRows([{ id: 'row-1', name: '', costPrice: '', margin: '', price: '', quantity: '', category: 'General', barcode: '' }]);
      return;
    }
    setRows(prev => prev.filter(r => r.id !== id));
  };

  // Update cell with automatic Cost Price / Margin % / Sell Price calculation
  const handleUpdateCell = (index: number, field: keyof SpreadsheetRowItem, value: any) => {
    setRows(prev => {
      const updated = [...prev];
      const row = { ...updated[index], [field]: value };

      if (field === 'costPrice') {
        const cost = typeof value === 'number' ? value : parseFloat(String(value));
        const margin = typeof row.margin === 'number' ? row.margin : parseFloat(String(row.margin));
        if (!isNaN(cost) && cost > 0 && !isNaN(margin)) {
          row.price = Math.round(cost * (1 + margin / 100) * 100) / 100;
        } else if (!isNaN(cost) && cost > 0) {
          const sell = typeof row.price === 'number' ? row.price : parseFloat(String(row.price));
          if (!isNaN(sell) && sell > 0) {
            row.margin = Math.round(((sell - cost) / cost) * 100 * 10) / 10;
          }
        }
      } else if (field === 'margin') {
        const margin = typeof value === 'number' ? value : parseFloat(String(value));
        const cost = typeof row.costPrice === 'number' ? row.costPrice : parseFloat(String(row.costPrice));
        if (!isNaN(cost) && cost > 0 && !isNaN(margin)) {
          row.price = Math.round(cost * (1 + margin / 100) * 100) / 100;
        }
      } else if (field === 'price') {
        const sell = typeof value === 'number' ? value : parseFloat(String(value));
        const cost = typeof row.costPrice === 'number' ? row.costPrice : parseFloat(String(row.costPrice));
        if (!isNaN(cost) && cost > 0 && !isNaN(sell)) {
          row.margin = Math.round(((sell - cost) / cost) * 100 * 10) / 10;
        }
      }

      updated[index] = row;
      return updated;
    });

    if (uploadError) {
      setUploadError(null);
    }
  };

  // 4-Way Arrow Key & Enter Navigation for Excel spreadsheet cells
  const columnOrder: Array<'name' | 'costPrice' | 'margin' | 'price' | 'quantity' | 'category' | 'barcode'> = [
    'name', 'costPrice', 'margin', 'price', 'quantity', 'category', 'barcode'
  ];

  const handleCellKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    rowIndex: number,
    fieldName: 'name' | 'costPrice' | 'margin' | 'price' | 'quantity' | 'category' | 'barcode'
  ) => {
    const target = e.currentTarget;
    const isInput = target.tagName === 'INPUT';
    const inputEl = isInput ? (target as HTMLInputElement) : null;
    const colIdx = columnOrder.indexOf(fieldName);

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (rowIndex > 0) {
        cellRefs.current[`${rowIndex - 1}-${fieldName}`]?.focus();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (rowIndex < rows.length - 1) {
        cellRefs.current[`${rowIndex + 1}-${fieldName}`]?.focus();
      } else {
        const newId = `row-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const defaultCat = rows[rowIndex]?.category || 'General';
        setRows(prev => [
          ...prev,
          { id: newId, name: '', costPrice: '', margin: '', price: '', quantity: '', category: defaultCat, barcode: '' }
        ]);
        setTimeout(() => {
          cellRefs.current[`${rowIndex + 1}-${fieldName}`]?.focus();
        }, 50);
      }
      return;
    }

    if (e.key === 'ArrowLeft') {
      const atStart = !inputEl || (inputEl.selectionStart === 0 && inputEl.selectionEnd === 0);
      if (atStart && colIdx > 0) {
        e.preventDefault();
        const prevCol = columnOrder[colIdx - 1];
        cellRefs.current[`${rowIndex}-${prevCol}`]?.focus();
        return;
      }
    }

    if (e.key === 'ArrowRight') {
      const atEnd = !inputEl || (inputEl.selectionStart === inputEl.value.length);
      if (atEnd && colIdx < columnOrder.length - 1) {
        e.preventDefault();
        const nextCol = columnOrder[colIdx + 1];
        cellRefs.current[`${rowIndex}-${nextCol}`]?.focus();
        return;
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const nextRowIndex = rowIndex + 1;

      if (nextRowIndex < rows.length) {
        setTimeout(() => {
          cellRefs.current[`${nextRowIndex}-name`]?.focus();
        }, 10);
      } else {
        const newId = `row-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const defaultCat = rows[rowIndex]?.category || 'General';
        setRows(prev => [
          ...prev,
          { id: newId, name: '', costPrice: '', margin: '', price: '', quantity: '', category: defaultCat, barcode: '' }
        ]);

        setTimeout(() => {
          cellRefs.current[`${nextRowIndex}-name`]?.focus();
        }, 50);
      }
    }
  };

  // Handle saving new custom category
  const handleConfirmNewCategory = async () => {
    if (!newCatInput.trim()) {
      setIsAddingNewCat(false);
      return;
    }
    const trimmed = newCatInput.trim();
    await saveNewCategoryToStore(store.id, store.customCategories || [], trimmed);
    setCategoriesList(prev => Array.from(new Set([...prev, trimmed])));

    if (newCatRowTargetIndex !== null && rows[newCatRowTargetIndex]) {
      handleUpdateCell(newCatRowTargetIndex, 'category', trimmed);
    }
    setNewCatInput('');
    setIsAddingNewCat(false);
    setNewCatRowTargetIndex(null);
  };

  // Handle Option 1: File Upload from Device
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const parsed = await parseExcelProductFile(file);
      if (!parsed || parsed.length === 0) {
        throw new Error('No valid products found in the file.');
      }

      playScanSuccessBeep();

      const convertedRows: SpreadsheetRowItem[] = parsed.map((p, idx) => {
        const pCost = p.costPrice || (p.price ? Math.round(p.price * 0.8) : '');
        const pSell = p.price || '';
        const pMargin = (pCost && pSell) ? Math.round(((Number(pSell) - Number(pCost)) / Number(pCost)) * 100 * 10) / 10 : 20;

        return {
          id: `upload-${Date.now()}-${idx}`,
          name: p.name,
          costPrice: pCost,
          margin: pMargin,
          price: pSell,
          quantity: p.quantity ?? 10,
          category: p.category || 'General',
          barcode: p.barcode ? p.barcode.trim() : ''
        };
      });

      setRows(convertedRows);
      setActiveTab('create_now');
    } catch (err: any) {
      setUploadError(err.message || 'Failed to parse Excel file. Ensure it has product names, cost prices, and sell prices.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Handle "Send to AI" button click with MANDATORY COST & SELL PRICE VALIDATION
  const handleSendToAi = () => {
    setHasAttemptedSubmit(true);
    setUploadError(null);

    const rowsWithData = rows.filter(r => 
      r.name.trim().length > 0 || 
      r.costPrice !== '' ||
      r.price !== '' || 
      r.quantity !== '' || 
      r.barcode.trim().length > 0
    );

    if (rowsWithData.length === 0) {
      setUploadError('Please fill in product details (Name, Cost Price, Selling Price, and Quantity) for at least one item before proceeding.');
      return;
    }

    // MANDATORY REQUIREMENT: BOTH Cost Price (>0) and Selling Price (>0) are compulsory in spreadsheet!
    const incompleteRows = rowsWithData.filter(r => {
      const hasName = r.name.trim().length > 0;
      const numCost = typeof r.costPrice === 'number' ? r.costPrice : parseFloat(String(r.costPrice));
      const hasValidCost = !isNaN(numCost) && numCost > 0;
      const numPrice = typeof r.price === 'number' ? r.price : parseFloat(String(r.price));
      const hasValidPrice = !isNaN(numPrice) && numPrice > 0;
      const numQty = typeof r.quantity === 'number' ? r.quantity : parseFloat(String(r.quantity));
      const hasValidQty = r.quantity !== '' && !isNaN(numQty) && numQty >= 0;
      
      return !hasName || !hasValidCost || !hasValidPrice || !hasValidQty;
    });

    if (incompleteRows.length > 0) {
      setUploadError(`Cannot proceed: ${incompleteRows.length} product row(s) are missing required fields. Adding BOTH Cost Price (> 0) and Selling Price (> 0) is mandatory for every item in the spreadsheet.`);
      return;
    }

    const batchProducts: BatchProductRow[] = rowsWithData.map((r, idx) => {
      const pCost = typeof r.costPrice === 'number' ? r.costPrice : parseFloat(String(r.costPrice)) || 0;
      const pPrice = typeof r.price === 'number' ? r.price : parseFloat(String(r.price)) || 0;
      const pQty = typeof r.quantity === 'number' ? r.quantity : parseFloat(String(r.quantity)) || 0;

      const rowCategory = r.category.trim() || 'General';

      // Auto persist new category to store customCategories in Firestore
      if (rowCategory && store?.id) {
        saveNewCategoryToStore(store.id, store.customCategories || [], rowCategory).catch(() => {});
      }

      return {
        id: r.id || `batch-${idx}`,
        name: r.name.trim(),
        costPrice: pCost,
        price: pPrice,
        category: rowCategory,
        barcode: r.barcode.trim(),
        sellBy: 'unit',
        unitType: 'piece',
        quantity: pQty
      };
    });

    playScanSuccessBeep();
    onClose();
    onSendToAi(batchProducts);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-white w-full max-w-6xl rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col h-[98dvh] max-h-[98dvh] my-auto">
        
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-3.5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-bold">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-orange-600 text-white">
                  Excel & Spreadsheet Manager
                </span>
                <span className="text-xs text-slate-400 font-mono hidden sm:inline">{store.name}</span>
              </div>
              <h2 className="text-sm sm:text-lg font-black text-white tracking-tight">
                Bulk Products & In-App Spreadsheet
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === 'create_now' && (
              <button
                type="button"
                onClick={() => setActiveTab('choose_option')}
                className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition-colors cursor-pointer"
              >
                ← Back
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ERROR NOTIFICATION BANNER */}
        {uploadError && (
          <div className="p-3 bg-red-50 border-b border-red-200 text-red-700 text-xs font-bold flex items-center justify-between px-4 sm:px-6 shrink-0">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{uploadError}</span>
            </div>
            <button onClick={() => setUploadError(null)} className="text-red-500 hover:text-red-800 text-xs">
              Dismiss
            </button>
          </div>
        )}

        {/* SCREEN 1: CHOICE SCREEN */}
        {activeTab === 'choose_option' && (
          <div className="p-4 sm:p-10 flex-1 overflow-y-auto space-y-6">
            <div className="text-center max-w-xl mx-auto space-y-1.5">
              <h3 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight">
                How would you like to add your products?
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 font-medium">
                Choose one of the two options below to import from a file or create in our interactive live spreadsheet:
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileUpload}
              className="hidden"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto pt-2">
              
              {/* OPTION 1: UPLOAD FROM DEVICE */}
              <motion.button
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.99 }}
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="p-5 sm:p-6 rounded-3xl border-2 border-slate-200 hover:border-orange-500 bg-white hover:bg-orange-50/40 text-left transition-all shadow-xs hover:shadow-lg group flex flex-col justify-between cursor-pointer"
              >
                <div className="space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold shadow-inner group-hover:bg-orange-600 group-hover:text-white transition-all">
                    <FolderUp className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-orange-600 block mb-1">
                      Option 1
                    </span>
                    <h4 className="text-base sm:text-lg font-black text-slate-900 group-hover:text-orange-950">
                      Upload from device
                    </h4>
                    <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                      Upload an existing Excel (.xlsx, .xls) or CSV spreadsheet. Cost price, selling price, and barcodes are parsed automatically.
                    </p>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-orange-600">
                  <span>{isUploading ? 'Parsing file...' : 'Choose File from Device'}</span>
                  <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                </div>
              </motion.button>

              {/* OPTION 2: CREATE NOW (IN-APP SPREADSHEET) */}
              <motion.button
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.99 }}
                type="button"
                onClick={() => setActiveTab('create_now')}
                className="p-5 sm:p-6 rounded-3xl border-2 border-slate-200 hover:border-emerald-500 bg-white hover:bg-emerald-50/40 text-left transition-all shadow-xs hover:shadow-lg group flex flex-col justify-between cursor-pointer"
              >
                <div className="space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold shadow-inner group-hover:bg-emerald-600 group-hover:text-white transition-all">
                    <Table className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 block mb-1">
                      Option 2
                    </span>
                    <h4 className="text-base sm:text-lg font-black text-slate-900 group-hover:text-emerald-950">
                      Create now
                    </h4>
                    <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                      Create a spreadsheet right inside the app! Fill Cost Price, Margin %, Selling Price, and Quantity. Enter key moves to next row!
                    </p>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-emerald-600">
                  <span>Open In-App Table Creator</span>
                  <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                </div>
              </motion.button>

            </div>

            <div className="max-w-xl mx-auto p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-center text-xs text-slate-500">
              💡 <strong>Requirement:</strong> Both <strong>Cost Price</strong> and <strong>Selling Price</strong> are mandatory for every product. Entering Margin % automatically calculates Selling Price!
            </div>
          </div>
        )}

        {/* SCREEN 2: IN-APP SPREADSHEET CREATOR */}
        {activeTab === 'create_now' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            
            {/* Table Control Sub-header */}
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0 px-4 sm:px-6">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Product Rows ({rows.filter(r => r.name.trim()).length} of {rows.length} filled)
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold hidden sm:inline">
                  ⌨️ Enter key moves to next row
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddRow}
                  className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold flex items-center gap-1 cursor-pointer shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5 text-orange-600" /> Add Row
                </button>
                <button
                  type="button"
                  onClick={handleAdd5Rows}
                  className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold flex items-center gap-1 cursor-pointer shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-600" /> +5 Rows
                </button>
              </div>
            </div>

            {/* Scrollable Table Area */}
            <div className="flex-1 overflow-auto custom-scrollbar p-2 sm:p-4 bg-slate-100/50">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-x-auto min-w-[850px]">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="bg-slate-900 text-white text-[10px] sm:text-[11px] uppercase tracking-wider font-extrabold border-b border-slate-800">
                      <th className="py-3 px-2.5 w-10 text-center">#</th>
                      <th className="py-3 px-3 min-w-[180px]">Product Name *</th>
                      <th className="py-3 px-2.5 w-28 text-rose-300">Cost Price (Rs.) *</th>
                      <th className="py-3 px-2.5 w-24 text-amber-300">Margin (%)</th>
                      <th className="py-3 px-2.5 w-28 text-emerald-300">Selling Price (Rs.) *</th>
                      <th className="py-3 px-2.5 w-24">Qty *</th>
                      <th className="py-3 px-2.5 w-36">Category</th>
                      <th className="py-3 px-3 min-w-[150px]">Barcode</th>
                      <th className="py-3 px-2 text-center w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150">
                    {rows.map((row, index) => {
                      const hasRowData = row.name.trim().length > 0 || row.costPrice !== '' || row.price !== '' || row.quantity !== '' || row.barcode.trim().length > 0;
                      const isNameInvalid = hasAttemptedSubmit && hasRowData && row.name.trim().length === 0;
                      const isCostInvalid = hasAttemptedSubmit && hasRowData && (row.costPrice === '' || isNaN(Number(row.costPrice)) || Number(row.costPrice) <= 0);
                      const isPriceInvalid = hasAttemptedSubmit && hasRowData && (row.price === '' || isNaN(Number(row.price)) || Number(row.price) <= 0);
                      const isQtyInvalid = hasAttemptedSubmit && hasRowData && (row.quantity === '' || isNaN(Number(row.quantity)) || Number(row.quantity) < 0);

                      return (
                      <tr 
                        key={row.id}
                        className={`transition-colors group ${
                          (isNameInvalid || isCostInvalid || isPriceInvalid || isQtyInvalid) ? 'bg-red-50/70' : 'hover:bg-orange-50/30'
                        }`}
                      >
                        {/* Row Number */}
                        <td className="py-2 px-2.5 text-center text-slate-400 font-mono text-xs">
                          {index + 1}
                        </td>

                        {/* 1. Name of Product */}
                        <td className="py-2 px-2.5">
                          <input
                            ref={el => { if (el) cellRefs.current[`${index}-name`] = el; }}
                            type="text"
                            value={row.name}
                            onChange={(e) => handleUpdateCell(index, 'name', e.target.value)}
                            onKeyDown={(e) => handleCellKeyDown(e, index, 'name')}
                            placeholder="e.g. Zeera Plus, Dalda Oil..."
                            className={`w-full px-2.5 py-1.5 bg-slate-50 focus:bg-white border rounded-lg text-xs font-medium focus:outline-none transition-all ${
                              isNameInvalid ? 'border-red-500 bg-red-50' : 'border-slate-200 focus:border-orange-500'
                            }`}
                          />
                        </td>

                        {/* 2. Cost Price (Buy) */}
                        <td className="py-2 px-2.5">
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-bold">
                              Rs.
                            </span>
                            <input
                              ref={el => { if (el) cellRefs.current[`${index}-costPrice`] = el; }}
                              type="number"
                              step="any"
                              min="0"
                              value={row.costPrice}
                              onChange={(e) => handleUpdateCell(index, 'costPrice', e.target.value === '' ? '' : parseFloat(e.target.value))}
                              onKeyDown={(e) => handleCellKeyDown(e, index, 'costPrice')}
                              placeholder="0.00"
                              className={`w-full pl-7 pr-2 py-1.5 bg-slate-50 focus:bg-white border rounded-lg text-xs font-mono font-bold text-slate-800 focus:outline-none transition-all ${
                                isCostInvalid ? 'border-red-500 bg-red-50' : 'border-slate-200 focus:border-rose-500'
                              }`}
                            />
                          </div>
                        </td>

                        {/* 3. Margin % (Calculates Sell Price) */}
                        <td className="py-2 px-2.5">
                          <div className="relative">
                            <input
                              ref={el => { if (el) cellRefs.current[`${index}-margin`] = el; }}
                              type="number"
                              step="any"
                              value={row.margin}
                              onChange={(e) => handleUpdateCell(index, 'margin', e.target.value === '' ? '' : parseFloat(e.target.value))}
                              onKeyDown={(e) => handleCellKeyDown(e, index, 'margin')}
                              placeholder="% margin"
                              className="w-full pr-6 pl-2 py-1.5 bg-amber-50/50 focus:bg-white border border-amber-200 focus:border-amber-500 rounded-lg text-xs font-mono font-bold text-amber-900 focus:outline-none transition-all"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-amber-600 font-bold">
                              %
                            </span>
                          </div>
                        </td>

                        {/* 4. Selling Price (Rs.) */}
                        <td className="py-2 px-2.5">
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-bold">
                              Rs.
                            </span>
                            <input
                              ref={el => { if (el) cellRefs.current[`${index}-price`] = el; }}
                              type="number"
                              step="any"
                              min="0"
                              value={row.price}
                              onChange={(e) => handleUpdateCell(index, 'price', e.target.value === '' ? '' : parseFloat(e.target.value))}
                              onKeyDown={(e) => handleCellKeyDown(e, index, 'price')}
                              placeholder="0.00"
                              className={`w-full pl-7 pr-2 py-1.5 bg-slate-50 focus:bg-white border rounded-lg text-xs font-mono font-black text-emerald-700 focus:outline-none transition-all ${
                                isPriceInvalid ? 'border-red-500 bg-red-50' : 'border-slate-200 focus:border-emerald-500'
                              }`}
                            />
                          </div>
                        </td>

                        {/* 5. Quantity */}
                        <td className="py-2 px-2.5">
                          <input
                            ref={el => { if (el) cellRefs.current[`${index}-quantity`] = el; }}
                            type="number"
                            step="any"
                            min="0"
                            value={row.quantity}
                            onChange={(e) => handleUpdateCell(index, 'quantity', e.target.value === '' ? '' : parseFloat(e.target.value))}
                            onKeyDown={(e) => handleCellKeyDown(e, index, 'quantity')}
                            placeholder="Qty"
                            className={`w-full px-2.5 py-1.5 bg-slate-50 focus:bg-white border rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none transition-all ${
                              isQtyInvalid ? 'border-red-500 bg-red-50' : 'border-slate-200 focus:border-orange-500'
                            }`}
                          />
                        </td>

                        {/* 6. Category */}
                        <td className="py-2 px-2.5">
                          <select
                            ref={el => { if (el) cellRefs.current[`${index}-category`] = el; }}
                            value={row.category}
                            onChange={(e) => {
                              if (e.target.value === '__add_new__') {
                                setNewCatRowTargetIndex(index);
                                setIsAddingNewCat(true);
                              } else {
                                handleUpdateCell(index, 'category', e.target.value);
                              }
                            }}
                            onKeyDown={(e) => handleCellKeyDown(e, index, 'category')}
                            className="w-full px-2 py-1.5 bg-slate-50 focus:bg-white border border-slate-200 focus:border-orange-500 rounded-lg text-xs font-bold text-slate-800 focus:outline-none transition-all"
                          >
                            {categoriesList.map(cat => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                            <option value="__add_new__" className="text-orange-600 font-bold">
                              ➕ + Add New Category...
                            </option>
                          </select>
                        </td>

                        {/* 7. Barcode */}
                        <td className="py-2 px-2.5 min-w-[150px]">
                          <div className="flex items-center gap-1">
                            <input
                              ref={el => { if (el) cellRefs.current[`${index}-barcode`] = el; }}
                              type="text"
                              value={row.barcode}
                              onChange={(e) => handleUpdateCell(index, 'barcode', e.target.value)}
                              onKeyDown={(e) => handleCellKeyDown(e, index, 'barcode')}
                              placeholder="Barcode"
                              className="w-full px-2.5 py-1.5 bg-slate-50 focus:bg-white border border-slate-200 focus:border-orange-500 rounded-lg text-xs font-mono font-bold text-slate-800 focus:outline-none transition-all"
                            />
                            <button
                              type="button"
                              onClick={() => handleUpdateCell(index, 'barcode', generateRandomBarcode())}
                              className="p-1 text-slate-400 hover:text-orange-600 rounded cursor-pointer shrink-0"
                              title="Generate Barcode"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>

                        {/* Delete Row */}
                        <td className="py-2 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteRow(row.id)}
                            className="p-1 text-slate-300 hover:text-red-600 transition-colors rounded cursor-pointer"
                            title="Delete row"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bottom Footer Actions */}
            <div className="p-3.5 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6 shrink-0">
              <div className="text-xs text-slate-500 font-medium hidden sm:block">
                Tip: Enter Cost Price & Margin % to set Selling Price automatically!
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={handleSaveDirectToStock}
                  disabled={isSavingDirectly}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                  <span>{isSavingDirectly ? 'Saving to Stock...' : 'Save All to Stock'}</span>
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={handleSendToAi}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-orange-600 via-amber-600 to-orange-600 hover:from-orange-500 hover:to-amber-500 text-white font-black text-xs uppercase tracking-wider shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-amber-200" />
                  <span>Send to AI</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </motion.button>
              </div>
            </div>

          </div>
        )}

      </div>

      {/* QUICK INLINE MODAL TO ADD NEW CATEGORY */}
      {isAddingNewCat && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl border border-slate-200 space-y-3 animate-scale-in">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-extrabold text-slate-900">Add New Category</h4>
              <button 
                onClick={() => setIsAddingNewCat(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Type the new category name to add it to your store:
            </p>
            <input
              type="text"
              autoFocus
              placeholder="e.g. Pet Care, Electronics..."
              value={newCatInput}
              onChange={(e) => setNewCatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleConfirmNewCategory();
                }
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-orange-500"
            />
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsAddingNewCat(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmNewCategory}
                className="px-4 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                Add Category
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
