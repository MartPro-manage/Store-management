import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  db, 
  collection, 
  onSnapshot, 
  query, 
  where, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  handleFirestoreError,
  OperationType,
  cleanFirestoreData
} from '../lib/firebase';
import { Product, Store, UserAccount } from '../types';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { BarcodeGeneratorModal } from './BarcodeGeneratorModal';
import { HardwarePermissionsBar } from './HardwarePermissionsBar';
import { MultiProductBatchModal } from './MultiProductBatchModal';
import { ExcelManagerModal } from './ExcelManagerModal';
import { StoreAiAssistantModal } from './StoreAiAssistantModal';
import { UniversalBackButton } from './UniversalBackButton';
import { DiscountManagerModal } from './DiscountManagerModal';
import { ItemDiscountModal } from './ItemDiscountModal';
import { downloadBarcodeForProduct } from '../lib/barcodeDownload';
import { BatchProductRow } from '../lib/excelParser';
import { getAllCategories, addCustomCategoryToStore, saveNewCategoryToStore } from '../lib/categories';
import { generateNextShortcutCode, generateNext4DigitSerialNumber, generate5DigitBarcode } from '../utils/productShortcuts';
import { getProductDiscountInfo, formatShortDate } from '../utils/discountUtils';
import { 
  Package,
  PackagePlus, 
  Barcode as BarcodeIcon, 
  Camera, 
  Search, 
  CheckCircle, 
  AlertCircle, 
  RefreshCw, 
  Tag, 
  Layers, 
  PlusCircle, 
  Edit3,
  Trash2,
  Printer,
  Scale,
  Sparkles,
  Info,
  Download,
  TrendingUp,
  Percent,
  Coins,
  DollarSign,
  ArrowUpRight,
  Image as ImageIcon,
  Upload,
  X,
  FileImage,
  ListPlus,
  FileSpreadsheet,
  Boxes,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Calendar,
  Clock
} from 'lucide-react';

interface ProductRegisterViewProps {
  store: Store;
  currentUser: UserAccount;
  onBack?: () => void;
}

export const ProductRegisterView: React.FC<ProductRegisterViewProps> = ({ store, currentUser, onBack }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [productForGenerator, setProductForGenerator] = useState<Partial<Product> | null>(null);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [spreadsheetProductsForAi, setSpreadsheetProductsForAi] = useState<BatchProductRow[] | null>(null);
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);
  const [aiEditTargetProduct, setAiEditTargetProduct] = useState<Product | null>(null);
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
  const [quickDiscountProduct, setQuickDiscountProduct] = useState<Product | null>(null);

  // Category addition states
  const [isAddCategoryModalOpen, setIsAddCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isSavingCategory, setIsSavingCategory] = useState(false);

  // Form states
  const [sellBy, setSellBy] = useState<'unit' | 'weight'>('unit');
  const [unitType, setUnitType] = useState<'piece' | 'kg' | 'g' | 'liter' | 'dozen'>('piece');
  const [barcode, setBarcode] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [name, setName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageInputMode, setImageInputMode] = useState<'upload' | 'url'>('upload');
  const [weight, setWeight] = useState('');
  const [weightPerUnit, setWeightPerUnit] = useState<number | ''>('');
  const [category, setCategory] = useState('General');
  const [costPrice, setCostPrice] = useState<number | ''>('');
  const [marginPercent, setMarginPercent] = useState<number | ''>('');
  const [price, setPrice] = useState<number | ''>('');
  const [discountActive, setDiscountActive] = useState<boolean>(false);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState<number | ''>('');
  
  const getTodayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const [discountStartDate, setDiscountStartDate] = useState<string>(getTodayISO());
  const [discountEndDate, setDiscountEndDate] = useState<string>('');
  const [hasDateLimit, setHasDateLimit] = useState<boolean>(false);

  const applyDiscountDatePreset = (days: number | 'today' | 'end_month' | 'none') => {
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

  const [stockQuantityToAdd, setStockQuantityToAdd] = useState<number | ''>('');
  const [stockAdjustmentMode, setStockAdjustmentMode] = useState<'keep' | 'add' | 'set'>('keep');
  const [minStockLevel, setMinStockLevel] = useState<number>(5);

  const [existingProduct, setExistingProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [catalogFilter, setCatalogFilter] = useState<'all' | 'weight' | 'unit'>('all');

  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [showHardwareBar, setShowHardwareBar] = useState(false);

  const barcodeInputRef = useRef<HTMLInputElement | null>(null);
  const serialNumberInputRef = useRef<HTMLInputElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const priceInputRef = useRef<HTMLInputElement | null>(null);
  const quantityInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Compute all available categories including presets and custom store categories
  const availableCategories = useMemo(() => {
    return getAllCategories(store, products);
  }, [store, products]);

  // Preview system assigned 4-digit serial number
  const previewNextSerialNumber = useMemo(() => {
    if (existingProduct?.serialNumber && /^\d{4}$/.test(existingProduct.serialNumber)) {
      return existingProduct.serialNumber;
    }
    if (existingProduct?.shortcutCode && /^\d{4}$/.test(existingProduct.shortcutCode)) {
      return existingProduct.shortcutCode;
    }
    return generateNext4DigitSerialNumber(products);
  }, [existingProduct, products]);

  // Handler to add a new category dynamically
  const handleAddNewCategory = async () => {
    const trimmed = (newCategoryName || '').trim();
    if (!trimmed) {
      showNotification('error', 'Please enter a category name.');
      return;
    }
    setIsSavingCategory(true);
    try {
      const res = await addCustomCategoryToStore(store.id, trimmed, store.customCategories);
      if (res.success) {
        setCategory(trimmed);
        setNewCategoryName('');
        setIsAddCategoryModalOpen(false);
        showNotification('success', `Category "${trimmed}" added and selected!`);
      } else {
        showNotification('error', res.error || 'Failed to add category.');
      }
    } catch {
      showNotification('error', 'Failed to save category.');
    } finally {
      setIsSavingCategory(false);
    }
  };

  // Auto compress and convert uploaded image to compact base64
  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showNotification('error', 'Please select a valid image file (JPG, PNG, WEBP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_DIM = 400;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_DIM) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          }
        } else {
          if (height > MAX_DIM) {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.82);
          setImageUrl(compressed);
          showNotification('success', 'Product photo attached and optimized!');
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Auto focus barcode input for fast hardware USB barcode scanner support
  useEffect(() => {
    if (!isScannerOpen && !isGeneratorOpen && barcodeInputRef.current) {
      barcodeInputRef.current.focus();
    }
  }, [isScannerOpen, isGeneratorOpen]);

  // Catch physical barcode scanner typing if focus was accidentally blurred
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInputActive = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT');
      if (!isInputActive && !isScannerOpen && !isGeneratorOpen && barcodeInputRef.current) {
        if (e.key.length === 1 || e.key === 'Enter') {
          barcodeInputRef.current.focus();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isScannerOpen, isGeneratorOpen]);

  // Subscribe to Products for this store
  useEffect(() => {
    if (!store?.id) return;

    const q = query(
      collection(db, 'products'),
      where('storeId', '==', store.id)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const list: Product[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Product);
      });
      setProducts(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'products');
    });

    return () => unsub();
  }, [store?.id]);

  // Helper to find a registered product by Barcode, Serial Number, Short Code (1001-9999), or ID
  const findRegisteredProduct = (queryCode: string): Product | undefined => {
    const clean = (queryCode || '').trim();
    if (!clean) return undefined;
    const cleanLower = clean.toLowerCase();

    // 1. Match by 4-digit Short Code (e.g. "1001", "1002")
    const byShortcut = products.find(p => p.shortcutCode && p.shortcutCode.trim().toLowerCase() === cleanLower);
    if (byShortcut) return byShortcut;

    // 2. Match by exact Barcode
    const byBarcode = products.find(p => p.barcode && p.barcode.trim().toLowerCase() === cleanLower);
    if (byBarcode) return byBarcode;

    // 3. Match by exact Serial Number
    const bySerial = products.find(p => p.serialNumber && p.serialNumber.trim().toLowerCase() === cleanLower);
    if (bySerial) return bySerial;

    // 4. Match by Product ID
    const byId = products.find(p => p.id === clean || p.id.toLowerCase() === cleanLower);
    if (byId) return byId;

    return undefined;
  };

  // Dedicated handler when user inputs a Barcode, Serial Number, or Short Code and hits Enter
  const handleCodeEnterLookup = (code: string, sourceField: 'barcode' | 'serial' | 'search') => {
    const trimmed = (code || '').trim();
    if (!trimmed) return;

    const matched = findRegisteredProduct(trimmed);
    if (matched) {
      handleSelectProductToEdit(matched);
      const codeType = matched.shortcutCode?.toLowerCase() === trimmed.toLowerCase()
        ? `Short Code: ${matched.shortcutCode}`
        : matched.serialNumber?.toLowerCase() === trimmed.toLowerCase()
        ? `S/N: ${matched.serialNumber}`
        : `Barcode: ${matched.barcode || trimmed}`;
      showNotification('success', `✓ Found "${matched.name}" (${codeType}) - Opened for editing!`);
      
      // Auto-focus the Selling Price or Quantity field for rapid stock/price modification
      setTimeout(() => {
        if (priceInputRef.current) {
          priceInputRef.current.focus();
          priceInputRef.current.select();
        }
      }, 120);
    } else {
      if (sourceField === 'barcode') {
        showNotification('error', `No registered product found with barcode / short code "${trimmed}". Enter details to register as a new product.`);
        if (nameInputRef.current) {
          nameInputRef.current.focus();
        }
      } else if (sourceField === 'serial') {
        showNotification('error', `No registered product found with serial number / short code "${trimmed}".`);
        if (nameInputRef.current) {
          nameInputRef.current.focus();
        }
      } else {
        showNotification('error', `No registered product found matching "${trimmed}".`);
      }
    }
  };

  // Whenever barcode or serial number changes, check if existing product
  useEffect(() => {
    const trimmedBarcode = barcode.trim().toLowerCase();
    const trimmedSerial = serialNumber.trim().toLowerCase();

    if (!trimmedBarcode && !trimmedSerial) {
      setExistingProduct(prev => prev !== null ? null : prev);
      return;
    }

    const found = products.find(p => 
      (trimmedBarcode && p.barcode && p.barcode.trim().toLowerCase() === trimmedBarcode) ||
      (trimmedBarcode && p.shortcutCode && p.shortcutCode.trim().toLowerCase() === trimmedBarcode) ||
      (trimmedSerial && p.shortcutCode && p.shortcutCode.trim().toLowerCase() === trimmedSerial) ||
      (trimmedSerial && p.serialNumber && p.serialNumber.trim().toLowerCase() === trimmedSerial)
    );

    if (found) {
      setExistingProduct(prev => {
        if (prev?.id === found.id) return prev;
        return found;
      });
      // Only set form values if switching to a new found product
      setExistingProduct(prev => {
        if (prev?.id !== found.id) {
          if (!barcode && found.barcode) setBarcode(found.barcode);
          if (!serialNumber && found.serialNumber) setSerialNumber(found.serialNumber || '');
          setName(found.name);
          setImageUrl(found.imageUrl || '');
          setWeight(found.weight || '');
          setCategory(found.category || 'General');
          setCostPrice(found.costPrice !== undefined ? found.costPrice : '');
          setPrice(found.price);
          setMinStockLevel(found.minStockLevel || 5);
          setSellBy(found.sellBy || (found.unitType === 'kg' ? 'weight' : 'unit'));
          setUnitType((found.unitType as any) || (found.sellBy === 'weight' ? 'kg' : 'piece'));
          setWeightPerUnit(found.weightPerUnit !== undefined ? found.weightPerUnit : '');
          setStockAdjustmentMode('keep');
          setStockQuantityToAdd('');
          return found;
        }
        return prev;
      });
    } else {
      setExistingProduct(prev => prev !== null ? null : prev);
    }
  }, [barcode, serialNumber, products]);

  const showNotification = (type: 'success' | 'error', text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 5000);
  };

  const handleResetForm = () => {
    setBarcode('');
    setSerialNumber('');
    setName('');
    setImageUrl('');
    setWeight('');
    setWeightPerUnit('');
    setCategory('General');
    setCostPrice('');
    setMarginPercent('');
    setPrice('');
    setDiscountActive(false);
    setDiscountType('percentage');
    setDiscountValue('');
    setDiscountStartDate(getTodayISO());
    setDiscountEndDate('');
    setHasDateLimit(false);
    setStockQuantityToAdd('');
    setStockAdjustmentMode('keep');
    setExistingProduct(null);
    if (barcodeInputRef.current) {
      barcodeInputRef.current.focus();
    }
  };

  const handleSelectProductToEdit = (p: Product) => {
    setBarcode(p.barcode || '');
    setSerialNumber(p.serialNumber || '');
    setExistingProduct(p);
    setName(p.name);
    setImageUrl(p.imageUrl || '');
    setWeight(p.weight || '');
    setCategory(p.category || 'General');
    const cPrice = p.costPrice !== undefined ? p.costPrice : '';
    setCostPrice(cPrice);
    setPrice(p.price);
    if (typeof cPrice === 'number' && cPrice > 0 && typeof p.price === 'number' && p.price > 0) {
      setMarginPercent(Math.round(((p.price - cPrice) / cPrice) * 100 * 10) / 10);
    } else {
      setMarginPercent('');
    }
    setDiscountActive(p.discountActive || false);
    setDiscountType(p.discountType || 'percentage');
    setDiscountValue(p.discountValue !== undefined && p.discountValue > 0 ? p.discountValue : '');
    setDiscountStartDate(p.discountStartDate || getTodayISO());
    setDiscountEndDate(p.discountEndDate || '');
    setHasDateLimit(Boolean(p.discountEndDate));
    setMinStockLevel(p.minStockLevel || 5);
    setSellBy(p.sellBy || (p.unitType === 'kg' ? 'weight' : 'unit'));
    setUnitType((p.unitType as any) || (p.sellBy === 'weight' ? 'kg' : 'piece'));
    setWeightPerUnit(p.weightPerUnit !== undefined ? p.weightPerUnit : '');
    setStockAdjustmentMode('keep');
    setStockQuantityToAdd('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenGeneratorForProduct = (p?: Product) => {
    if (p) {
      setProductForGenerator(p);
    } else {
      setProductForGenerator({
        name: name || '',
        imageUrl: imageUrl || undefined,
        barcode: barcode || '',
        serialNumber: serialNumber || '',
        weight: weight || (sellBy === 'weight' ? '1 kg' : '500g'),
        costPrice: typeof costPrice === 'number' ? costPrice : (costPrice !== '' ? parseFloat(costPrice as any) : undefined),
        price: typeof price === 'number' ? price : 0,
        category: category || 'General',
        stockQuantity: typeof stockQuantityToAdd === 'number' ? stockQuantityToAdd : 50,
        sellBy: sellBy,
        unitType: unitType,
        pricePerKg: sellBy === 'weight' && typeof price === 'number' ? price : undefined,
        weightPerUnit: typeof weightPerUnit === 'number' ? weightPerUnit : undefined
      });
    }
    setIsGeneratorOpen(true);
  };

  const handleDirectDownloadBarcode = async (p: Product) => {
    try {
      showNotification('success', `Preparing barcode download for "${p.name}"...`);
      await downloadBarcodeForProduct(p, store?.name || 'SUPERMARKET');
      showNotification('success', `Downloaded Barcode Sticker for "${p.name}"!`);
    } catch (err: any) {
      showNotification('error', `Failed to download barcode: ${err?.message || 'Unknown error'}`);
    }
  };

  const handleAutoGenerateBarcodeNumber = () => {
    const newCode = generate5DigitBarcode();
    setBarcode(newCode);
    showNotification('success', `Generated new Full Barcode: ${newCode}`);
  };

  const handleSubmitProductStock = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    let trimmedBarcode = barcode.trim();
    const trimmedName = name.trim();
    const trimmedWeight = weight.trim();
    const numericPrice = typeof price === 'number' ? price : parseFloat(price as any);
    const numericCostPrice = typeof costPrice === 'number' ? costPrice : (costPrice !== '' ? parseFloat(costPrice as any) : undefined);
    const numericWeightPerUnit = typeof weightPerUnit === 'number' ? weightPerUnit : (weightPerUnit ? parseFloat(weightPerUnit as string) : undefined);

    if (!trimmedName) {
      showNotification('error', 'Product Name is required.');
      return;
    }

    if (isNaN(numericPrice) || numericPrice < 0) {
      showNotification('error', sellBy === 'weight' ? 'Please enter a valid price per kg in Pakistani Rupees (Rs.).' : 'Please enter a valid price in Pakistani Rupees (Rs.).');
      return;
    }

    // MANDATORY REQUIREMENT: Product register cannot register product without adding cost price
    if (numericCostPrice === undefined || isNaN(numericCostPrice) || numericCostPrice < 0) {
      showNotification('error', 'Cost Price is mandatory! A product cannot be registered without adding its cost price.');
      return;
    }

    // Auto-generate full barcode if not entered
    if (!trimmedBarcode) {
      trimmedBarcode = generate5DigitBarcode();
      setBarcode(trimmedBarcode);
    }

    // Find if barcode already belongs to an existing product in catalog
    const existingBarcodeMatch = trimmedBarcode 
      ? products.find(p => p.barcode && p.barcode.trim().toLowerCase() === trimmedBarcode.toLowerCase())
      : undefined;

    const targetProduct = existingProduct || existingBarcodeMatch;
    const unitLabel = sellBy === 'weight' ? 'kg' : 'units';

    let finalTotalStock = 0;
    let stockSummaryText = '';

    if (targetProduct) {
      if (stockAdjustmentMode === 'keep') {
        finalTotalStock = targetProduct.stockQuantity;
        stockSummaryText = `Stock kept at ${finalTotalStock} ${unitLabel}`;
      } else if (stockAdjustmentMode === 'set') {
        const parsedVal = typeof stockQuantityToAdd === 'number' ? stockQuantityToAdd : (stockQuantityToAdd === '' ? 0 : parseFloat(stockQuantityToAdd as string));
        if (isNaN(parsedVal) || parsedVal < 0) {
          showNotification('error', 'Please enter a valid stock quantity (0 or greater).');
          return;
        }
        finalTotalStock = Math.round(parsedVal * 1000) / 1000;
        stockSummaryText = `Stock set to ${finalTotalStock} ${unitLabel}`;
      } else {
        // 'add'
        const parsedVal = typeof stockQuantityToAdd === 'number' ? stockQuantityToAdd : (stockQuantityToAdd === '' ? 0 : parseFloat(stockQuantityToAdd as string));
        if (isNaN(parsedVal) || parsedVal <= 0) {
          showNotification('error', `Please enter a quantity greater than 0 to add to stock.`);
          return;
        }
        const roundedAdded = Math.round(parsedVal * 1000) / 1000;
        finalTotalStock = Math.round((targetProduct.stockQuantity + roundedAdded) * 1000) / 1000;
        stockSummaryText = `Added +${roundedAdded} ${unitLabel} (Total Stock: ${finalTotalStock} ${unitLabel})`;
      }
    } else {
      // New product
      const parsedVal = typeof stockQuantityToAdd === 'number' ? stockQuantityToAdd : (stockQuantityToAdd === '' ? 0 : parseFloat(stockQuantityToAdd as string));
      if (isNaN(parsedVal) || parsedVal < 0) {
        showNotification('error', 'Please enter a valid initial stock quantity (0 or greater).');
        return;
      }
      finalTotalStock = Math.round(parsedVal * 1000) / 1000;
      stockSummaryText = `Initial stock: ${finalTotalStock} ${unitLabel}`;
    }

    setLoading(true);

    // Auto-save new custom category to store in Firestore if not already present
    const finalCat = category.trim() || 'General';
    if (finalCat && !availableCategories.some(c => c.toLowerCase() === finalCat.toLowerCase())) {
      saveNewCategoryToStore(store.id, store.customCategories || [], finalCat).catch(e => console.warn('Category sync:', e));
    }

    try {
      // System assigns a 4-digit serial number (1001-9999)
      const assigned4DigitSerial = targetProduct?.serialNumber && /^\d{4}$/.test(targetProduct.serialNumber)
        ? targetProduct.serialNumber
        : targetProduct?.shortcutCode && /^\d{4}$/.test(targetProduct.shortcutCode)
        ? targetProduct.shortcutCode
        : generateNext4DigitSerialNumber(products);

      const assignedShortcutCode = targetProduct?.shortcutCode && /^\d{4}$/.test(targetProduct.shortcutCode)
        ? targetProduct.shortcutCode
        : assigned4DigitSerial;

      const codeInfo = [
        `S/N: ${assigned4DigitSerial}`,
        trimmedBarcode ? `BC: ${trimmedBarcode}` : null,
        trimmedWeight ? `Wt: ${trimmedWeight}` : null,
        sellBy === 'weight' ? 'Sell By Weight (kg)' : null
      ].filter(Boolean).join(', ');

      if (targetProduct) {
        // UPDATE EXISTING PRODUCT
        const productDocRef = doc(db, 'products', targetProduct.id);

        const numDiscountValue = discountActive && discountValue !== '' ? Number(discountValue) : undefined;
        const finalStartDate = discountActive && hasDateLimit && discountStartDate ? discountStartDate : undefined;
        const finalEndDate = discountActive && hasDateLimit && discountEndDate ? discountEndDate : undefined;

        await updateDoc(productDocRef, cleanFirestoreData({
          barcode: trimmedBarcode || '',
          shortcutCode: assignedShortcutCode,
          serialNumber: assigned4DigitSerial,
          name: trimmedName,
          imageUrl: imageUrl.trim() || undefined,
          weight: trimmedWeight || (sellBy === 'weight' ? `${finalTotalStock} kg` : ''),
          category: category.trim() || 'General',
          costPrice: numericCostPrice !== undefined && !isNaN(numericCostPrice) ? numericCostPrice : 0,
          price: numericPrice,
          pricePerKg: sellBy === 'weight' ? numericPrice : undefined,
          sellBy: sellBy,
          unitType: sellBy === 'weight' ? (unitType || 'kg') : (unitType || 'piece'),
          weightPerUnit: numericWeightPerUnit || undefined,
          discountActive: discountActive && !!numDiscountValue,
          discountType: discountType || 'percentage',
          discountValue: numDiscountValue || undefined,
          discountStartDate: finalStartDate || null,
          discountEndDate: finalEndDate || null,
          stockQuantity: finalTotalStock,
          minStockLevel: minStockLevel || 5,
          updatedAt: new Date().toISOString()
        }));

        showNotification(
          'success',
          `Updated "${trimmedName}" (${codeInfo})! Price: Rs. ${numericPrice.toFixed(2)}${sellBy === 'weight' ? '/kg' : ''} • ${stockSummaryText}`
        );
      } else {
        // REGISTER NEW PRODUCT with system-assigned 4-digit serial number
        const productDocRef = doc(collection(db, 'products'));
        const numDiscountValue = discountActive && discountValue !== '' ? Number(discountValue) : undefined;
        const finalStartDate = discountActive && hasDateLimit && discountStartDate ? discountStartDate : undefined;
        const finalEndDate = discountActive && hasDateLimit && discountEndDate ? discountEndDate : undefined;

        const newProduct: Product = {
          id: productDocRef.id,
          storeId: store.id,
          barcode: trimmedBarcode || '',
          shortcutCode: assignedShortcutCode,
          serialNumber: assigned4DigitSerial,
          name: trimmedName,
          imageUrl: imageUrl.trim() || undefined,
          weight: trimmedWeight || (sellBy === 'weight' ? `${finalTotalStock} kg` : ''),
          category: category.trim() || 'General',
          costPrice: numericCostPrice !== undefined && !isNaN(numericCostPrice) ? numericCostPrice : 0,
          price: numericPrice,
          pricePerKg: sellBy === 'weight' ? numericPrice : undefined,
          sellBy: sellBy,
          unitType: sellBy === 'weight' ? (unitType || 'kg') : (unitType || 'piece'),
          weightPerUnit: numericWeightPerUnit || undefined,
          discountActive: discountActive && !!numDiscountValue,
          discountType: discountType || 'percentage',
          discountValue: numDiscountValue || undefined,
          discountStartDate: finalStartDate,
          discountEndDate: finalEndDate,
          stockQuantity: finalTotalStock,
          minStockLevel: minStockLevel || 5,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        await setDoc(productDocRef, cleanFirestoreData(newProduct));

        showNotification(
          'success',
          `Registered new product "${trimmedName}" [4-Digit S/N: ${assigned4DigitSerial}]${codeInfo ? ` (${codeInfo})` : ''} at Rs. ${numericPrice.toFixed(2)}${sellBy === 'weight' ? '/kg' : ''} • ${stockSummaryText}`
        );
      }

      handleResetForm();
    } catch (err: any) {
      console.error(err);
      showNotification('error', 'Failed to save product: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handler for saving from BarcodeGeneratorModal
  const handleSaveFromGenerator = async (productData: {
    name: string;
    uniqueNumber: string;
    weight: string;
    costPrice?: number;
    price: number;
    category?: string;
    stockQuantity?: number;
  }) => {
    const existing = products.find(
      p => (p.barcode && p.barcode.toLowerCase() === productData.uniqueNumber.toLowerCase()) ||
           (p.name && p.name.toLowerCase() === productData.name.toLowerCase())
    );

    if (existing) {
      const newStock = existing.stockQuantity + (productData.stockQuantity || 50);
      await updateDoc(doc(db, 'products', existing.id), cleanFirestoreData({
        barcode: productData.uniqueNumber || '',
        name: productData.name,
        weight: productData.weight || '',
        costPrice: productData.costPrice !== undefined ? productData.costPrice : (existing.costPrice || 0),
        price: productData.price,
        category: productData.category || 'General',
        stockQuantity: newStock,
        updatedAt: new Date().toISOString()
      }));
      showNotification('success', `Updated stock for "${productData.name}" (Total Stock: ${newStock}) at Rs. ${productData.price.toFixed(2)}`);
    } else {
      const newDocRef = doc(collection(db, 'products'));
      const shortcutCode = generateNextShortcutCode(products);
      const newProd: Product = {
        id: newDocRef.id,
        storeId: store.id,
        barcode: productData.uniqueNumber || '',
        shortcutCode,
        name: productData.name,
        weight: productData.weight || '',
        category: productData.category || 'General',
        costPrice: productData.costPrice || 0,
        price: productData.price,
        stockQuantity: productData.stockQuantity || 50,
        minStockLevel: 5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await setDoc(newDocRef, cleanFirestoreData(newProd));
      showNotification('success', `Created & registered product "${productData.name}" [Code: ${shortcutCode}] with ${productData.stockQuantity || 50} units at Rs. ${productData.price.toFixed(2)}`);
    }
  };

  // Calculate store inventory and financial valuation
  const inventoryStats = useMemo(() => {
    let totalCostValue = 0;
    let totalRetailValue = 0;
    let totalUnitsCount = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    (products || []).forEach((p) => {
      const qty = p.stockQuantity || 0;
      const effectiveSellPrice = p.price || p.pricePerKg || 0;
      const effectiveCostPrice = p.costPrice || 0;
      const minLevel = p.minStockLevel ?? 5;

      totalUnitsCount += qty;
      totalCostValue += effectiveCostPrice * qty;
      totalRetailValue += effectiveSellPrice * qty;

      if (qty <= 0) {
        outOfStockCount++;
      } else if (qty <= minLevel) {
        lowStockCount++;
      }
    });

    const projectedProfit = totalRetailValue - totalCostValue;
    const overallMargin = totalRetailValue > 0 ? (projectedProfit / totalRetailValue) * 100 : 0;

    return {
      totalItemsCount: totalUnitsCount,
      totalUnitsCount,
      totalProductsCount: (products || []).length,
      totalCostValue,
      totalRetailValue,
      projectedProfit,
      overallMargin,
      lowStockCount,
      outOfStockCount
    };
  }, [products]);

  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);

  const confirmSingleDelete = async () => {
    if (!productToDelete) return;
    const p = productToDelete;
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'products', p.id));
      showNotification('success', `Deleted "${p.name}" from stock inventory.`);

      setSelectedProductIds(prev => prev.filter(id => id !== p.id));

      if (existingProduct?.id === p.id) {
        setBarcode('');
        setSerialNumber('');
        setName('');
        setWeight('');
        setCategory('General');
        setPrice('');
        setStockQuantityToAdd('');
        setExistingProduct(null);
      }
      setProductToDelete(null);
    } catch (err: any) {
      console.error('Delete product error:', err);
      showNotification('error', 'Failed to delete product stock: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProduct = (p: Product) => {
    setProductToDelete(p);
  };

  const handleToggleSelectProduct = (id: string) => {
    setSelectedProductIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    if (selectedProductIds.length === filteredCatalog.length && filteredCatalog.length > 0) {
      setSelectedProductIds([]);
    } else {
      setSelectedProductIds(filteredCatalog.map(p => p.id));
    }
  };

  const handleBulkDelete = () => {
    if (selectedProductIds.length === 0) return;
    setIsBulkDeleteModalOpen(true);
  };

  const confirmBulkDelete = async () => {
    if (selectedProductIds.length === 0) return;

    setLoading(true);
    let deletedCount = 0;
    try {
      for (const id of selectedProductIds) {
        await deleteDoc(doc(db, 'products', id));
        deletedCount++;
      }

      showNotification('success', `Successfully deleted ${deletedCount} selected product(s) from inventory.`);
      setSelectedProductIds([]);
      setIsBulkDeleteModalOpen(false);

      if (existingProduct && selectedProductIds.includes(existingProduct.id)) {
        setBarcode('');
        setSerialNumber('');
        setName('');
        setWeight('');
        setCategory('General');
        setPrice('');
        setStockQuantityToAdd('');
        setExistingProduct(null);
      }
    } catch (err: any) {
      console.error('Bulk delete error:', err);
      showNotification('error', 'Failed during bulk deletion: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredCatalog = products.filter(p => {
    if (catalogFilter === 'weight' && !(p.sellBy === 'weight' || p.unitType === 'kg' || p.pricePerKg)) return false;
    if (catalogFilter === 'unit' && (p.sellBy === 'weight' || p.unitType === 'kg' || p.pricePerKg)) return false;

    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      p.name.toLowerCase().includes(term) ||
      p.barcode.toLowerCase().includes(term) ||
      (p.serialNumber && p.serialNumber.toLowerCase().includes(term)) ||
      (p.weight && p.weight.toLowerCase().includes(term)) ||
      p.category.toLowerCase().includes(term)
    );
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6">

        {/* Top Control Banner */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-5 relative overflow-hidden"
        >
          <div className="space-y-1.5 z-10">
            {onBack && (
              <div className="mb-2">
                <UniversalBackButton onBack={onBack} label="Back to Dashboard" />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-50 text-orange-700 border border-orange-200 flex items-center gap-1.5 shadow-2xs">
                <PackagePlus className="w-3.5 h-3.5 text-orange-600" /> Product Register & Stock
              </span>
              <span className="text-xs text-slate-500 font-medium">Store: <strong className="text-slate-800">{store.name}</strong></span>
              <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-bold">
                PKR (Rs.)
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span>Product Register &</span>
              <span className="text-orange-600">Inventory Stock</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 max-w-2xl font-medium">
              Add products, adjust stock quantities, and generate barcode stickers. Scanners work automatically.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 z-10 shrink-0">
            {/* Discounts & Promotions Manager Button */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setIsDiscountModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs uppercase tracking-wider shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer relative"
              title="Add discount to all or selected products (% or Rs.)"
            >
              <Tag className="w-4 h-4 text-rose-200" />
              <span>Discounts & Sales</span>
              {products.filter(p => p.discountActive && p.discountValue).length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 bg-white text-rose-700 text-[10px] font-black rounded-full">
                  {products.filter(p => p.discountActive && p.discountValue).length}
                </span>
              )}
            </motion.button>

            {/* Multi-Product Batch Entry & Excel Import */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setIsExcelModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-extrabold text-xs uppercase tracking-wider shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              title="Upload Excel from device or create spreadsheet in-app"
            >
              <FileSpreadsheet className="w-4 h-4 text-orange-200" /> Excel / Spreadsheet
            </motion.button>

            {/* AI Assistant Button */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setIsAiAssistantOpen(true)}
              className="px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-extrabold text-xs uppercase tracking-wider shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              title="Store AI Copilot: Query cheapest/most selling items or ask questions"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-200" /> AI Assistant
            </motion.button>

            {/* Generate Barcode Button */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleOpenGeneratorForProduct()}
              className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs uppercase tracking-wider shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <BarcodeIcon className="w-4 h-4 text-amber-400" /> Barcode Sticker
            </motion.button>

            {/* Camera Scanner Trigger (respects store setting) */}
            {store.cameraScannerEnabled !== false && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setIsScannerOpen(true)}
                className="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-extrabold text-xs uppercase tracking-wider shadow-2xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5 text-orange-600" /> Scanner
              </motion.button>
            )}

            {/* Collapsible Device & Hardware Controls Toggle */}
            <button
              type="button"
              onClick={() => setShowHardwareBar(!showHardwareBar)}
              className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border cursor-pointer ${
                showHardwareBar 
                  ? 'bg-slate-800 text-white border-slate-700 shadow-xs' 
                  : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-300 shadow-2xs'
              }`}
              title="Show or hide camera, audio, and device permissions bar"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">Hardware</span>
              {showHardwareBar ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </motion.div>

        {/* Collapsible Hardware Permissions & Voice Controls */}
        <AnimatePresence>
          {showHardwareBar && (
            <motion.div
              initial={{ opacity: 0, height: 0, overflow: 'hidden' }}
              animate={{ opacity: 1, height: 'auto', overflow: 'visible' }}
              exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
              transition={{ duration: 0.2 }}
            >
              <HardwarePermissionsBar 
                voiceEnabled={voiceEnabled} 
                onToggleVoice={setVoiceEnabled} 
                voiceAllowed={store?.voiceAnnouncementEnabled !== false}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Global Notifications */}
        {msg && (
          <div className={`p-4 rounded-2xl border flex items-center gap-3 text-sm font-medium shadow-sm transition-all ${
            msg.type === 'success' 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            {msg.type === 'success' ? <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" /> : <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />}
            <span>{msg.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Form Column: Stock In & Product Registration Form */}
          <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <PackagePlus className="w-5 h-5 text-orange-600" /> 
                  {existingProduct ? 'Update Product & Price' : 'Register Product Stock'}
                </h2>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  {existingProduct ? `Modifying "${existingProduct.name}"` : 'Enter product details or scan barcode to add stock'}
                </p>
              </div>

              {existingProduct ? (
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                    Editing Item
                  </span>
                  <button
                    type="button"
                    onClick={handleResetForm}
                    className="text-xs font-bold text-slate-500 hover:text-slate-900 px-2 py-1 rounded-lg hover:bg-slate-100 transition-all cursor-pointer"
                    title="Cancel edit and register a new item"
                  >
                    ✕ New Item
                  </button>
                </div>
              ) : (
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  New Item
                </span>
              )}
            </div>

            {/* Helpful Notice about Serial Number and Barcode */}
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-600 flex items-start gap-2">
              <Info className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
              <span>
                <strong>Note:</strong> You can edit product price at any time without entering quantity. Barcode or Serial Number can also be customized.
              </span>
            </div>

            <form onSubmit={handleSubmitProductStock} className="space-y-4">
              
              {/* Selling Method Mode: Piece vs Weight */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Selling Method *
                </label>
                <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => {
                      setSellBy('unit');
                      if (unitType === 'kg' || unitType === 'g') setUnitType('piece');
                    }}
                    className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      sellBy === 'unit'
                        ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <PackagePlus className="w-4 h-4 text-blue-600" />
                    <span>📦 By Piece / Unit</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSellBy('weight');
                      setUnitType('kg');
                    }}
                    className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      sellBy === 'weight'
                        ? 'bg-orange-600 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Scale className="w-4 h-4 text-amber-300" />
                    <span>⚖️ By Weight (per kg)</span>
                  </button>
                </div>
              </div>

              {/* Product Barcode Field (Full Barcode) with Scan Trigger & Auto-Gen */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <BarcodeIcon className="w-3.5 h-3.5 text-orange-600" />
                    <span>Product Barcode (Full Barcode)</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleAutoGenerateBarcodeNumber}
                    className="text-[10px] text-orange-600 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" /> Auto-fill Full Barcode
                  </button>
                </div>
                <div className="relative flex gap-2">
                  <div className="relative flex-1">
                    <BarcodeIcon className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      ref={barcodeInputRef}
                      type="text"
                      maxLength={50}
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder="Scan or enter full barcode (e.g. 890123456789) & press Enter..."
                      value={barcode}
                      onChange={(e) => {
                        setBarcode(e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleCodeEnterLookup(barcode, 'barcode');
                        }
                      }}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-orange-500 focus:bg-white font-mono shadow-inner transition-all font-bold tracking-wide"
                    />
                  </div>
                  {store.cameraScannerEnabled !== false && (
                    <button
                      type="button"
                      onClick={() => setIsScannerOpen(true)}
                      className="p-2.5 rounded-xl bg-slate-100 border border-slate-300 hover:border-orange-500 text-orange-600 hover:text-orange-700 transition-colors cursor-pointer shrink-0"
                      title="Camera Scanner"
                    >
                      <Camera className="w-5 h-5" />
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1 px-1">
                  <span>Full barcode recorded (EAN-13, UPC, Code-128, etc.)</span>
                  <span className="font-mono font-medium text-slate-500">{barcode.length} chars</span>
                </div>
              </div>

              {/* System Assigned 4-Digit Serial Number (Auto Assigned, No Manual Entry) */}
              <div className="p-3 bg-amber-50/80 border border-amber-200/90 rounded-xl flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-800 font-mono font-black text-sm">
                    #
                  </div>
                  <div>
                    <div className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                      <span>Serial Number (S/N)</span>
                      <span className="text-[10px] bg-amber-200/90 text-amber-900 px-1.5 py-0.2 rounded-md font-bold">
                        Auto 4 Digits
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-700 font-medium mt-0.5">
                      {existingProduct ? (
                        <span>System assigned: <strong className="font-mono text-amber-950 font-bold">{existingProduct.serialNumber || existingProduct.shortcutCode || '1001'}</strong></span>
                      ) : (
                        <span>System will automatically assign: <strong className="font-mono text-amber-950 font-bold">{previewNextSerialNumber}</strong> on save</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="font-mono font-black text-amber-950 text-base bg-white px-3 py-1.5 rounded-lg border border-amber-300 shadow-xs tracking-wider">
                  #{existingProduct ? (existingProduct.serialNumber || existingProduct.shortcutCode || '1001') : previewNextSerialNumber}
                </div>
              </div>

              {/* Product Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Product Name *
                </label>
                <input
                  ref={nameInputRef}
                  type="text"
                  required
                  placeholder={sellBy === 'weight' ? 'e.g. Basmati Rice, Fresh Apples, Sugar' : 'e.g. Milk Pack, Shampoo, Cooking Oil'}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-orange-500 focus:bg-white font-medium transition-all"
                />
              </div>

              {/* Product Picture / Image Attachment */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-orange-600" />
                    <span>Product Picture</span>
                    <span className="text-[10px] text-slate-400 font-normal lowercase">(optional)</span>
                  </label>
                  <div className="flex items-center gap-1 bg-slate-200/80 p-0.5 rounded-lg text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => setImageInputMode('upload')}
                      className={`px-2 py-0.5 rounded-md cursor-pointer transition-all ${
                        imageInputMode === 'upload' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      File Upload
                    </button>
                    <button
                      type="button"
                      onClick={() => setImageInputMode('url')}
                      className={`px-2 py-0.5 rounded-md cursor-pointer transition-all ${
                        imageInputMode === 'url' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      Image URL
                    </button>
                  </div>
                </div>

                {imageUrl ? (
                  <div className="flex items-center gap-4 p-2.5 bg-white rounded-xl border border-slate-200 shadow-xs">
                    <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                      <img
                        src={imageUrl}
                        alt="Product preview"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as any).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">Photo Attached</p>
                      <p className="text-[10px] text-emerald-600 font-medium">Visible on Customer Price Checker & POS</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setImageUrl('')}
                      className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-600 hover:text-white border border-red-200 transition-colors cursor-pointer"
                      title="Remove product picture"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div>
                    {imageInputMode === 'upload' ? (
                      <div>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleImageFileUpload}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full py-4 border-2 border-dashed border-slate-300 hover:border-orange-500 rounded-xl bg-white hover:bg-orange-50/40 text-slate-600 hover:text-orange-600 transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer text-xs font-bold"
                        >
                          <Upload className="w-5 h-5 text-orange-600" />
                          <span>Click to Upload Product Picture</span>
                          <span className="text-[10px] text-slate-400 font-normal">Supports JPG, PNG, WEBP (auto-compressed)</span>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="relative">
                          <input
                            type="url"
                            placeholder="https://example.com/product-image.jpg"
                            value={imageUrl}
                            onChange={(e) => setImageUrl(e.target.value)}
                            className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-orange-500 font-medium"
                          />
                        </div>
                        <p className="text-[10px] text-slate-400">Paste direct image URL from web or catalog</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Weight & Category Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    {sellBy === 'weight' ? 'Unit Type' : 'Weight / Volume'}
                  </label>
                  {sellBy === 'weight' ? (
                    <select
                      value={unitType}
                      onChange={(e) => setUnitType(e.target.value as any)}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm font-bold focus:outline-none focus:border-orange-500 focus:bg-white transition-all cursor-pointer"
                    >
                      <option value="kg">kg (Kilogram)</option>
                      <option value="g">g (Grams)</option>
                      <option value="liter">liter (Liters)</option>
                    </select>
                  ) : (
                    <div className="relative">
                      <Scale className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="e.g. 500g, 1kg, 250ml"
                        value={weight}
                        onChange={(e) => setWeight(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-orange-500 focus:bg-white font-medium transition-all"
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Category
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setNewCategoryName('');
                        setIsAddCategoryModalOpen(true);
                      }}
                      className="text-[11px] font-black text-orange-600 hover:text-orange-700 flex items-center gap-1 cursor-pointer transition-colors"
                      title="Create a new store category"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>+ Add New Category</span>
                    </button>
                  </div>

                  {/* Category Selection Combobox & Text Input */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <select
                        value={availableCategories.includes(category) ? category : 'custom'}
                        onChange={(e) => {
                          if (e.target.value === '__add_new__') {
                            setNewCategoryName('');
                            setIsAddCategoryModalOpen(true);
                          } else if (e.target.value !== 'custom') {
                            setCategory(e.target.value);
                          }
                        }}
                        className="w-1/2 px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs sm:text-sm focus:outline-none focus:border-orange-500 focus:bg-white font-medium transition-all"
                      >
                        <option value="">Select Category...</option>
                        {availableCategories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                        <option value="custom">Other / Custom...</option>
                        <option value="__add_new__">➕ + Add New Category</option>
                      </select>

                      <input
                        type="text"
                        placeholder="Or type custom category..."
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-1/2 px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs sm:text-sm focus:outline-none focus:border-orange-500 focus:bg-white font-medium transition-all"
                      />
                    </div>

                    {/* Quick Category Presets as requested: Grain, Biscuit, Oil, Ghee, Tea, Toys, Detergent, Soap, Laundry */}
                    <div className="flex items-center gap-1 flex-wrap pt-0.5">
                      <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mr-1">Presets:</span>
                      {['Grain', 'Biscuit', 'Oil', 'Ghee', 'Tea', 'Toys', 'Detergent', 'Soap', 'Laundry'].map((preset) => {
                        const isSelected = category.toLowerCase() === preset.toLowerCase();
                        return (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setCategory(preset)}
                            className={`px-2 py-0.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                              isSelected
                                ? 'bg-orange-600 text-white border-orange-600 shadow-2xs'
                                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            {preset}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Optional Pre-packaged pack weight when selling by weight */}
              {sellBy === 'weight' && (
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <span>Pre-packed Weight per Bag/Unit</span>
                      <span className="text-[10px] text-slate-500 font-normal">(Optional)</span>
                    </label>
                    <span className="text-[10px] text-orange-600 font-bold">Auto-multiply helper</span>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="e.g. 0.5 (kg per packet) or leave blank for loose"
                      value={weightPerUnit}
                      onChange={(e) => setWeightPerUnit(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-orange-500 font-mono"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500">
                    If this item is sold in fixed-weight bags (e.g. 0.5 kg bag), entering quantity at checkout will automatically multiply: <em>Quantity × Weight</em>.
                  </p>
                </div>
              )}

              {/* Stock Management & Price Grid */}
              <div className="space-y-3 pt-1">
                {existingProduct ? (
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                        Inventory Stock Adjustment
                      </label>
                      <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 font-mono">
                        Current: {existingProduct.stockQuantity} {sellBy === 'weight' || existingProduct.sellBy === 'weight' || unitType === 'kg' ? 'kg' : 'units'}
                      </span>
                    </div>

                    {/* Stock Mode Switcher: Keep vs Add vs Override */}
                    <div className="grid grid-cols-3 gap-1.5 bg-slate-200/70 p-1 rounded-xl text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => {
                          setStockAdjustmentMode('keep');
                          setStockQuantityToAdd('');
                        }}
                        className={`py-1.5 px-2 rounded-lg transition-all text-center cursor-pointer ${
                          stockAdjustmentMode === 'keep'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Keep Stock
                      </button>
                      <button
                        type="button"
                        onClick={() => setStockAdjustmentMode('add')}
                        className={`py-1.5 px-2 rounded-lg transition-all text-center cursor-pointer ${
                          stockAdjustmentMode === 'add'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        + Add Stock
                      </button>
                      <button
                        type="button"
                        onClick={() => setStockAdjustmentMode('set')}
                        className={`py-1.5 px-2 rounded-lg transition-all text-center cursor-pointer ${
                          stockAdjustmentMode === 'set'
                            ? 'bg-orange-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Set Total
                      </button>
                    </div>

                    {stockAdjustmentMode === 'keep' ? (
                      <p className="text-[11px] text-slate-500 font-medium">
                        ✓ Current inventory remains at <strong>{existingProduct.stockQuantity} {sellBy === 'weight' || existingProduct.sellBy === 'weight' || unitType === 'kg' ? 'kg' : 'units'}</strong>. You can update the price or details below without entering quantity.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                          {stockAdjustmentMode === 'add'
                            ? `Quantity to ADD (+${sellBy === 'weight' || unitType === 'kg' ? 'kg' : 'units'}) *`
                            : `New Total Stock Count (${sellBy === 'weight' || unitType === 'kg' ? 'kg' : 'units'}) *`}
                        </label>
                        <input
                          ref={quantityInputRef}
                          type="number"
                          step="any"
                          min="0"
                          required={true}
                          placeholder={
                            stockAdjustmentMode === 'add'
                              ? (sellBy === 'weight' ? 'e.g. 10.5' : 'e.g. 10 or 40')
                              : (sellBy === 'weight' ? 'e.g. 50.0' : 'e.g. 40')
                          }
                          value={stockQuantityToAdd}
                          onChange={(e) => setStockQuantityToAdd(e.target.value === '' ? '' : parseFloat(e.target.value))}
                          className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-orange-500 font-bold text-emerald-700 transition-all font-mono"
                        />
                        <p className="text-[10px] text-slate-500">
                          {stockAdjustmentMode === 'add' && typeof stockQuantityToAdd === 'number' && !isNaN(stockQuantityToAdd)
                            ? `New Total will be: ${Math.round((existingProduct.stockQuantity + stockQuantityToAdd) * 1000) / 1000} ${sellBy === 'weight' || unitType === 'kg' ? 'kg' : 'units'}`
                            : stockAdjustmentMode === 'set'
                            ? 'Will replace current stock count in inventory.'
                            : 'Enter quantity to update inventory.'}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      {sellBy === 'weight' ? 'Initial Stock Weight (kg)' : 'Initial Stock Quantity'}
                    </label>
                    <input
                      ref={quantityInputRef}
                      type="number"
                      step="any"
                      min="0"
                      placeholder={sellBy === 'weight' ? 'e.g. 50.000 (Optional, default 0)' : 'e.g. 50 or 40 (Optional, default 0)'}
                      value={stockQuantityToAdd}
                      onChange={(e) => setStockQuantityToAdd(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-orange-500 focus:bg-white font-bold text-emerald-700 transition-all font-mono"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Optional. Defaults to 0 if left blank.</p>
                  </div>
                )}

                {/* Pricing & Cost Grid */}
                <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1">
                      <Coins className="w-4 h-4 text-orange-600" />
                      <span>Pricing & Profit Margin</span>
                    </label>
                    <span className="text-[10px] text-rose-600 font-extrabold bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                      Cost & Sell Price Mandatory
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* 1. Cost / Purchase Price (Rs.) */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Cost Price *
                      </label>
                      <div className="relative">
                        <span className="text-xs font-black text-slate-400 absolute left-3 top-1/2 -translate-y-1/2">
                          Rs.
                        </span>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          required
                          placeholder="e.g. 100.00"
                          value={costPrice}
                          onChange={(e) => {
                            const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                            setCostPrice(val);
                            if (typeof val === 'number' && val > 0 && typeof marginPercent === 'number') {
                              const calcSell = Math.round(val * (1 + marginPercent / 100) * 100) / 100;
                              setPrice(calcSell);
                            } else if (typeof val === 'number' && val > 0 && typeof price === 'number' && price > 0) {
                              setMarginPercent(Math.round(((price - val) / val) * 100 * 10) / 10);
                            }
                          }}
                          className="w-full pl-9 pr-2.5 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 text-xs sm:text-sm focus:outline-none focus:border-rose-500 font-bold font-mono transition-all"
                        />
                      </div>
                    </div>

                    {/* 2. Margin Percentage (% Margin) */}
                    <div>
                      <label className="block text-[11px] font-bold text-amber-800 uppercase tracking-wider mb-1 flex items-center justify-between">
                        <span>Margin %</span>
                        <span className="text-[9px] text-amber-600">Auto-sets Sell</span>
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="any"
                          placeholder="e.g. 20"
                          value={marginPercent}
                          onChange={(e) => {
                            const mVal = e.target.value === '' ? '' : parseFloat(e.target.value);
                            setMarginPercent(mVal);
                            if (typeof mVal === 'number' && typeof costPrice === 'number' && costPrice > 0) {
                              const calcSell = Math.round(costPrice * (1 + mVal / 100) * 100) / 100;
                              setPrice(calcSell);
                            }
                          }}
                          className="w-full pl-3 pr-7 py-2 bg-amber-50/60 border border-amber-300 rounded-xl text-amber-950 text-xs sm:text-sm focus:outline-none focus:border-amber-500 font-mono font-black transition-all"
                        />
                        <span className="text-xs font-black text-amber-600 absolute right-2.5 top-1/2 -translate-y-1/2">
                          %
                        </span>
                      </div>
                    </div>

                    {/* 3. Selling Price (Rs.) */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Selling Price *
                      </label>
                      <div className="relative">
                        <span className="text-xs font-black text-slate-400 absolute left-3 top-1/2 -translate-y-1/2">
                          Rs.
                        </span>
                        <input
                          ref={priceInputRef}
                          type="number"
                          step="any"
                          min="0"
                          required
                          placeholder="e.g. 120.00"
                          value={price}
                          onChange={(e) => {
                            const pVal = e.target.value === '' ? '' : parseFloat(e.target.value);
                            setPrice(pVal);
                            if (typeof pVal === 'number' && pVal > 0 && typeof costPrice === 'number' && costPrice > 0) {
                              setMarginPercent(Math.round(((pVal - costPrice) / costPrice) * 100 * 10) / 10);
                            }
                          }}
                          className="w-full pl-9 pr-2.5 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 text-xs sm:text-sm focus:outline-none focus:border-emerald-500 font-black text-emerald-700 font-mono transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  {typeof costPrice === 'number' && typeof price === 'number' && costPrice > 0 && price > 0 && (
                    <div className="p-2.5 bg-white rounded-xl border border-slate-200 text-xs flex items-center justify-between font-medium">
                      <span className="text-slate-500">
                        Profit / Unit: <strong className="text-emerald-700 font-mono">Rs. {(price - costPrice).toFixed(2)}</strong>
                      </span>
                      <span className="text-amber-800 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-[11px]">
                        Profit Margin: {(((price - costPrice) / costPrice) * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>

                {/* Product Discount Configuration */}
                <div className="p-3.5 bg-rose-50/60 rounded-2xl border border-rose-200/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={discountActive}
                        onChange={(e) => setDiscountActive(e.target.checked)}
                        className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500 cursor-pointer"
                      />
                      <Tag className="w-3.5 h-3.5 text-rose-600" />
                      <span>Apply Discount on this Product</span>
                    </label>
                    {discountActive && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200 uppercase tracking-wider">
                        Active Discount
                      </span>
                    )}
                  </div>

                  {discountActive && (
                    <div className="space-y-2.5 pt-1">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                            Discount Type
                          </label>
                          <select
                            value={discountType}
                            onChange={(e) => setDiscountType(e.target.value as any)}
                            className="w-full px-3 py-2 bg-white border border-rose-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-rose-500"
                          >
                            <option value="percentage">Percentage (%)</option>
                            <option value="fixed">Fixed Rupees (Rs.)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                            {discountType === 'percentage' ? 'Percentage Off (%)' : 'Amount Off (Rs.)'}
                          </label>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            max={discountType === 'percentage' ? 100 : undefined}
                            placeholder={discountType === 'percentage' ? 'e.g. 10' : 'e.g. 50'}
                            value={discountValue}
                            onChange={(e) => setDiscountValue(e.target.value === '' ? '' : parseFloat(e.target.value))}
                            className="w-full px-3 py-2 bg-white border border-rose-200 rounded-xl text-xs font-bold text-rose-700 focus:outline-none focus:border-rose-500 font-mono"
                          />
                        </div>
                      </div>

                      {/* Time Limit & Date Range Settings */}
                      <div className="p-3 bg-white/80 border border-rose-200 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-slate-800 flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={hasDateLimit}
                              onChange={(e) => {
                                setHasDateLimit(e.target.checked);
                                if (e.target.checked && !discountEndDate) {
                                  applyDiscountDatePreset(7);
                                }
                              }}
                              className="w-3.5 h-3.5 text-rose-600 rounded border-slate-300 focus:ring-rose-500 cursor-pointer"
                            />
                            <Calendar className="w-3.5 h-3.5 text-rose-600" />
                            <span>Set Time Limit / Expiry Date</span>
                          </label>
                          {hasDateLimit && (
                            <span className="text-[9px] font-black uppercase text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full border border-rose-200">
                              Time-Limited
                            </span>
                          )}
                        </div>

                        {hasDateLimit ? (
                          <div className="space-y-2 pt-0.5">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                                  Valid From *
                                </label>
                                <input
                                  type="date"
                                  value={discountStartDate}
                                  onChange={(e) => setDiscountStartDate(e.target.value)}
                                  className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:border-rose-500"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                                  Valid Until *
                                </label>
                                <input
                                  type="date"
                                  min={discountStartDate}
                                  value={discountEndDate}
                                  onChange={(e) => setDiscountEndDate(e.target.value)}
                                  className="w-full px-2 py-1.5 bg-white border border-rose-300 rounded-lg text-xs font-bold text-rose-800 focus:outline-none focus:border-rose-500"
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
                                  onClick={() => applyDiscountDatePreset(preset.val)}
                                  className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-50 border border-slate-200 text-slate-600 hover:text-rose-600 hover:border-rose-300 transition-all cursor-pointer"
                                >
                                  {preset.label}
                                </button>
                              ))}
                            </div>

                            {discountStartDate && discountEndDate && (
                              <div className="text-[10px] text-rose-800 font-bold bg-rose-50/80 p-1.5 rounded-lg border border-rose-200 flex items-center gap-1">
                                <Clock className="w-3 h-3 text-rose-600 shrink-0" />
                                <span>Active: <strong>{formatShortDate(discountStartDate)}</strong> → <strong>{formatShortDate(discountEndDate)}</strong></span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-[10px] text-slate-400">
                            No time limit. Discount will remain active indefinitely until unchecked.
                          </p>
                        )}
                      </div>

                      {/* Live calculation preview */}
                      {(() => {
                        const originalP = typeof price === 'number' ? price : (price ? parseFloat(price as any) : 0);
                        const discVal = typeof discountValue === 'number' ? discountValue : (discountValue ? parseFloat(discountValue as any) : 0);
                        if (originalP > 0 && discVal > 0) {
                          const discAmt = discountType === 'percentage' ? (originalP * discVal) / 100 : discVal;
                          const finalP = Math.max(0, originalP - discAmt);
                          return (
                            <div className="p-2.5 bg-white rounded-xl border border-rose-200/90 flex items-center justify-between text-xs">
                              <div>
                                <span className="text-slate-500 text-[10px] block">Customer Pays</span>
                                <span className="font-black text-rose-700 text-sm font-mono">Rs. {finalP.toFixed(2)}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-slate-500 text-[10px] block">Customer Saves</span>
                                <span className="font-bold text-emerald-600 font-mono">Rs. {discAmt.toFixed(2)} {discountType === 'percentage' ? `(${discVal}%)` : ''}</span>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  )}
                </div>

                {/* Live Profit & Margin Indicator */}
                {(() => {
                  const numSellingPrice = typeof price === 'number' ? price : (price !== '' ? parseFloat(price as any) : 0);
                  const numCostPrice = typeof costPrice === 'number' ? costPrice : (costPrice !== '' ? parseFloat(costPrice as any) : 0);
                  
                  if (numSellingPrice <= 0 && numCostPrice <= 0) return null;

                  const unitProfit = numSellingPrice - numCostPrice;
                  const marginPercent = numSellingPrice > 0 ? (unitProfit / numSellingPrice) * 100 : 0;
                  const markupPercent = numCostPrice > 0 ? (unitProfit / numCostPrice) * 100 : 0;
                  const isProfit = unitProfit >= 0;

                  return (
                    <div className={`p-3.5 rounded-2xl border transition-all ${
                      isProfit ? 'bg-emerald-50/70 border-emerald-200' : 'bg-red-50/70 border-red-200'
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <TrendingUp className={`w-4 h-4 ${isProfit ? 'text-emerald-600' : 'text-red-600'}`} />
                          Profit Preview ({sellBy === 'weight' ? 'per kg' : 'per item'})
                        </span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                          isProfit ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {isProfit ? '✓ Profitable' : '⚠ Low / Negative Margin'}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-white p-2 rounded-xl border border-slate-200/80 shadow-xs">
                          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Est. Profit</div>
                          <div className={`text-xs sm:text-sm font-black font-mono mt-0.5 ${isProfit ? 'text-emerald-700' : 'text-red-700'}`}>
                            Rs. {unitProfit.toFixed(2)}
                          </div>
                        </div>

                        <div className="bg-white p-2 rounded-xl border border-slate-200/80 shadow-xs">
                          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Margin</div>
                          <div className={`text-xs sm:text-sm font-black font-mono mt-0.5 ${isProfit ? 'text-emerald-700' : 'text-red-700'}`}>
                            {marginPercent.toFixed(1)}%
                          </div>
                        </div>

                        <div className="bg-white p-2 rounded-xl border border-slate-200/80 shadow-xs">
                          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Markup</div>
                          <div className={`text-xs sm:text-sm font-black font-mono mt-0.5 ${isProfit ? 'text-emerald-700' : 'text-red-700'}`}>
                            {numCostPrice > 0 ? `${markupPercent.toFixed(1)}%` : 'N/A'}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Action Buttons */}
              <div className="space-y-2.5 pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 px-4 bg-orange-600 hover:bg-orange-500 text-white font-extrabold rounded-2xl shadow-lg shadow-orange-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer text-xs uppercase tracking-wider"
                >
                  <PlusCircle className="w-4 h-4" />
                  {loading ? 'Saving Stock...' : existingProduct ? 'Update Stock Batch & Price' : 'Register New Product Stock'}
                </button>

                {/* Quick Barcode Label Generation for current product */}
                <button
                  type="button"
                  onClick={() => handleOpenGeneratorForProduct()}
                  className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer text-xs"
                >
                  <Printer className="w-3.5 h-3.5 text-amber-400" />
                  Generate & Print Barcode Label for this Product
                </button>

                {existingProduct && (
                  <button
                    type="button"
                    onClick={() => handleDeleteProduct(existingProduct)}
                    disabled={loading}
                    className="w-full py-2 px-4 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer text-xs"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-600" />
                    Delete Product From Stock
                  </button>
                )}
              </div>

            </form>
          </div>

          {/* Right Column: Registered Inventory Catalog */}
          <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-blue-600" /> Current Store Inventory ({products.length})
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  Manage inventory, print barcode stickers, or edit prices (Pakistani Rupees)
                </p>
              </div>

              <div className="flex items-center gap-2">
                {selectedProductIds.length > 0 && (
                  <button
                    onClick={handleBulkDelete}
                    className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete ({selectedProductIds.length})
                  </button>
                )}

                <div className="relative min-w-[190px]">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search Barcode, S/N, Short Code or Name & press Enter..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCodeEnterLookup(searchTerm, 'search');
                      }
                    }}
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs focus:outline-none focus:border-orange-500 font-medium"
                  />
                </div>
              </div>
            </div>

            {/* Filter Tabs: All, By Weight, By Unit */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200">
              <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
                <button
                  type="button"
                  onClick={() => setCatalogFilter('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    catalogFilter === 'all'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  All Products ({products.length})
                </button>
                <button
                  type="button"
                  onClick={() => setCatalogFilter('weight')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                    catalogFilter === 'weight'
                      ? 'bg-orange-600 text-white shadow-sm'
                      : 'bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100'
                  }`}
                >
                  <Scale className="w-3 h-3" /> Sold by Weight ({products.filter(p => p.sellBy === 'weight' || p.unitType === 'kg' || p.pricePerKg).length})
                </button>
                <button
                  type="button"
                  onClick={() => setCatalogFilter('unit')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                    catalogFilter === 'unit'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
                  }`}
                >
                  <Package className="w-3 h-3" /> Sold by Unit ({products.filter(p => p.sellBy !== 'weight' && p.unitType !== 'kg' && !p.pricePerKg).length})
                </button>
              </div>

              <div className="text-[11px] text-slate-500 font-medium">
                Showing {filteredCatalog.length} of {products.length} products
              </div>
            </div>

            {filteredCatalog.length === 0 ? (
              <div className="text-sm text-slate-500 p-12 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 space-y-2">
                <PackagePlus className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="font-bold text-slate-700">No products found in catalog</p>
                <p className="text-xs text-slate-500">Use the form on the left or click "Generate & Print Barcode" to add items.</p>
              </div>
            ) : (
              <div className="overflow-x-auto overflow-y-auto max-h-[620px] overscroll-contain custom-scrollbar border border-slate-200 rounded-2xl">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-600 uppercase tracking-wider border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                      <th className="p-3.5 w-8">
                        <input
                          type="checkbox"
                          checked={selectedProductIds.length === filteredCatalog.length && filteredCatalog.length > 0}
                          onChange={handleToggleSelectAll}
                          className="w-4 h-4 text-orange-600 border-slate-300 rounded focus:ring-orange-500 cursor-pointer"
                          title="Select / Deselect all"
                        />
                      </th>
                      <th className="p-3.5">Product & Method</th>
                      <th className="p-3.5">S/N & Barcode</th>
                      <th className="p-3.5 text-center">Cost & Price</th>
                      <th className="p-3.5 text-center">Profit / Unit</th>
                      <th className="p-3.5 text-center">Available Stock</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredCatalog.map((p) => {
                      const isSelected = selectedProductIds.includes(p.id);
                      const isWeighted = p.sellBy === 'weight' || p.unitType === 'kg' || !!p.pricePerKg;
                      const cost = p.costPrice || 0;
                      const sell = p.price;
                      const itemProfit = sell - cost;
                      const itemMargin = sell > 0 ? (itemProfit / sell) * 100 : 0;
                      return (
                        <tr key={p.id} className={`${isSelected ? 'bg-orange-50/60' : 'hover:bg-slate-50'} transition-colors`}>
                          <td className="p-3.5">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectProduct(p.id)}
                              className="w-4 h-4 text-orange-600 border-slate-300 rounded focus:ring-orange-500 cursor-pointer"
                            />
                          </td>
                          <td className="p-3.5">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center">
                                {p.imageUrl ? (
                                  <img
                                    src={p.imageUrl}
                                    alt={p.name}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      (e.target as any).style.display = 'none';
                                    }}
                                  />
                                ) : (
                                  <ImageIcon className="w-5 h-5 text-slate-300" />
                                )}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-900">{p.name}</span>
                                  {isWeighted ? (
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-orange-100 text-orange-800 border border-orange-200 flex items-center gap-0.5">
                                      <Scale className="w-2.5 h-2.5" /> By Weight
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200">
                                      By Unit
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium mt-0.5">
                                  {p.weight && (
                                    <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono font-bold">
                                      {p.weight}
                                    </span>
                                  )}
                                  {p.weightPerUnit && (
                                    <span className="text-orange-700 font-semibold">
                                      ({p.weightPerUnit} kg/pack)
                                    </span>
                                  )}
                                  <span>{p.category || 'General'}</span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="p-3.5 text-xs space-y-1 font-mono">
                            <div className="font-bold text-amber-900 flex items-center gap-1">
                              <span className="text-[10px] bg-amber-100 text-amber-950 border border-amber-300 px-1.5 py-0.5 rounded font-black shadow-2xs">
                                S/N: #{p.serialNumber || p.shortcutCode || '1001'}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-600 font-medium">
                              BC: <strong className="text-slate-800">{p.barcode || 'N/A'}</strong>
                            </div>
                          </td>
                          <td className="p-3.5 text-center font-mono">
                            {(() => {
                              const discInfo = getProductDiscountInfo(p);
                              if (discInfo.hasDiscount) {
                                return (
                                  <div className="space-y-0.5">
                                    <div className="font-black text-rose-600 flex items-center justify-center gap-1">
                                      <span>Rs. {discInfo.discountedPrice.toFixed(2)}{isWeighted ? '/kg' : ''}</span>
                                      <span className="text-[10px] font-extrabold bg-rose-100 text-rose-800 px-1.5 py-0.2 rounded-full border border-rose-200">
                                        {discInfo.discountLabel}
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-slate-400 line-through">
                                      Was Rs. {(p.price ?? 0).toFixed(2)}
                                    </div>
                                    {p.discountEndDate && (
                                      <div className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 inline-flex items-center gap-1">
                                        <Clock className="w-2.5 h-2.5" />
                                        <span>{discInfo.dateStatusMessage}</span>
                                      </div>
                                    )}
                                    <div className="text-[10px] text-slate-500 font-semibold">
                                      Cost: Rs. {(cost || 0).toFixed(2)}
                                    </div>
                                  </div>
                                );
                              } else if (p.discountActive && (discInfo.isExpired || discInfo.isUpcoming)) {
                                return (
                                  <div className="space-y-0.5">
                                    <div className="font-black text-orange-600">
                                      Rs. {(p.price ?? 0).toFixed(2)}{isWeighted ? '/kg' : ''}
                                    </div>
                                    <div className={`text-[9px] font-bold px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${
                                      discInfo.isExpired ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-amber-50 text-amber-800 border-amber-200'
                                    }`}>
                                      <Clock className="w-2.5 h-2.5" />
                                      <span>{discInfo.dateStatusMessage}</span>
                                    </div>
                                    <div className="text-[10px] text-slate-500 font-semibold">
                                      Cost: Rs. {(cost || 0).toFixed(2)}
                                    </div>
                                  </div>
                                );
                              }
                              return (
                                <div>
                                  <div className="font-black text-orange-600">
                                    Rs. {(p.price ?? 0).toFixed(2)}{isWeighted ? '/kg' : ''}
                                  </div>
                                  <div className="text-[11px] text-slate-500 font-semibold">
                                    Cost: Rs. {(cost || 0).toFixed(2)}
                                  </div>
                                </div>
                              );
                            })()}
                          </td>
                          <td className="p-3.5 text-center font-mono">
                            <div className={`text-xs font-bold ${itemProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                              +Rs. {(itemProfit || 0).toFixed(2)}
                            </div>
                            <div className="text-[10px] text-slate-400 font-medium">
                              ({(itemMargin || 0).toFixed(0)}% margin)
                            </div>
                          </td>
                          <td className="p-3.5 text-center font-black text-sm">
                            <span className={(p.stockQuantity || 0) <= 0 ? 'text-red-600 font-black' : (p.stockQuantity || 0) <= 5 ? 'text-amber-600 font-bold' : 'text-emerald-600 font-black'}>
                              {(p.stockQuantity || 0) % 1 === 0 ? (p.stockQuantity || 0) : (p.stockQuantity || 0).toFixed(3)} {isWeighted ? 'kg' : 'units'}
                            </span>
                          </td>
                          <td className="p-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Quick Discount Setting Action */}
                              <button
                                onClick={() => setQuickDiscountProduct(p)}
                                className={`px-2 py-1.5 rounded-lg border transition-all text-xs font-bold flex items-center gap-1 cursor-pointer shadow-xs ${
                                  p.discountActive && (p.discountValue || 0) > 0
                                    ? 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-600 hover:text-white'
                                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-rose-50 hover:text-rose-700'
                                }`}
                                title={p.discountActive ? `Active Discount: ${p.discountValue}${p.discountType === 'percentage' ? '%' : ' Rs.'} off. Click to edit.` : 'Set item discount'}
                              >
                                <Percent className="w-3 h-3 text-rose-600" />
                                {p.discountActive && (p.discountValue || 0) > 0 ? (
                                  <span>{p.discountValue}{p.discountType === 'percentage' ? '%' : ' Rs.'}</span>
                                ) : (
                                  <span>Discount</span>
                                )}
                              </button>

                              {/* Print Barcode / Sticker Action */}
                              <button
                                onClick={() => handleOpenGeneratorForProduct(p)}
                                className="px-2 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-all text-xs font-bold flex items-center gap-1 cursor-pointer shadow-sm"
                                title="Open Barcode & Label Station"
                              >
                                <Printer className="w-3 h-3 text-amber-300" /> Print
                              </button>

                              {/* Direct Download Barcode Image */}
                              <button
                                onClick={() => handleDirectDownloadBarcode(p)}
                                className="px-2 py-1.5 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-600 hover:text-white transition-all text-xs font-bold flex items-center gap-1 cursor-pointer shadow-sm"
                                title="Download Barcode Sticker PNG"
                              >
                                <Download className="w-3 h-3 text-sky-600 group-hover:text-white" /> Download
                              </button>

                              <button
                                onClick={() => handleSelectProductToEdit(p)}
                                className="px-2.5 py-1.5 rounded-lg bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-600 hover:text-white transition-all text-xs font-bold flex items-center gap-1 cursor-pointer shadow-sm"
                                title="Update stock or price manually in the form"
                              >
                                <Edit3 className="w-3 h-3" /> Edit
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setAiEditTargetProduct(p);
                                  setIsAiAssistantOpen(true);
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-50 to-orange-50 text-orange-900 border border-orange-300 hover:from-orange-600 hover:to-amber-600 hover:text-white transition-all text-xs font-bold flex items-center gap-1 cursor-pointer shadow-xs"
                                title="Ask AI Copilot to edit price, cost, stock, or details"
                              >
                                <Sparkles className="w-3 h-3 text-amber-500" /> AI Edit
                              </button>

                              <button
                                onClick={() => handleDeleteProduct(p)}
                                className="px-2 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-600 hover:text-white transition-all text-xs font-bold flex items-center gap-1 cursor-pointer shadow-sm"
                                title="Delete stock item"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>

        {/* Dedicated Barcode Generator & Print Station Modal */}
        <BarcodeGeneratorModal
          isOpen={isGeneratorOpen}
          onClose={() => setIsGeneratorOpen(false)}
          store={store}
          initialProduct={productForGenerator}
          onSaveToInventory={handleSaveFromGenerator}
        />

        {/* Camera Scanner Modal */}
        <BarcodeScannerModal
          isOpen={isScannerOpen}
          onClose={() => setIsScannerOpen(false)}
          onScanSuccess={(scannedCode) => {
            const matched = findRegisteredProduct(scannedCode);
            if (matched) {
              handleSelectProductToEdit(matched);
              showNotification('success', `✓ Found "${matched.name}" - Opened for editing!`);
            } else {
              setBarcode(scannedCode);
              showNotification('success', `Scanned Barcode: ${scannedCode}`);
              if (barcodeInputRef.current) {
                barcodeInputRef.current.focus();
              }
            }
          }}
          title="Product Barcode Scanner"
          subtitle="Scan product barcode number to fill barcode field"
        />

        {/* Single Product Delete Confirmation Modal */}
        {productToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5">
              <div className="flex items-start gap-3">
                <div className="p-3 bg-red-100 text-red-600 rounded-2xl shrink-0">
                  <Trash2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900">Delete Product from Inventory?</h3>
                  <p className="text-xs text-slate-600 mt-1">
                    Are you sure you want to permanently delete <span className="font-bold text-slate-900">"{productToDelete.name}"</span>?
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs font-mono space-y-1 text-slate-700">
                <div><span className="font-bold">Barcode:</span> {productToDelete.barcode || 'N/A'}</div>
                {productToDelete.serialNumber && <div><span className="font-bold">S/N:</span> {productToDelete.serialNumber}</div>}
                {productToDelete.weight && <div><span className="font-bold">Weight:</span> {productToDelete.weight}</div>}
                <div><span className="font-bold">Price:</span> Rs. {(productToDelete.price ?? 0).toFixed(2)}</div>
                <div><span className="font-bold">Current Stock:</span> {productToDelete.stockQuantity} units</div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setProductToDelete(null)}
                  disabled={loading}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs cursor-pointer transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmSingleDelete}
                  disabled={loading}
                  className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs cursor-pointer transition-all shadow-md flex items-center gap-1.5"
                >
                  {loading ? 'Deleting...' : 'Yes, Delete Permanently'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Delete Confirmation Modal */}
        {isBulkDeleteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5">
              <div className="flex items-start gap-3">
                <div className="p-3 bg-red-100 text-red-600 rounded-2xl shrink-0">
                  <Trash2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900">Delete {selectedProductIds.length} Selected Products?</h3>
                  <p className="text-xs text-slate-600 mt-1">
                    Are you sure you want to permanently delete all <span className="font-bold text-slate-900">{selectedProductIds.length} selected items</span> from your stock database? This action cannot be undone.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsBulkDeleteModalOpen(false)}
                  disabled={loading}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs cursor-pointer transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmBulkDelete}
                  disabled={loading}
                  className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs cursor-pointer transition-all shadow-md flex items-center gap-1.5"
                >
                  {loading ? 'Deleting All...' : `Delete ${selectedProductIds.length} Items`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* EXCEL MANAGER MODAL (TWO OPTIONS: UPLOAD FROM DEVICE OR CREATE NOW) */}
        <ExcelManagerModal
          isOpen={isExcelModalOpen}
          onClose={() => setIsExcelModalOpen(false)}
          store={store}
          existingProducts={products}
          onSendToAi={(parsedRows) => {
            setSpreadsheetProductsForAi(parsedRows);
            setIsExcelModalOpen(false);
            setIsAiAssistantOpen(true);
          }}
          onProductsSaved={(count) => {
            showNotification('success', `Successfully saved ${count} products to store catalog!`);
          }}
          onOpenBatchModal={() => {
            setIsExcelModalOpen(false);
            setIsBatchModalOpen(true);
          }}
        />

        {/* MULTI-PRODUCT BATCH REGISTER & EXCEL MODAL */}
        <MultiProductBatchModal
          isOpen={isBatchModalOpen}
          onClose={() => setIsBatchModalOpen(false)}
          store={store}
          onSuccess={(count) => {
            showNotification('success', `Successfully registered ${count} products into catalog!`);
          }}
        />

        {/* SOFTWARE AI ASSISTANT MODAL */}
        <StoreAiAssistantModal
          isOpen={isAiAssistantOpen}
          onClose={() => {
            setIsAiAssistantOpen(false);
            setAiEditTargetProduct(null);
            setSpreadsheetProductsForAi(null);
          }}
          store={store}
          products={products}
          currentUser={currentUser}
          initialProductToEdit={aiEditTargetProduct}
          initialSpreadsheetProducts={spreadsheetProductsForAi}
          onProductUpdated={(updated) => {
            showNotification('success', `AI successfully updated "${updated.name}"!`);
          }}
          onOpenBatchRegister={() => {
            setIsAiAssistantOpen(false);
            setIsBatchModalOpen(true);
          }}
        />

        {/* DISCOUNT MANAGER MODAL */}
        <DiscountManagerModal
          isOpen={isDiscountModalOpen}
          onClose={() => setIsDiscountModalOpen(false)}
          products={products}
          store={store}
          onRefresh={() => {
            showNotification('success', 'Product discounts successfully updated!');
          }}
        />

        {/* SINGLE ITEM QUICK DISCOUNT MODAL */}
        <ItemDiscountModal
          isOpen={Boolean(quickDiscountProduct)}
          onClose={() => setQuickDiscountProduct(null)}
          product={quickDiscountProduct}
          store={store}
          onSuccess={(updated) => {
            showNotification('success', `Updated discount on "${updated.name}"!`);
          }}
        />

        {/* ADD NEW CATEGORY MODAL */}
        {isAddCategoryModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2 text-orange-600 font-black text-base">
                  <Tag className="w-5 h-5" />
                  <span>Add New Category</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddCategoryModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Category Name
                </label>
                <input
                  type="text"
                  autoFocus
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddNewCategory();
                    }
                  }}
                  placeholder="e.g. Grain, Biscuit, Oil, Ghee, Toys..."
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-orange-500 focus:bg-white font-medium transition-all"
                />
                <p className="text-[11px] text-slate-500">
                  This category will be permanently saved for store "{store.name}" and available in all product forms & AI queries.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddCategoryModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddNewCategory}
                  disabled={isSavingCategory || !newCategoryName.trim()}
                  className="px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  {isSavingCategory ? 'Saving...' : 'Save & Select'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
