import React, { useState, useRef } from 'react';
import { 
  X, 
  Plus, 
  Trash2, 
  Upload, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  Barcode as BarcodeIcon, 
  Sparkles, 
  RefreshCw, 
  Scale, 
  Package, 
  Coins, 
  Layers,
  ArrowRight,
  Download
} from 'lucide-react';
import { BatchProductRow, parseExcelProductFile } from '../lib/excelParser';
import { saveNewCategoryToStore, getAllCategories } from '../lib/categories';
import { Product, Store } from '../types';
import { db, collection, setDoc, doc } from '../lib/firebase';
import { generateNextShortcutCode } from '../utils/productShortcuts';

const generateRandomBarcode = (): string => {
  return Math.floor(10000 + Math.random() * 90000).toString();
};

interface MultiProductBatchModalProps {
  store: Store;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (count: number) => void;
  onProductsImported?: (count: number) => void;
  currentUser?: any;
  existingProducts?: Product[];
}

export const MultiProductBatchModal: React.FC<MultiProductBatchModalProps> = ({
  store,
  isOpen,
  onClose,
  onSuccess,
  onProductsImported,
  currentUser,
  existingProducts = []
}) => {
  const [rows, setRows] = useState<BatchProductRow[]>([
    {
      id: 'row-1',
      barcode: '',
      name: '',
      category: 'General',
      sellBy: 'unit',
      unitType: 'piece',
      quantity: 10,
      costPrice: 0,
      price: 0
    },
    {
      id: 'row-2',
      barcode: '',
      name: '',
      category: 'General',
      sellBy: 'weight',
      unitType: 'kg',
      quantity: 25,
      costPrice: 0,
      price: 0
    }
  ]);

  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  // Add empty row - no default barcode
  const handleAddRow = (sellBy: 'unit' | 'weight' = 'unit', unitType: 'piece' | 'kg' | 'liter' = 'piece') => {
    setRows(prev => [
      ...prev,
      {
        id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        barcode: '',
        name: '',
        category: 'General',
        sellBy,
        unitType,
        quantity: sellBy === 'weight' ? 20 : 10,
        costPrice: 0,
        price: 0
      }
    ]);
  };

  // Add 5 rows - no default barcodes
  const handleAdd5Rows = () => {
    const newRows: BatchProductRow[] = [];
    for (let i = 0; i < 5; i++) {
      newRows.push({
        id: `row-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        barcode: '',
        name: '',
        category: 'General',
        sellBy: 'unit',
        unitType: 'piece',
        quantity: 10,
        costPrice: 0,
        price: 0
      });
    }
    setRows(prev => [...prev, ...newRows]);
  };

  // Update a field in a row
  const handleUpdateRow = (id: string, field: keyof BatchProductRow, value: any) => {
    setRows(prev => prev.map(row => {
      if (row.id !== id) return row;
      const updated = { ...row, [field]: value };
      
      // Auto pricing calculation
      if (field === 'costPrice') {
        const cost = Number(value);
        const sell = Number(updated.price);
        if (cost > 0 && sell > 0) {
          // preserve sell price
        }
      }

      // Keep sellBy in sync with unitType
      if (field === 'unitType') {
        if (value === 'kg' || value === 'g' || value === 'liter') {
          updated.sellBy = 'weight';
        } else {
          updated.sellBy = 'unit';
        }
      } else if (field === 'sellBy') {
        if (value === 'weight' && updated.unitType === 'piece') {
          updated.unitType = 'kg';
        } else if (value === 'unit' && (updated.unitType === 'kg' || updated.unitType === 'g' || updated.unitType === 'liter')) {
          updated.unitType = 'piece';
        }
      }

      return updated;
    }));
  };

  // Remove row
  const handleRemoveRow = (id: string) => {
    if (rows.length <= 1) {
      setErrorMsg('You must have at least one product row.');
      return;
    }
    setRows(prev => prev.filter(r => r.id !== id));
  };

  // Handle Excel or CSV file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    setIsUploading(true);

    try {
      const parsedRows = await parseExcelProductFile(file);
      if (parsedRows.length === 0) {
        throw new Error('No valid product rows were found in the uploaded file.');
      }
      setRows(parsedRows);
      setSuccessMsg(`Successfully parsed ${parsedRows.length} products from ${file.name}. Review below and save to inventory!`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to parse Excel file. Please check file format.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Save all valid rows to Firestore
  const handleSaveAll = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    // Validation: Product name, Cost Price (>0), and Retail Selling Price (>0) are mandatory
    const invalidRows = rows.filter(r => !r.name.trim() || !r.costPrice || Number(r.costPrice) <= 0 || !r.price || Number(r.price) <= 0);
    if (invalidRows.length > 0) {
      setErrorMsg(`Both Cost Price (>0) and Retail Selling Price (>0) are mandatory for all product rows. ${invalidRows.length} row(s) need attention.`);
      return;
    }

    setIsSaving(true);
    let savedCount = 0;

    try {
      // Build map of existing products by barcode or ID for updates
      const barcodeMap = new Map<string, Product>();
      (existingProducts || []).forEach(p => {
        if (p.barcode) barcodeMap.set(p.barcode.trim().toLowerCase(), p);
      });

      const assignedShortcutsPool = [...existingProducts];

      for (const row of rows) {
        const barcodeTrimmed = row.barcode ? row.barcode.trim() : '';
        const existing = barcodeTrimmed ? barcodeMap.get(barcodeTrimmed.toLowerCase()) : undefined;
        const productId = existing ? existing.id : `prod_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

        // Assign or preserve unique 4-digit shortcut code
        const shortcutCode = existing?.shortcutCode || generateNextShortcutCode(assignedShortcutsPool);
        assignedShortcutsPool.push({ shortcutCode } as Product);

        const productPayload: Partial<Product> = {
          id: productId,
          storeId: store.id,
          barcode: barcodeTrimmed,
          shortcutCode,
          serialNumber: existing?.serialNumber || shortcutCode,
          name: row.name.trim(),
          category: row.category.trim() || 'General',
          sellBy: row.sellBy,
          unitType: row.unitType,
          price: Number(row.price),
          costPrice: Number(row.costPrice) || 0,
          stockQuantity: existing ? (existing.stockQuantity || 0) + Number(row.quantity) : Number(row.quantity),
          minStockLevel: 5,
          weight: row.sellBy === 'weight' ? (row.unitType === 'kg' ? '1 kg' : '1 Liter') : undefined,
          updatedAt: new Date().toISOString()
        };

        if (!existing) {
          productPayload.createdAt = new Date().toISOString();
        }

        const productDocRef = doc(db, 'products', productId);
        await setDoc(productDocRef, productPayload, { merge: true });
        savedCount++;
      }

      // Persist any newly added custom categories to store customCategories in Firestore
      const batchCategories = new Set<string>();
      rows.forEach(r => {
        if (r.category && r.category.trim()) batchCategories.add(r.category.trim());
      });
      let currentCustomCats = [...(store.customCategories || [])];
      for (const cat of batchCategories) {
        if (!currentCustomCats.some(c => c.toLowerCase() === cat.toLowerCase())) {
          currentCustomCats = await saveNewCategoryToStore(store.id, currentCustomCats, cat);
        }
      }

      setSuccessMsg(`Success! Saved ${savedCount} products into ${store.name} inventory with automated 4-digit shortcuts.`);
      setTimeout(() => {
        if (onSuccess) onSuccess(savedCount);
        if (onProductsImported) onProductsImported(savedCount);
        onClose();
      }, 1200);

    } catch (err: any) {
      console.error('Error saving batch products:', err);
      setErrorMsg(err.message || 'Failed to save products to database.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-orange-600 text-white shadow-sm">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  Batch Multi-Product Register & Excel Import
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Add multiple products in a list or upload an Excel / CSV spreadsheet to list all products automatically
                </p>
              </div>
            </div>
          </div>

          {/* Quick Actions & Close */}
          <div className="flex items-center gap-2">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              accept=".xlsx, .xls, .csv" 
              className="hidden" 
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {isUploading ? 'Parsing Excel...' : 'Upload Excel / CSV File'}
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Alerts */}
        {errorMsg && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Information Callout Banner */}
        <div className="mx-5 mt-3 p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-[11px] text-amber-900 flex flex-wrap items-center justify-between gap-2 font-medium">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              <strong>By Weight / Liquid Pricing:</strong> Set unit type to <strong>Kilogram (kg)</strong> or <strong>Liter (L)</strong> to set price per kg or per liter. The cash counter automatically computes the price when weight is entered.
            </span>
          </div>
          <div className="flex items-center gap-2 text-slate-600">
            <span>Total Rows: <strong>{rows.length}</strong></span>
          </div>
        </div>

        {/* Spreadsheet Table Container */}
        <div className="flex-1 overflow-x-auto overflow-y-auto p-5 custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-slate-100 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200">
                <th className="p-2.5 text-center w-12">#</th>
                <th className="p-2.5 w-44">Barcode (Optional)</th>
                <th className="p-2.5 min-w-[200px]">Product Name *</th>
                <th className="p-2.5 w-32">Category</th>
                <th className="p-2.5 w-32">Unit / Pricing Type</th>
                <th className="p-2.5 w-28 text-right">Quantity *</th>
                <th className="p-2.5 w-28 text-right">Wholesale Cost</th>
                <th className="p-2.5 w-36 text-right">Retail Selling Price *</th>
                <th className="p-2.5 text-center w-16">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, idx) => {
                const isByWeight = row.sellBy === 'weight' || row.unitType === 'kg' || row.unitType === 'liter';
                const isPriceEmpty = row.price <= 0;
                const isNameEmpty = !row.name.trim();

                return (
                  <tr 
                    key={row.id} 
                    className={`hover:bg-slate-50/70 transition-colors ${
                      isPriceEmpty || isNameEmpty ? 'bg-amber-50/30' : ''
                    }`}
                  >
                    {/* Index */}
                    <td className="p-2 text-center font-bold text-slate-400">
                      {idx + 1}
                    </td>

                    {/* Barcode & Auto Generator */}
                    <td className="p-2">
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          value={row.barcode}
                          onChange={(e) => handleUpdateRow(row.id, 'barcode', e.target.value)}
                          placeholder="e.g. 890123456789"
                          className="w-full pl-2 pr-7 py-1.5 rounded-lg border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-mono text-xs bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => handleUpdateRow(row.id, 'barcode', generateRandomBarcode())}
                          title="Generate Unique Barcode"
                          className="absolute right-1.5 text-slate-400 hover:text-orange-600 p-0.5 cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>

                    {/* Product Name */}
                    <td className="p-2">
                      <input
                        type="text"
                        value={row.name}
                        onChange={(e) => handleUpdateRow(row.id, 'name', e.target.value)}
                        placeholder="e.g. Farm Fresh Apples / Basmati Rice 1kg"
                        className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-semibold ${
                          isNameEmpty ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200 bg-white'
                        } focus:border-orange-500 focus:ring-1 focus:ring-orange-500`}
                      />
                    </td>

                    {/* Category */}
                    <td className="p-2">
                      <select
                        value={row.category}
                        onChange={(e) => handleUpdateRow(row.id, 'category', e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700"
                      >
                        <option value="General">General</option>
                        <option value="Grocery">Grocery</option>
                        <option value="Dairy">Dairy</option>
                        <option value="Produce">Produce (Fruits & Veg)</option>
                        <option value="Bakery">Bakery</option>
                        <option value="Beverages">Beverages</option>
                        <option value="Snacks">Snacks & Confectionery</option>
                        <option value="Meat">Meat & Poultry</option>
                        <option value="Household">Household & Cleaning</option>
                        <option value="Personal Care">Personal Care</option>
                      </select>
                    </td>

                    {/* Unit / Pricing Type */}
                    <td className="p-2">
                      <select
                        value={row.unitType}
                        onChange={(e) => handleUpdateRow(row.id, 'unitType', e.target.value)}
                        className={`w-full px-2 py-1.5 rounded-lg border text-xs font-semibold ${
                          isByWeight 
                            ? 'bg-amber-50 border-amber-300 text-amber-900' 
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        <option value="piece">Piece (each unit)</option>
                        <option value="kg">Kilogram (per kg)</option>
                        <option value="liter">Liter (per liter)</option>
                        <option value="g">Gram (per g)</option>
                        <option value="dozen">Dozen (12 pcs)</option>
                      </select>
                    </td>

                    {/* Quantity */}
                    <td className="p-2 text-right">
                      <input
                        type="number"
                        step={isByWeight ? '0.1' : '1'}
                        min="0"
                        value={row.quantity}
                        onChange={(e) => handleUpdateRow(row.id, 'quantity', parseFloat(e.target.value) || 0)}
                        className="w-24 px-2 py-1.5 rounded-lg border border-slate-200 text-right font-mono text-xs bg-white"
                      />
                    </td>

                    {/* Wholesale Cost */}
                    <td className="p-2 text-right">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={row.costPrice === 0 ? '' : row.costPrice}
                        onChange={(e) => handleUpdateRow(row.id, 'costPrice', parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        className="w-24 px-2 py-1.5 rounded-lg border border-slate-200 text-right font-mono text-xs bg-white"
                      />
                    </td>

                    {/* Retail Selling Price */}
                    <td className="p-2 text-right">
                      <div className="relative flex items-center justify-end">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.price === 0 ? '' : row.price}
                          onChange={(e) => handleUpdateRow(row.id, 'price', parseFloat(e.target.value) || 0)}
                          placeholder={isByWeight ? (row.unitType === 'liter' ? 'Rs/Liter' : 'Rs/Kg') : 'Rs/Piece'}
                          className={`w-28 px-2 py-1.5 rounded-lg border text-right font-mono text-xs font-bold ${
                            isPriceEmpty ? 'border-amber-400 bg-amber-50/40 text-amber-900' : 'border-slate-200 bg-white text-slate-900'
                          }`}
                        />
                      </div>
                      {isByWeight && (
                        <div className="text-[10px] text-amber-700 font-medium text-right mt-0.5">
                          {row.unitType === 'liter' ? 'Per Liter rate' : 'Per Kg rate'}
                        </div>
                      )}
                    </td>

                    {/* Action */}
                    <td className="p-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(row.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        title="Delete Row"
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

        {/* Footer Controls */}
        <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Add Rows Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleAddRow('unit', 'piece')}
              className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-xl border border-slate-200 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-orange-600" /> +1 Product (Piece)
            </button>
            <button
              type="button"
              onClick={() => handleAddRow('weight', 'kg')}
              className="px-3 py-2 bg-white hover:bg-amber-50 text-amber-800 rounded-xl border border-amber-200 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Scale className="w-3.5 h-3.5 text-amber-600" /> +1 Weight Product (Price/Kg)
            </button>
            <button
              type="button"
              onClick={handleAdd5Rows}
              className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-xl border border-slate-200 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-slate-500" /> +5 Empty Rows
            </button>
          </div>

          {/* Submit & Cancel */}
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={isSaving || rows.length === 0}
              className="px-6 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition-all shadow-md hover:shadow-lg flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Saving {rows.length} Products...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" /> Save All {rows.length} Products to Inventory
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
