import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  db, 
  collection, 
  doc,
  onSnapshot, 
  query, 
  where, 
  updateDoc,
  writeBatch,
  cleanFirestoreData,
  handleFirestoreError,
  OperationType 
} from '../lib/firebase';
import { Product, Sale, Store, UserAccount, ProductReturn, Expense } from '../types';
import { cleanupExpiredReceipts, isSaleExpired } from '../lib/salesCleanup';
import { ReturnSlipModal } from './ReturnSlipModal';
import { ReceiptModal } from './ReceiptModal';
import { StoreSettingsView } from './StoreSettingsView';
import { SalesRevenueChart } from './SalesRevenueChart';
import { SevenDaySalesVolumeChart } from './SevenDaySalesVolumeChart';
import { HourlySales24hChart } from './HourlySales24hChart';
import { StoreAiAssistantModal } from './StoreAiAssistantModal';
import { ExcelManagerModal } from './ExcelManagerModal';
import { DiscountManagerModal } from './DiscountManagerModal';
import { ItemDiscountModal } from './ItemDiscountModal';
import { getProductDiscountInfo, getEffectiveProductPrice } from '../utils/discountUtils';
import { syncMissingShortcutCodesInFirestore } from '../utils/productShortcuts';
import { playScanSuccessBeep } from '../lib/sound';
import { BatchProductRow } from '../lib/excelParser';
import { StoreAdminSidebar, StoreAdminTab, ExpenseFilterMode } from './StoreAdminSidebar';
import { StoreAdminExpenses } from './StoreAdminExpenses';
import { SupplierManagementView } from './SupplierManagementView';
import { StaffSessionsView } from './StaffSessionsView';
import { PaymentMethodsView } from './PaymentMethodsView';
import { StoreStaffTrackerView } from './StoreStaffTrackerView';
import { StaffAttendanceView } from './StaffAttendanceView';
import { GmailReceiptsLogView } from './GmailReceiptsLogView';
import { 
  TrendingUp, 
  Package, 
  AlertTriangle, 
  DollarSign, 
  ShoppingBag, 
  Search, 
  Calculator, 
  PackageCheck, 
  Receipt, 
  ReceiptText,
  Scale,
  Activity,
  CalendarCheck2,
  Eye, 
  ArrowUpRight, 
  RefreshCw,
  Layers,
  Calendar,
  CalendarDays,
  Clock,
  Filter,
  Check,
  RotateCcw,
  CreditCard,
  Banknote,
  ChevronRight,
  ChevronLeft,
  ArrowDownRight,
  Tag,
  Undo2,
  Settings,
  Coins,
  Percent,
  BarChart3,
  Sparkles,
  Bot,
  LineChart as LineChartIcon,
  FileSpreadsheet,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  LayoutDashboard,
  Users,
  Store as StoreIcon,
  ShieldCheck,
  ArrowRight,
  Truck,
  Boxes,
  PackagePlus,
  CheckCircle2,
  Trash2,
  Mail,
  LogOut
} from 'lucide-react';

interface StoreAdminDashboardProps {
  store: Store;
  currentUser: UserAccount;
  onNavigateToPOS?: () => void;
  onNavigateToInventory?: () => void;
  onViewReceipt?: (sale: Sale) => void;
  onNavigateToSuppliers?: () => void;
  onNavigateToLiveSessions?: () => void;
  onLogout?: () => void;
}

type DateFilterType = 'all' | 'today' | 'yesterday' | 'last_7_days' | 'this_month' | 'custom_single' | 'custom_range';

// Helper to get YYYY-MM-DD from an ISO string or Date in local time
function getLocalDateString(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper to format display date (e.g. "Sat, 15 Aug 2026")
function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts.map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

export const StoreAdminDashboard: React.FC<StoreAdminDashboardProps> = ({
  store,
  currentUser,
  onNavigateToPOS,
  onNavigateToInventory,
  onViewReceipt,
  onLogout
}) => {
  const [liveStore, setLiveStore] = useState<Store>(store);
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [returns, setReturns] = useState<ProductReturn[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseFilterMode, setExpenseFilterMode] = useState<ExpenseFilterMode>('month');
  const [storeUsers, setStoreUsers] = useState<UserAccount[]>([]);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<StoreAdminTab>('sales_by_date');
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showChartInSalesByDate, setShowChartInSalesByDate] = useState<boolean>(true);
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [spreadsheetProductsForAi, setSpreadsheetProductsForAi] = useState<BatchProductRow[] | null>(null);

  // Return Voucher Modal State
  const [viewingReturnSlip, setViewingReturnSlip] = useState<ProductReturn | null>(null);
  const [isReturnSlipOpen, setIsReturnSlipOpen] = useState(false);

  // Customer Receipt Modal State
  const [viewingReceipt, setViewingReceipt] = useState<Sale | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  // Date Filtering State
  const todayStr = useMemo(() => getLocalDateString(new Date()), []);
  const [dateFilter, setDateFilter] = useState<DateFilterType>('all');
  const [selectedSingleDate, setSelectedSingleDate] = useState<string>(todayStr);
  const [customStartDate, setCustomStartDate] = useState<string>(todayStr);
  const [customEndDate, setCustomEndDate] = useState<string>(todayStr);

  // Selected date for deep inspection in Sales by Date tab
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  const mainContentRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (mainContentRef.current) {
      mainContentRef.current.scrollTop = 0;
    }
  }, [activeTab]);

  // Promotions & Discounts States
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
  const [discountEditProduct, setDiscountEditProduct] = useState<Product | null>(null);
  const [promotionsSearchTerm, setPromotionsSearchTerm] = useState('');
  const [promotionsFilter, setPromotionsFilter] = useState<'all' | 'active' | 'percentage' | 'fixed' | 'none'>('all');
  const [promotionsCategory, setPromotionsCategory] = useState<string>('All');
  const [isClearingAllDiscounts, setIsClearingAllDiscounts] = useState(false);
  const [isConfirmClearDiscountsOpen, setIsConfirmClearDiscountsOpen] = useState(false);
  const [gmailReceiptsCount, setGmailReceiptsCount] = useState<number>(0);

  // Real-time synchronization of Store, Products, Sales, Returns, and Staff for this store
  useEffect(() => {
    if (store && store.id !== liveStore.id) {
      setLiveStore(store);
    }
  }, [store?.id]);

  useEffect(() => {
    if (!store?.id) return;

    // 0. Subscribe to Store Details
    const storeRef = doc(db, 'stores', store.id);
    const unsubStore = onSnapshot(storeRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setLiveStore({ id: snapshot.id, ...data } as Store);
      }
    }, (err) => {
      console.warn('Store snapshot sync warning:', err);
    });

    // 1. Subscribe to Products
    const productsQuery = query(
      collection(db, 'products'),
      where('storeId', '==', store.id)
    );

    const unsubProducts = onSnapshot(productsQuery, (snapshot) => {
      const prodList: Product[] = [];
      snapshot.forEach((doc) => {
        prodList.push({ id: doc.id, ...doc.data() } as Product);
      });
      setProducts(prodList);

      // Auto-sync 4-digit shortcut codes for any legacy products missing one
      const hasMissingShortcuts = prodList.some(p => !p.shortcutCode || !/^\d{4}$/.test(p.shortcutCode));
      if (hasMissingShortcuts && prodList.length > 0) {
        syncMissingShortcutCodesInFirestore(prodList).catch(e => console.warn('Background shortcut sync error:', e));
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'products');
    });

    // 2. Subscribe to Sales (Customer slips older than 7 days expire from public access, but sales records, revenue, profit, stock, and sold items remain permanent)
    cleanupExpiredReceipts(store.id);

    const salesQuery = query(
      collection(db, 'sales'),
      where('storeId', '==', store.id)
    );

    const unsubSales = onSnapshot(salesQuery, (snapshot) => {
      const saleList: Sale[] = [];
      snapshot.forEach((doc) => {
        const saleData = { id: doc.id, ...doc.data() } as Sale;
        // CRITICAL: NEVER delete or exclude sales records! Total revenue, profit, inventory, and sold products are permanent.
        saleList.push(saleData);
      });
      // Sort sales by timestamp descending (newest first)
      saleList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setSales(saleList);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'sales');
    });

    // 3. Subscribe to Product Returns & Refunds
    const returnsQuery = query(
      collection(db, 'returns'),
      where('storeId', '==', store.id)
    );

    const unsubReturns = onSnapshot(returnsQuery, (snapshot) => {
      const returnList: ProductReturn[] = [];
      snapshot.forEach((doc) => {
        returnList.push({ id: doc.id, ...doc.data() } as ProductReturn);
      });
      returnList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setReturns(returnList);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'returns');
    });

    // 4. Subscribe to Staff Users
    const usersQuery = query(
      collection(db, 'users'),
      where('storeId', '==', store.id)
    );

    const unsubUsers = onSnapshot(usersQuery, (snapshot) => {
      const userList: UserAccount[] = [];
      snapshot.forEach((doc) => {
        userList.push({ id: doc.id, ...doc.data() } as UserAccount);
      });
      setStoreUsers(userList);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'users');
    });

    // 5. Subscribe to Expenses & Outflows
    const expensesQuery = query(
      collection(db, 'expenses'),
      where('storeId', '==', store.id)
    );

    const unsubExpenses = onSnapshot(expensesQuery, (snapshot) => {
      const expenseList: Expense[] = [];
      snapshot.forEach((doc) => {
        expenseList.push({ id: doc.id, ...doc.data() } as Expense);
      });
      // Sort newest date first
      expenseList.sort((a, b) => new Date(b.date || b.timestamp).getTime() - new Date(a.date || a.timestamp).getTime());
      setExpenses(expenseList);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'expenses');
    });

    // 6. Subscribe to Sent Receipts (Gmail E-Receipts Log Count)
    let unsubSentReceipts = () => {};
    try {
      const sentReceiptsQuery = store.id !== 'all'
        ? query(collection(db, 'sent_receipts'), where('storeId', '==', store.id))
        : collection(db, 'sent_receipts');
      unsubSentReceipts = onSnapshot(sentReceiptsQuery, (snap) => {
        setGmailReceiptsCount(snap.docs.length);
      }, (err) => {
        console.warn('sent_receipts count listener warning:', err);
      });
    } catch (e) {
      console.warn('Failed to listen to sent_receipts count:', e);
    }

    return () => {
      unsubStore();
      unsubProducts();
      unsubSales();
      unsubReturns();
      unsubUsers();
      unsubExpenses();
      unsubSentReceipts();
    };
  }, [store?.id]);

  // Compute yesterday string
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return getLocalDateString(d);
  }, []);

  // Filter Sales according to selected Date Range
  const filteredSalesByDate = useMemo(() => {
    if (dateFilter === 'all') return sales;

    const now = new Date();

    if (dateFilter === 'today') {
      return sales.filter(s => getLocalDateString(s.timestamp) === todayStr);
    }

    if (dateFilter === 'yesterday') {
      return sales.filter(s => getLocalDateString(s.timestamp) === yesterdayStr);
    }

    if (dateFilter === 'last_7_days') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(now.getDate() - 7);
      sevenDaysAgo.setHours(0, 0, 0, 0);
      return sales.filter(s => new Date(s.timestamp) >= sevenDaysAgo);
    }

    if (dateFilter === 'this_month') {
      const curYear = now.getFullYear();
      const curMonth = now.getMonth();
      return sales.filter(s => {
        const d = new Date(s.timestamp);
        return d.getFullYear() === curYear && d.getMonth() === curMonth;
      });
    }

    if (dateFilter === 'custom_single') {
      return sales.filter(s => getLocalDateString(s.timestamp) === selectedSingleDate);
    }

    if (dateFilter === 'custom_range') {
      return sales.filter(s => {
        const saleDate = getLocalDateString(s.timestamp);
        return saleDate >= customStartDate && saleDate <= customEndDate;
      });
    }

    return sales;
  }, [sales, dateFilter, todayStr, yesterdayStr, selectedSingleDate, customStartDate, customEndDate]);

  // Filter Returns according to selected Date Range
  const filteredReturnsByDate = useMemo(() => {
    if (dateFilter === 'all') return returns;

    const now = new Date();

    if (dateFilter === 'today') {
      return returns.filter(r => getLocalDateString(r.timestamp) === todayStr);
    }

    if (dateFilter === 'yesterday') {
      return returns.filter(r => getLocalDateString(r.timestamp) === yesterdayStr);
    }

    if (dateFilter === 'last_7_days') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(now.getDate() - 7);
      sevenDaysAgo.setHours(0, 0, 0, 0);
      return returns.filter(r => new Date(r.timestamp) >= sevenDaysAgo);
    }

    if (dateFilter === 'this_month') {
      const curYear = now.getFullYear();
      const curMonth = now.getMonth();
      return returns.filter(r => {
        const d = new Date(r.timestamp);
        return d.getFullYear() === curYear && d.getMonth() === curMonth;
      });
    }

    if (dateFilter === 'custom_single') {
      return returns.filter(r => getLocalDateString(r.timestamp) === selectedSingleDate);
    }

    if (dateFilter === 'custom_range') {
      return returns.filter(r => {
        const returnDate = getLocalDateString(r.timestamp);
        return returnDate >= customStartDate && returnDate <= customEndDate;
      });
    }

    return returns;
  }, [returns, dateFilter, todayStr, yesterdayStr, selectedSingleDate, customStartDate, customEndDate]);

  // Daily Sales & Returns Grouping (Day-by-Day Financial Breakdown)
  const dailySalesBreakdown = useMemo(() => {
    const dateMap: { 
      [dateKey: string]: {
        date: string;
        formattedDate: string;
        grossRevenue: number;
        grossCost: number;
        totalRefunds: number;
        returnedCost: number;
        netRevenue: number;
        netCost: number;
        netProfit: number;
        profitMargin: number;
        totalInvoices: number;
        totalReturnsCount: number;
        grossUnitsSold: number;
        unitsReturned: number;
        netUnitsSold: number;
        cashRevenue: number;
        onlineRevenue: number;
        totalDiscount: number;
        sales: Sale[];
        returns: ProductReturn[];
      }
    } = {};

    const getOrCreate = (dateKey: string) => {
      if (!dateMap[dateKey]) {
        dateMap[dateKey] = {
          date: dateKey,
          formattedDate: formatDisplayDate(dateKey),
          grossRevenue: 0,
          grossCost: 0,
          totalRefunds: 0,
          returnedCost: 0,
          netRevenue: 0,
          netCost: 0,
          netProfit: 0,
          profitMargin: 0,
          totalInvoices: 0,
          totalReturnsCount: 0,
          grossUnitsSold: 0,
          unitsReturned: 0,
          netUnitsSold: 0,
          cashRevenue: 0,
          onlineRevenue: 0,
          totalDiscount: 0,
          sales: [],
          returns: []
        };
      }
      return dateMap[dateKey];
    };

    (sales || []).forEach((sale) => {
      const dateKey = getLocalDateString(sale.timestamp) || 'Unknown Date';
      const d = getOrCreate(dateKey);

      d.totalInvoices += 1;
      d.grossRevenue += (sale.totalAmount || 0);
      d.totalDiscount += (sale.discountAmount || 0);

      if (sale.paymentMethod === 'online') {
        d.onlineRevenue += (sale.totalAmount || 0);
      } else {
        d.cashRevenue += (sale.totalAmount || 0);
      }

      let saleCost = 0;
      (sale.items || []).forEach((item) => {
        const qty = item.quantity || 0;
        d.grossUnitsSold += qty;
        
        let unitCost = 0;
        if (typeof item.costPrice === 'number' && item.costPrice >= 0) {
          unitCost = item.costPrice;
        } else {
          const matching = products.find(p => (item.productId && p.id === item.productId) || (item.barcode && p.barcode === item.barcode));
          unitCost = matching?.costPrice || 0;
        }
        saleCost += unitCost * qty;
      });

      d.grossCost += saleCost;
      d.sales.push(sale);
    });

    (returns || []).forEach((ret) => {
      const dateKey = getLocalDateString(ret.timestamp) || 'Unknown Date';
      const d = getOrCreate(dateKey);

      d.totalReturnsCount += 1;
      d.totalRefunds += (ret.refundAmount || 0);
      const retQty = ret.quantity || 0;
      d.unitsReturned += retQty;

      const matching = products.find(p => (ret.productId && p.id === ret.productId) || (ret.barcode && p.barcode === ret.barcode));
      const retCost = (matching?.costPrice || 0) * retQty;
      d.returnedCost += retCost;

      d.returns.push(ret);
    });

    // Compute Net Profit, Net Units, and Margins for every day
    Object.values(dateMap).forEach((d) => {
      const dayOrderCost = (expenses || [])
        .filter(e => (e.date || getLocalDateString(e.timestamp)) === d.date && (e.category === 'Transport & Logistics' || (e as any).description?.toLowerCase().includes('supply') || (e as any).title?.toLowerCase().includes('order') || (e as any).reason?.toLowerCase().includes('balance')))
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

      d.netRevenue = Math.max(0, d.grossRevenue - d.totalRefunds - dayOrderCost);
      d.netCost = Math.max(0, d.grossCost - d.returnedCost);
      d.netProfit = d.netRevenue - d.netCost;
      d.profitMargin = d.netRevenue > 0 ? (d.netProfit / d.netRevenue) * 100 : 0;
      d.netUnitsSold = d.grossUnitsSold - d.unitsReturned;
    });

    // Sort descending by date
    return Object.values(dateMap).sort((a, b) => b.date.localeCompare(a.date));
  }, [sales, returns, products, expenses]);

  // Compute Aggregations for Active Date Filter
  const filteredGrossRevenue = useMemo(() => {
    return filteredSalesByDate.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
  }, [filteredSalesByDate]);

  const filteredRefundsTotal = useMemo(() => {
    return filteredReturnsByDate.reduce((sum, r) => sum + (r.refundAmount || 0), 0);
  }, [filteredReturnsByDate]);

  // Filter Expenses according to selected Date Range
  const filteredExpensesByDate = useMemo(() => {
    if (dateFilter === 'all') return expenses;
    const now = new Date();
    if (dateFilter === 'today') {
      return expenses.filter(e => (e.date || getLocalDateString(e.timestamp)) === todayStr);
    }
    if (dateFilter === 'yesterday') {
      return expenses.filter(e => (e.date || getLocalDateString(e.timestamp)) === yesterdayStr);
    }
    if (dateFilter === 'last_7_days') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(now.getDate() - 7);
      sevenDaysAgo.setHours(0, 0, 0, 0);
      return expenses.filter(e => new Date(e.date || e.timestamp) >= sevenDaysAgo);
    }
    if (dateFilter === 'this_month') {
      const curYear = now.getFullYear();
      const curMonth = now.getMonth();
      return expenses.filter(e => {
        const d = new Date(e.date || e.timestamp);
        return d.getFullYear() === curYear && d.getMonth() === curMonth;
      });
    }
    if (dateFilter === 'custom_single') {
      return expenses.filter(e => (e.date || getLocalDateString(e.timestamp)) === selectedSingleDate);
    }
    if (dateFilter === 'custom_range') {
      return expenses.filter(e => {
        const expDate = e.date || getLocalDateString(e.timestamp);
        return expDate >= customStartDate && expDate <= customEndDate;
      });
    }
    return expenses;
  }, [expenses, dateFilter, todayStr, yesterdayStr, selectedSingleDate, customStartDate, customEndDate]);

  const filteredSupplierOrdersCost = useMemo(() => {
    return filteredExpensesByDate
      .filter(e => e.category === 'Transport & Logistics' || (e as any).description?.toLowerCase().includes('supply') || (e as any).title?.toLowerCase().includes('order') || (e as any).reason?.toLowerCase().includes('balance'))
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }, [filteredExpensesByDate]);

  const filteredNetRevenue = useMemo(() => {
    return Math.max(0, filteredGrossRevenue - filteredRefundsTotal - filteredSupplierOrdersCost);
  }, [filteredGrossRevenue, filteredRefundsTotal, filteredSupplierOrdersCost]);

  const filteredCostOfGoods = useMemo(() => {
    let totalCost = 0;
    (filteredSalesByDate || []).forEach((sale) => {
      (sale.items || []).forEach((item) => {
        const qty = item.quantity || 0;
        let unitCost = 0;
        if (typeof item.costPrice === 'number' && item.costPrice >= 0) {
          unitCost = item.costPrice;
        } else {
          const matching = products.find(p => (item.productId && p.id === item.productId) || (item.barcode && p.barcode === item.barcode));
          unitCost = matching?.costPrice || 0;
        }
        totalCost += unitCost * qty;
      });
    });

    (filteredReturnsByDate || []).forEach((ret) => {
      const retQty = ret.quantity || 0;
      const matching = products.find(p => (ret.productId && p.id === ret.productId) || (ret.barcode && p.barcode === ret.barcode));
      const retCost = (matching?.costPrice || 0) * retQty;
      totalCost -= retCost;
    });

    return Math.max(0, totalCost);
  }, [filteredSalesByDate, filteredReturnsByDate, products]);

  const filteredNetProfit = useMemo(() => {
    return filteredNetRevenue - filteredCostOfGoods;
  }, [filteredNetRevenue, filteredCostOfGoods]);

  const filteredTotalExpenses = useMemo(() => {
    return filteredExpensesByDate.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);
  }, [filteredExpensesByDate]);

  const filteredNetProfitIncludingExpenses = useMemo(() => {
    return filteredNetProfit - filteredTotalExpenses;
  }, [filteredNetProfit, filteredTotalExpenses]);

  const filteredProfitMargin = useMemo(() => {
    if (filteredNetRevenue <= 0) return 0;
    return (filteredNetProfit / filteredNetRevenue) * 100;
  }, [filteredNetRevenue, filteredNetProfit]);

  const filteredGrossUnitsSold = useMemo(() => {
    return filteredSalesByDate.reduce((sum, sale) => {
      const itemsCount = sale.items?.reduce((iSum, item) => iSum + (item.quantity || 0), 0) || 0;
      return sum + itemsCount;
    }, 0);
  }, [filteredSalesByDate]);

  const filteredUnitsReturned = useMemo(() => {
    return filteredReturnsByDate.reduce((sum, r) => sum + (r.quantity || 0), 0);
  }, [filteredReturnsByDate]);

  const filteredNetUnitsSold = useMemo(() => {
    return filteredGrossUnitsSold - filteredUnitsReturned;
  }, [filteredGrossUnitsSold, filteredUnitsReturned]);

  const filteredDiscounts = useMemo(() => {
    return filteredSalesByDate.reduce((sum, s) => sum + (s.discountAmount || 0), 0);
  }, [filteredSalesByDate]);

  // Aggregate Sold Products for Active Date Filter with cost and profit metrics
  const soldProductsSummary = useMemo(() => {
    const summaryMap: { 
      [barcodeOrId: string]: { 
        barcode: string; 
        name: string; 
        costPrice: number;
        grossUnitsSold: number; 
        unitsReturned: number;
        netUnitsSold: number;
        grossRevenue: number; 
        refundedAmount: number;
        netRevenue: number;
        totalCost: number;
        realizedProfit: number;
        profitMargin: number;
        lastPrice: number 
      } 
    } = {};

    (filteredSalesByDate || []).forEach((sale) => {
      (sale.items || []).forEach((item) => {
        const key = item.barcode || item.name;
        if (!summaryMap[key]) {
          let unitCost = 0;
          if (typeof item.costPrice === 'number' && item.costPrice >= 0) {
            unitCost = item.costPrice;
          } else {
            const matching = products.find(p => (item.productId && p.id === item.productId) || (item.barcode && p.barcode === item.barcode));
            unitCost = matching?.costPrice || 0;
          }

          summaryMap[key] = {
            barcode: item.barcode,
            name: item.name,
            costPrice: unitCost,
            grossUnitsSold: 0,
            unitsReturned: 0,
            netUnitsSold: 0,
            grossRevenue: 0,
            refundedAmount: 0,
            netRevenue: 0,
            totalCost: 0,
            realizedProfit: 0,
            profitMargin: 0,
            lastPrice: item.price
          };
        }
        summaryMap[key].grossUnitsSold += item.quantity;
        summaryMap[key].grossRevenue += item.total;
        summaryMap[key].lastPrice = item.price;
      });
    });

    (filteredReturnsByDate || []).forEach((ret) => {
      const key = ret.barcode || ret.productName;
      if (!summaryMap[key]) {
        const matching = products.find(p => (ret.productId && p.id === ret.productId) || (ret.barcode && p.barcode === ret.barcode));
        summaryMap[key] = {
          barcode: ret.barcode || '',
          name: ret.productName || '',
          costPrice: matching?.costPrice || 0,
          grossUnitsSold: 0,
          unitsReturned: 0,
          netUnitsSold: 0,
          grossRevenue: 0,
          refundedAmount: 0,
          netRevenue: 0,
          totalCost: 0,
          realizedProfit: 0,
          profitMargin: 0,
          lastPrice: ret.price ?? (ret as any).unitPrice ?? 0
        };
      }
      summaryMap[key].unitsReturned += (ret.quantity || 0);
      summaryMap[key].refundedAmount += (ret.refundAmount || 0);
      if (typeof ret.price === 'number') {
        summaryMap[key].lastPrice = ret.price;
      } else if (typeof (ret as any).unitPrice === 'number') {
        summaryMap[key].lastPrice = (ret as any).unitPrice;
      }
    });

    Object.values(summaryMap).forEach((sp) => {
      sp.netUnitsSold = Math.max(0, sp.grossUnitsSold - sp.unitsReturned);
      sp.netRevenue = sp.grossRevenue - sp.refundedAmount;
      sp.totalCost = sp.costPrice * sp.netUnitsSold;
      sp.realizedProfit = sp.netRevenue - sp.totalCost;
      sp.profitMargin = sp.netRevenue > 0 ? (sp.realizedProfit / sp.netRevenue) * 100 : 0;
    });

    return Object.values(summaryMap).sort((a, b) => b.realizedProfit - a.realizedProfit);
  }, [filteredSalesByDate, filteredReturnsByDate, products]);

  // Store inventory valuation and stock health analytics (migrated from Product Register)
  const inventoryValuationStats = useMemo(() => {
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
      totalProductsCount: (products || []).length,
      totalUnitsCount,
      totalCostValue,
      totalRetailValue,
      projectedProfit,
      overallMargin,
      lowStockCount,
      outOfStockCount
    };
  }, [products]);

  // Low stock products count
  const lowStockCount = useMemo(() => {
    return products.filter(p => p.stockQuantity <= (p.minStockLevel || 5)).length;
  }, [products]);

  // Filtered sold products by search query
  const filteredSoldProducts = useMemo(() => {
    if (!searchTerm.trim()) return soldProductsSummary;
    const term = searchTerm.toLowerCase();
    return soldProductsSummary.filter(
      sp => sp.name.toLowerCase().includes(term) || sp.barcode.toLowerCase().includes(term)
    );
  }, [soldProductsSummary, searchTerm]);

  // Filtered remaining stock products
  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return products;
    const term = searchTerm.toLowerCase();
    return products.filter(
      p => p.name.toLowerCase().includes(term) || p.barcode.toLowerCase().includes(term) || p.category.toLowerCase().includes(term)
    );
  }, [products, searchTerm]);

  // Filtered sales receipts by search query
  const filteredReceipts = useMemo(() => {
    if (!searchTerm.trim()) return filteredSalesByDate;
    const term = searchTerm.toLowerCase();
    return filteredSalesByDate.filter((s) => 
      s.receiptNumber.toLowerCase().includes(term) ||
      (s.counterName && s.counterName.toLowerCase().includes(term)) ||
      (s.cashierUsername && s.cashierUsername.toLowerCase().includes(term)) ||
      s.items?.some(i => i.name.toLowerCase().includes(term) || i.barcode.toLowerCase().includes(term))
    );
  }, [filteredSalesByDate, searchTerm]);

  // Filtered returns and refunds by search query
  const filteredReturnsLog = useMemo(() => {
    if (!searchTerm.trim()) return filteredReturnsByDate;
    const term = searchTerm.toLowerCase();
    return filteredReturnsByDate.filter((r) => 
      r.returnSlipNumber.toLowerCase().includes(term) ||
      r.productName.toLowerCase().includes(term) ||
      r.barcode.toLowerCase().includes(term) ||
      (r.originalReceiptNumber && r.originalReceiptNumber.toLowerCase().includes(term)) ||
      (r.cashierUsername && r.cashierUsername.toLowerCase().includes(term)) ||
      (r.reason && r.reason.toLowerCase().includes(term))
    );
  }, [filteredReturnsByDate, searchTerm]);

  // Text label describing active date filter
  const activeDateFilterLabel = useMemo(() => {
    switch (dateFilter) {
      case 'today':
        return `Today (${formatDisplayDate(todayStr)})`;
      case 'yesterday':
        return `Yesterday (${formatDisplayDate(yesterdayStr)})`;
      case 'last_7_days':
        return 'Last 7 Days';
      case 'this_month':
        return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      case 'custom_single':
        return formatDisplayDate(selectedSingleDate);
      case 'custom_range':
        return `${formatDisplayDate(customStartDate)} to ${formatDisplayDate(customEndDate)}`;
      case 'all':
      default:
        return 'All Time (Lifetime History)';
    }
  }, [dateFilter, todayStr, yesterdayStr, selectedSingleDate, customStartDate, customEndDate]);

  // Low stock count based on store alert threshold
  const lowStockAlertCount = useMemo(() => {
    const threshold = liveStore.lowStockAlertThreshold || 5;
    return products.filter(p => (p.stockQuantity || 0) <= threshold).length;
  }, [products, liveStore.lowStockAlertThreshold]);

  // Monthly expenses total
  const monthlyExpensesTotal = useMemo(() => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return expenses
      .filter(e => e.date && e.date.startsWith(ym))
      .reduce((acc, curr) => acc + (curr.amount || 0), 0);
  }, [expenses]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set);
  }, [products]);

  // Payment methods breakdown stats
  const paymentMethodStats = useMemo(() => {
    let cashSum = 0;
    let onlineSum = 0;
    filteredSalesByDate.forEach(s => {
      const amt = Number(s.totalAmount) || 0;
      if (s.paymentMethod === 'online') {
        onlineSum += amt;
      } else {
        cashSum += amt;
      }
    });
    const total = cashSum + onlineSum;
    const cashPercent = total > 0 ? Math.round((cashSum / total) * 100) : 0;
    const onlinePercent = total > 0 ? Math.round((onlineSum / total) * 100) : 0;
    return {
      cashPaymentTotal: cashSum,
      onlinePaymentTotal: onlineSum,
      cashPercent,
      onlinePercent,
      totalTransactionsCount: filteredSalesByDate.length
    };
  }, [filteredSalesByDate]);

  // Sidebar live stats badges
  const sidebarStats = useMemo(() => ({
    salesDays: dailySalesBreakdown.length,
    totalProducts: products.length,
    lowStockCount: lowStockAlertCount,
    soldProductsCount: soldProductsSummary.length,
    discountedCount: products.filter(p => p.discountActive && (p.discountValue || 0) > 0).length,
    receiptsCount: filteredSalesByDate.length,
    gmailReceiptsCount: gmailReceiptsCount,
    returnsCount: filteredReturnsByDate.length,
    staffCount: storeUsers.length,
    expensesCount: expenses.length,
    monthlyExpensesTotal,
    cashPaymentTotal: paymentMethodStats.cashPaymentTotal,
    onlinePaymentTotal: paymentMethodStats.onlinePaymentTotal,
    cashPercent: paymentMethodStats.cashPercent,
    onlinePercent: paymentMethodStats.onlinePercent,
    totalTransactionsCount: paymentMethodStats.totalTransactionsCount
  }), [dailySalesBreakdown.length, products.length, lowStockAlertCount, soldProductsSummary.length, products, filteredSalesByDate.length, gmailReceiptsCount, filteredReturnsByDate.length, storeUsers.length, expenses.length, monthlyExpensesTotal, paymentMethodStats]);

  // Promotions Memoized Calculations
  const promotionsCategories = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.category) set.add(p.category);
    });
    return ['All', ...Array.from(set).sort()];
  }, [products]);

  const activeDiscountedProducts = useMemo(() => {
    return products.filter(p => p.discountActive && (p.discountValue || 0) > 0);
  }, [products]);

  const promotionsStats = useMemo(() => {
    const totalCount = products.length;
    const activeCount = activeDiscountedProducts.length;
    const percentageCount = activeDiscountedProducts.filter(p => p.discountType === 'percentage').length;
    const fixedCount = activeDiscountedProducts.filter(p => p.discountType === 'fixed').length;

    let totalPotentialSavings = 0;
    let sumPercentage = 0;
    let countPercentage = 0;

    activeDiscountedProducts.forEach(p => {
      const info = getProductDiscountInfo(p);
      totalPotentialSavings += info.discountAmount * (p.stockQuantity || 1);
      if (p.discountType === 'percentage' && p.discountValue) {
        sumPercentage += p.discountValue;
        countPercentage++;
      }
    });

    const avgDiscountPercentage = countPercentage > 0 ? (sumPercentage / countPercentage) : 0;

    return {
      totalCount,
      activeCount,
      percentageCount,
      fixedCount,
      totalPotentialSavings,
      avgDiscountPercentage,
      percentCatalogOnSale: totalCount > 0 ? (activeCount / totalCount) * 100 : 0
    };
  }, [products, activeDiscountedProducts]);

  const filteredPromotionsProducts = useMemo(() => {
    let result = products;

    // Filter by discount status
    if (promotionsFilter === 'active') {
      result = result.filter(p => p.discountActive && (p.discountValue || 0) > 0);
    } else if (promotionsFilter === 'percentage') {
      result = result.filter(p => p.discountActive && p.discountType === 'percentage' && (p.discountValue || 0) > 0);
    } else if (promotionsFilter === 'fixed') {
      result = result.filter(p => p.discountActive && p.discountType === 'fixed' && (p.discountValue || 0) > 0);
    } else if (promotionsFilter === 'none') {
      result = result.filter(p => !p.discountActive || !p.discountValue || p.discountValue <= 0);
    }

    // Filter by category
    if (promotionsCategory !== 'All') {
      result = result.filter(p => p.category === promotionsCategory);
    }

    // Filter by search query
    if (promotionsSearchTerm.trim()) {
      const q = promotionsSearchTerm.toLowerCase().trim();
      result = result.filter(p => 
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.toLowerCase().includes(q)) ||
        (p.shortcutCode && p.shortcutCode.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q))
      );
    }

    return result;
  }, [products, promotionsFilter, promotionsCategory, promotionsSearchTerm]);

  // Handler to clear all product discounts in bulk
  const handleClearAllDiscounts = async () => {
    if (activeDiscountedProducts.length === 0) return;

    setIsClearingAllDiscounts(true);
    try {
      const batch = writeBatch(db);
      activeDiscountedProducts.forEach(p => {
        const pRef = doc(db, 'products', p.id);
        batch.update(pRef, {
          discountActive: false,
          discountValue: 0,
          discountType: 'percentage',
          updatedAt: new Date().toISOString()
        });
      });
      await batch.commit();
      playScanSuccessBeep();
      setIsConfirmClearDiscountsOpen(false);
    } catch (err) {
      console.error('Failed to clear discounts:', err);
      handleFirestoreError(err, OperationType.UPDATE, 'products');
    } finally {
      setIsClearingAllDiscounts(false);
    }
  };

  // Quick single product discount remove
  const handleQuickRemoveDiscount = async (p: Product) => {
    try {
      const pRef = doc(db, 'products', p.id);
      await updateDoc(pRef, cleanFirestoreData({
        discountActive: false,
        discountValue: 0,
        discountType: 'percentage',
        updatedAt: new Date().toISOString()
      }));
      playScanSuccessBeep();
    } catch (err) {
      console.error('Failed to remove discount:', err);
      handleFirestoreError(err, OperationType.UPDATE, 'products');
    }
  };

  // Top selling products for overview
  const topSellingProducts = useMemo(() => {
    return [...soldProductsSummary].sort((a, b) => b.netUnitsSold - a.netUnitsSold).slice(0, 5);
  }, [soldProductsSummary]);

  // Critical low stock items for overview
  const lowStockItems = useMemo(() => {
    const threshold = liveStore.lowStockAlertThreshold || 5;
    return products.filter(p => (p.stockQuantity || 0) <= threshold).slice(0, 5);
  }, [products, liveStore.lowStockAlertThreshold]);

  // Tab metadata for navigation and header
  const tabTitles: Record<StoreAdminTab, { title: string; subtitle: string; icon: React.ComponentType<{ className?: string }> }> = {
    sales_by_date: {
      title: 'Sales by Date',
      subtitle: 'Day-by-day revenue, profit margin, orders count, and deep day inspection',
      icon: CalendarDays
    },
    volume_chart: {
      title: '7-Day Sales Volume',
      subtitle: 'Visual volume line trend across recent 7 operating days',
      icon: LineChartIcon
    },
    revenue_trends: {
      title: 'Revenue Trends',
      subtitle: 'Historical gross sales, cost of goods, net profits, and profit margins',
      icon: TrendingUp
    },
    returns: {
      title: 'Returns & Refunds',
      subtitle: 'Product return slips, refunded amounts, restocked inventory, and reasons',
      icon: Undo2
    },
    sold_products: {
      title: 'Sold Products',
      subtitle: 'Item-by-item sales velocity, refund impact, wholesale cost, and net margins',
      icon: Tag
    },
    stock_remaining: {
      title: 'Realtime Stock Inventory',
      subtitle: 'Current in-stock inventory counts, selling prices, wholesale costs, and stock alerts',
      icon: Package
    },
    promotions: {
      title: 'Item Discounts & Promotions',
      subtitle: 'Set and manage percentage & flat rupee discounts, monitor customer savings and realized profit margins',
      icon: Percent
    },
    sales_history: {
      title: 'Receipts & Billing Log',
      subtitle: 'All customer checkout records, payment methods, cashier counter numbers, and slips',
      icon: Receipt
    },
    payment_methods: {
      title: 'Payment Methods & Financial Breakdown',
      subtitle: 'Configure accepted digital payment platforms (EasyPaisa, JazzCash, etc.) and audit Cash vs Online inflow',
      icon: CreditCard
    },
    expenses: {
      title: 'Store Expense Management',
      subtitle: 'Log, filter, and review store operational costs, bills, rent, packaging, and outflows',
      icon: ReceiptText
    },
    suppliers: {
      title: 'Supplier Orders & Stock Receipts',
      subtitle: 'Create supplier purchase orders, receive inventory stock, and track supplier accounts',
      icon: Truck
    },
    staff: {
      title: 'Store Staff & Salaries',
      subtitle: 'Cashiers, inventory staff, salaries, payroll disbursements, and account management',
      icon: Users
    },
    settings: {
      title: 'Settings & Configuration',
      subtitle: 'Store identity, address, receipt formats, black & white logo, and product categories',
      icon: Settings
    },
    net_profit_revenue: {
      title: 'Net Profit & Sales Revenue',
      subtitle: 'Total net profit, net sales revenue, and profit margins filtered by time',
      icon: DollarSign
    },
    product_valuation: {
      title: 'Store Product Valuation Analytics',
      subtitle: 'Cost of goods sold, total units sold, product categories, wholesale investment, retail value, and stock health',
      icon: Scale
    },
    recent_receipts: {
      title: 'Recent Customer Receipts',
      subtitle: 'All recent customer checkout slips and transaction history',
      icon: ReceiptText
    },
    gmail_log: {
      title: 'Customer Gmail E-Receipts Audit Log',
      subtitle: 'Realtime record of all digital invoices dispatched via supermarketmanage@gmail.com',
      icon: Mail
    },
    attendance: {
      title: 'Staff Attendance & Reports',
      subtitle: 'Daily staff check-in/check-out tracking and custom month attendance reports',
      icon: CalendarCheck2
    },
    staff_operations: {
      title: 'Staff & Operations (Online / Offline Status)',
      subtitle: 'Realtime view of online active staff members vs offline accounts across roles',
      icon: Activity
    },
    omnimail: {
      title: 'Direct Gmail E-Receipt & Broadcast',
      subtitle: 'Dispatch real-time digital e-receipts and promotional email broadcasts directly via Gmail',
      icon: Mail
    }
  };

  return (
    <div className="h-full w-full bg-slate-100 text-slate-900 flex overflow-hidden overflow-x-hidden">
      {/* STORE ADMIN SIDEBAR NAVIGATION */}
      <StoreAdminSidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(prev => !prev)}
        isOpenMobile={isSidebarOpenMobile}
        onCloseMobile={() => setIsSidebarOpenMobile(false)}
        store={liveStore}
        stats={sidebarStats}
        expenseFilterMode={expenseFilterMode}
        onSelectExpenseFilterMode={setExpenseFilterMode}
        onNavigateToPOS={onNavigateToPOS}
        onNavigateToInventory={onNavigateToInventory}
        onOpenExcel={() => setIsExcelModalOpen(true)}
        onOpenAi={() => setIsAiAssistantOpen(true)}
        onLogout={onLogout}
      />

      {/* MAIN DASHBOARD CONTENT WRAPPER */}
      <div className="flex-1 min-w-0 flex flex-col h-full min-h-0 overflow-hidden">
        {/* STICKY TOP APP BAR */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-3 sm:px-6 py-3.5 flex items-center justify-between gap-4 shadow-2xs shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {/* Menu Button to Open Sidebar Drawer */}
            <button
              type="button"
              onClick={() => setIsSidebarOpenMobile(true)}
              className="p-2 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 cursor-pointer flex items-center gap-1.5 text-xs font-bold transition-colors shadow-2xs"
              title="Open Sidebar Navigation"
              aria-label="Open Sidebar Navigation"
            >
              <Menu className="w-5 h-5 text-orange-600" />
              <span>Menu</span>
            </button>

            {/* Breadcrumb Indicator */}
            <div className="flex items-center gap-2 min-w-0">
              <button 
                type="button"
                onClick={() => setActiveTab('sales_by_date')}
                className="text-xs font-bold text-slate-500 hover:text-orange-600 transition-colors hidden sm:inline truncate cursor-pointer"
              >
                Store Admin
              </button>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 hidden sm:inline shrink-0" />
              <div className="flex items-center gap-2 min-w-0">
                <span className="p-1 rounded-lg bg-orange-100 text-orange-700 shrink-0">
                  {React.createElement(tabTitles[activeTab]?.icon || LayoutDashboard, { className: 'w-3.5 h-3.5' })}
                </span>
                <span className="text-sm sm:text-base font-extrabold text-slate-900 truncate">
                  {tabTitles[activeTab]?.title || 'Dashboard'}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Header Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsExcelModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-xs hidden md:flex items-center gap-1.5 cursor-pointer transition-all"
              title="Open Excel / Spreadsheet Manager"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" /> Excel
            </button>

            <button
              type="button"
              onClick={() => setIsAiAssistantOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold text-xs hidden md:flex items-center gap-1.5 cursor-pointer transition-all"
              title="Open AI Copilot"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-600" /> AI Copilot
            </button>

            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs"
                title="Log Out of Store Admin"
              >
                <LogOut className="w-3.5 h-3.5 text-red-600" />
                <span className="hidden sm:inline">Log Out</span>
              </button>
            )}
          </div>
        </header>

        {/* INNER SCROLLABLE CONTENT */}
        <main ref={mainContentRef as any} className="p-0 sm:p-6 lg:p-8 w-full space-y-6 flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar touch-auto overscroll-contain">
          {/* Store Admin Hero Banner */}
          <div className="bg-white p-4 sm:p-8 rounded-none sm:rounded-3xl border-x-0 sm:border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative overflow-hidden text-left">
            <div className="space-y-2 z-10 flex flex-col items-start w-full">
              <div className="flex items-center justify-start gap-2">
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-orange-50 text-orange-700 border border-orange-200 flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5 text-orange-600" /> Store Admin Dashboard
                </span>
                <span className="text-xs text-emerald-700 font-bold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" /> Realtime Sync Active
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                {store.name} <span className="text-orange-600">{tabTitles[activeTab]?.title || 'Store Management'}</span>
              </h1>
              <p className="text-sm text-slate-600 max-w-2xl font-medium text-left">
                {tabTitles[activeTab]?.subtitle || 'View sales filtered by date, day-by-day revenue breakdown, product sales velocity, real-time inventory levels, and cashier checkout logs.'}
              </p>

              {/* Quick Live Revenue and Profit Highlight Badges */}
              {activeTab === 'sales_by_date' && (
                <div className="flex flex-wrap items-center justify-start gap-3 pt-2">
                  <div className="px-3.5 py-1.5 rounded-xl bg-orange-50 border border-orange-200 flex items-center gap-2 shadow-2xs">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-orange-700">Total Revenue:</span>
                    <span className="font-mono font-black text-sm text-orange-950">
                      Rs. {filteredNetRevenue.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className={`px-3.5 py-1.5 rounded-xl border flex items-center gap-2 shadow-2xs ${
                    filteredNetProfit >= 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-950' : 'bg-red-50 border-red-200 text-red-950'
                  }`}>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Net Profit:</span>
                    <span className={`font-mono font-black text-sm ${filteredNetProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      Rs. {filteredNetProfit.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] font-bold bg-white px-1.5 py-0.5 rounded border border-emerald-200">
                      {(filteredProfitMargin || 0).toFixed(1)}% margin
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

        {/* DATE FILTERING & KPIS FOR SPECIFIC DATE AND DATE RANGE */}
        {activeTab === 'sales_by_date' && (
          <>
            {/* DATE FILTERING CONTROL TOOLBAR */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center font-bold">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                  <span>Filter Sales By Date</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-orange-100 text-orange-800 border border-orange-200">
                    {activeDateFilterLabel}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500 font-medium">
                  Select any date or range to analyze sales revenue, transactions count, and sold items for that specific period.
                </p>
              </div>
            </div>

            {dateFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setDateFilter('all')}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors self-start md:self-auto"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Show All Time Sales
              </button>
            )}
          </div>

          {/* Quick Preset Buttons & Date Pickers */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setDateFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                dateFilter === 'all'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              All Time
            </button>

            <button
              type="button"
              onClick={() => setDateFilter('today')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                dateFilter === 'today'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5" /> Today
            </button>

            <button
              type="button"
              onClick={() => setDateFilter('yesterday')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                dateFilter === 'yesterday'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              Yesterday
            </button>

            <button
              type="button"
              onClick={() => setDateFilter('last_7_days')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                dateFilter === 'last_7_days'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              Last 7 Days
            </button>

            <button
              type="button"
              onClick={() => setDateFilter('this_month')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                dateFilter === 'this_month'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              This Month
            </button>

            <button
              type="button"
              onClick={() => setDateFilter('custom_single')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                dateFilter === 'custom_single'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" /> Specific Date
            </button>

            <button
              type="button"
              onClick={() => setDateFilter('custom_range')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                dateFilter === 'custom_range'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" /> Date Range
            </button>
          </div>

          {/* SPECIFIC DATE INPUT */}
          {dateFilter === 'custom_single' && (
            <div className="flex items-center gap-3 bg-orange-50/70 p-3 rounded-xl border border-orange-200 animate-fade-in flex-wrap">
              <span className="text-xs font-bold text-orange-950 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-orange-600" /> Select Date:
              </span>
              <input
                type="date"
                value={selectedSingleDate}
                onChange={(e) => setSelectedSingleDate(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-orange-500 shadow-xs"
              />
              <span className="text-xs text-orange-800 font-medium">
                Viewing sales for: <strong>{formatDisplayDate(selectedSingleDate)}</strong>
              </span>
            </div>
          )}

          {/* CUSTOM DATE RANGE INPUTS */}
          {dateFilter === 'custom_range' && (
            <div className="flex items-center gap-3 bg-orange-50/70 p-3 rounded-xl border border-orange-200 animate-fade-in flex-wrap">
              <span className="text-xs font-bold text-orange-950 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-orange-600" /> From:
              </span>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-orange-500 shadow-xs"
              />
              <span className="text-xs font-bold text-orange-950">To:</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-orange-500 shadow-xs"
              />
              <span className="text-xs text-orange-800 font-medium">
                ({formatDisplayDate(customStartDate)} – {formatDisplayDate(customEndDate)})
              </span>
            </div>
          )}
        </div>

        {/* DYNAMIC REALTIME METRICS CARDS (Adjusts to selected Date Filter) */}
        <div 
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          
          {/* Net Realized Profit (Excl. & Incl. Expenses) */}
          <div 
            className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Net Profit (Excl. & Incl. Expenses)
              </span>
              <div className="flex items-center gap-1.5 shrink-0 select-none">
                <span className="text-[10px] bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full font-bold border border-orange-200">
                  Total Exp: Rs. {filteredTotalExpenses.toLocaleString('en-PK', { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-100">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Excluding Expenses</span>
                <div className={`text-xl sm:text-2xl font-black font-mono ${filteredNetProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  Rs. {filteredNetProfit.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Including Expenses</span>
                <div className={`text-xl sm:text-2xl font-black font-mono ${filteredNetProfitIncludingExpenses >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>
                  Rs. {filteredNetProfitIncludingExpenses.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 mt-2.5 pt-2 border-t border-slate-100 flex flex-wrap items-center gap-1 font-medium">
              <span className="text-slate-700 font-bold">Revenue: Rs. {(filteredNetRevenue || 0).toFixed(0)}</span>
              <span className="text-slate-400">•</span>
              <span className="text-slate-600 font-semibold">Orders: {filteredSalesByDate.length}</span>
            </div>
          </div>

          {/* Net Sales Revenue */}
          <div 
            className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                {dateFilter === 'all' ? 'Net Sales Revenue' : 'Revenue (Filtered Date)'}
              </span>
              <div className="p-2 rounded-xl bg-orange-50 text-orange-600 border border-orange-200 font-bold text-xs">
                <span>PKR</span>
              </div>
            </div>
            <div className="mt-3 text-2xl sm:text-3xl font-black text-slate-900 font-mono">
              Rs. {filteredNetRevenue.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-slate-500 mt-1 font-medium">
              Gross: Rs. {(filteredGrossRevenue || 0).toFixed(0)} {(filteredRefundsTotal || 0) > 0 ? `• -Rs. ${(filteredRefundsTotal || 0).toFixed(0)} refunds` : ''}
            </p>
          </div>

          {/* Monthly Store Expenses & Outflows */}
          <div 
            onClick={() => setActiveTab('expenses')}
            className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm cursor-pointer hover:border-orange-300 transition-colors group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider group-hover:text-orange-600 transition-colors">
                Monthly Expenses
              </span>
              <div className="p-2 rounded-xl bg-red-50 text-red-600 border border-red-200 group-hover:bg-orange-50 group-hover:text-orange-600 transition-colors">
                <ReceiptText className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 text-2xl sm:text-3xl font-extrabold text-red-600 font-mono">
              Rs. {monthlyExpensesTotal.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </div>
            <p className="text-[11px] text-slate-500 mt-1 flex items-center justify-between font-medium">
              <span>{expenses.length} records</span>
              <span className="text-orange-600 font-bold group-hover:underline flex items-center gap-0.5">Manage <ArrowRight className="w-3 h-3" /></span>
            </p>
          </div>

        </div>
          </>
        )}

        {/* VIEW HEADER & SEARCH BAR */}
        {activeTab !== 'sales_by_date' && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setActiveTab('sales_by_date')}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                title="Return to Sales by Date"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Sales by Date
              </button>
              <div>
                <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                  {React.createElement(tabTitles[activeTab]?.icon || LayoutDashboard, { className: 'w-4 h-4 text-orange-600' })}
                  {tabTitles[activeTab]?.title}
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  {tabTitles[activeTab]?.subtitle}
                </p>
              </div>
            </div>

            {/* Search Input for tabs that support searching */}
            {['sold_products', 'stock_remaining', 'sales_history', 'returns'].includes(activeTab) && (
              <div className="relative min-w-[260px]">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder={
                    activeTab === 'returns' 
                      ? 'Filter return slip, product or cashier...' 
                      : activeTab === 'sales_history' 
                      ? 'Filter receipt #, product or cashier...' 
                      : 'Filter by name or barcode...'
                  }
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs focus:outline-none focus:border-orange-500 font-medium"
                />
              </div>
            )}
          </div>
        )}

        {/* TAB: 7-DAY DAILY SALES VOLUME LINE CHART */}
        {activeTab === 'volume_chart' && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="space-y-4"
          >
            <SevenDaySalesVolumeChart sales={sales} />
          </motion.div>
        )}

        {/* TAB: DEDICATED REVENUE TRENDS CHART */}
        {activeTab === 'revenue_trends' && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="space-y-6"
          >
            <SalesRevenueChart 
              sales={sales} 
              returns={returns} 
              products={products} 
            />
          </motion.div>
        )}

        {/* TAB 1: SALES BY DATE - DAY BY DAY BREAKDOWN TABLE */}
        {activeTab === 'sales_by_date' && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6"
          >
            {/* Embedded Recharts Sales Trend with Collapse Toggle */}
            <div className="space-y-3 pb-2 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-orange-600" /> Revenue & Profit Trend Chart
                </span>
                <button
                  type="button"
                  onClick={() => setShowChartInSalesByDate(prev => !prev)}
                  className="text-xs font-bold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 px-3 py-1.5 rounded-lg border border-orange-200 transition-all cursor-pointer flex items-center gap-1"
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  {showChartInSalesByDate ? 'Collapse Chart' : 'Expand Revenue Chart'}
                </button>
              </div>

              {showChartInSalesByDate && (
                <SalesRevenueChart 
                  sales={sales} 
                  returns={returns} 
                  products={products} 
                />
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-orange-600" /> Day-by-Day Sales & Profit Breakdown
                </h2>
                <p className="text-xs text-slate-600 font-medium">
                  Summary of gross revenue, customer return refunds, net profit, and orders count.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="text-xs text-slate-500 font-medium bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                  Total Days: <strong className="text-slate-900">{dailySalesBreakdown.length}</strong>
                </div>
              </div>
            </div>

            {dailySalesBreakdown.length === 0 ? (
              <div className="p-12 text-center text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-300 space-y-2">
                <Calendar className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-sm font-bold text-slate-700">No Sales Recorded Yet</p>
                <p className="text-xs text-slate-500">Sales completed at cash counters will be grouped and displayed by date here.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-600 uppercase tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="p-3.5">Date</th>
                        <th className="p-3.5 text-center">Invoices & Returns</th>
                        <th className="p-3.5 text-right">Net Revenue</th>
                        <th className="p-3.5 text-right">Realized Net Profit</th>
                        <th className="p-3.5 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {dailySalesBreakdown.map((daySummary) => {
                        const isToday = daySummary.date === todayStr;
                        const isYesterday = daySummary.date === yesterdayStr;
                        const isExpanded = expandedDate === daySummary.date;

                        return (
                          <React.Fragment key={daySummary.date}>
                            <tr className={`hover:bg-orange-50/40 transition-colors ${isExpanded ? 'bg-orange-50/60' : ''}`}>
                              <td className="p-3.5">
                                <div className="flex items-center gap-2">
                                  <div className="font-extrabold text-slate-900 text-sm">
                                    {daySummary.formattedDate}
                                  </div>
                                  {isToday && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                                      TODAY
                                    </span>
                                  )}
                                  {isYesterday && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
                                      YESTERDAY
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                  {daySummary.date}
                                </div>
                              </td>

                              <td className="p-3.5 text-center">
                                <div className="flex flex-col items-center gap-1">
                                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-extrabold bg-slate-100 text-slate-800">
                                    {daySummary.totalInvoices} {daySummary.totalInvoices === 1 ? 'order' : 'orders'}
                                  </span>
                                  {daySummary.totalReturnsCount > 0 && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                                      {daySummary.totalReturnsCount} returns
                                    </span>
                                  )}
                                </div>
                              </td>

                              <td className="p-3.5 text-right font-medium text-slate-900 text-xs">
                                <div className="font-bold">Rs. {(daySummary.netRevenue || 0).toFixed(2)}</div>
                                {(daySummary.totalRefunds || 0) > 0 && (
                                  <div className="text-[10px] text-slate-400">Gross: Rs. {(daySummary.grossRevenue || 0).toFixed(0)}</div>
                                )}
                              </td>

                              <td className="p-3.5 text-right">
                                <div className={`text-base font-black font-mono ${daySummary.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                  Rs. {daySummary.netProfit.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                                <div className="text-[10px] font-bold text-slate-500 flex items-center justify-end gap-1">
                                  <span>Margin: {(daySummary.profitMargin || 0).toFixed(1)}%</span>
                                </div>
                              </td>

                              <td className="p-3.5 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setExpandedDate(isExpanded ? null : daySummary.date)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all flex items-center gap-1 ${
                                      isExpanded
                                        ? 'bg-orange-600 text-white shadow-xs'
                                        : 'bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200'
                                    }`}
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    {isExpanded ? 'Hide Items' : `View Invoices (${daySummary.totalInvoices})`}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDateFilter('custom_single');
                                      setSelectedSingleDate(daySummary.date);
                                      setActiveTab('sales_history');
                                    }}
                                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer transition-colors"
                                    title="Drill down to receipt log for this date"
                                  >
                                    Filter History →
                                  </button>
                                </div>
                              </td>
                            </tr>

                             {/* EXPANDED INVOICES LIST FOR THIS DATE */}
                            {isExpanded && (
                              <tr className="bg-slate-50/90 border-b border-orange-200">
                                <td colSpan={5} className="p-4 sm:p-6 space-y-4">
                                  {/* 24-Hour Hourly Breakdown Chart for this specific date */}
                                  <HourlySales24hChart 
                                    sales={sales} 
                                    returns={returns} 
                                    products={products} 
                                    initialDate={daySummary.date}
                                  />

                                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
                                    <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                        <Receipt className="w-4 h-4 text-orange-600" />
                                        Invoices Issued on {daySummary.formattedDate} ({daySummary.sales.length} transactions)
                                      </h4>
                                      <div className="flex items-center gap-3">
                                        <span className="text-xs font-black text-emerald-600">
                                          Net Day Profit: Rs. {(daySummary.netProfit || 0).toFixed(2)} ({(daySummary.profitMargin || 0).toFixed(1)}%)
                                        </span>
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto overscroll-contain pr-1 custom-scrollbar">
                                      {daySummary.sales.map((sale) => (
                                        <div key={sale.id} className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-orange-50/30 transition-colors flex items-center justify-between gap-3">
                                          <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                              <span className="font-extrabold text-xs text-slate-900">#{sale.receiptNumber}</span>
                                              <span className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase ${
                                                sale.paymentMethod === 'cash' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                                              }`}>
                                                {sale.paymentMethod}
                                              </span>
                                            </div>
                                            <div className="text-[11px] text-slate-500 truncate mt-0.5">
                                              {sale.counterName} ({sale.cashierUsername}) • {new Date(sale.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                            <div className="text-[10px] text-slate-600 font-medium truncate mt-0.5">
                                              {sale.items?.map(i => `${i.name} (x${i.quantity})`).join(', ')}
                                            </div>
                                          </div>

                                          <div className="flex items-center gap-2 shrink-0">
                                            <div className="text-right">
                                              <div className="font-extrabold text-orange-600 text-xs">Rs. {(sale.totalAmount || 0).toFixed(2)}</div>
                                              {sale.discountAmount && sale.discountAmount > 0 ? (
                                                <div className="text-[9px] text-amber-700 font-bold">-Rs. {(sale.discountAmount || 0).toFixed(0)} off</div>
                                              ) : null}
                                            </div>
                                            {onViewReceipt && (
                                              <button
                                                type="button"
                                                onClick={() => onViewReceipt(sale)}
                                                className="p-1.5 bg-orange-50 hover:bg-orange-600 text-orange-700 hover:text-white rounded-lg border border-orange-200 transition-colors cursor-pointer"
                                                title="View Full Receipt"
                                              >
                                                <Eye className="w-3.5 h-3.5" />
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>

                                    {daySummary.returns.length > 0 && (
                                      <div className="pt-2 border-t border-red-100">
                                        <h5 className="text-[11px] font-bold text-red-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                          <Undo2 className="w-3.5 h-3.5 text-red-600" /> Returns & Refunds Processed on {daySummary.formattedDate}
                                        </h5>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                          {daySummary.returns.map((ret) => (
                                            <div key={ret.id} className="p-2.5 rounded-lg border border-red-200 bg-red-50/50 flex items-center justify-between text-xs">
                                              <div>
                                                <span className="font-bold text-red-950">Slip #{ret.returnSlipNumber}</span>
                                                <p className="text-[11px] text-red-800">{ret.productName} ({ret.quantity} {ret.quantity === 1 ? 'unit' : 'units'} restocked)</p>
                                              </div>
                                              <div className="text-right font-black text-red-700">
                                                -Rs. {(ret.refundAmount || 0).toFixed(2)}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* TAB 2: PRODUCT RETURNS & REFUNDS LOG */}
        {activeTab === 'returns' && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Undo2 className="w-5 h-5 text-red-600" /> Customer Product Returns & Refund Log
                </h2>
                <p className="text-xs text-slate-600 font-medium">
                  Showing product returns for: <strong className="text-red-700">{activeDateFilterLabel}</strong>. All returned items are atomically restocked into store inventory and deducted from profits.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-red-800 bg-red-50 px-3 py-1.5 rounded-xl border border-red-200">
                  Total Refunded: Rs. {(filteredRefundsTotal || 0).toFixed(2)}
                </span>
                <span className="text-xs font-bold text-slate-600 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                  {filteredReturnsLog.length} Returns
                </span>
              </div>
            </div>

            {filteredReturnsLog.length === 0 ? (
              <div className="p-12 text-center text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                <Undo2 className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="font-bold text-slate-700">No Product Returns Recorded</p>
                <p className="text-xs text-slate-500">No product returns or refunds were logged during {activeDateFilterLabel}.</p>
              </div>
            ) : (
              <div className="overflow-x-auto overflow-y-auto max-h-[580px] overscroll-contain custom-scrollbar border border-slate-200 rounded-xl">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-600 uppercase tracking-wider border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                      <th className="p-3.5">Return Slip #</th>
                      <th className="p-3.5">Original Receipt</th>
                      <th className="p-3.5">Product & Barcode</th>
                      <th className="p-3.5 text-center">Restocked Units</th>
                      <th className="p-3.5 text-right">Unit Price</th>
                      <th className="p-3.5 text-right">Refund Deducted</th>
                      <th className="p-3.5">Reason & Cashier</th>
                      <th className="p-3.5 text-center">Voucher</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredReturnsLog.map((ret) => (
                      <tr key={ret.id} className="hover:bg-red-50/30 transition-colors">
                        <td className="p-3.5">
                          <span className="font-mono font-bold text-slate-900 text-xs bg-slate-100 px-2 py-1 rounded border border-slate-200">
                            #{ret.returnSlipNumber}
                          </span>
                          <div className="text-[11px] text-slate-500 mt-1">
                            {new Date(ret.timestamp).toLocaleString()}
                          </div>
                        </td>
                        <td className="p-3.5 font-mono text-xs text-slate-700 font-bold">
                          {ret.originalReceiptNumber ? `#${ret.originalReceiptNumber}` : 'Direct Return'}
                        </td>
                        <td className="p-3.5">
                          <div className="font-bold text-slate-900">{ret.productName}</div>
                          <div className="font-mono text-[11px] text-slate-500">{ret.barcode}</div>
                        </td>
                        <td className="p-3.5 text-center">
                          <span className="px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                            +{ret.quantity} Restocked
                          </span>
                        </td>
                        <td className="p-3.5 text-right font-medium text-slate-700">
                          Rs. {(ret.price ?? (ret as any).unitPrice ?? 0).toFixed(2)}
                        </td>
                        <td className="p-3.5 text-right font-extrabold text-red-600">
                          -Rs. {(ret.refundAmount || 0).toFixed(2)}
                        </td>
                        <td className="p-3.5 text-xs text-slate-600">
                          <div className="font-medium">{ret.reason}</div>
                          <div className="text-[11px] text-slate-500">By: {ret.cashierUsername} ({ret.counterName})</div>
                        </td>
                        <td className="p-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setViewingReturnSlip(ret);
                              setIsReturnSlipOpen(true);
                            }}
                            className="px-2.5 py-1.5 bg-red-50 hover:bg-red-600 text-red-700 hover:text-white rounded-lg border border-red-200 transition-colors font-bold text-xs cursor-pointer flex items-center gap-1 mx-auto"
                            title="View Return Slip Voucher"
                          >
                            <Eye className="w-3.5 h-3.5" /> Voucher
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}

        {/* TAB 3: TOTAL PRODUCTS SOLD WITH NAMES AND QUANTITY (FILTERED BY DATE) */}
        {activeTab === 'sold_products' && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-orange-600" /> Products Sold Velocity, Cost & Realized Profit
                </h2>
                <p className="text-xs text-slate-600 font-medium">
                  Showing sold items for: <strong className="text-orange-700">{activeDateFilterLabel}</strong> (returns deducted, ranked by realized profit)
                </p>
              </div>

              <span className="text-xs font-bold text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                {filteredSoldProducts.length} Distinct Products Active
              </span>
            </div>

            {filteredSoldProducts.length === 0 ? (
              <div className="p-10 text-center text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                No products sold during the selected date range ({activeDateFilterLabel}).
              </div>
            ) : (
              <div className="overflow-x-auto overflow-y-auto max-h-[580px] overscroll-contain custom-scrollbar border border-slate-200 rounded-xl">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-600 uppercase tracking-wider border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                      <th className="p-3.5">Product Name</th>
                      <th className="p-3.5">Barcode</th>
                      <th className="p-3.5 text-center">Cost & Price</th>
                      <th className="p-3.5 text-center">Net Units Sold</th>
                      <th className="p-3.5 text-right">Net Revenue</th>
                      <th className="p-3.5 text-right">Total Cost (COGS)</th>
                      <th className="p-3.5 text-right">Realized Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredSoldProducts.map((sp, idx) => {
                      const unitProfit = sp.lastPrice - (sp.costPrice || 0);
                      const isProfitable = sp.realizedProfit >= 0;

                      return (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3.5 font-bold text-slate-900 flex items-center gap-2">
                            <span className="w-6 h-6 rounded-lg bg-orange-50 text-orange-600 text-xs flex items-center justify-center font-bold border border-orange-200 shrink-0">
                              #{idx + 1}
                            </span>
                            <div>
                              <div className="font-bold text-slate-900">{sp.name}</div>
                              {sp.unitsReturned > 0 && (
                                <span className="text-[10px] font-bold text-red-600">
                                  ({sp.unitsReturned} returned & refunded)
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3.5 text-slate-500 font-mono text-xs">
                            {sp.barcode}
                          </td>
                          <td className="p-3.5 text-center text-xs">
                            <div className="font-bold text-slate-900">
                              Sell: Rs. {(sp.lastPrice || 0).toFixed(2)}
                            </div>
                            <div className="text-[11px] text-slate-500 font-medium">
                              Cost: Rs. {(sp.costPrice || 0).toFixed(2)}
                            </div>
                            <div className={`text-[10px] font-bold mt-0.5 ${unitProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                              +{unitProfit >= 0 ? '' : ''}Rs. {(unitProfit || 0).toFixed(2)}/u
                            </div>
                          </td>
                          <td className="p-3.5 text-center">
                            <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {sp.netUnitsSold} units
                            </span>
                            {sp.grossUnitsSold !== sp.netUnitsSold && (
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                {sp.grossUnitsSold} gross
                              </div>
                            )}
                          </td>
                          <td className="p-3.5 text-right font-medium text-slate-900 font-mono text-xs">
                            Rs. {(sp.netRevenue || 0).toFixed(2)}
                          </td>
                          <td className="p-3.5 text-right font-semibold text-slate-600 font-mono text-xs">
                            Rs. {(sp.totalCost || 0).toFixed(2)}
                          </td>
                          <td className="p-3.5 text-right">
                            <div className={`text-sm font-black font-mono ${isProfitable ? 'text-emerald-600' : 'text-red-600'}`}>
                              Rs. {(sp.realizedProfit || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <div className="text-[10px] font-bold text-slate-500">
                              {(sp.profitMargin || 0).toFixed(1)}% margin
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}

        {/* TAB 3: REALTIME REMAINING STOCK */}
        {activeTab === 'stock_remaining' && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Package className="w-5 h-5 text-blue-600" /> Realtime Stock Available & Remaining
                </h2>
                <p className="text-xs text-slate-600 font-medium">
                  Live inventory levels. When cashiers make sales or product registers add stock, numbers update automatically.
                </p>
              </div>
            </div>

            {/* Inventory Valuation & Health KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Total SKUs</span>
                <span className="text-xl font-black text-slate-900 font-mono mt-1 block">{inventoryValuationStats.totalProductsCount}</span>
                <span className="text-[10px] text-slate-500 font-medium">Catalog items</span>
              </div>
              <div className="bg-blue-50/60 p-3.5 rounded-xl border border-blue-200">
                <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wider block">Stock On Hand</span>
                <span className="text-xl font-black text-blue-700 font-mono mt-1 block">{inventoryValuationStats.totalUnitsCount.toLocaleString()}</span>
                <span className="text-[10px] text-blue-600 font-medium">Units in store</span>
              </div>
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Wholesale Cost</span>
                <span className="text-lg font-black text-slate-900 font-mono mt-1 block truncate">Rs. {inventoryValuationStats.totalCostValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                <span className="text-[10px] text-slate-500 font-medium">Purchase cost</span>
              </div>
              <div className="bg-emerald-50/60 p-3.5 rounded-xl border border-emerald-200">
                <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">Retail Value</span>
                <span className="text-lg font-black text-emerald-700 font-mono mt-1 block truncate">Rs. {inventoryValuationStats.totalRetailValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                <span className="text-[10px] text-emerald-700 font-medium font-mono">{(inventoryValuationStats?.overallMargin || 0).toFixed(1)}% Gross Margin</span>
              </div>
              <div className={`p-3.5 rounded-xl border col-span-2 sm:col-span-1 ${
                inventoryValuationStats.outOfStockCount > 0 || inventoryValuationStats.lowStockCount > 0
                  ? 'bg-amber-50/80 border-amber-200 text-amber-900'
                  : 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
              }`}>
                <span className="text-[10px] font-bold uppercase tracking-wider block">Stock Health</span>
                <span className="text-lg font-black font-mono mt-1 block">
                  {inventoryValuationStats.outOfStockCount > 0 ? `${inventoryValuationStats.outOfStockCount} Out of Stock` : inventoryValuationStats.lowStockCount > 0 ? `${inventoryValuationStats.lowStockCount} Low Stock` : 'All Stocked'}
                </span>
                <span className="text-[10px] font-medium opacity-80 block">
                  {inventoryValuationStats.outOfStockCount > 0 ? 'Urgent restock needed' : 'Healthy inventory'}
                </span>
              </div>
            </div>

            {filteredProducts.length === 0 ? (
              <div className="p-10 text-center text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                No products found in inventory. Product Registers can scan barcodes and add stock.
              </div>
            ) : (
              <div className="overflow-x-auto overflow-y-auto max-h-[580px] overscroll-contain custom-scrollbar border border-slate-200 rounded-xl">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-600 uppercase tracking-wider border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                      <th className="p-3.5">Product Name</th>
                      <th className="p-3.5">Barcode</th>
                      <th className="p-3.5">Category</th>
                      <th className="p-3.5 text-center">Retail Price</th>
                      <th className="p-3.5 text-center">Stock Remaining</th>
                      <th className="p-3.5 text-center">Stock Status</th>
                      <th className="p-3.5 text-right">Promotions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredProducts.map((p) => {
                      const isOutOfStock = p.stockQuantity <= 0;
                      const isLowStock = p.stockQuantity > 0 && p.stockQuantity <= (p.minStockLevel || 5);
                      const discInfo = getProductDiscountInfo(p);

                      return (
                        <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3.5 font-bold text-slate-900">
                            <div className="flex items-center gap-2">
                              <span>{p.name}</span>
                              {discInfo.hasDiscount && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200">
                                  {discInfo.discountLabel}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3.5 text-slate-500 font-mono text-xs">
                            {p.barcode}
                          </td>
                          <td className="p-3.5 text-slate-600 text-xs">
                            <span className="px-2 py-1 rounded bg-slate-100 text-slate-700 font-medium border border-slate-200">
                              {p.category || 'General'}
                            </span>
                          </td>
                          <td className="p-3.5 text-center font-mono">
                            {discInfo.hasDiscount ? (
                              <div>
                                <div className="font-black text-rose-600">
                                  Rs. {discInfo.discountedPrice.toFixed(2)}
                                </div>
                                <div className="text-[10px] text-slate-400 line-through">
                                  Was Rs. {(p.price ?? 0).toFixed(2)}
                                </div>
                              </div>
                            ) : (
                              <div className="font-bold text-orange-600">
                                Rs. {(p.price ?? 0).toFixed(2)}
                              </div>
                            )}
                          </td>
                          <td className="p-3.5 text-center font-black text-lg">
                            <span className={isOutOfStock ? 'text-red-600' : isLowStock ? 'text-amber-600' : 'text-emerald-600'}>
                              {p.stockQuantity}
                            </span>
                          </td>
                          <td className="p-3.5 text-center">
                            {isOutOfStock ? (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-red-50 text-red-700 border border-red-200">
                                OUT OF STOCK
                              </span>
                            ) : isLowStock ? (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200">
                                LOW STOCK
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                HEALTHY STOCK
                              </span>
                            )}
                          </td>
                          <td className="p-3.5 text-right">
                            <button
                              type="button"
                              onClick={() => setDiscountEditProduct(p)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center gap-1 ml-auto shadow-2xs ${
                                discInfo.hasDiscount
                                  ? 'bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border-rose-300'
                                  : 'bg-slate-50 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border-slate-200'
                              }`}
                              title={discInfo.hasDiscount ? 'Active discount. Click to modify or remove.' : 'Set discount on item'}
                            >
                              <Percent className="w-3 h-3" />
                              <span>{discInfo.hasDiscount ? discInfo.discountLabel : 'Set Discount'}</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}

        {/* TAB: ITEM DISCOUNTS & PROMOTIONS */}
        {activeTab === 'promotions' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="space-y-5"
          >
            {/* Top Action Header */}
            <div className="bg-gradient-to-r from-rose-900 via-slate-900 to-slate-950 rounded-2xl p-6 text-white border border-rose-800/40 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl">
                    <Percent className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-white flex items-center gap-2">
                      Item Discounts & Promotional Deals
                    </h2>
                    <p className="text-xs text-rose-200/80 font-medium mt-0.5">
                      Set percentage or rupee price reductions on individual items or entire category ranges
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setIsDiscountModalOpen(true)}
                  className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black shadow-md shadow-rose-600/30 transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Bulk / Category Discounts</span>
                </button>

                {activeDiscountedProducts.length > 0 && (
                  <button
                    type="button"
                    disabled={isClearingAllDiscounts}
                    onClick={() => setIsConfirmClearDiscountsOpen(true)}
                    className="px-3.5 py-2.5 bg-white/10 hover:bg-rose-950/80 text-rose-200 hover:text-white border border-rose-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    title="Remove all active discounts across all products"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    <span>{isClearingAllDiscounts ? 'Clearing...' : 'Clear All Discounts'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* KPI Statistics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Active Discounts</span>
                <span className="text-2xl font-black text-rose-600 font-mono mt-1 block">
                  {promotionsStats.activeCount} <span className="text-xs text-slate-400 font-normal">/ {promotionsStats.totalCount} items</span>
                </span>
                <span className="text-[10px] text-slate-500 font-medium">
                  {promotionsStats.percentCatalogOnSale.toFixed(1)}% of inventory on deal
                </span>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Average Discount %</span>
                <span className="text-2xl font-black text-slate-900 font-mono mt-1 block">
                  {promotionsStats.avgDiscountPercentage > 0 ? `${promotionsStats.avgDiscountPercentage.toFixed(1)}%` : '0%'}
                </span>
                <span className="text-[10px] text-slate-500 font-medium">
                  {promotionsStats.percentageCount} percentage deals active
                </span>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Flat Cash Off Deals</span>
                <span className="text-2xl font-black text-amber-600 font-mono mt-1 block">
                  {promotionsStats.fixedCount} <span className="text-xs text-slate-400 font-normal">items</span>
                </span>
                <span className="text-[10px] text-slate-500 font-medium">
                  Direct rupee cuts on price
                </span>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Est. Customer Savings</span>
                <span className="text-2xl font-black text-emerald-600 font-mono mt-1 block truncate">
                  Rs. {promotionsStats.totalPotentialSavings.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
                <span className="text-[10px] text-emerald-700 font-medium">
                  Available on stock in store
                </span>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                {/* Search Bar */}
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search by name, barcode, shortcut..."
                    value={promotionsSearchTerm}
                    onChange={(e) => setPromotionsSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-rose-400 focus:bg-white transition-all"
                  />
                  {promotionsSearchTerm && (
                    <button
                      onClick={() => setPromotionsSearchTerm('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer text-xs"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Filters */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Category Filter */}
                  <select
                    value={promotionsCategory}
                    onChange={(e) => setPromotionsCategory(e.target.value)}
                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-rose-400 cursor-pointer"
                  >
                    {promotionsCategories.map(cat => (
                      <option key={cat} value={cat}>Category: {cat}</option>
                    ))}
                  </select>

                  {/* Status Toggle Pills */}
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setPromotionsFilter('all')}
                      className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                        promotionsFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      All ({products.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPromotionsFilter('active')}
                      className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                        promotionsFilter === 'active' ? 'bg-rose-600 text-white shadow-2xs font-black' : 'text-rose-700 hover:text-rose-900'
                      }`}
                    >
                      On Discount ({promotionsStats.activeCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPromotionsFilter('percentage')}
                      className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                        promotionsFilter === 'percentage' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      % Off
                    </button>
                    <button
                      type="button"
                      onClick={() => setPromotionsFilter('fixed')}
                      className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                        promotionsFilter === 'fixed' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Flat Rs.
                    </button>
                    <button
                      type="button"
                      onClick={() => setPromotionsFilter('none')}
                      className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                        promotionsFilter === 'none' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      No Discount
                    </button>
                  </div>
                </div>
              </div>

              {/* Promotions Table */}
              {filteredPromotionsProducts.length === 0 ? (
                <div className="p-12 text-center text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                  <Tag className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                  <p className="font-bold text-slate-700">No products match your discount filter.</p>
                  <p className="text-xs text-slate-500 mt-1">Try changing your search terms or filter settings.</p>
                </div>
              ) : (
                <div className="overflow-x-auto overflow-y-auto max-h-[580px] overscroll-contain custom-scrollbar border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-600 uppercase tracking-wider border-b border-slate-200 sticky top-0 z-10">
                      <tr>
                        <th className="p-3.5">Product</th>
                        <th className="p-3.5">Barcode / SKU</th>
                        <th className="p-3.5 text-center">Regular Price</th>
                        <th className="p-3.5 text-center">Active Discount</th>
                        <th className="p-3.5 text-center">Customer Price</th>
                        <th className="p-3.5 text-center">Profit / Unit</th>
                        <th className="p-3.5 text-center">Stock</th>
                        <th className="p-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredPromotionsProducts.map((p) => {
                        const discInfo = getProductDiscountInfo(p);
                        const cost = p.costPrice || 0;
                        const finalSellingPrice = discInfo.effectivePrice;
                        const unitProfit = finalSellingPrice - cost;
                        const unitMargin = finalSellingPrice > 0 ? (unitProfit / finalSellingPrice) * 100 : 0;

                        return (
                          <tr key={p.id} className={`hover:bg-slate-50 transition-colors ${discInfo.hasDiscount ? 'bg-rose-50/20' : ''}`}>
                            <td className="p-3.5">
                              <div className="flex items-center gap-3">
                                {p.imageUrl ? (
                                  <img 
                                    src={p.imageUrl} 
                                    alt={p.name} 
                                    className="w-10 h-10 rounded-lg object-cover border border-slate-200 bg-white shrink-0" 
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0 font-black text-xs">
                                    {p.name.charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="font-black text-slate-900 text-sm truncate max-w-[200px]">
                                    {p.name}
                                  </div>
                                  <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                                    <span className="px-1.5 py-0.5 rounded bg-slate-100 font-medium text-[11px]">
                                      {p.category || 'General'}
                                    </span>
                                    <span>•</span>
                                    <span>{p.sellBy === 'weight' ? 'Per Kg' : 'Per Unit'}</span>
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td className="p-3.5 font-mono text-xs text-slate-600">
                              <div>{p.barcode || 'No barcode'}</div>
                              {p.shortcutCode && (
                                <span className="text-[10px] text-amber-700 font-bold bg-amber-50 px-1 rounded">
                                  #{p.shortcutCode}
                                </span>
                              )}
                            </td>

                            <td className="p-3.5 text-center font-mono">
                              <div className="text-sm font-bold text-slate-800">
                                Rs. {(p.price ?? 0).toFixed(2)}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                Cost: Rs. {cost.toFixed(2)}
                              </div>
                            </td>

                            <td className="p-3.5 text-center">
                              {discInfo.hasDiscount ? (
                                <div className="inline-flex flex-col items-center">
                                  <span className="px-2.5 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-800 border border-rose-300 shadow-2xs flex items-center gap-1">
                                    <Tag className="w-3 h-3" />
                                    <span>{discInfo.discountLabel}</span>
                                  </span>
                                  <span className="text-[10px] text-rose-700 font-bold mt-0.5">
                                    -Rs. {discInfo.discountAmount.toFixed(2)} off
                                  </span>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400 font-medium">
                                  None (Full Price)
                                </span>
                              )}
                            </td>

                            <td className="p-3.5 text-center font-mono">
                              <div className={`text-sm font-black ${discInfo.hasDiscount ? 'text-rose-600' : 'text-slate-900'}`}>
                                Rs. {discInfo.discountedPrice.toFixed(2)}
                              </div>
                              {discInfo.hasDiscount && (
                                <span className="text-[10px] text-emerald-700 font-extrabold block">
                                  Save Rs. {discInfo.discountAmount.toFixed(2)}
                                </span>
                              )}
                            </td>

                            <td className="p-3.5 text-center font-mono">
                              <div className={`text-xs font-bold ${unitProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                +Rs. {unitProfit.toFixed(2)}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {unitMargin.toFixed(0)}% margin
                              </div>
                            </td>

                            <td className="p-3.5 text-center font-mono font-bold text-slate-700">
                              {p.stockQuantity || 0} {p.sellBy === 'weight' ? 'kg' : 'pcs'}
                            </td>

                            <td className="p-3.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setDiscountEditProduct(p)}
                                  className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 hover:border-rose-600 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                                  title="Configure item discount"
                                >
                                  <Percent className="w-3 h-3" />
                                  <span>{discInfo.hasDiscount ? 'Edit Deal' : 'Set Deal'}</span>
                                </button>

                                {discInfo.hasDiscount && (
                                  <button
                                    type="button"
                                    onClick={() => handleQuickRemoveDiscount(p)}
                                    className="p-1.5 rounded-xl bg-red-50 hover:bg-red-600 text-red-600 hover:text-white border border-red-200 text-xs font-bold transition-all cursor-pointer shadow-2xs"
                                    title="Quick remove discount"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                )}
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
          </motion.div>
        )}

        {/* TAB 4: SALES HISTORY (FILTERED BY SELECTED DATE) */}
        {activeTab === 'sales_history' && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-emerald-600" /> Completed Checkout Receipts Log
                </h2>
                <p className="text-xs text-slate-600 font-medium">
                  Showing receipts for: <strong className="text-orange-700">{activeDateFilterLabel}</strong>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                  {filteredReceipts.length} Receipts
                </span>
              </div>
            </div>

            {filteredReceipts.length === 0 ? (
              <p className="text-sm text-slate-500 p-8 text-center border border-dashed border-slate-300 rounded-xl bg-slate-50">
                No checkout transactions recorded for {activeDateFilterLabel}.
              </p>
            ) : (
              <div className="space-y-3 max-h-[580px] overflow-y-auto overscroll-contain pr-1.5 custom-scrollbar">
                {filteredReceipts.map((sale) => {
                  let saleCost = 0;
                  sale.items?.forEach((item) => {
                    let uCost = 0;
                    if (typeof item.costPrice === 'number' && item.costPrice >= 0) {
                      uCost = item.costPrice;
                    } else {
                      const matching = products.find(p => (item.productId && p.id === item.productId) || (item.barcode && p.barcode === item.barcode));
                      uCost = matching?.costPrice || 0;
                    }
                    saleCost += uCost * (item.quantity || 0);
                  });
                  const saleProfit = (sale.totalAmount || 0) - saleCost;
                  const saleMargin = sale.totalAmount > 0 ? (saleProfit / sale.totalAmount) * 100 : 0;

                  return (
                    <div key={sale.id} className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-slate-300 transition-colors">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-slate-900 text-sm">Receipt #{sale.receiptNumber}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                            sale.paymentMethod === 'cash' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}>
                            {sale.paymentMethod}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                            saleProfit >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                          }`}>
                            Profit: +Rs. {(saleProfit || 0).toFixed(2)} ({(saleMargin || 0).toFixed(0)}%)
                          </span>
                          {sale.discountAmount && sale.discountAmount > 0 ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                              Discount -Rs. {(sale.discountAmount || 0).toFixed(2)}
                            </span>
                          ) : null}
                          {isSaleExpired(sale) ? (
                            <span 
                              className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-300"
                              title="Customer public receipt slip cleared after 7-day retention period. Sales and profit records are permanently preserved."
                            >
                              Slip Cleared (7d) • Record Permanent
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Slip Active
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 mt-1 font-medium">
                          Counter: <span className="text-slate-900 font-semibold">{sale.counterName}</span> ({sale.cashierUsername}) • <span className="text-orange-700 font-bold">{new Date(sale.timestamp).toLocaleString()}</span>
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Items ({sale.items?.reduce((s, i) => s + i.quantity, 0)}): {sale.items?.map(i => `${i.name} (x${i.quantity})`).join(', ')}
                        </p>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                        <div className="text-right">
                          <div className="text-lg font-extrabold text-orange-600 font-mono">
                            Rs. {(sale.totalAmount || 0).toFixed(2)}
                          </div>
                          <div className="text-[10px] text-slate-500 font-semibold">
                            Cost: Rs. {(saleCost || 0).toFixed(2)}
                          </div>
                        </div>
                        {onViewReceipt && (
                          <button
                            onClick={() => onViewReceipt(sale)}
                            className="px-3 py-1.5 rounded-lg bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-600 hover:text-white transition-all text-xs font-bold flex items-center gap-1 cursor-pointer shadow-sm"
                          >
                            <Eye className="w-3.5 h-3.5" /> View Receipt
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {/* TAB 5: STORE STAFF & SALARIES */}
        {activeTab === 'staff' && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <StaffSessionsView
              store={liveStore}
              currentUser={currentUser}
              onBack={() => setActiveTab('sales_by_date')}
            />
          </motion.div>
        )}

        {/* TAB: SUPPLIER PURCHASE ORDERS & STOCK RECEIPTS */}
        {activeTab === 'suppliers' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <SupplierManagementView
              store={liveStore}
              currentUser={currentUser}
              onBack={() => setActiveTab('sales_by_date')}
            />
          </motion.div>
        )}

        {/* TAB 6: SETTINGS & CONFIGURATION */}
        {activeTab === 'settings' && (
          <StoreSettingsView
            store={liveStore}
            currentUser={currentUser}
            storeUsers={storeUsers}
            onStoreUpdated={(updated) => setLiveStore(updated)}
            onNavigateToGmailLog={() => setActiveTab('gmail_log')}
          />
        )}

        {/* TAB: PAYMENT METHODS & FINANCIAL BREAKDOWN */}
        {activeTab === 'payment_methods' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <PaymentMethodsView
              store={liveStore}
              sales={sales}
              returns={returns}
              currencySymbol="Rs."
              onViewReceipt={(sale) => {
                setViewingReceipt(sale);
                setIsReceiptOpen(true);
              }}
              onUpdateStore={(updated) => {
                setLiveStore(prev => ({ ...prev, ...updated }));
              }}
            />
          </motion.div>
        )}

        {/* TAB: NET PROFIT & SALES REVENUE */}
        {activeTab === 'net_profit_revenue' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Net Sales Revenue</span>
                <div className="text-2xl font-black text-slate-900 font-mono mt-1">Rs. {filteredNetRevenue.toLocaleString('en-PK', { minimumFractionDigits: 2 })}</div>
                <p className="text-[11px] text-slate-500 mt-0.5">Gross Sales - Returns & Order Costs</p>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cost of Goods Sold (COGS)</span>
                <div className="text-2xl font-black text-slate-900 font-mono mt-1">Rs. {filteredCostOfGoods.toLocaleString('en-PK', { minimumFractionDigits: 2 })}</div>
                <p className="text-[11px] text-slate-500 mt-0.5">Wholesale cost of sold units</p>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Net Profit</span>
                <div className={`text-2xl font-black font-mono mt-1 ${filteredNetProfitIncludingExpenses >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  Rs. {filteredNetProfitIncludingExpenses.toLocaleString('en-PK', { minimumFractionDigits: 2 })}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">Net Revenue - COGS - Expenses</p>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Profit Margin</span>
                <div className="text-2xl font-black text-orange-600 font-mono mt-1">{(filteredProfitMargin || 0).toFixed(1)}%</div>
                <p className="text-[11px] text-slate-500 mt-0.5">Realized net profit percentage</p>
              </div>
            </div>
            <SalesRevenueChart sales={sales} returns={returns} products={products} />
          </motion.div>
        )}

        {/* TAB: PRODUCT VALUATION ANALYTICS */}
        {activeTab === 'product_valuation' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cost of Goods Sold (COGS)</span>
                <div className="text-2xl font-black text-slate-900 font-mono mt-1">Rs. {filteredCostOfGoods.toLocaleString('en-PK', { minimumFractionDigits: 2 })}</div>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Units Sold</span>
                <div className="text-2xl font-black text-blue-600 font-mono mt-1">{filteredNetUnitsSold.toLocaleString()} units</div>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Product Categories</span>
                <div className="text-2xl font-black text-slate-900 font-mono mt-1">{categories.length} Categories</div>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Stock on Hand Wholesale Investment</span>
                <div className="text-2xl font-black text-amber-600 font-mono mt-1">Rs. {(inventoryValuationStats.totalCostValue || 0).toLocaleString('en-PK', { minimumFractionDigits: 2 })}</div>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Retail Stock Value</span>
                <div className="text-2xl font-black text-emerald-600 font-mono mt-1">Rs. {inventoryValuationStats.totalRetailValue.toLocaleString('en-PK', { minimumFractionDigits: 2 })}</div>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Stock Health</span>
                <div className="text-2xl font-black text-slate-900 font-mono mt-1">{lowStockItems.length === 0 ? 'Healthy 🟢' : `${lowStockItems.length} Low Stock Alert ⚠️`}</div>
              </div>
            </div>

            {/* Product Valuation Item Breakdown Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <Scale className="w-4 h-4 text-orange-600" />
                    Product Inventory Valuation Breakdown
                  </h3>
                  <p className="text-xs text-slate-500">
                    Individual SKU wholesale costs, retail values, and projected profit margins on shelves.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search product or barcode..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 w-48 sm:w-64 font-medium"
                    />
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider border-b border-slate-200 font-bold">
                    <tr>
                      <th className="p-3">Product / SKU</th>
                      <th className="p-3">Category</th>
                      <th className="p-3 text-center">Stock Units</th>
                      <th className="p-3 text-right">Cost (Wholesale)</th>
                      <th className="p-3 text-right">Price (Retail)</th>
                      <th className="p-3 text-right">Total Wholesale</th>
                      <th className="p-3 text-right">Total Retail</th>
                      <th className="p-3 text-right">Expected Margin</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(products || [])
                      .filter(p => !searchTerm.trim() || p.name.toLowerCase().includes(searchTerm.toLowerCase().trim()) || p.barcode.includes(searchTerm.trim()))
                      .map((p) => {
                        const qty = p.stockQuantity || 0;
                        const cost = p.costPrice || 0;
                        const sell = p.price || p.pricePerKg || 0;
                        const totalCost = cost * qty;
                        const totalRetail = sell * qty;
                        const profit = totalRetail - totalCost;
                        const margin = totalRetail > 0 ? (profit / totalRetail) * 100 : 0;
                        const isLow = qty <= (p.minStockLevel ?? 5) && qty > 0;
                        const isOut = qty <= 0;

                        return (
                          <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-3">
                              <div className="font-bold text-slate-900">{p.name}</div>
                              <div className="text-[10px] text-slate-400 font-mono">{p.barcode}</div>
                            </td>
                            <td className="p-3 text-slate-600 font-medium">{p.category || 'General'}</td>
                            <td className="p-3 text-center font-bold text-slate-800">{qty.toLocaleString()}</td>
                            <td className="p-3 text-right font-mono text-slate-600">Rs. {cost.toFixed(2)}</td>
                            <td className="p-3 text-right font-mono font-bold text-slate-900">Rs. {sell.toFixed(2)}</td>
                            <td className="p-3 text-right font-mono font-semibold text-amber-700">Rs. {totalCost.toLocaleString('en-PK', { maximumFractionDigits: 0 })}</td>
                            <td className="p-3 text-right font-mono font-bold text-emerald-700">Rs. {totalRetail.toLocaleString('en-PK', { maximumFractionDigits: 0 })}</td>
                            <td className="p-3 text-right">
                              <span className={`font-mono font-bold text-xs ${margin >= 20 ? 'text-emerald-600' : margin >= 10 ? 'text-amber-600' : 'text-slate-500'}`}>
                                {margin.toFixed(1)}%
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              {isOut ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">Out of Stock</span>
                              ) : isLow ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">Low Stock</span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">Healthy</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {/* TAB: RECENT CUSTOMER RECEIPTS */}
        {activeTab === 'recent_receipts' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="p-4 border-b border-slate-200 flex items-center justify-between font-bold text-xs">
                <span>Recent Customer Receipts ({sales.length})</span>
              </div>
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Receipt #</th>
                    <th className="p-3">Time</th>
                    <th className="p-3">Items</th>
                    <th className="p-3">Payment</th>
                    <th className="p-3 text-right">Total Amount</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sales.slice(0, 50).map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono font-bold text-slate-900">#{s.receiptNumber || s.id.slice(-6)}</td>
                      <td className="p-3 text-slate-500">{new Date(s.timestamp).toLocaleString()}</td>
                      <td className="p-3 text-slate-700">{(s.items || []).length} items</td>
                      <td className="p-3 uppercase font-bold text-slate-700">{s.paymentMethod}</td>
                      <td className="p-3 text-right font-mono font-bold text-slate-900">Rs. {(s.totalAmount || 0).toFixed(2)}</td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => { setViewingReceipt(s); setIsReceiptOpen(true); }}
                          className="px-2.5 py-1 rounded-lg bg-orange-50 text-orange-700 hover:bg-orange-100 font-bold cursor-pointer"
                        >
                          View Receipt
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {/* TAB: GMAIL E-RECEIPTS AUDIT LOG */}
        {activeTab === 'gmail_log' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="space-y-4"
          >
            <GmailReceiptsLogView
              store={liveStore}
              onViewReceipt={(saleId, receiptNumber) => {
                const targetSale = sales.find(s => s.id === saleId || s.receiptNumber === receiptNumber);
                if (targetSale) {
                  setViewingReceipt(targetSale);
                  setIsReceiptOpen(true);
                }
              }}
            />
          </motion.div>
        )}

        {/* TAB: STAFF & OPERATIONS */}
        {activeTab === 'staff_operations' && (
          <div className="space-y-6">
            <StoreStaffTrackerView store={liveStore} currentUser={currentUser} storeUsers={storeUsers} />
          </div>
        )}

        {/* TAB: STAFF ATTENDANCE & MONTHLY REPORTS */}
        {activeTab === 'attendance' && (
          <div className="space-y-6">
            <StaffAttendanceView
              store={liveStore}
              currentUser={currentUser}
              storeUsers={storeUsers}
            />
          </div>
        )}

        {/* TAB: STORE EXPENSE MANAGEMENT */}
        {activeTab === 'expenses' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <StoreAdminExpenses
              store={liveStore}
              currentUser={currentUser}
              expenses={expenses}
              initialFilterMode={expenseFilterMode}
              onFilterModeChange={setExpenseFilterMode}
            />
          </motion.div>
        )}

        {/* RETURN SLIP MODAL */}
        {isReturnSlipOpen && viewingReturnSlip && (
          <ReturnSlipModal
            isOpen={isReturnSlipOpen}
            onClose={() => {
              setIsReturnSlipOpen(false);
              setViewingReturnSlip(null);
            }}
            returnRecord={viewingReturnSlip}
            store={store}
          />
        )}

        {/* EXCEL MANAGER MODAL (UPLOAD FROM DEVICE OR CREATE NOW) */}
        <ExcelManagerModal
          isOpen={isExcelModalOpen}
          onClose={() => setIsExcelModalOpen(false)}
          store={liveStore}
          existingProducts={products}
          onSendToAi={(parsedRows) => {
            setSpreadsheetProductsForAi(parsedRows);
            setIsExcelModalOpen(false);
            setIsAiAssistantOpen(true);
          }}
          onProductsSaved={() => {
            // Live Firestore subscription automatically refreshes products
          }}
          onOpenBatchModal={onNavigateToInventory}
        />

        {/* STORE AI ASSISTANT MODAL */}
        <StoreAiAssistantModal
          isOpen={isAiAssistantOpen}
          onClose={() => {
            setIsAiAssistantOpen(false);
            setSpreadsheetProductsForAi(null);
          }}
          store={liveStore}
          products={products}
          sales={sales}
          returns={returns}
          currentUser={currentUser}
          initialSpreadsheetProducts={spreadsheetProductsForAi}
          onOpenBatchRegister={onNavigateToInventory}
        />

        {/* CUSTOMER SALE RECEIPT MODAL */}
        {viewingReceipt && (
          <ReceiptModal
            isOpen={isReceiptOpen}
            onClose={() => {
              setIsReceiptOpen(false);
              setViewingReceipt(null);
            }}
            sale={viewingReceipt}
            store={liveStore}
          />
        )}

        {/* BULK / STORE-WIDE DISCOUNT MANAGER MODAL */}
        <DiscountManagerModal
          isOpen={isDiscountModalOpen}
          onClose={() => setIsDiscountModalOpen(false)}
          products={products}
          store={liveStore}
          onRefresh={() => {
            // Firestore onSnapshot automatically keeps products updated
          }}
        />

        {/* SINGLE ITEM QUICK DISCOUNT MODAL */}
        <ItemDiscountModal
          isOpen={Boolean(discountEditProduct)}
          onClose={() => setDiscountEditProduct(null)}
          product={discountEditProduct}
          store={liveStore}
          onSuccess={(updated) => {
            setDiscountEditProduct(null);
          }}
        />

        {/* CONFIRMATION MODAL: CLEAR ALL DISCOUNTS */}
        {isConfirmClearDiscountsOpen && (
          <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-scale-up">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto shadow-inner">
                <Trash2 className="w-6 h-6" />
              </div>

              <div className="text-center space-y-1.5">
                <h3 className="text-base font-black text-slate-900">Clear All Active Discounts?</h3>
                <p className="text-xs text-slate-500">
                  Are you sure you want to remove discounts from all <strong className="text-slate-900 font-bold">{activeDiscountedProducts.length} active products</strong> in this store?
                </p>
                <div className="text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-200 mt-2">
                  All discounted items will immediately return to standard regular selling prices.
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsConfirmClearDiscountsOpen(false)}
                  disabled={isClearingAllDiscounts}
                  className="w-1/2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleClearAllDiscounts}
                  disabled={isClearingAllDiscounts}
                  className="w-1/2 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs transition-colors cursor-pointer shadow-sm disabled:opacity-50"
                >
                  {isClearingAllDiscounts ? 'Clearing...' : 'Yes, Clear All'}
                </button>
              </div>
            </div>
          </div>
        )}

        </main>
      </div>
    </div>
  );
};
