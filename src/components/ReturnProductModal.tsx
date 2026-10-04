import React, { useState, useRef, useEffect } from 'react';
import { 
  db, 
  doc, 
  runTransaction 
} from '../lib/firebase';
import { Product, Store, UserAccount, ProductReturn, ProductReturnItem, Sale } from '../types';
import { playScanSuccessBeep, playScanErrorBeep } from '../lib/sound';
import { speakMessage } from '../lib/speech';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { WeightPromptModal } from './WeightPromptModal';
import { 
  RotateCcw, 
  X, 
  Barcode as BarcodeIcon, 
  AlertCircle, 
  Package, 
  Receipt, 
  Plus, 
  Minus, 
  Banknote, 
  CreditCard,
  Camera,
  TrendingDown,
  Sparkles,
  ArrowRight,
  Search,
  Trash2,
  CheckCircle2,
  Hash
} from 'lucide-react';

interface ReturnProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  store: Store;
  currentUser: UserAccount;
  recentSales?: Sale[];
  voiceEnabled?: boolean;
  isCameraScannerAllowed?: boolean;
  onReturnProcessed: (returnRecord: ProductReturn) => void;
}

export interface ReturnCartItem {
  id: string;
  product: Product;
  quantity: number;
  unitPrice: number;
  refundTotal: number;
  reason: string;
  customReason?: string;
  sale?: Sale;
  saleItemIndex?: number;
}

const COMMON_REASONS = [
  'Customer changed mind',
  'Defective / Damaged item',
  'Wrong product purchased',
  'Quality issue / Expired',
  'Customer requested exchange / refund',
  'Billing error / Duplicate charge'
];

const DEFAULT_RECENT_SALES: Sale[] = [];

export const ReturnProductModal: React.FC<ReturnProductModalProps> = ({
  isOpen,
  onClose,
  products,
  store,
  currentUser,
  recentSales = DEFAULT_RECENT_SALES,
  voiceEnabled = true,
  isCameraScannerAllowed = false,
  onReturnProcessed
}) => {
  const [scanMode, setScanMode] = useState<'barcode' | 'receipt'>('barcode');
  
  // Barcode / Scanner input states
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [receiptNumberInput, setReceiptNumberInput] = useState('');
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);
  
  // Multi-item Return Cart
  const [returnItems, setReturnItems] = useState<ReturnCartItem[]>([]);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  
  // Weight Modal for Weighted Item Returns
  const [weightPromptProduct, setWeightPromptProduct] = useState<Product | null>(null);
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  
  // Common refund settings
  const [refundMethod, setRefundMethod] = useState<'cash' | 'online'>('cash');
  const [defaultReason, setDefaultReason] = useState<string>('Customer changed mind');
  
  // Loading & Error states
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  // Focus barcode input on modal open
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        if (scanMode === 'barcode' && barcodeInputRef.current) {
          barcodeInputRef.current.focus();
        } else if (scanMode === 'receipt' && receiptInputRef.current) {
          receiptInputRef.current.focus();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, scanMode]);

  if (!isOpen) return null;

  // Normalization helper for accurate barcode and code matching
  const cleanCode = (v: any) => String(v ?? '').replace(/[\r\n\t\s]/g, '').trim().toLowerCase();
  const cleanName = (v: any) => String(v ?? '').trim().toLowerCase();

  // Add or increment product in return cart
  const addProductToReturnCart = (product: Product, reasonStr = defaultReason, saleRef?: Sale) => {
    const unitPrice = product.price || product.pricePerKg || 0;
    
    setReturnItems(prev => {
      const existingIdx = prev.findIndex(item => item.product.id === product.id);
      if (existingIdx >= 0) {
        const updated = [...prev];
        const newQty = Math.round((updated[existingIdx].quantity + 1) * 1000) / 1000;
        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: newQty,
          refundTotal: Math.round(unitPrice * newQty * 100) / 100
        };
        return updated;
      } else {
        return [
          ...prev,
          {
            id: `ret_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            product,
            quantity: 1,
            unitPrice,
            refundTotal: unitPrice,
            reason: reasonStr,
            sale: saleRef
          }
        ];
      }
    });

    playScanSuccessBeep();
    if (voiceEnabled && store?.voiceAnnouncementEnabled !== false) {
      speakMessage(`Added ${product.name} to return list`);
    }
  };

  // Add weighted product to return cart
  const addProductToReturnCartWithWeight = (
    product: Product, 
    quantityInKg: number, 
    customTotalPrice: number, 
    reasonStr = defaultReason, 
    saleRef?: Sale
  ) => {
    const unitPrice = product.price || product.pricePerKg || 0;
    
    setReturnItems(prev => [
      ...prev,
      {
        id: `ret_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        product,
        quantity: Math.round(quantityInKg * 1000) / 1000,
        unitPrice,
        refundTotal: Math.round(customTotalPrice * 100) / 100,
        reason: reasonStr,
        sale: saleRef
      }
    ]);

    playScanSuccessBeep();
    if (voiceEnabled && store?.voiceAnnouncementEnabled !== false) {
      speakMessage(`Added ${quantityInKg.toFixed(3)} kg ${product.name} to return list`);
    }
  };

  // Handle barcode / 4-digit shortcut lookup
  const handleBarcodeSubmit = (rawBarcode: string) => {
    const code = rawBarcode ? rawBarcode.replace(/[\r\n\t]/g, '').trim() : '';
    if (!code) return;

    setErrorMsg(null);
    const targetCode = cleanCode(code);
    const targetName = cleanName(code);

    // 1. Search in store products by 4-digit shortcutCode, barcode, serial, id, or exact name
    let found = products.find(p => {
      const pShortcut = cleanCode(p.shortcutCode);
      const pBarcode = cleanCode(p.barcode);
      const pSerial = cleanCode(p.serialNumber);
      const pId = cleanCode(p.id);
      const pName = cleanName(p.name);

      if (pShortcut && pShortcut === targetCode) return true;
      if (pBarcode && pBarcode === targetCode) return true;
      if (pSerial && pSerial === targetCode) return true;
      if (pId && pId === targetCode) return true;
      if (pName && pName === targetName) return true;
      return false;
    });

    // Fallback for leading-zero variations in standard barcode formats (e.g. UPC/EAN)
    if (!found) {
      const targetDigitsNoZero = targetCode.replace(/^0+/, '');
      if (targetDigitsNoZero.length >= 3) {
        found = products.find(p => {
          const pBarcodeDigits = cleanCode(p.barcode).replace(/^0+/, '');
          const pSerialDigits = cleanCode(p.serialNumber).replace(/^0+/, '');
          const pShortcutDigits = cleanCode(p.shortcutCode).replace(/^0+/, '');
          return (pBarcodeDigits && pBarcodeDigits === targetDigitsNoZero) ||
                 (pSerialDigits && pSerialDigits === targetDigitsNoZero) ||
                 (pShortcutDigits && pShortcutDigits === targetDigitsNoZero);
        });
      }
    }

    if (found) {
      const isWeightProduct = found.sellBy === 'weight' || found.unitType === 'kg' || Boolean(found.pricePerKg);
      if (isWeightProduct) {
        setWeightPromptProduct(found);
        setIsWeightModalOpen(true);
        setScannedBarcode('');
        return;
      }

      addProductToReturnCart(found);
      setScannedBarcode('');
      if (barcodeInputRef.current) {
        barcodeInputRef.current.focus();
      }
      return;
    }

    const returnPolicyDays = store.returnPolicyDays && store.returnPolicyDays > 0 ? store.returnPolicyDays : 7;

    // 2. Search in recent sales items by exact full barcode or serial number
    for (const sale of recentSales) {
      const itemIndex = sale.items.findIndex(i => {
        const iBarcode = cleanCode(i.barcode);
        const iSerial = cleanCode(i.serialNumber);
        const iName = cleanName(i.name);
        return (iBarcode && iBarcode === targetCode) ||
               (iSerial && iSerial === targetCode) ||
               (iName && iName === targetName);
      });

      if (itemIndex !== -1) {
        const saleAgeDays = Math.floor((Date.now() - new Date(sale.timestamp).getTime()) / (1000 * 60 * 60 * 24));
        if (saleAgeDays > returnPolicyDays) {
          playScanErrorBeep();
          setErrorMsg(`Slip Expired / Disqualified! Item found in Receipt #${sale.receiptNumber}, but purchase was made ${saleAgeDays} days ago. Admin policy allows restock & refund only within ${returnPolicyDays} days of purchase.`);
          if (voiceEnabled && store?.voiceAnnouncementEnabled !== false) {
            speakMessage(`Slip expired. Return window of ${returnPolicyDays} days has passed.`);
          }
          return;
        }

        const item = sale.items[itemIndex];
        const constructedProduct: Product = {
          id: item.productId,
          storeId: store.id,
          barcode: item.barcode || '',
          serialNumber: item.serialNumber || '',
          shortcutCode: item.shortcutCode || '',
          name: item.name,
          category: 'General',
          price: item.price,
          stockQuantity: 0,
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString()
        };

        addProductToReturnCart(constructedProduct, defaultReason, sale);
        setRefundMethod(sale.paymentMethod || 'cash');
        setScannedBarcode('');
        if (barcodeInputRef.current) {
          barcodeInputRef.current.focus();
        }
        return;
      }
    }

    // Not found
    playScanErrorBeep();
    setErrorMsg(`No product found matching code/shortcut "${code}". Check 4-digit short key or scan barcode.`);
  };

  // Handle receipt number search
  const handleReceiptSubmit = (rawReceiptNo: string) => {
    const receiptQuery = rawReceiptNo.trim().replace(/^#/, '').toLowerCase();
    if (!receiptQuery) return;

    setErrorMsg(null);
    const returnPolicyDays = store.returnPolicyDays && store.returnPolicyDays > 0 ? store.returnPolicyDays : 7;
    const foundSale = recentSales.find(s => 
      s.receiptNumber.toLowerCase().includes(receiptQuery) ||
      s.id.toLowerCase().includes(receiptQuery)
    );

    if (foundSale) {
      const saleAgeDays = Math.floor((Date.now() - new Date(foundSale.timestamp).getTime()) / (1000 * 60 * 60 * 24));
      if (saleAgeDays > returnPolicyDays) {
        playScanErrorBeep();
        setErrorMsg(`Slip Expired / Disqualified! Slip #${foundSale.receiptNumber} is ${saleAgeDays} days old. Admin policy allows restock & refund only within ${returnPolicyDays} days from purchase.`);
        if (voiceEnabled && store?.voiceAnnouncementEnabled !== false) {
          speakMessage(`Slip expired. Return allowed only within ${returnPolicyDays} days.`);
        }
        return;
      }
      setSelectedSale(foundSale);
      playScanSuccessBeep();
    } else {
      playScanErrorBeep();
      setErrorMsg(`Invoice/Receipt #${rawReceiptNo} not found in recent sales records.`);
    }
  };

  // Select an item from a found receipt into return cart
  const handleSelectSaleItem = (sale: Sale, itemIndex: number) => {
    const saleItem = sale.items[itemIndex];
    if (!saleItem) return;

    const matchingProduct = products.find(p => p.id === saleItem.productId) || {
      id: saleItem.productId,
      storeId: store.id,
      barcode: saleItem.barcode || '',
      serialNumber: saleItem.serialNumber || '',
      shortcutCode: saleItem.shortcutCode || '',
      name: saleItem.name,
      category: 'General',
      price: saleItem.price,
      stockQuantity: 0,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    } as Product;

    const isWeightProduct = matchingProduct.sellBy === 'weight' || matchingProduct.unitType === 'kg' || Boolean(matchingProduct.pricePerKg);
    if (isWeightProduct) {
      setWeightPromptProduct(matchingProduct);
      setIsWeightModalOpen(true);
      return;
    }

    addProductToReturnCart(matchingProduct, defaultReason, sale);
    setRefundMethod(sale.paymentMethod || 'cash');
    setErrorMsg(null);
  };

  // Quantity modification for return cart item
  const updateItemQty = (id: string, newQty: number) => {
    if (newQty <= 0) {
      removeItem(id);
      return;
    }
    setReturnItems(prev => prev.map(item => {
      if (item.id === id) {
        const qty = Math.round(newQty * 1000) / 1000;
        return {
          ...item,
          quantity: qty,
          refundTotal: Math.round(item.unitPrice * qty * 100) / 100
        };
      }
      return item;
    }));
  };

  // Reason modification for return cart item
  const updateItemReason = (id: string, reason: string) => {
    setReturnItems(prev => prev.map(item => item.id === id ? { ...item, reason } : item));
  };

  // Remove item from return cart
  const removeItem = (id: string) => {
    setReturnItems(prev => prev.filter(item => item.id !== id));
  };

  // Clear return cart
  const handleClearAll = () => {
    setReturnItems([]);
    setSelectedSale(null);
    setErrorMsg(null);
    setScannedBarcode('');
  };

  // Total calculated refund for batch
  const grandTotalRefund = returnItems.reduce((sum, item) => sum + item.refundTotal, 0);
  const totalUnitsReturned = returnItems.reduce((sum, item) => sum + item.quantity, 0);

  // Submit batch return & refund
  const handleProcessBatchReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (returnItems.length === 0) {
      setErrorMsg('Please scan or select at least one product to return.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    const returnSlipNumber = `RET-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`;
    const returnRecordId = `return_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const timestamp = new Date().toISOString();

    const formattedItems: ProductReturnItem[] = returnItems.map(item => ({
      productId: item.product.id,
      productName: item.product.name,
      barcode: item.product.barcode || '',
      serialNumber: item.product.serialNumber || '',
      shortcutCode: item.product.shortcutCode || '',
      price: item.unitPrice,
      quantity: item.quantity,
      sellBy: item.product.sellBy,
      unitType: item.product.unitType,
      refundAmount: item.refundTotal,
      reason: item.reason
    }));

    const primaryItem = returnItems[0];
    const returnDocData: ProductReturn = {
      id: returnRecordId,
      storeId: store.id,
      storeName: store.name,
      counterId: currentUser.id,
      counterName: currentUser.name || currentUser.counterNumber || 'Counter',
      cashierName: currentUser.name || currentUser.username,
      cashierUsername: currentUser.username,
      productId: primaryItem.product.id,
      productName: returnItems.length === 1 ? primaryItem.product.name : `${returnItems.length} Products Batch Return`,
      barcode: primaryItem.product.barcode || '',
      serialNumber: primaryItem.product.serialNumber || '',
      price: primaryItem.unitPrice,
      quantity: totalUnitsReturned,
      refundAmount: grandTotalRefund,
      refundMethod: refundMethod,
      reason: primaryItem.reason,
      items: formattedItems,
      originalReceiptNumber: selectedSale?.receiptNumber || undefined,
      returnSlipNumber: returnSlipNumber,
      timestamp: timestamp
    };

    try {
      // Execute Firestore atomic transaction for all returned items in batch:
      await runTransaction(db, async (transaction) => {
        for (const item of returnItems) {
          const productRef = doc(db, 'products', item.product.id);
          const productSnap = await transaction.get(productRef);

          let newStock = item.quantity;
          if (productSnap.exists()) {
            const currentStock = Number(productSnap.data().stockQuantity) || 0;
            newStock = Math.round((currentStock + item.quantity) * 1000) / 1000;
            transaction.update(productRef, {
              stockQuantity: newStock,
              updatedAt: timestamp
            });
          } else {
            transaction.set(productRef, {
              ...item.product,
              stockQuantity: newStock,
              updatedAt: timestamp
            });
          }
        }

        const returnRef = doc(db, 'returns', returnRecordId);
        transaction.set(returnRef, returnDocData);
      });

      playScanSuccessBeep();
      if (voiceEnabled && store?.voiceAnnouncementEnabled !== false) {
        speakMessage(`Batch return processed. Refund of rupees ${grandTotalRefund.toFixed(0)} issued. Products restocked.`);
      }

      onReturnProcessed(returnDocData);
      handleClearAll();
      onClose();
    } catch (err: any) {
      console.error('Error processing batch return transaction:', err);
      playScanErrorBeep();
      setErrorMsg(err.message || 'Failed to process return. Please check connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto overscroll-contain">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-3xl w-full p-5 sm:p-6 shadow-2xl relative space-y-5 max-h-[94vh] flex flex-col my-auto overflow-y-auto custom-scrollbar">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4 shrink-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-100 text-rose-700 rounded-2xl border border-rose-200 shadow-xs">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                Scan Products to Return
                <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-mono font-bold">
                  Shortcut: R + N
                </span>
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Enter 4-digit short key or scan barcode &bull; Multi-item batch returns &bull; Restocks stock & issues refund
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

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs font-semibold flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Scan input section */}
        <div className="space-y-3">
          
          {/* Mode Switch Tabs */}
          <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-2xl border border-slate-200 shrink-0">
            <button
              type="button"
              onClick={() => {
                setScanMode('barcode');
                setErrorMsg(null);
              }}
              className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                scanMode === 'barcode'
                  ? 'bg-white text-rose-700 shadow-xs font-extrabold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarcodeIcon className="w-4 h-4 text-rose-600" />
              Scan Barcode / 4-Digit Short Key
            </button>
            <button
              type="button"
              onClick={() => {
                setScanMode('receipt');
                setErrorMsg(null);
              }}
              className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                scanMode === 'receipt'
                  ? 'bg-white text-rose-700 shadow-xs font-extrabold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Receipt className="w-4 h-4 text-rose-600" />
              Scan Receipt / Invoice #
            </button>
          </div>

          {scanMode === 'barcode' ? (
            <div className="bg-rose-50/60 border-2 border-dashed border-rose-300 rounded-3xl p-4 text-center space-y-3">
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  handleBarcodeSubmit(scannedBarcode);
                }}
                className="flex gap-2 max-w-xl mx-auto"
              >
                <div className="relative flex-1">
                  <input
                    id="return-barcode-input"
                    ref={barcodeInputRef}
                    type="text"
                    autoFocus
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    value={scannedBarcode}
                    onChange={(e) => setScannedBarcode(e.target.value)}
                    placeholder="Scan barcode or enter 4-digit short key (e.g. 1001)..."
                    className="w-full pl-4 pr-4 py-3 bg-white border-2 border-rose-300 rounded-2xl text-slate-900 font-mono text-sm font-bold focus:outline-none focus:border-rose-600 shadow-inner"
                  />
                </div>
                <button
                  type="submit"
                  className="px-5 py-3 bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs rounded-2xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
                >
                  <Plus className="w-4 h-4" /> Add Item
                </button>
              </form>

              <div className="flex items-center justify-center gap-4 text-[11px] text-slate-600 font-medium">
                <span className="flex items-center gap-1 text-slate-700 font-bold">
                  <Hash className="w-3.5 h-3.5 text-blue-600" /> 4-Digit Short Keys Supported
                </span>
                <span>&bull;</span>
                <span className="flex items-center gap-1 text-slate-700 font-bold">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Multi-Item Batch Return
                </span>
                {isCameraScannerAllowed && (
                  <>
                    <span>&bull;</span>
                    <button
                      type="button"
                      onClick={() => setIsCameraScannerOpen(true)}
                      className="text-rose-700 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5" /> Camera Scanner
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-3xl p-4 space-y-3">
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  handleReceiptSubmit(receiptNumberInput);
                }}
                className="flex gap-2"
              >
                <div className="relative flex-1">
                  <Receipt className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="return-receipt-input"
                    ref={receiptInputRef}
                    type="text"
                    autoFocus
                    value={receiptNumberInput}
                    onChange={(e) => setReceiptNumberInput(e.target.value)}
                    placeholder="e.g. 1723812903 or scan receipt barcode..."
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-2xl text-slate-900 text-xs font-mono font-bold focus:outline-none focus:border-rose-500 shadow-inner"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-2xl transition-all cursor-pointer shrink-0 flex items-center gap-1"
                >
                  <Search className="w-3.5 h-3.5" /> Find Receipt
                </button>
              </form>

              {selectedSale && (
                <div className="p-3 bg-white border border-rose-200 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="font-extrabold text-xs text-slate-900">
                      Receipt #{selectedSale.receiptNumber}
                    </span>
                    <span className="font-black text-xs text-slate-900">
                      Total: Rs. {selectedSale.totalAmount.toFixed(2)}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="text-[11px] font-bold text-slate-600">
                      Click items below to add to return cart:
                    </div>
                    {selectedSale.items.map((item, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSelectSaleItem(selectedSale, idx)}
                        className="w-full p-2 bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-300 rounded-xl text-left transition-all flex items-center justify-between text-xs cursor-pointer group"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <Plus className="w-3.5 h-3.5 text-rose-500" />
                          <span className="font-bold text-slate-900 truncate">{item.name}</span>
                          <span className="text-[10px] text-slate-500 bg-white px-1.5 py-0.5 rounded font-mono border border-slate-200">
                            x{item.quantity}
                          </span>
                        </div>
                        <div className="font-black text-rose-600 text-xs">
                          Rs. {item.price.toFixed(2)} ea
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Multi-Item Return Cart Table */}
        <form onSubmit={handleProcessBatchReturn} className="space-y-4 flex-1 flex flex-col min-h-0">
          <div className="bg-rose-50/70 border-2 border-rose-200 rounded-3xl p-4 sm:p-5 space-y-3 shadow-xs">
            <div className="flex items-center justify-between border-b border-rose-200/80 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-rose-600 text-white rounded-xl shadow-xs">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                    List of Items to Return & Restock
                    <span className="px-2.5 py-0.5 rounded-full bg-rose-600 text-white text-xs font-mono font-black shadow-2xs">
                      {returnItems.length} {returnItems.length === 1 ? 'Product' : 'Products'}
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-600 font-medium">
                    Review returned items below &bull; Restocks inventory automatically &bull; Issues customer refund
                  </p>
                </div>
              </div>

              {returnItems.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="px-3 py-1 bg-white hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200 shadow-2xs transition-all cursor-pointer"
                >
                  Clear All
                </button>
              )}
            </div>

            {returnItems.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-2xl border-2 border-dashed border-rose-200 my-auto">
                <RotateCcw className="w-10 h-10 text-rose-300 mx-auto mb-2 animate-bounce" />
                <p className="text-sm font-extrabold text-slate-800">No items added to return list yet</p>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 font-medium">
                  Scan any product barcode or enter a <strong>4-digit short key (e.g. 1001)</strong> in the box above to easily build your return & restock list.
                </p>
              </div>
            ) : (
              <div className="border border-rose-200 rounded-2xl overflow-hidden overflow-y-auto max-h-64 custom-scrollbar bg-white shadow-xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-900 text-white font-extrabold border-b border-slate-800 sticky top-0 z-10 text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="p-3">Returned Product</th>
                      <th className="p-3 w-28 text-right">Unit Price</th>
                      <th className="p-3 w-36 text-center">Return Qty</th>
                      <th className="p-3 w-32 text-right">Refund Total</th>
                      <th className="p-3 w-40">Return Reason</th>
                      <th className="p-3 w-12 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {returnItems.map((item) => (
                      <tr key={item.id} className="hover:bg-rose-50/60 transition-colors">
                        <td className="p-3 font-bold text-slate-900">
                          <div className="space-y-1">
                            <div className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5 flex-wrap">
                              <span>{item.product.name}</span>
                              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center gap-1 shrink-0">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" /> +{item.quantity} Restock
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 font-mono font-medium flex items-center gap-2 flex-wrap">
                              {item.product.shortcutCode && (
                                <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 font-bold">
                                  Short Key: #{item.product.shortcutCode}
                                </span>
                              )}
                              {item.product.barcode && (
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                                  Barcode: {item.product.barcode}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="p-3 text-right font-mono text-slate-800 font-black text-xs">
                          Rs. {item.unitPrice.toFixed(2)}
                        </td>

                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200">
                            <button
                              type="button"
                              onClick={() => updateItemQty(item.id, item.quantity - 1)}
                              className="p-1 hover:bg-white text-slate-700 rounded-lg transition-colors cursor-pointer"
                              title="Decrease return quantity"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={item.quantity}
                              onChange={(e) => updateItemQty(item.id, parseFloat(e.target.value) || 1)}
                              className="w-14 text-center border border-slate-300 rounded-lg py-1 font-mono font-black text-xs bg-white text-slate-900 focus:outline-none focus:border-rose-500"
                            />
                            <button
                              type="button"
                              onClick={() => updateItemQty(item.id, item.quantity + 1)}
                              className="p-1 hover:bg-white text-slate-700 rounded-lg transition-colors cursor-pointer"
                              title="Increase return quantity"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>

                        <td className="p-3 text-right font-mono font-black text-rose-700 text-sm">
                          Rs. {item.refundTotal.toFixed(2)}
                        </td>

                        <td className="p-3">
                          <select
                            value={item.reason}
                            onChange={(e) => updateItemReason(item.id, e.target.value)}
                            className="w-full text-xs p-1.5 border border-slate-300 rounded-xl bg-white text-slate-900 font-semibold focus:outline-none focus:border-rose-500"
                          >
                            {COMMON_REASONS.map(r => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                        </td>

                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => removeItem(item.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-rose-100 rounded-xl transition-colors cursor-pointer"
                            title="Remove product from return list"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Customer Refund Method & Grand Total Summary */}
          {returnItems.length > 0 && (
            <div className="p-4 bg-slate-900 text-white rounded-3xl space-y-3 shadow-lg border border-slate-800">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-300">Refund Method:</span>
                  <div className="flex items-center gap-1.5 bg-slate-800 p-1 rounded-xl border border-slate-700">
                    <button
                      type="button"
                      onClick={() => setRefundMethod('cash')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        refundMethod === 'cash' ? 'bg-rose-600 text-white shadow-xs font-extrabold' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Banknote className="w-3.5 h-3.5 text-emerald-400" /> Cash Refund
                    </button>
                    <button
                      type="button"
                      onClick={() => setRefundMethod('online')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        refundMethod === 'online' ? 'bg-rose-600 text-white shadow-xs font-extrabold' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <CreditCard className="w-3.5 h-3.5 text-blue-400" /> Online / Store Credit
                    </button>
                  </div>
                </div>

                <div className="text-right space-y-0.5">
                  <div className="text-xs text-slate-300 flex items-center gap-2 justify-end">
                    <span>Total Restock Units:</span>
                    <span className="text-emerald-400 font-extrabold">+{totalUnitsReturned} units</span>
                  </div>
                  <div className="text-lg font-black text-rose-400 font-mono">
                    Grand Refund Total: Rs. {grandTotalRefund.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || returnItems.length === 0}
                className="w-full py-3.5 bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <>Processing Return Batch & Restocking...</>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" /> Complete Return & Restock ({returnItems.length} {returnItems.length === 1 ? 'Product' : 'Products'}) &bull; Refund Rs. {grandTotalRefund.toFixed(2)}
                  </>
                )}
              </button>
            </div>
          )}
        </form>

        {/* Camera Scanner Modal within Return flow */}
        {isCameraScannerOpen && (
          <BarcodeScannerModal
            isOpen={isCameraScannerOpen}
            onClose={() => setIsCameraScannerOpen(false)}
            onScanSuccess={(code) => {
              setIsCameraScannerOpen(false);
              handleBarcodeSubmit(code);
            }}
          />
        )}

        {/* Weight Prompt Modal for Weighted Returns */}
        {isWeightModalOpen && (
          <WeightPromptModal
            product={weightPromptProduct}
            isOpen={isWeightModalOpen}
            isReturnMode={true}
            title="Return Weighted Product"
            confirmLabel="Add Weight to Return List"
            onClose={() => {
              setIsWeightModalOpen(false);
              setWeightPromptProduct(null);
            }}
            onConfirm={(prod, qtyInKg, calcTotalPrice) => {
              addProductToReturnCartWithWeight(prod, qtyInKg, calcTotalPrice);
              setIsWeightModalOpen(false);
              setWeightPromptProduct(null);
            }}
          />
        )}

      </div>
    </div>
  );
};
