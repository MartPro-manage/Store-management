import React, { useState, useEffect } from 'react';
import { 
  db, 
  doc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  handleFirestoreError, 
  OperationType 
} from '../lib/firebase';
import { Store, UserAccount } from '../types';
import { speakMessage } from '../lib/speech';
import { getAllCategories, DEFAULT_PRESET_CATEGORIES } from '../lib/categories';
import { authenticateWithGmail, getCachedGmailToken, getCachedGmailAddress } from '../lib/gmail';
import { 
  Settings, 
  Receipt, 
  Volume2, 
  Camera, 
  KeyRound, 
  ShieldCheck, 
  CheckCircle, 
  AlertCircle, 
  Save, 
  Bell, 
  Users, 
  Calculator, 
  PackageCheck,
  Check,
  Eye, 
  EyeOff,
  Upload,
  Image,
  Layout,
  Trash2,
  Plus,
  Tag,
  MapPin,
  Store as StoreIcon,
  FileText,
  QrCode,
  Mail,
  RefreshCw
} from 'lucide-react';

interface StoreSettingsViewProps {
  store: Store;
  currentUser: UserAccount;
  storeUsers: UserAccount[];
  onStoreUpdated?: (updatedStore: Store) => void;
  onNavigateToGmailLog?: () => void;
}

export const StoreSettingsView: React.FC<StoreSettingsViewProps> = ({
  store,
  currentUser,
  storeUsers,
  onStoreUpdated,
  onNavigateToGmailLog
}) => {
  // Store Identity & Address
  const [storeName, setStoreName] = useState(store.name || '');
  const [storeAddress, setStoreAddress] = useState(store.address || '');
  const [storePhone, setStorePhone] = useState(store.phone || '');

  // POS & Receipt Settings
  const [currencySymbol, setCurrencySymbol] = useState(store.currencySymbol || 'Rs.');
  const [receiptHeader, setReceiptHeader] = useState(store.receiptHeader || 'OFFICIAL SALES INVOICE');
  const [receiptFooter, setReceiptFooter] = useState(store.receiptFooter || 'THANK YOU FOR SHOPPING WITH US! Retain slip for returns.');
  const [receiptGreeting, setReceiptGreeting] = useState(store.receiptGreeting || 'Welcome & Thank You for Shopping!');
  const [receiptQrCodeEnabled, setReceiptQrCodeEnabled] = useState<boolean>(Boolean(store.receiptQrCodeEnabled));
  const [receiptQrTitle, setReceiptQrTitle] = useState(store.receiptQrTitle || 'Scan to Verify Receipt');
  const [receiptQrData, setReceiptQrData] = useState(store.receiptQrData || '');
  const [receiptQrImageUrl, setReceiptQrImageUrl] = useState<string>(store.receiptQrImageUrl || '');
  const [returnPolicyDays, setReturnPolicyDays] = useState<number>(store.returnPolicyDays || 7);
  const [receiptFormat, setReceiptFormat] = useState<'standard' | 'classic_detailed' | 'compact_eco'>(store.receiptFormat || 'standard');
  const [receiptFontFamily, setReceiptFontFamily] = useState(store.receiptFontFamily || 'Courier New');
  const [receiptFontBold, setReceiptFontBold] = useState<boolean>(Boolean(store.receiptFontBold));
  const [receiptFontItalic, setReceiptFontItalic] = useState<boolean>(Boolean(store.receiptFontItalic));
  const [receiptBorderRadius, setReceiptBorderRadius] = useState(store.receiptBorderRadius || 'rounded-2xl');
  const [logoUrl, setLogoUrl] = useState<string>(store.logoUrl || '');

  // Category Management
  const [customCategories, setCustomCategories] = useState<string[]>(store.customCategories || []);
  const [newCatInput, setNewCatInput] = useState('');

  // Audio & Hardware Settings
  const [soundEffectsEnabled, setSoundEffectsEnabled] = useState<boolean>(store.soundEffectsEnabled !== false);
  const [lowStockAlertThreshold, setLowStockAlertThreshold] = useState<number>(store.lowStockAlertThreshold || 5);
  const [adminGmail, setAdminGmail] = useState<string>(store.adminGmail || '');
  const [connectedGmail, setConnectedGmail] = useState<string | null>(getCachedGmailAddress());
  const [isConnectingGmail, setIsConnectingGmail] = useState(false);

  // Password Change State
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Voice Test & Status State
  const [voiceTestMsg, setVoiceTestMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Sync state if store prop changes
  useEffect(() => {
    setStoreName(store.name || '');
    setStoreAddress(store.address || '');
    setStorePhone(store.phone || '');
    setCurrencySymbol(store.currencySymbol || 'Rs.');
    setReceiptHeader(store.receiptHeader || 'OFFICIAL SALES INVOICE');
    setReceiptFooter(store.receiptFooter || 'THANK YOU FOR SHOPPING WITH US! Retain slip for returns.');
    setReceiptGreeting(store.receiptGreeting || 'Welcome & Thank You for Shopping!');
    setReceiptQrCodeEnabled(Boolean(store.receiptQrCodeEnabled));
    setReceiptQrTitle(store.receiptQrTitle || 'Scan to Verify Receipt');
    setReceiptQrData(store.receiptQrData || '');
    setReceiptQrImageUrl(store.receiptQrImageUrl || '');
    setReturnPolicyDays(store.returnPolicyDays || 7);
    setReceiptFormat(store.receiptFormat || 'standard');
    setReceiptFontFamily(store.receiptFontFamily || 'Courier New');
    setReceiptFontBold(Boolean(store.receiptFontBold));
    setReceiptFontItalic(Boolean(store.receiptFontItalic));
    setReceiptBorderRadius(store.receiptBorderRadius || 'rounded-2xl');
    setLogoUrl(store.logoUrl || '');
    setCustomCategories(store.customCategories || []);
    setSoundEffectsEnabled(store.soundEffectsEnabled !== false);
    setLowStockAlertThreshold(store.lowStockAlertThreshold || 5);
    setAdminGmail(store.adminGmail || '');
  }, [store]);

  const showNotification = (type: 'success' | 'error', text: string) => {
    setFeedbackMsg({ type, text });
    setTimeout(() => setFeedbackMsg(null), 5000);
  };

  // Convert uploaded image to Black and White for thermal printing
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showNotification('error', 'Please upload a valid image file (PNG or JPG).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxW = 320;
        const scale = Math.min(1, maxW / img.width);
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        // Convert to high-contrast Pure Black & White (optimal for thermal POS slips)
        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3];
          if (alpha < 60) {
            data[i] = 255;
            data[i + 1] = 255;
            data[i + 2] = 255;
            data[i + 3] = 255;
          } else {
            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            const bw = gray > 150 ? 255 : 0;
            data[i] = bw;
            data[i + 1] = bw;
            data[i + 2] = bw;
            data[i + 3] = 255;
          }
        }
        ctx.putImageData(imgData, 0, 0);
        const bwDataUrl = canvas.toDataURL('image/png');
        setLogoUrl(bwDataUrl);
        showNotification('success', 'Black & White logo processed! Remember to click "Save All Settings".');
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleQrImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showNotification('error', 'Please upload a valid image file for QR code.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      setReceiptQrImageUrl(event.target?.result as string);
      showNotification('success', 'Custom QR code image uploaded! Remember to click "Save All Settings".');
    };
    reader.readAsDataURL(file);
  };

  const handleAddCategory = async () => {
    const trimmed = newCatInput.trim();
    if (!trimmed) return;
    if (customCategories.includes(trimmed) || DEFAULT_PRESET_CATEGORIES.includes(trimmed)) {
      showNotification('error', `Category "${trimmed}" already exists.`);
      return;
    }
    const updated = [...customCategories, trimmed];
    setCustomCategories(updated);
    setNewCatInput('');
    try {
      const storeRef = doc(db, 'stores', store.id);
      await updateDoc(storeRef, { customCategories: updated });
      showNotification('success', `Category "${trimmed}" added and saved!`);
    } catch (err: any) {
      showNotification('error', `Failed to save category: ${err?.message || 'Error'}`);
    }
  };

  const handleRemoveCustomCategory = async (catName: string) => {
    const updated = customCategories.filter(c => c !== catName);
    setCustomCategories(updated);
    try {
      const storeRef = doc(db, 'stores', store.id);
      await updateDoc(storeRef, { customCategories: updated });
      showNotification('success', `Category "${catName}" removed!`);
    } catch (err: any) {
      showNotification('error', `Failed to remove category: ${err?.message || 'Error'}`);
    }
  };

  const handleTestVoice = () => {
    if (store.voiceAnnouncementEnabled === false) {
      showNotification('error', '⚠️ Voice generation is DISALLOWED by Super Admin policy for this store.');
      return;
    }
    const storeLabel = storeName || store.name || 'our store';
    speakMessage(`Total bill is 450 rupees. Thank you for shopping at ${storeLabel}!`);
    setVoiceTestMsg(`🔊 Playing voice test for "${storeLabel}"`);
    setTimeout(() => setVoiceTestMsg(null), 4000);
  };

  const handleSaveAllSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    setLoading(true);
    try {
      const storeRef = doc(db, 'stores', store.id);
      const updatePayload: Partial<Store> = {
        name: storeName.trim() || store.name,
        address: storeAddress.trim(),
        phone: storePhone.trim(),
        currencySymbol: currencySymbol.trim() || 'Rs.',
        receiptHeader: receiptHeader.trim(),
        receiptFooter: receiptFooter.trim(),
        receiptGreeting: receiptGreeting.trim(),
        receiptQrCodeEnabled: Boolean(receiptQrCodeEnabled),
        receiptQrTitle: receiptQrTitle.trim() || 'Scan to Verify Receipt',
        receiptQrData: receiptQrData.trim(),
        receiptQrImageUrl: receiptQrImageUrl || '',
        returnPolicyDays: Number(returnPolicyDays) || 7,
        receiptFormat: receiptFormat,
        logoUrl: logoUrl || '',
        customCategories: customCategories,
        soundEffectsEnabled: Boolean(soundEffectsEnabled),
        lowStockAlertThreshold: Number(lowStockAlertThreshold) || 5,
        adminGmail: adminGmail.trim()
      };

      // Also update password if provided
      if (newAdminPassword.trim()) {
        if (newAdminPassword.trim().length < 4) {
          showNotification('error', 'New password must be at least 4 characters long.');
          setLoading(false);
          return;
        }
        updatePayload.adminPassword = newAdminPassword.trim();
      }

      await updateDoc(storeRef, updatePayload);

      // If admin password changed, synchronize user record for this admin
      if (newAdminPassword.trim()) {
        const usersQ = query(
          collection(db, 'users'),
          where('storeId', '==', store.id),
          where('role', '==', 'admin')
        );
        const usersSnap = await getDocs(usersQ);
        for (const userDoc of usersSnap.docs) {
          await updateDoc(doc(db, 'users', userDoc.id), {
            password: newAdminPassword.trim()
          });
        }
        setNewAdminPassword('');
      }

      if (onStoreUpdated) {
        onStoreUpdated({ ...store, ...updatePayload });
      }

      showNotification('success', '✅ Store settings and receipt configuration updated successfully!');
    } catch (err: any) {
      console.error('Error saving store settings:', err);
      handleFirestoreError(err, OperationType.UPDATE, `stores/${store.id}`);
      showNotification('error', 'Failed to save settings: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const cashiers = storeUsers.filter(u => u.role === 'cash_counter');
  const registrars = storeUsers.filter(u => u.role === 'product_register');

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-orange-50 text-orange-700 border border-orange-200 flex items-center gap-1.5">
              <Settings className="w-3.5 h-3.5 text-orange-600" /> Admin Settings & Configuration
            </span>
            <span className="text-xs text-slate-500 font-semibold">Store ID: {store.id.slice(0, 8)}...</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Configure {store.name}
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 font-medium max-w-2xl">
            Manage POS receipts, voice announcement preferences, hardware audio policies, low inventory thresholds, and admin security in one centralized location.
          </p>
        </div>

        <button
          type="button"
          onClick={() => handleSaveAllSettings()}
          disabled={loading}
          className="px-6 py-3 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-extrabold rounded-2xl shadow-md shadow-orange-600/20 transition-all text-xs flex items-center justify-center gap-2 cursor-pointer shrink-0"
        >
          <Save className="w-4 h-4" /> {loading ? 'Saving...' : 'Save All Settings'}
        </button>
      </div>

      {/* Global Notification Toast */}
      {feedbackMsg && (
        <div className={`p-4 rounded-2xl border flex items-center gap-3 text-xs sm:text-sm font-bold shadow-sm transition-all animate-fade-in ${
          feedbackMsg.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
            : 'bg-red-50 border-red-200 text-red-900'
        }`}>
          {feedbackMsg.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          )}
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* Main Settings Grid */}
      <form onSubmit={handleSaveAllSettings} className="space-y-6">
        
        {/* SECTION 0: Store Identity & Branding (Name, Address, B&W Logo) */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-orange-50 text-orange-600 rounded-2xl">
                <StoreIcon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Store Identity & Receipt Branding</h3>
                <p className="text-xs text-slate-500 font-medium">
                  Update your official store name, physical address, and thermal receipt black & white logo.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Store Name (Prints on all receipts)
              </label>
              <input
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="e.g. SUPERMARKET PRO"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs font-bold focus:outline-none focus:border-orange-500 focus:bg-white transition-all shadow-xs"
              />
              <p className="text-[11px] text-slate-400 mt-1">Changes name displayed on POS counters and receipts.</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Store Phone / Helpline (Prints on receipts)
              </label>
              <input
                type="text"
                value={storePhone}
                onChange={(e) => setStorePhone(e.target.value)}
                placeholder="e.g. +92 300 1234567 / 042-111-222"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs font-bold focus:outline-none focus:border-orange-500 focus:bg-white transition-all shadow-xs"
              />
              <p className="text-[11px] text-slate-400 mt-1">Contact number printed at the top of customer receipts.</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Store Physical Address (Prints on receipts)
              </label>
              <input
                type="text"
                value={storeAddress}
                onChange={(e) => setStoreAddress(e.target.value)}
                placeholder="e.g. Shop #12, Commercial Market, Main Road"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs font-bold focus:outline-none focus:border-orange-500 focus:bg-white transition-all shadow-xs"
              />
              <p className="text-[11px] text-slate-400 mt-1">Shows at the top of printable & customer E-Receipts.</p>
            </div>
          </div>

          {/* Black and White Logo Upload */}
          <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Store Logo (Black & White Thermal Receipt Ready)
                </label>
                <p className="text-[11px] text-slate-500 font-medium">
                  Upload your brand logo. It is automatically converted into high-contrast black & white for thermal slips.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <label className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl cursor-pointer flex items-center gap-1.5 transition-all shadow-xs">
                  <Upload className="w-3.5 h-3.5" /> Upload Logo
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                </label>

                {logoUrl && (
                  <button
                    type="button"
                    onClick={() => setLogoUrl('')}
                    className="px-3 py-2 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 font-bold text-xs rounded-xl flex items-center gap-1 cursor-pointer transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </button>
                )}
              </div>
            </div>

            {logoUrl ? (
              <div className="pt-2 flex items-center gap-4">
                <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-2xs max-w-[160px] flex items-center justify-center">
                  <img
                    src={logoUrl}
                    alt="Store B&W Logo"
                    className="max-h-16 max-w-full object-contain filter grayscale contrast-200"
                  />
                </div>
                <div className="text-xs text-slate-600 space-y-0.5">
                  <span className="font-bold text-emerald-700 flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> High-Contrast B&W Logo Active
                  </span>
                  <p className="text-[11px] text-slate-500">
                    This logo will print cleanly at the top of thermal slips.
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
                No logo uploaded yet. Upload a logo to personalize customer receipts.
              </div>
            )}
          </div>
        </div>

        {/* SECTION 1: 3 Receipt Format Templates */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                <Layout className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Receipt Format Templates</h3>
                <p className="text-xs text-slate-500 font-medium">
                  Choose from 3 distinct receipt layout formats for thermal printing and digital copies.
                </p>
              </div>
            </div>

            <span className="text-[11px] font-bold px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl uppercase">
              Format: {receiptFormat.replace('_', ' ')}
            </span>
          </div>

          {/* 3 Interactive Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Template 1: Modern Thermal (Standard) */}
            <div
              onClick={() => setReceiptFormat('standard')}
              className={`p-5 rounded-2xl border-2 transition-all cursor-pointer space-y-3 relative ${
                receiptFormat === 'standard'
                  ? 'border-orange-500 bg-orange-50/20 shadow-md ring-2 ring-orange-400/20'
                  : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-slate-900 text-sm">1. Modern Thermal</span>
                {receiptFormat === 'standard' && (
                  <span className="w-5 h-5 rounded-full bg-orange-600 text-white flex items-center justify-center text-xs font-bold">✓</span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                Default clean layout. Crisp dashed lines, centered store name, scannable QR code, and neat itemized table.
              </p>
              <div className="bg-white p-3 rounded-xl border border-slate-200 font-mono text-[9px] text-slate-600 space-y-1">
                <div className="text-center font-bold">{storeName || 'SUPERMARKET'}</div>
                <div className="border-b border-dashed border-slate-300 my-1"></div>
                <div className="flex justify-between"><span>Milk 1L</span><span>Rs. 150</span></div>
                <div className="flex justify-between"><span>Bread</span><span>Rs. 90</span></div>
                <div className="border-t border-dashed border-slate-300 pt-1 font-bold flex justify-between"><span>TOTAL:</span><span>Rs. 240</span></div>
              </div>
            </div>

            {/* Template 2: Classic Detailed Retail */}
            <div
              onClick={() => setReceiptFormat('classic_detailed')}
              className={`p-5 rounded-2xl border-2 transition-all cursor-pointer space-y-3 relative ${
                receiptFormat === 'classic_detailed'
                  ? 'border-orange-500 bg-orange-50/20 shadow-md ring-2 ring-orange-400/20'
                  : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-slate-900 text-sm">2. Classic Detailed</span>
                {receiptFormat === 'classic_detailed' && (
                  <span className="w-5 h-5 rounded-full bg-orange-600 text-white flex items-center justify-center text-xs font-bold">✓</span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                Traditional retail invoice format with double-line borders, prominent store address, cashier name, and tax breakdown.
              </p>
              <div className="bg-white p-3 rounded-xl border-2 border-slate-400 font-mono text-[9px] text-slate-700 space-y-1">
                <div className="text-center font-black uppercase text-slate-900">{storeName || 'SUPERMARKET'}</div>
                <div className="text-center text-[8px] text-slate-500">{storeAddress || 'Main Commercial Market'}</div>
                <div className="border-b-2 border-slate-400 my-1"></div>
                <div className="flex justify-between font-bold"><span>ITEM</span><span>QTY</span><span>TOTAL</span></div>
                <div className="flex justify-between"><span>Rice 5kg</span><span>1</span><span>Rs. 950</span></div>
                <div className="border-t-2 border-slate-400 pt-1 font-black flex justify-between text-slate-900"><span>NET PAYABLE:</span><span>Rs. 950</span></div>
              </div>
            </div>

            {/* Template 3: Compact Minimalist Eco */}
            <div
              onClick={() => setReceiptFormat('compact_eco')}
              className={`p-5 rounded-2xl border-2 transition-all cursor-pointer space-y-3 relative ${
                receiptFormat === 'compact_eco'
                  ? 'border-orange-500 bg-orange-50/20 shadow-md ring-2 ring-orange-400/20'
                  : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-slate-900 text-sm">3. Compact Eco</span>
                {receiptFormat === 'compact_eco' && (
                  <span className="w-5 h-5 rounded-full bg-orange-600 text-white flex items-center justify-center text-xs font-bold">✓</span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                High-density paper saver layout. Condensed line heights, minimal padding, saves up to 40% thermal paper roll.
              </p>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200 font-mono text-[8px] text-slate-700 space-y-0.5">
                <div className="font-bold flex justify-between"><span>{storeName || 'MART'}</span><span>#0492</span></div>
                <div className="flex justify-between border-t border-slate-200 pt-0.5"><span>Oil 1L x 2</span><span>Rs. 800</span></div>
                <div className="flex justify-between font-bold border-t border-slate-300 pt-0.5"><span>TOT:</span><span>Rs. 800</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2: Product Category Management */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                <Tag className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Product Categories Management</h3>
                <p className="text-xs text-slate-500 font-medium">
                  Add new categories for Product Register staff to organize and classify stock.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {/* Add New Category Input */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Enter new category name (e.g. Frozen Foods, Stationery, Beverages)..."
                value={newCatInput}
                onChange={(e) => setNewCatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategory(); } }}
                className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-orange-500 focus:bg-white"
              />
              <button
                type="button"
                onClick={handleAddCategory}
                className="px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Plus className="w-4 h-4" /> Add Category
              </button>
            </div>

            {/* Custom Categories List */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Custom Store Categories ({customCategories.length})
              </label>
              {customCategories.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No custom categories added yet. All default supermarket categories are enabled below.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {customCategories.map((cat) => (
                    <span
                      key={cat}
                      className="px-3 py-1.5 bg-orange-50 text-orange-800 border border-orange-200 rounded-xl text-xs font-bold flex items-center gap-2 shadow-2xs"
                    >
                      <span>{cat}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomCategory(cat)}
                        className="text-orange-400 hover:text-rose-600 cursor-pointer"
                        title="Remove category"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Built-in Presets */}
            <div className="pt-2">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Standard Supermarket Presets (Active)
              </label>
              <div className="flex flex-wrap gap-1.5 opacity-80">
                {DEFAULT_PRESET_CATEGORIES.map((cat) => (
                  <span
                    key={cat}
                    className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-[11px] font-medium border border-slate-200"
                  >
                    {cat}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 3: Additional Receipt Options */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                <Receipt className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Receipt Details & Policy</h3>
                <p className="text-xs text-slate-500 font-medium">
                  Customize headers, return period, and thank-you notes.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Currency Symbol
              </label>
              <div className="flex items-center gap-2">
                {['Rs.', 'PKR', '$', '€', 'AED', 'SAR'].map((curr) => (
                  <button
                    key={curr}
                    type="button"
                    onClick={() => setCurrencySymbol(curr)}
                    className={`px-3 py-2 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                      currencySymbol === curr
                        ? 'bg-orange-600 text-white border-orange-600 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {curr}
                  </button>
                ))}
                <input
                  type="text"
                  value={currencySymbol}
                  onChange={(e) => setCurrencySymbol(e.target.value)}
                  placeholder="Custom"
                  className="w-20 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs font-bold text-center focus:outline-none focus:border-orange-500"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Currency prefix shown across prices and receipts.</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Delete Slip After (Days) from Purchase for Restock & Refund *
              </label>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {[1, 3, 7, 14, 30].map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setReturnPolicyDays(days)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        returnPolicyDays === days
                          ? 'bg-orange-600 text-white border-orange-600 shadow-sm'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {days} {days === 1 ? 'Day' : 'Days'}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={returnPolicyDays}
                    onChange={(e) => setReturnPolicyDays(Math.max(1, Number(e.target.value)))}
                    className="w-28 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs font-bold focus:outline-none focus:border-orange-500"
                  />
                  <span className="text-xs text-slate-600 font-bold">Days from purchase</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                Slips older than {returnPolicyDays} days from purchase date will be deleted & disqualified from restock and customer refunds.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Receipt Subtitle / Header Note
              </label>
              <input
                type="text"
                value={receiptHeader}
                onChange={(e) => setReceiptHeader(e.target.value)}
                placeholder="e.g. OFFICIAL SALES INVOICE"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs font-bold focus:outline-none focus:border-orange-500 focus:bg-white transition-all shadow-xs"
              />
              <p className="text-[11px] text-slate-400 mt-1">Printed directly underneath your store title.</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Receipt Customer Greeting Message
              </label>
              <input
                type="text"
                value={receiptGreeting}
                onChange={(e) => setReceiptGreeting(e.target.value)}
                placeholder="e.g. Welcome & Thank you for shopping with us!"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs font-bold focus:outline-none focus:border-orange-500 focus:bg-white transition-all shadow-xs"
              />
              <p className="text-[11px] text-slate-400 mt-1">Special welcoming / promotional greeting printed on the bill.</p>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Receipt Footer Policy & Note
              </label>
              <input
                type="text"
                value={receiptFooter}
                onChange={(e) => setReceiptFooter(e.target.value)}
                placeholder="e.g. THANK YOU FOR SHOPPING! Please retain slip for return."
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs font-bold focus:outline-none focus:border-orange-500 focus:bg-white transition-all shadow-xs"
              />
              <p className="text-[11px] text-slate-400 mt-1">Closing greeting printed at the bottom of the slip.</p>
            </div>
          </div>

          {/* RECEIPT FONT & STYLING CUSTOMIZATION */}
          <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-4 shadow-sm">
            <h4 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
              <span>✍️</span> Receipt Typography & Box Styling Customization
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Receipt Font Style
                </label>
                <select
                  value={receiptFontFamily}
                  onChange={(e) => setReceiptFontFamily(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs font-bold focus:outline-none focus:border-orange-500"
                >
                  <option value="Courier New">Courier New (Classic Thermal)</option>
                  <option value="monospace">Monospace</option>
                  <option value="sans-serif">Sans-Serif (Modern)</option>
                  <option value="serif">Serif (Formal)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Box Round Curves
                </label>
                <select
                  value={receiptBorderRadius}
                  onChange={(e) => setReceiptBorderRadius(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs font-bold focus:outline-none focus:border-orange-500"
                >
                  <option value="rounded-none">Square / Sharp Corners (0px)</option>
                  <option value="rounded-md">Subtle Curves (6px)</option>
                  <option value="rounded-2xl">Standard Rounded (16px)</option>
                  <option value="rounded-3xl">Extra Round Curves (24px)</option>
                </select>
              </div>

              <div className="flex items-center gap-6 pt-6 sm:pt-4 sm:col-span-2">
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={receiptFontBold}
                    onChange={(e) => setReceiptFontBold(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                  <span className="ml-3 text-xs font-extrabold text-slate-800">
                    Bold Text {receiptFontBold ? '(Active)' : ''}
                  </span>
                </label>

                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={receiptFontItalic}
                    onChange={(e) => setReceiptFontItalic(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                  <span className="ml-3 text-xs font-extrabold text-slate-800">
                    Italic Text {receiptFontItalic ? '(Active)' : ''}
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* RECEIPT QR CODE CONFIGURATION (With Title Above QR Code) */}
          <div className="p-5 bg-gradient-to-r from-orange-50/60 to-amber-50/60 border border-orange-200/80 rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-orange-200/60 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-orange-600 text-white rounded-xl shadow-xs">
                  <QrCode className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-slate-900">Receipt QR Code Settings</h4>
                  <p className="text-[11px] text-slate-600 font-medium">
                    Print an automated verification QR code with custom title on every customer invoice slip.
                  </p>
                </div>
              </div>

              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={receiptQrCodeEnabled}
                  onChange={(e) => setReceiptQrCodeEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                <span className="ml-3 text-xs font-extrabold text-slate-800">
                  {receiptQrCodeEnabled ? 'QR Code Enabled' : 'QR Code Disabled'}
                </span>
              </label>
            </div>

            {receiptQrCodeEnabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 animate-fade-in">
                <div>
                  <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                    Title Displayed Above QR Code *
                  </label>
                  <input
                    type="text"
                    value={receiptQrTitle}
                    onChange={(e) => setReceiptQrTitle(e.target.value)}
                    placeholder="e.g. Scan to Verify Receipt / Digital Invoice"
                    className="w-full px-3.5 py-2.5 bg-white border border-orange-200 rounded-xl text-slate-900 text-xs font-bold focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 transition-all"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">This text appears directly above the QR code on the thermal slip.</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                    Custom QR Target URL / Data (Optional)
                  </label>
                  <input
                    type="text"
                    value={receiptQrData}
                    onChange={(e) => setReceiptQrData(e.target.value)}
                    placeholder="e.g. https://yourmart.com or leave blank for auto slip-verification"
                    className="w-full px-3.5 py-2.5 bg-white border border-orange-200 rounded-xl text-slate-900 text-xs font-bold focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 transition-all"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">If blank, defaults to generating an instant digital verification link for that invoice.</p>
                </div>

                <div className="md:col-span-2 space-y-2 pt-2 border-t border-orange-200/60">
                  <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Upload Custom Picture of QR Code (Optional - overrides auto link generation)
                  </label>
                  <div className="flex items-center gap-4 flex-wrap">
                    <label className="px-4 py-2.5 bg-white hover:bg-orange-50 text-orange-900 border border-orange-300 rounded-xl font-bold text-xs cursor-pointer shadow-xs transition-all flex items-center gap-2">
                      <Image className="w-4 h-4 text-orange-600" /> Upload QR Code Image
                      <input type="file" accept="image/*" onChange={handleQrImageUpload} className="hidden" />
                    </label>
                    {receiptQrImageUrl ? (
                      <div className="flex items-center gap-3">
                        <div className="w-16 h-16 bg-white p-1 rounded-xl border border-orange-200 shadow-sm flex items-center justify-center">
                          <img src={receiptQrImageUrl} alt="QR Code" className="w-full h-full object-contain" />
                        </div>
                        <button
                          type="button"
                          onClick={() => setReceiptQrImageUrl('')}
                          className="text-xs font-bold text-red-600 hover:text-red-700 hover:underline cursor-pointer"
                        >
                          Remove QR Image
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500 italic">No custom QR picture uploaded (auto-generating from link).</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* SECTION 4: Centralized Gmail E-Receipt Network Channel */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-orange-50 text-orange-600 rounded-2xl">
                <Mail className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Centralized Customer E-Receipt Dispatch</h3>
                <p className="text-xs text-slate-500 font-medium">
                  All customer e-receipts and digital invoice slips across all stores and counters are automatically sent through the verified master network channel.
                </p>
              </div>
            </div>

            <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" /> Operational
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="p-5 rounded-2xl border bg-slate-50 border-slate-200 space-y-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                Master Network Sender Gmail
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black font-mono text-slate-900 bg-white px-3 py-2 rounded-xl border border-slate-200 flex-1">
                  supermarketmanage@gmail.com
                </span>
                <span className="px-2.5 py-1.5 rounded-xl bg-emerald-100 text-emerald-800 font-extrabold text-xs">
                  Active
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                All branch stores, POS terminals, and cash counters automatically dispatch slips using this single centralized sender. No per-store Gmail setup or manual OAuth required.
              </p>
            </div>

            <div className="p-5 rounded-2xl border bg-orange-50/50 border-orange-200 flex flex-col justify-between gap-3">
              <div className="space-y-1">
                <span className="text-xs font-extrabold text-orange-950 uppercase tracking-wider block">
                  Realtime E-Receipts Audit Log
                </span>
                <p className="text-xs text-orange-900 leading-relaxed font-medium">
                  Store admins can review all sent digital invoices, customer emails, total amounts, and delivery timestamps in the dedicated audit log.
                </p>
              </div>

              {onNavigateToGmailLog && (
                <button
                  type="button"
                  onClick={onNavigateToGmailLog}
                  className="w-full py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-extrabold rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                >
                  <Mail className="w-4 h-4" /> Open Gmail E-Receipts Log
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ROW 2: Hardware, Voice Announcements & Sound Effects (Only shown if allowed) */}
        {(store.voiceAnnouncementEnabled !== false || store.cameraScannerEnabled !== false) && (
          <div className={`grid grid-cols-1 ${store.voiceAnnouncementEnabled !== false && store.cameraScannerEnabled !== false ? 'md:grid-cols-2' : 'md:grid-cols-1'} gap-6`}>
            
            {/* Voice Announcement Policy & Tester (Completely hidden if disallowed) */}
            {store.voiceAnnouncementEnabled !== false && (
              <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-5 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                        <Volume2 className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-base font-extrabold text-slate-900">Voice Speech Announcements</h3>
                        <p className="text-xs text-slate-500 font-medium">
                          Audio greeting & total bill speech at checkout.
                        </p>
                      </div>
                    </div>

                    <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold border bg-emerald-50 text-emerald-700 border-emerald-200">
                      ALLOWED
                    </span>
                  </div>

                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                    <div className="text-xs font-bold text-slate-800 flex items-center justify-between">
                      <span>Voice Announcement Policy:</span>
                      <span className="font-mono text-emerald-700 font-extrabold">Active & Ready</span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                      Cash counters announce: "Total bill is [X] rupees. Thank you for shopping at {store.name}!" at a natural 0.85 rate.
                    </p>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleTestVoice}
                    className="w-full py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-600 shadow-sm cursor-pointer transition-all"
                  >
                    <Volume2 className="w-4 h-4" /> Test Checkout Voice Audio
                  </button>
                  {voiceTestMsg && (
                    <p className="text-xs text-emerald-700 font-bold text-center mt-2 animate-pulse">{voiceTestMsg}</p>
                  )}
                </div>
              </div>
            )}

            {/* Barcode Camera Scanner & Beep Sounds (Completely hidden if disallowed) */}
            {store.cameraScannerEnabled !== false && (
              <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-5 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl">
                        <Camera className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-base font-extrabold text-slate-900">Hardware & Barcode Scanning</h3>
                        <p className="text-xs text-slate-500 font-medium">
                          Camera scanner & USB barcode reader settings.
                        </p>
                      </div>
                    </div>

                    <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold border bg-purple-50 text-purple-700 border-purple-200">
                      CAMERA ALLOWED
                    </span>
                  </div>

                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">Scan Audio Beep Effects:</span>
                      <button
                        type="button"
                        onClick={() => setSoundEffectsEnabled(!soundEffectsEnabled)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                          soundEffectsEnabled
                            ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                            : 'bg-white text-slate-600 border-slate-300'
                        }`}
                      >
                        {soundEffectsEnabled ? 'Beep: ON' : 'Beep: OFF'}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium">
                      Plays positive high-frequency beep on valid scan and buzz alert on out-of-stock items.
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-purple-50/50 border border-purple-200 rounded-xl text-[11px] text-purple-900 font-medium flex items-center gap-2">
                  <Check className="w-4 h-4 text-purple-600 shrink-0" />
                  <span>External USB & Wireless Barcode Scanners are plug-and-play active on all cash counters.</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ROW 4: Inventory Thresholds & Store Admin Security */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Stock & Low Inventory Threshold */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-5">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
                <Bell className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Inventory & Alert Thresholds</h3>
                <p className="text-xs text-slate-500 font-medium">
                  Trigger visual warnings when store stock drops below limit.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Low Stock Alert Threshold (Units)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={lowStockAlertThreshold}
                  onChange={(e) => setLowStockAlertThreshold(Number(e.target.value))}
                  className="w-32 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs font-bold focus:outline-none focus:border-orange-500"
                />
                <span className="text-xs text-slate-600 font-medium">
                  Alert when product quantity is ≤ <strong>{lowStockAlertThreshold} units</strong>
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Products reaching this level will display amber low-stock badges in inventory and cashier lookup.
              </p>
            </div>
          </div>

          {/* Admin Credentials & Password Security */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-5">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="p-3 bg-red-50 text-red-600 rounded-2xl">
                <KeyRound className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Store Admin Security & Password</h3>
                <p className="text-xs text-slate-500 font-medium">
                  Change the login password for Store Admin account.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-xs text-slate-600 font-medium">
                Admin Username: <strong className="text-orange-700 font-mono">{store.adminUsername}</strong>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Set New Store Admin Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newAdminPassword}
                    onChange={(e) => setNewAdminPassword(e.target.value)}
                    placeholder="Leave blank to keep current password"
                    className="w-full pl-4 pr-11 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs font-bold focus:outline-none focus:border-orange-500 focus:bg-white transition-all shadow-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Enter 4+ characters only if you wish to change your password.</p>
              </div>
            </div>
          </div>

        </div>

        {/* ROW 5: Terminal Staff & Connected Accounts Overview */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-orange-50 text-orange-600 rounded-2xl">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Active Staff & Cash Counters</h3>
                <p className="text-xs text-slate-500 font-medium">
                  Overview of all Cash Counters and Product Registers configured for {store.name}.
                </p>
              </div>
            </div>

            <span className="text-xs font-bold bg-slate-100 text-slate-700 px-3 py-1.5 rounded-xl border border-slate-200">
              {storeUsers.length} Total Users
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {/* Cashiers */}
            <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                  <Calculator className="w-4 h-4 text-emerald-600" /> Cash Counters ({cashiers.length})
                </span>
                <span className="text-[10px] bg-emerald-200/60 text-emerald-900 font-extrabold px-2 py-0.5 rounded-full">
                  POS
                </span>
              </div>
              <div className="space-y-1.5">
                {cashiers.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No cash counters added yet.</p>
                ) : (
                  cashiers.map(c => (
                    <div key={c.id} className="bg-white p-2.5 rounded-xl border border-emerald-100 text-xs">
                      <div className="font-bold text-slate-900">{c.name}</div>
                      <div className="text-[11px] text-slate-500 font-mono">user: {c.username}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Product Registrars */}
            <div className="p-4 bg-blue-50/50 border border-blue-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
                  <PackageCheck className="w-4 h-4 text-blue-600" /> Product Registers ({registrars.length})
                </span>
                <span className="text-[10px] bg-blue-200/60 text-blue-900 font-extrabold px-2 py-0.5 rounded-full">
                  STOCK IN
                </span>
              </div>
              <div className="space-y-1.5">
                {registrars.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No product registers added yet.</p>
                ) : (
                  registrars.map(r => (
                    <div key={r.id} className="bg-white p-2.5 rounded-xl border border-blue-100 text-xs">
                      <div className="font-bold text-slate-900">{r.name}</div>
                      <div className="text-[11px] text-slate-500 font-mono">user: {r.username}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Store Admin */}
            <div className="p-4 bg-orange-50/50 border border-orange-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-orange-950 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-orange-600" /> Store Administrator
                </span>
                <span className="text-[10px] bg-orange-200/60 text-orange-900 font-extrabold px-2 py-0.5 rounded-full">
                  ADMIN
                </span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-orange-100 text-xs space-y-1">
                <div className="font-bold text-slate-900">{currentUser.name || store.name + ' Admin'}</div>
                <div className="text-[11px] text-orange-800 font-mono font-bold">user: {store.adminUsername}</div>
                <div className="text-[10px] text-slate-500">Full Reports & Settings Access</div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Save Bar */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-slate-500 font-medium">
            All modifications will immediately sync to Firestore and apply to customer receipts and checkout stations.
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full sm:w-auto px-8 py-3.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-extrabold rounded-2xl shadow-md shadow-orange-600/20 transition-all text-xs flex items-center justify-center gap-2 cursor-pointer"
          >
            <Save className="w-4 h-4" /> {loading ? 'Saving Changes...' : 'Save All Settings'}
          </button>
        </div>

      </form>
    </div>
  );
};
