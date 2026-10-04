import React, { useState, useMemo } from 'react';
import { Store, Sale, ProductReturn, DigitalPaymentMethodConfig, StoreBankAccount } from '../types';
import { db } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { 
  CreditCard, 
  Banknote, 
  Smartphone, 
  Receipt, 
  Calendar, 
  Search, 
  Download, 
  Printer, 
  Plus, 
  Trash2, 
  Edit2, 
  Check, 
  X, 
  QrCode, 
  Image as ImageIcon, 
  Building2, 
  PieChart, 
  Wallet, 
  Coins, 
  Users, 
  Eye, 
  Layers, 
  Sparkles,
  Info,
  ExternalLink,
  ShieldCheck,
  Copy,
  Star,
  CheckCheck,
  Landmark
} from 'lucide-react';

interface PaymentMethodsViewProps {
  store: Store;
  sales: Sale[];
  returns?: ProductReturn[];
  currencySymbol: string;
  onViewReceipt?: (sale: Sale) => void;
  onUpdateStore?: (updatedStore: Partial<Store>) => void;
}

type DatePreset = 'all' | 'today' | 'yesterday' | 'last_7_days' | 'this_month' | 'custom';
type MethodFilter = 'all' | 'cash' | 'online' | string;

const DEFAULT_PRESET_METHODS: Omit<DigitalPaymentMethodConfig, 'id'>[] = [
  { name: 'Card', isActive: true, instructions: 'Debit / Credit Card swipe or tap on POS terminal' },
  { name: 'EasyPaisa', isActive: true, instructions: 'Send payment via EasyPaisa app or mobile number' },
  { name: 'JazzCash', isActive: true, instructions: 'Send payment via JazzCash mobile account' },
  { name: 'SadaPay', isActive: true, instructions: 'Send to SadaPay wallet' },
  { name: 'NayaPay', isActive: true, instructions: 'Send to NayaPay wallet' },
  { name: 'Raast / Bank Transfer', isActive: true, instructions: 'Instant interbank transfer via Raast or Online Banking' }
];

function getLocalDateString(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts.map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

export const PaymentMethodsView: React.FC<PaymentMethodsViewProps> = ({
  store,
  sales,
  returns = [],
  currencySymbol,
  onViewReceipt,
  onUpdateStore
}) => {
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Digital Payment Methods State for Admin Configuration
  const [isAddingMethod, setIsAddingMethod] = useState(false);
  const [editingMethodId, setEditingMethodId] = useState<string | null>(null);
  const [newMethodName, setNewMethodName] = useState('');
  const [newInstructions, setNewInstructions] = useState('');
  const [newQrCodeUrl, setNewQrCodeUrl] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [methodToDelete, setMethodToDelete] = useState<DigitalPaymentMethodConfig | null>(null);

  const todayStr = useMemo(() => getLocalDateString(new Date()), []);
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return getLocalDateString(d);
  }, []);

  const digitalMethods: DigitalPaymentMethodConfig[] = useMemo(() => {
    if (store.digitalPaymentMethods && store.digitalPaymentMethods.length > 0) {
      return store.digitalPaymentMethods;
    }
    // Default fallback list
    return [
      { id: 'method-card', name: 'Card', isActive: true, instructions: 'Debit / Credit Card POS swipe' },
      { id: 'method-easypaisa', name: 'EasyPaisa', isActive: true, instructions: 'EasyPaisa mobile transfer' },
      { id: 'method-jazzcash', name: 'JazzCash', isActive: true, instructions: 'JazzCash mobile account' },
      { id: 'method-sadapay', name: 'SadaPay', isActive: true, instructions: 'SadaPay wallet' },
      { id: 'method-nayapay', name: 'NayaPay', isActive: true, instructions: 'NayaPay wallet' },
      { id: 'method-bank', name: 'Raast / Bank Transfer', isActive: true, instructions: 'Direct Bank or Raast' }
    ];
  }, [store.digitalPaymentMethods]);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  // Filter Sales based on selected Date Range
  const filteredSalesByDate = useMemo(() => {
    if (datePreset === 'all') return sales;

    const now = new Date();

    if (datePreset === 'today') {
      return sales.filter(s => getLocalDateString(s.timestamp) === todayStr);
    }

    if (datePreset === 'yesterday') {
      return sales.filter(s => getLocalDateString(s.timestamp) === yesterdayStr);
    }

    if (datePreset === 'last_7_days') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(now.getDate() - 7);
      sevenDaysAgo.setHours(0, 0, 0, 0);
      return sales.filter(s => new Date(s.timestamp) >= sevenDaysAgo);
    }

    if (datePreset === 'this_month') {
      const curYear = now.getFullYear();
      const curMonth = now.getMonth();
      return sales.filter(s => {
        const d = new Date(s.timestamp);
        return d.getFullYear() === curYear && d.getMonth() === curMonth;
      });
    }

    if (datePreset === 'custom') {
      if (!customStartDate && !customEndDate) return sales;
      return sales.filter(s => {
        const saleDate = getLocalDateString(s.timestamp);
        if (customStartDate && customEndDate) {
          return saleDate >= customStartDate && saleDate <= customEndDate;
        }
        if (customStartDate) return saleDate >= customStartDate;
        if (customEndDate) return saleDate <= customEndDate;
        return true;
      });
    }

    return sales;
  }, [sales, datePreset, todayStr, yesterdayStr, customStartDate, customEndDate]);

  // Overall Financial Aggregations (Cash vs Online)
  const paymentStats = useMemo(() => {
    let totalGross = 0;
    let cashTotal = 0;
    let onlineTotal = 0;
    let cashCount = 0;
    let onlineCount = 0;
    let cashReceivedSum = 0;
    let changeReturnedSum = 0;

    filteredSalesByDate.forEach(sale => {
      const amt = Number(sale.totalAmount) || 0;
      totalGross += amt;

      if (sale.paymentMethod === 'online') {
        onlineTotal += amt;
        onlineCount += 1;
      } else {
        cashTotal += amt;
        cashCount += 1;
        if (sale.cashReceived !== undefined) {
          cashReceivedSum += Number(sale.cashReceived) || amt;
        }
        if (sale.changeReturned !== undefined) {
          changeReturnedSum += Number(sale.changeReturned) || 0;
        }
      }
    });

    const totalCount = filteredSalesByDate.length;
    const cashPercent = totalGross > 0 ? (cashTotal / totalGross) * 100 : 0;
    const onlinePercent = totalGross > 0 ? (onlineTotal / totalGross) * 100 : 0;
    const avgCashTicket = cashCount > 0 ? cashTotal / cashCount : 0;
    const avgOnlineTicket = onlineCount > 0 ? onlineTotal / onlineCount : 0;
    const avgTicket = totalCount > 0 ? totalGross / totalCount : 0;

    return {
      totalGross,
      totalCount,
      cashTotal,
      cashCount,
      cashPercent,
      onlineTotal,
      onlineCount,
      onlinePercent,
      avgCashTicket,
      avgOnlineTicket,
      avgTicket,
      cashReceivedSum,
      changeReturnedSum
    };
  }, [filteredSalesByDate]);

  // Platform by Platform Breakdown: How much money was received on which digital payment platform
  const digitalPlatformsStats = useMemo(() => {
    const map = new Map<string, {
      name: string;
      totalAmount: number;
      totalCount: number;
    }>();

    // Initialize map with configured active methods
    digitalMethods.forEach(method => {
      map.set(method.name.toLowerCase().trim(), {
        name: method.name,
        totalAmount: 0,
        totalCount: 0
      });
    });

    filteredSalesByDate.forEach(sale => {
      if (sale.paymentMethod === 'online') {
        const provider = sale.onlinePaymentProvider?.trim() || 'Other / Generic Online';
        const key = provider.toLowerCase();

        if (!map.has(key)) {
          map.set(key, {
            name: provider,
            totalAmount: 0,
            totalCount: 0
          });
        }

        const entry = map.get(key)!;
        entry.totalAmount += Number(sale.totalAmount) || 0;
        entry.totalCount += 1;
      }
    });

    return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [filteredSalesByDate, digitalMethods]);

  // Cashier & Counter Reconciliation Breakdown
  const cashierBreakdown = useMemo(() => {
    const map = new Map<string, {
      staffName: string;
      counterName: string;
      cashAmount: number;
      cashCount: number;
      onlineAmount: number;
      onlineCount: number;
      totalAmount: number;
      totalCount: number;
      platformAmounts: Record<string, number>;
    }>();

    filteredSalesByDate.forEach(sale => {
      const key = sale.cashierName || sale.cashierUsername || 'Counter Staff';
      const counter = sale.counterName ? sale.counterName : ((sale as any).counterNumber ? `Counter #${(sale as any).counterNumber}` : 'Main Counter');
      const amt = Number(sale.totalAmount) || 0;

      if (!map.has(key)) {
        map.set(key, {
          staffName: key,
          counterName: counter,
          cashAmount: 0,
          cashCount: 0,
          onlineAmount: 0,
          onlineCount: 0,
          totalAmount: 0,
          totalCount: 0,
          platformAmounts: {}
        });
      }

      const entry = map.get(key)!;
      entry.totalAmount += amt;
      entry.totalCount += 1;

      if (sale.paymentMethod === 'online') {
        entry.onlineAmount += amt;
        entry.onlineCount += 1;
        const prov = sale.onlinePaymentProvider || 'Digital';
        entry.platformAmounts[prov] = (entry.platformAmounts[prov] || 0) + amt;
      } else {
        entry.cashAmount += amt;
        entry.cashCount += 1;
      }
    });

    return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [filteredSalesByDate]);

  // Day-by-Day Cash vs Online Breakdown
  const dailyPaymentBreakdown = useMemo(() => {
    const map = new Map<string, {
      date: string;
      cashAmount: number;
      onlineAmount: number;
      totalAmount: number;
      cashCount: number;
      onlineCount: number;
      totalCount: number;
    }>();

    filteredSalesByDate.forEach(sale => {
      const dateKey = getLocalDateString(sale.timestamp) || 'Unknown Date';
      const amt = Number(sale.totalAmount) || 0;

      if (!map.has(dateKey)) {
        map.set(dateKey, {
          date: dateKey,
          cashAmount: 0,
          onlineAmount: 0,
          totalAmount: 0,
          cashCount: 0,
          onlineCount: 0,
          totalCount: 0
        });
      }

      const day = map.get(dateKey)!;
      day.totalAmount += amt;
      day.totalCount += 1;

      if (sale.paymentMethod === 'online') {
        day.onlineAmount += amt;
        day.onlineCount += 1;
      } else {
        day.cashAmount += amt;
        day.cashCount += 1;
      }
    });

    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredSalesByDate]);

  // Filtered Receipts for the Transactions Log
  const displayedSales = useMemo(() => {
    return filteredSalesByDate.filter(sale => {
      // 1. Payment Method Filter
      if (methodFilter === 'cash' && sale.paymentMethod === 'online') return false;
      if (methodFilter === 'online' && sale.paymentMethod !== 'online') return false;
      if (methodFilter !== 'all' && methodFilter !== 'cash' && methodFilter !== 'online') {
        // Specific platform filter (e.g. 'EasyPaisa', 'JazzCash')
        if (sale.paymentMethod !== 'online' || sale.onlinePaymentProvider !== methodFilter) {
          return false;
        }
      }

      // 2. Search Term Filter
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesReceipt = sale.receiptNumber?.toLowerCase().includes(term);
        const matchesCashier = sale.cashierName?.toLowerCase().includes(term) || sale.cashierUsername?.toLowerCase().includes(term);
        const matchesCounter = sale.counterName?.toLowerCase().includes(term) || String((sale as any).counterNumber || '').includes(term);
        const matchesCustomer = (sale as any).customerPhone?.toLowerCase().includes(term) || (sale as any).customerName?.toLowerCase().includes(term);
        const matchesProvider = sale.onlinePaymentProvider?.toLowerCase().includes(term);
        const matchesTxId = sale.onlineTransactionId?.toLowerCase().includes(term);
        const matchesAmount = String(sale.totalAmount || '').includes(term);

        return matchesReceipt || matchesCashier || matchesCounter || matchesCustomer || matchesProvider || matchesTxId || matchesAmount;
      }

      return true;
    });
  }, [filteredSalesByDate, methodFilter, searchTerm]);

  // Admin: Save Digital Payment Methods to Firestore
  const handleSaveMethodsToDb = async (methodsToSave: DigitalPaymentMethodConfig[]) => {
    setSavingSettings(true);
    try {
      const storeDocRef = doc(db, 'stores', store.id);
      await updateDoc(storeDocRef, {
        digitalPaymentMethods: methodsToSave
      });

      if (onUpdateStore) {
        onUpdateStore({ digitalPaymentMethods: methodsToSave });
      }

      showNotification('success', 'Digital payment platforms updated and synchronized with Cashier Counters!');
    } catch (err: any) {
      console.error('Error updating digital payment methods:', err);
      showNotification('error', err.message || 'Failed to save digital payment methods.');
    } finally {
      setSavingSettings(false);
    }
  };

  // Admin: Add or update digital method (DO NOT ask bank details)
  const handleSaveNewMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMethodName.trim()) {
      showNotification('error', 'Please enter a payment platform name (e.g. EasyPaisa, JazzCash).');
      return;
    }

    let updated: DigitalPaymentMethodConfig[];
    if (editingMethodId) {
      updated = digitalMethods.map(m => m.id === editingMethodId ? {
        ...m,
        name: newMethodName.trim(),
        instructions: newInstructions.trim(),
        qrCodeUrl: newQrCodeUrl.trim()
      } : m);
    } else {
      const newMethod: DigitalPaymentMethodConfig = {
        id: `method-${Date.now()}`,
        name: newMethodName.trim(),
        instructions: newInstructions.trim(),
        qrCodeUrl: newQrCodeUrl.trim(),
        isActive: true
      };
      updated = [...digitalMethods, newMethod];
    }

    await handleSaveMethodsToDb(updated);
    setIsAddingMethod(false);
    setEditingMethodId(null);
    setNewMethodName('');
    setNewInstructions('');
    setNewQrCodeUrl('');
  };

  const handleToggleMethodActive = async (id: string, currentState: boolean) => {
    const updated = digitalMethods.map(m => m.id === id ? { ...m, isActive: !currentState } : m);
    await handleSaveMethodsToDb(updated);
  };

  const handleDeleteMethod = async (id: string) => {
    const updated = digitalMethods.filter(m => m.id !== id);
    await handleSaveMethodsToDb(updated);
    setMethodToDelete(null);
    showNotification('success', 'Digital payment method removed.');
  };

  const handleStartEditMethod = (method: DigitalPaymentMethodConfig) => {
    setEditingMethodId(method.id);
    setNewMethodName(method.name);
    setNewInstructions(method.instructions || '');
    setNewQrCodeUrl(method.qrCodeUrl || '');
    setIsAddingMethod(true);
  };

  const handleQrImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        showNotification('error', 'Image size must be under 2MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        setNewQrCodeUrl(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Export to CSV
  const handleExportCsv = () => {
    const headers = [
      'Receipt Number',
      'Date',
      'Time',
      'Payment Method',
      'Digital Provider / Platform',
      'Transaction Ref / ID',
      'Total Amount',
      'Cash Received',
      'Change Returned',
      'Cashier Name',
      'Counter'
    ];

    const rows = displayedSales.map(s => {
      const d = new Date(s.timestamp);
      const isOnline = s.paymentMethod === 'online';
      return [
        `"${s.receiptNumber || s.id}"`,
        `"${getLocalDateString(s.timestamp)}"`,
        `"${d.toLocaleTimeString()}"`,
        `"${isOnline ? 'ONLINE' : 'CASH'}"`,
        `"${s.onlinePaymentProvider || (isOnline ? 'Digital' : 'N/A')}"`,
        `"${s.onlineTransactionId || ''}"`,
        Number(s.totalAmount || 0).toFixed(2),
        !isOnline && s.cashReceived !== undefined ? Number(s.cashReceived).toFixed(2) : '""',
        !isOnline && s.changeReturned !== undefined ? Number(s.changeReturned).toFixed(2) : '""',
        `"${s.cashierName || s.cashierUsername || 'Staff'}"`,
        `"${s.counterName || (s as any).counterNumber || 'Main'}"`
      ];
    });

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Payment_Methods_Report_${store.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Notification */}
      {notification && (
        <div className={`p-4 rounded-xl text-xs font-bold flex items-center justify-between shadow-lg transition-all animate-fade-in ${
          notification.type === 'success' 
            ? 'bg-emerald-600 text-white shadow-emerald-500/20' 
            : 'bg-rose-600 text-white shadow-rose-500/20'
        }`}>
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <X className="w-4 h-4 shrink-0" />}
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-white/80 hover:text-white p-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 1. TOP HEADER & DATE RANGE FILTER BAR */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-orange-600">
              <CreditCard className="w-4 h-4 text-orange-600" />
              <span>Payment Methods & Financial Audit</span>
            </div>
            <h3 className="text-xl font-black text-slate-900 mt-0.5">
              Payment Gateway & Cash vs Digital Reconciliation
            </h3>
            <p className="text-xs text-slate-500">
              Configure accepted digital platforms (EasyPaisa, JazzCash, SadaPay, etc.) and audit cash vs online money inflow.
            </p>
          </div>

          {/* Action buttons: Add Method, Export CSV & Print */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              onClick={() => {
                setEditingMethodId(null);
                setNewMethodName('');
                setNewInstructions('');
                setNewQrCodeUrl('');
                setIsAddingMethod(true);
              }}
              className="px-3.5 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" /> Add Digital Platform
            </button>
            <button
              onClick={handleExportCsv}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer shadow-xs"
              title="Download payment reconciliation report as CSV"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
            <button
              onClick={() => window.print()}
              className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer shadow-2xs"
              title="Print payment report summary"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" /> Print
            </button>
          </div>
        </div>

        {/* Date Presets Selector */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" /> Audit Period:
            </span>
            {[
              { id: 'all', label: 'All Time' },
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: 'last_7_days', label: 'Last 7 Days' },
              { id: 'this_month', label: 'This Month' },
              { id: 'custom', label: 'Custom Range' }
            ].map(preset => (
              <button
                key={preset.id}
                onClick={() => setDatePreset(preset.id as DatePreset)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  datePreset === preset.id
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Custom Date Inputs */}
          {datePreset === 'custom' && (
            <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200 text-xs">
              <span className="text-slate-500 font-medium">From:</span>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-800 text-xs font-medium focus:outline-hidden focus:ring-1 focus:ring-orange-500"
              />
              <span className="text-slate-500 font-medium">To:</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-800 text-xs font-medium focus:outline-hidden focus:ring-1 focus:ring-orange-500"
              />
            </div>
          )}
        </div>
      </div>

      {/* 2. ADMIN CONFIGURATION: DIGITAL PAYMENT PLATFORMS (Card, EasyPaisa, JazzCash, SadaPay, etc.) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-gradient-to-r from-orange-50/60 via-white to-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-black shadow-xs">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-base font-black text-slate-900">Configured Digital Payment Platforms</h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-orange-100 text-orange-800 border border-orange-200">
                  {digitalMethods.length} {digitalMethods.length === 1 ? 'Platform' : 'Platforms'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Manage digital payment options (Card, EasyPaisa, JazzCash, etc.) available for cashiers at checkout. Bank details are not required.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => {
                setEditingMethodId(null);
                setNewMethodName('');
                setNewInstructions('');
                setNewQrCodeUrl('');
                setIsAddingMethod(true);
              }}
              className="px-3.5 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto shrink-0 shadow-xs"
            >
              <Plus className="w-4 h-4" /> Add Payment Platform
            </button>
          </div>
        </div>

        {/* Quick Add Presets Bar */}
        <div className="px-4 sm:px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2 flex-wrap text-xs">
          <span className="font-bold text-slate-500 flex items-center gap-1 shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-orange-500" /> Quick Add:
          </span>
          {DEFAULT_PRESET_METHODS.map((preset) => {
            const alreadyExists = digitalMethods.some(
              (m) => m.name.toLowerCase().trim() === preset.name.toLowerCase().trim()
            );
            return (
              <button
                key={preset.name}
                type="button"
                disabled={alreadyExists || savingSettings}
                onClick={async () => {
                  const newMethod: DigitalPaymentMethodConfig = {
                    id: `method-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    name: preset.name,
                    instructions: preset.instructions,
                    isActive: true
                  };
                  await handleSaveMethodsToDb([...digitalMethods, newMethod]);
                }}
                className={`px-2.5 py-1 rounded-lg font-bold text-xs flex items-center gap-1 transition-all cursor-pointer ${
                  alreadyExists
                    ? 'bg-slate-200/70 text-slate-400 cursor-not-allowed'
                    : 'bg-white hover:bg-orange-50 hover:text-orange-700 hover:border-orange-300 text-slate-700 border border-slate-200 shadow-2xs'
                }`}
                title={alreadyExists ? 'Already added' : `Add ${preset.name}`}
              >
                {alreadyExists ? <Check className="w-3 h-3 text-emerald-600" /> : <Plus className="w-3 h-3 text-orange-500" />}
                <span>{preset.name}</span>
              </button>
            );
          })}
        </div>

        {/* Modal / Inline Form to Add / Edit Digital Method (DO NOT ASK BANK DETAILS) */}
        {isAddingMethod && (
          <form onSubmit={handleSaveNewMethod} className="p-5 bg-orange-50/40 border-b border-orange-200 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <div>
                <h5 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-orange-600" />
                  {editingMethodId ? 'Edit Digital Payment Platform' : 'Add New Digital Payment Platform'}
                </h5>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Enter payment method or platform name (e.g. Card, EasyPaisa, JazzCash, SadaPay).
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAddingMethod(false);
                  setEditingMethodId(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Payment Platform / Method Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Card, EasyPaisa, JazzCash, SadaPay, NayaPay"
                  value={newMethodName}
                  onChange={(e) => setNewMethodName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Cashier Instructions / Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Swipe card on terminal or verify mobile payment"
                  value={newInstructions}
                  onChange={(e) => setNewInstructions(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Platform Specific QR Code (Optional)
              </label>
              <div className="flex items-center gap-3">
                <label className="px-3 py-2 bg-white border border-slate-300 hover:border-orange-500 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs">
                  <ImageIcon className="w-3.5 h-3.5 text-orange-600" /> Upload QR Code
                  <input type="file" accept="image/*" onChange={handleQrImageUpload} className="hidden" />
                </label>
                {newQrCodeUrl ? (
                  <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-lg border border-slate-200">
                    <img src={newQrCodeUrl} alt="QR" className="w-6 h-6 object-contain rounded" />
                    <span className="text-[10px] text-emerald-600 font-bold">QR Loaded</span>
                    <button
                      type="button"
                      onClick={() => setNewQrCodeUrl('')}
                      className="text-rose-500 hover:text-rose-700 text-xs ml-1"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <span className="text-[11px] text-slate-400 italic">No QR picture attached</span>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsAddingMethod(false);
                  setEditingMethodId(null);
                }}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingSettings}
                className="px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
              >
                {savingSettings ? 'Saving...' : editingMethodId ? 'Update Platform' : 'Save Platform'}
              </button>
            </div>
          </form>
        )}

        {/* Digital Methods List Grid */}
        <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {digitalMethods.map((method) => {
            return (
              <div
                key={method.id}
                className={`p-4 rounded-2xl border transition-all relative ${
                  method.isActive 
                    ? 'bg-white border-slate-200 shadow-xs hover:border-orange-300' 
                    : 'bg-slate-50 border-slate-200 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-100 text-orange-600 flex items-center justify-center font-black">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div>
                      <h5 className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                        {method.name}
                        {method.isActive ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-100 text-emerald-800">
                            ACTIVE
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-slate-200 text-slate-600">
                            DISABLED
                          </span>
                        )}
                      </h5>
                      <p className="text-[11px] text-slate-500 font-medium">
                        Digital Payment Platform
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleToggleMethodActive(method.id, method.isActive)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-colors ${
                        method.isActive 
                          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' 
                          : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                      }`}
                      title={method.isActive ? 'Click to disable' : 'Click to enable'}
                    >
                      {method.isActive ? 'Enabled' : 'Disabled'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStartEditMethod(method)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                      title="Edit details"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setMethodToDelete(method)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                      title="Delete method"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Instructions & QR preview */}
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <div className="space-y-0.5">
                    {method.instructions && (
                      <div className="text-[10px] text-slate-500">
                        {method.instructions}
                      </div>
                    )}
                  </div>
                  {method.qrCodeUrl && (
                    <div className="w-8 h-8 rounded-lg border border-slate-200 overflow-hidden shrink-0 bg-white p-0.5" title="Custom QR image attached">
                      <img src={method.qrCodeUrl} alt="QR" className="w-full h-full object-contain" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. EXECUTIVE KPI SUMMARY CARDS (CASH VS ONLINE) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Card 1: Total Gross Revenue */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Inflow</span>
            <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900">
              {currencySymbol} {paymentStats.totalGross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 mt-1">
              <span>{paymentStats.totalCount} total receipts</span>
              <span>Avg: {currencySymbol}{paymentStats.avgTicket.toFixed(0)}</span>
            </div>
          </div>
          <div className="mt-3 text-[11px] font-semibold text-slate-600 bg-slate-50 rounded-lg px-2.5 py-1 flex items-center justify-between">
            <span>Cash: {paymentStats.cashPercent.toFixed(1)}%</span>
            <span>Online: {paymentStats.onlinePercent.toFixed(1)}%</span>
          </div>
        </div>

        {/* Card 2: Cash Payments */}
        <div className="bg-white rounded-2xl p-5 border border-emerald-200 shadow-xs relative overflow-hidden bg-gradient-to-br from-white to-emerald-50/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-xs" />
              <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Cash Payments</span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700">
              <Banknote className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-emerald-700">
              {currencySymbol} {paymentStats.cashTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="flex items-center justify-between text-xs text-emerald-800/80 mt-1">
              <span className="font-semibold">{paymentStats.cashCount} cash bills</span>
              <span className="font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-md">
                {paymentStats.cashPercent.toFixed(1)}% Share
              </span>
            </div>
          </div>
          <div className="mt-3 text-[11px] font-medium text-emerald-800/80 border-t border-emerald-100 pt-2 flex items-center justify-between">
            <span>Physical Cash In Drawer</span>
            <span>Avg: {currencySymbol}{paymentStats.avgCashTicket.toFixed(0)}</span>
          </div>
        </div>

        {/* Card 3: Online Payments */}
        <div className="bg-white rounded-2xl p-5 border border-blue-200 shadow-xs relative overflow-hidden bg-gradient-to-br from-white to-blue-50/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-xs" />
              <span className="text-xs font-bold text-blue-800 uppercase tracking-wider">Online / Digital</span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700">
              <Smartphone className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-blue-700">
              {currencySymbol} {paymentStats.onlineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="flex items-center justify-between text-xs text-blue-800/80 mt-1">
              <span className="font-semibold">{paymentStats.onlineCount} digital bills</span>
              <span className="font-bold bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-md">
                {paymentStats.onlinePercent.toFixed(1)}% Share
              </span>
            </div>
          </div>
          <div className="mt-3 text-[11px] font-medium text-blue-800/80 border-t border-blue-100 pt-2 flex items-center justify-between">
            <span>Digital Inflow Received</span>
            <span>Avg: {currencySymbol}{paymentStats.avgOnlineTicket.toFixed(0)}</span>
          </div>
        </div>

        {/* Card 4: Cash Drawer Flow & Split Meter */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Payment Share Gauge</span>
              <PieChart className="w-4 h-4 text-slate-400" />
            </div>
            {/* Visual dual-color progress split bar */}
            <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden flex mt-3 shadow-inner">
              <div
                className="bg-emerald-500 h-full transition-all duration-500"
                style={{ width: `${paymentStats.cashPercent}%` }}
                title={`Cash: ${paymentStats.cashPercent.toFixed(1)}%`}
              />
              <div
                className="bg-blue-600 h-full transition-all duration-500"
                style={{ width: `${paymentStats.onlinePercent}%` }}
                title={`Online: ${paymentStats.onlinePercent.toFixed(1)}%`}
              />
            </div>
            <div className="flex justify-between items-center text-xs font-black mt-2">
              <span className="text-emerald-700 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Cash {paymentStats.cashPercent.toFixed(1)}%
              </span>
              <span className="text-blue-700 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-600" />
                Online {paymentStats.onlinePercent.toFixed(1)}%
              </span>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 bg-slate-50 rounded-xl p-2.5 mt-3 space-y-1">
            <div className="flex justify-between">
              <span>Cash Handled:</span>
              <span className="font-bold text-slate-700">{currencySymbol} {paymentStats.cashReceivedSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-amber-700 font-semibold">
              <span>Change Given:</span>
              <span>{currencySymbol} {paymentStats.changeReturnedSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. BREAKDOWN BY DIGITAL PAYMENT PLATFORM (EasyPaisa, JazzCash, etc.) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-black">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-black text-slate-900">Money Received by Digital Platform</h4>
              <p className="text-[11px] text-slate-500">
                Detailed audit showing exact revenue breakdown per digital gateway (EasyPaisa, JazzCash, Bank, etc.).
              </p>
            </div>
          </div>
          <span className="text-xs font-black text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1 rounded-xl">
            Total Digital: {currencySymbol} {paymentStats.onlineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        {digitalPlatformsStats.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            No digital payment transactions recorded for this period.
          </div>
        ) : (
          <div className="p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {digitalPlatformsStats.map((platform) => {
                const onlineShare = paymentStats.onlineTotal > 0 ? (platform.totalAmount / paymentStats.onlineTotal) * 100 : 0;
                const totalShare = paymentStats.totalGross > 0 ? (platform.totalAmount / paymentStats.totalGross) * 100 : 0;

                return (
                  <div
                    key={platform.name}
                    className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200 hover:border-blue-300 transition-all space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                        <Smartphone className="w-4 h-4 text-blue-600" />
                        {platform.name}
                      </span>
                      <span className="text-[10px] font-black bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                        {onlineShare.toFixed(1)}% of Online
                      </span>
                    </div>

                    <div className="text-xl font-black text-slate-900">
                      {currencySymbol} {platform.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-200">
                      <span>{platform.totalCount} receipts</span>
                      <span>{totalShare.toFixed(1)}% of total revenue</span>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-blue-600 h-full rounded-full transition-all" style={{ width: `${onlineShare}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 5. CASHIER & COUNTER RECONCILIATION BREAKDOWN */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-black text-slate-900">Cashier & Register Counter Reconciliation</h4>
              <p className="text-[11px] text-slate-500">Track how much cash each cashier collected in their register vs digital payments.</p>
            </div>
          </div>
          <span className="text-xs font-bold text-slate-600 bg-white border border-slate-200 px-2.5 py-1 rounded-lg">
            {cashierBreakdown.length} Cashier Accounts Active
          </span>
        </div>

        {cashierBreakdown.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            No cashier transactions found for the selected time range.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Cashier / Staff Member</th>
                  <th className="py-3 px-4">Counter</th>
                  <th className="py-3 px-4 text-center">Total Bills</th>
                  <th className="py-3 px-4 text-right">Cash Collected</th>
                  <th className="py-3 px-4 text-right">Online Collected</th>
                  <th className="py-3 px-4 text-right">Total Processed</th>
                  <th className="py-3 px-4 text-center">Method Split</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {cashierBreakdown.map((cashier, idx) => {
                  const cashRatio = cashier.totalAmount > 0 ? (cashier.cashAmount / cashier.totalAmount) * 100 : 0;
                  const onlineRatio = cashier.totalAmount > 0 ? (cashier.onlineAmount / cashier.totalAmount) * 100 : 0;

                  return (
                    <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-black text-[10px] flex items-center justify-center uppercase">
                          {cashier.staffName.substring(0, 2)}
                        </div>
                        {cashier.staffName}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-600">
                        {cashier.counterName}
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold text-slate-700">
                        {cashier.totalCount}
                      </td>
                      <td className="py-3.5 px-4 text-right font-black text-emerald-700">
                        {currencySymbol} {cashier.cashAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <div className="text-[10px] text-emerald-600 font-medium">{cashier.cashCount} bills</div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-black text-blue-700">
                        {currencySymbol} {cashier.onlineAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <div className="text-[10px] text-blue-600 font-medium">{cashier.onlineCount} bills</div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-black text-slate-900 text-sm">
                        {currencySymbol} {cashier.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="w-28 mx-auto space-y-1">
                          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden flex">
                            <div className="bg-emerald-500 h-full" style={{ width: `${cashRatio}%` }} />
                            <div className="bg-blue-600 h-full" style={{ width: `${onlineRatio}%` }} />
                          </div>
                          <div className="flex justify-between text-[9px] font-bold text-slate-500">
                            <span className="text-emerald-700">{cashRatio.toFixed(0)}%</span>
                            <span className="text-blue-700">{onlineRatio.toFixed(0)}%</span>
                          </div>
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

      {/* 6. DAY-BY-DAY PAYMENT BREAKDOWN */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-black text-slate-900">Day-by-Day Payment History</h4>
              <p className="text-[11px] text-slate-500">Daily reconciliation between physical cash collections and digital receipts.</p>
            </div>
          </div>
          <span className="text-xs font-bold text-slate-600 bg-white border border-slate-200 px-2.5 py-1 rounded-lg">
            {dailyPaymentBreakdown.length} Operating Days Logged
          </span>
        </div>

        {dailyPaymentBreakdown.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            No daily logs recorded for this period.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-72">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4 text-center">Invoices</th>
                  <th className="py-2.5 px-4 text-right">Cash Revenue</th>
                  <th className="py-2.5 px-4 text-right">Online Revenue</th>
                  <th className="py-2.5 px-4 text-right">Total Inflow</th>
                  <th className="py-2.5 px-4 text-center">Online Ratio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {dailyPaymentBreakdown.map((day) => {
                  const onlineRatio = day.totalAmount > 0 ? (day.onlineAmount / day.totalAmount) * 100 : 0;
                  return (
                    <tr key={day.date} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {formatDisplayDate(day.date)}
                        <span className="block text-[10px] font-normal text-slate-400">{day.date}</span>
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-slate-700">
                        {day.totalCount}
                      </td>
                      <td className="py-3 px-4 text-right font-black text-emerald-700">
                        {currencySymbol} {day.cashAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <span className="block text-[10px] text-emerald-600 font-medium">{day.cashCount} bills</span>
                      </td>
                      <td className="py-3 px-4 text-right font-black text-blue-700">
                        {currencySymbol} {day.onlineAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <span className="block text-[10px] text-blue-600 font-medium">{day.onlineCount} bills</span>
                      </td>
                      <td className="py-3 px-4 text-right font-black text-slate-900">
                        {currencySymbol} {day.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black ${
                          onlineRatio > 50 ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {onlineRatio.toFixed(1)}% Online
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 7. INDIVIDUAL TRANSACTIONS LOG WITH PAYMENT METHOD & PLATFORM FILTER */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <Receipt className="w-4 h-4 text-slate-600" />
              Customer Invoices by Payment Method & Platform
            </h4>
            <p className="text-[11px] text-slate-500">
              Showing {displayedSales.length} of {filteredSalesByDate.length} invoices.
            </p>
          </div>

          {/* Controls: Payment Method Toggle & Search */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Method Tabs */}
            <div className="bg-slate-200/80 p-1 rounded-xl flex items-center gap-1 text-xs overflow-x-auto max-w-full">
              <button
                type="button"
                onClick={() => setMethodFilter('all')}
                className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap ${
                  methodFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All ({filteredSalesByDate.length})
              </button>
              <button
                type="button"
                onClick={() => setMethodFilter('cash')}
                className={`px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                  methodFilter === 'cash'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-emerald-700 hover:text-emerald-900'
                }`}
              >
                <Banknote className="w-3 h-3" /> Cash ({paymentStats.cashCount})
              </button>
              <button
                type="button"
                onClick={() => setMethodFilter('online')}
                className={`px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                  methodFilter === 'online'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-blue-700 hover:text-blue-900'
                }`}
              >
                <Smartphone className="w-3 h-3" /> All Online ({paymentStats.onlineCount})
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search receipt, cashier, Tx ID..."
                className="pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500 w-48 sm:w-56"
              />
            </div>
          </div>
        </div>

        {/* Invoices Table */}
        {displayedSales.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Receipt className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-600">No receipt records found</p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Try adjusting your search keywords, payment mode filter, or selected date range.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  <th className="py-3 px-4">Receipt #</th>
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Cashier / Counter</th>
                  <th className="py-3 px-4">Payment Method & Platform</th>
                  <th className="py-3 px-4">Cash Handled / Reference</th>
                  <th className="py-3 px-4 text-right">Total Amount</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {displayedSales.map((sale) => {
                  const isOnline = sale.paymentMethod === 'online';
                  const d = new Date(sale.timestamp);

                  return (
                    <tr key={sale.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        #{sale.receiptNumber || sale.id.slice(-6).toUpperCase()}
                        <div className="text-[10px] font-medium text-slate-400">
                          {(sale.items || []).reduce((acc, it) => acc + (it.quantity || 1), 0)} items
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-800">{formatDisplayDate(getLocalDateString(sale.timestamp))}</div>
                        <div className="text-[10px] text-slate-400">{d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-900">{sale.cashierName || sale.cashierUsername || 'Counter Staff'}</div>
                        <div className="text-[10px] text-slate-400">
                          {sale.counterName || ((sale as any).counterNumber ? `Counter #${(sale as any).counterNumber}` : 'Main Counter')}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        {isOnline ? (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-blue-50 text-blue-700 border border-blue-200">
                              <Smartphone className="w-3 h-3 text-blue-600" /> ONLINE
                            </span>
                            {sale.onlinePaymentProvider && (
                              <div className="text-[11px] font-extrabold text-blue-800 mt-0.5 flex items-center gap-1">
                                <span>Platform:</span> {sale.onlinePaymentProvider}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <Banknote className="w-3 h-3 text-emerald-600" /> CASH
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {!isOnline && sale.cashReceived !== undefined ? (
                          <div className="space-y-0.5 text-[11px]">
                            <div className="text-slate-600">Recv: <strong className="text-slate-900">{currencySymbol}{sale.cashReceived}</strong></div>
                            {(sale.changeReturned ?? 0) > 0 && (
                              <div className="text-amber-700 font-semibold text-[10px]">
                                Change: {currencySymbol}{sale.changeReturned}
                              </div>
                            )}
                          </div>
                        ) : isOnline && sale.onlineTransactionId ? (
                          <div className="text-[11px] text-slate-700 font-mono">
                            Ref: <strong>{sale.onlineTransactionId}</strong>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-black text-sm text-slate-900">
                        {currencySymbol} {Number(sale.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {onViewReceipt && (
                          <button
                            type="button"
                            onClick={() => onViewReceipt(sale)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-orange-50 hover:text-orange-600 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                            title="View Full Customer Receipt"
                          >
                            <Eye className="w-3 h-3" /> View
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Digital Platform Confirmation Modal */}
      {methodToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-scale-up">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto shadow-inner">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-black text-slate-900">Delete Payment Platform?</h3>
              <p className="text-xs text-slate-500">
                Are you sure you want to remove <strong className="text-slate-900 font-extrabold">{methodToDelete.name}</strong> from your accepted digital platforms?
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMethodToDelete(null)}
                className="w-1/2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteMethod(methodToDelete.id)}
                disabled={savingSettings}
                className="w-1/2 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs transition-colors cursor-pointer shadow-sm disabled:opacity-50"
              >
                {savingSettings ? 'Removing...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
