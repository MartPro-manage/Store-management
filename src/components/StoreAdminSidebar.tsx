import React from 'react';
import { Store } from '../types';
import { DownloadAppButton } from './DownloadAppButton';
import { 
  CalendarDays, 
  LineChart as LineChartIcon, 
  TrendingUp, 
  Package, 
  Tag, 
  Percent, 
  Receipt, 
  Undo2, 
  Users, 
  Settings, 
  Calculator, 
  PackageCheck, 
  Sparkles, 
  FileSpreadsheet, 
  X,
  Store as StoreIcon,
  ShieldCheck,
  ReceiptText,
  Scale,
  Activity,
  Calendar,
  CalendarCheck2,
  DollarSign,
  CreditCard,
  Banknote,
  Smartphone,
  Download,
  Mail,
  LogOut
} from 'lucide-react';

export type StoreAdminTab = 
  | 'sales_by_date' 
  | 'volume_chart' 
  | 'revenue_trends' 
  | 'net_profit_revenue' 
  | 'product_valuation'
  | 'returns' 
  | 'sold_products' 
  | 'stock_remaining' 
  | 'promotions'
  | 'sales_history' 
  | 'recent_receipts'
  | 'gmail_log'
  | 'payment_methods'
  | 'expenses'
  | 'suppliers'
  | 'staff' 
  | 'attendance'
  | 'staff_operations'
  | 'omnimail'
  | 'settings';

export type ExpenseFilterMode = 'all' | 'date' | 'month' | 'year';

interface StoreAdminSidebarProps {
  activeTab: StoreAdminTab;
  onSelectTab: (tab: StoreAdminTab) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  store: Store;
  stats: {
    salesDays: number;
    totalProducts: number;
    lowStockCount: number;
    soldProductsCount: number;
    discountedCount?: number;
    receiptsCount: number;
    gmailReceiptsCount?: number;
    returnsCount: number;
    staffCount: number;
    expensesCount?: number;
    monthlyExpensesTotal?: number;
    cashPaymentTotal?: number;
    onlinePaymentTotal?: number;
    totalTransactionsCount?: number;
    cashPercent?: number;
    onlinePercent?: number;
  };
  expenseFilterMode?: ExpenseFilterMode;
  onSelectExpenseFilterMode?: (mode: ExpenseFilterMode) => void;
  onNavigateToPOS?: () => void;
  onNavigateToInventory?: () => void;
  onOpenExcel: () => void;
  onOpenAi: () => void;
  onLogout?: () => void;
}

export const StoreAdminSidebar: React.FC<StoreAdminSidebarProps> = ({
  activeTab,
  onSelectTab,
  isCollapsed,
  onToggleCollapse,
  isOpenMobile,
  onCloseMobile,
  store,
  stats,
  expenseFilterMode = 'month',
  onSelectExpenseFilterMode,
  onNavigateToPOS,
  onNavigateToInventory,
  onOpenExcel,
  onOpenAi,
  onLogout
}) => {
  const handleTabClick = (tab: StoreAdminTab) => {
    onSelectTab(tab);
    onCloseMobile();
  };

  const handleExpenseSubFilterClick = (mode: ExpenseFilterMode) => {
    if (onSelectExpenseFilterMode) {
      onSelectExpenseFilterMode(mode);
    }
    onSelectTab('expenses');
    onCloseMobile();
  };

  const navSections = [
    {
      group: 'Analytics & Reports',
      items: [
        {
          id: 'sales_by_date' as StoreAdminTab,
          label: 'Sales by Date',
          icon: CalendarDays,
          badge: `${stats.salesDays}d`
        },
        {
          id: 'volume_chart' as StoreAdminTab,
          label: '7-Day Volume Chart',
          icon: LineChartIcon,
          badge: null
        },
        {
          id: 'revenue_trends' as StoreAdminTab,
          label: 'Revenue & Profit Trends',
          icon: TrendingUp,
          badge: null
        },
        {
          id: 'net_profit_revenue' as StoreAdminTab,
          label: 'Net Profit & Sales Revenue',
          icon: DollarSign,
          badge: null
        }
      ]
    },
    {
      group: 'Inventory & Sales',
      items: [
        {
          id: 'stock_remaining' as StoreAdminTab,
          label: 'Realtime Stock',
          icon: Package,
          badge: stats.lowStockCount > 0 ? `${stats.lowStockCount} Low` : `${stats.totalProducts}`,
          badgeColor: stats.lowStockCount > 0 ? 'bg-amber-500 text-white font-black' : 'bg-slate-800 text-slate-300'
        },
        {
          id: 'product_valuation' as StoreAdminTab,
          label: 'Product Valuation Analytics',
          icon: Scale,
          badge: null
        },
        {
          id: 'promotions' as StoreAdminTab,
          label: 'Item Discounts',
          icon: Percent,
          badge: stats.discountedCount && stats.discountedCount > 0 ? `${stats.discountedCount} Active` : null,
          badgeColor: 'bg-rose-500 text-white font-black animate-pulse'
        },
        {
          id: 'sold_products' as StoreAdminTab,
          label: 'Sold Products',
          icon: Tag,
          badge: `${stats.soldProductsCount}`
        },
        {
          id: 'sales_history' as StoreAdminTab,
          label: 'Receipts Log',
          icon: Receipt,
          badge: `${stats.receiptsCount}`
        },
        {
          id: 'recent_receipts' as StoreAdminTab,
          label: 'Recent Customer Receipts',
          icon: ReceiptText,
          badge: `${stats.receiptsCount}`
        },
        {
          id: 'gmail_log' as StoreAdminTab,
          label: 'Gmail E-Receipts Log',
          icon: Mail,
          badge: stats.gmailReceiptsCount !== undefined && stats.gmailReceiptsCount > 0 ? `${stats.gmailReceiptsCount}` : null,
          badgeColor: 'bg-orange-600 text-white font-black'
        },
        {
          id: 'returns' as StoreAdminTab,
          label: 'Returns & Refunds',
          icon: Undo2,
          badge: stats.returnsCount > 0 ? `${stats.returnsCount}` : null,
          badgeColor: 'bg-red-500/80 text-white'
        }
      ]
    },
    {
      group: 'Finance & Payments',
      items: [
        {
          id: 'payment_methods' as StoreAdminTab,
          label: 'Payment Methods',
          icon: CreditCard,
          badge: stats.cashPercent !== undefined ? `${stats.cashPercent}% Cash` : null,
          badgeColor: 'bg-emerald-950 text-emerald-400 border border-emerald-800/80 font-black'
        },
        {
          id: 'expenses' as StoreAdminTab,
          label: 'Expenses & Outflows',
          icon: ReceiptText,
          badge: stats.expensesCount !== undefined ? `${stats.expensesCount}` : null,
          badgeColor: stats.expensesCount && stats.expensesCount > 0 ? 'bg-red-500/80 text-white' : undefined,
          isExpenseItem: true
        }
      ]
    },
    {
      group: 'Store Management',
      items: [
        {
          id: 'staff' as StoreAdminTab,
          label: 'Staff & Salaries',
          icon: Users,
          badge: `${stats.staffCount}`
        },
        {
          id: 'settings' as StoreAdminTab,
          label: 'Settings & Branding',
          icon: Settings,
          badge: null
        }
      ]
    }
  ];

  return (
    <>
      {/* Drawer Backdrop Overlay */}
      {isOpenMobile && (
        <div 
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-40 transition-opacity"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container (Slide-over drawer overlaying above interface) */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50
          h-screen w-72
          bg-slate-900 text-slate-100 flex flex-col border-r border-slate-800/80
          transition-transform duration-300 ease-in-out shrink-0 select-none shadow-2xl
          ${isOpenMobile ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Top Branding Section */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white shadow-md shrink-0">
              <StoreIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black text-orange-400 uppercase tracking-wider flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 inline text-orange-400" /> Store Admin
              </div>
              <h2 className="text-sm font-black text-white truncate" title={store.name}>
                {store.name}
              </h2>
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={onCloseMobile}
            className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
            title="Close Sidebar Navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Links (Scrollable) */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6 custom-scrollbar">
          {navSections.map((sec, idx) => (
            <div key={idx} className="space-y-1">
              {!isCollapsed && (
                <div className="px-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">
                  {sec.group}
                </div>
              )}
              {sec.items.map((item) => {
                const IconComponent = item.icon;
                const isActive = activeTab === item.id;
                const isExpense = item.id === 'expenses';

                return (
                  <React.Fragment key={item.id}>
                    <button
                      onClick={() => handleTabClick(item.id)}
                      title={isCollapsed ? item.label : undefined}
                      className={`
                        w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer
                        ${isActive 
                          ? 'bg-orange-600 text-white shadow-md shadow-orange-950/20' 
                          : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                        }
                        ${isCollapsed ? 'justify-center px-2' : 'justify-between'}
                      `}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <IconComponent className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                        {!isCollapsed && <span className="truncate text-left">{item.label}</span>}
                      </div>

                      {!isCollapsed && item.badge && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold shrink-0 ${item.badgeColor || (isActive ? 'bg-orange-700/80 text-white' : 'bg-slate-800 text-slate-300')}`}>
                          {item.badge}
                        </span>
                      )}
                    </button>

                    {/* Expense Sub-filter Navigation in Sidebar: Date, Month, Year */}
                    {isExpense && !isCollapsed && (
                      <div className="pl-3 pr-1 py-1 space-y-1 bg-slate-950/40 rounded-xl border border-slate-800/60 my-1">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1.5 pt-0.5">
                          Filter Period:
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExpenseSubFilterClick('date');
                            }}
                            className={`px-1.5 py-1 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                              isActive && expenseFilterMode === 'date'
                                ? 'bg-orange-600 text-white shadow-xs'
                                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                            }`}
                            title="Filter logged expenses by Date"
                          >
                            <Calendar className="w-2.5 h-2.5" /> Date
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExpenseSubFilterClick('month');
                            }}
                            className={`px-1.5 py-1 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                              isActive && expenseFilterMode === 'month'
                                ? 'bg-orange-600 text-white shadow-xs'
                                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                            }`}
                            title="Filter logged expenses by Month"
                          >
                            <CalendarDays className="w-2.5 h-2.5" /> Month
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExpenseSubFilterClick('year');
                            }}
                            className={`px-1.5 py-1 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                              isActive && expenseFilterMode === 'year'
                                ? 'bg-orange-600 text-white shadow-xs'
                                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                            }`}
                            title="Filter logged expenses by Year"
                          >
                            <ReceiptText className="w-2.5 h-2.5" /> Year
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Payment Method Quick Mini-Split Pill in Sidebar */}
                    {item.id === 'payment_methods' && !isCollapsed && stats.cashPaymentTotal !== undefined && (
                      <div className="px-3 py-1.5 bg-slate-950/50 rounded-xl border border-slate-800/80 my-1 text-[10px] space-y-1">
                        <div className="flex items-center justify-between font-bold">
                          <span className="text-emerald-400 flex items-center gap-1">
                            <Banknote className="w-3 h-3 text-emerald-400" /> Cash:
                          </span>
                          <span className="text-emerald-300 font-mono">
                            {stats.cashPercent !== undefined ? `${stats.cashPercent}%` : ''}
                          </span>
                        </div>
                        <div className="flex items-center justify-between font-bold">
                          <span className="text-blue-400 flex items-center gap-1">
                            <Smartphone className="w-3 h-3 text-blue-400" /> Online:
                          </span>
                          <span className="text-blue-300 font-mono">
                            {stats.onlinePercent !== undefined ? `${stats.onlinePercent}%` : ''}
                          </span>
                        </div>
                        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden flex">
                          <div className="bg-emerald-500 h-full" style={{ width: `${stats.cashPercent || 0}%` }} />
                          <div className="bg-blue-500 h-full" style={{ width: `${stats.onlinePercent || 0}%` }} />
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          ))}

          {/* Quick Tools & Access Section */}
          <div className="pt-2 border-t border-slate-800 space-y-1">
            {!isCollapsed && (
              <div className="px-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">
                Quick Tools & Access
              </div>
            )}

            {onNavigateToPOS && (
              <button
                onClick={() => { onCloseMobile(); onNavigateToPOS(); }}
                title="Open POS Cash Counter"
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer bg-gradient-to-r from-orange-600/20 to-amber-600/20 text-orange-400 hover:bg-orange-600 hover:text-white border border-orange-500/30
                  ${isCollapsed ? 'justify-center px-2' : 'justify-start'}
                `}
              >
                <Calculator className="w-4 h-4 shrink-0 text-orange-400" />
                {!isCollapsed && <span>Open Cash Counter POS</span>}
              </button>
            )}

            {onNavigateToInventory && (
              <button
                onClick={() => { onCloseMobile(); onNavigateToInventory(); }}
                title="Stock In Register Mode"
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-slate-300 hover:bg-slate-800 hover:text-white
                  ${isCollapsed ? 'justify-center px-2' : 'justify-start'}
                `}
              >
                <PackageCheck className="w-4 h-4 shrink-0 text-blue-400" />
                {!isCollapsed && <span>Stock In Register</span>}
              </button>
            )}

            <button
              onClick={() => { onCloseMobile(); onOpenAi(); }}
              title="Open Mart Pro AI Copilot"
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-slate-300 hover:bg-slate-800 hover:text-white
                ${isCollapsed ? 'justify-center px-2' : 'justify-start'}
              `}
            >
              <Sparkles className="w-4 h-4 shrink-0 text-amber-400" />
              {!isCollapsed && <span>Mart Pro AI Copilot</span>}
            </button>

            <button
              onClick={() => { onCloseMobile(); onOpenExcel(); }}
              title="Excel / Spreadsheet Manager"
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-slate-300 hover:bg-slate-800 hover:text-white
                ${isCollapsed ? 'justify-center px-2' : 'justify-start'}
              `}
            >
              <FileSpreadsheet className="w-4 h-4 shrink-0 text-emerald-400" />
              {!isCollapsed && <span>Excel / Spreadsheet</span>}
            </button>

            <DownloadAppButton variant="sidebar" />
          </div>
        </div>

        {/* Sidebar Footer User Info & Logout Button */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/60 space-y-2">
          {!isCollapsed ? (
            <div className="flex items-center justify-between text-xs px-2 py-1">
              <div className="truncate">
                <p className="font-bold text-slate-200 truncate">{store.name}</p>
                <p className="text-[10px] text-slate-400">{store.currencySymbol || 'Rs.'} Active</p>
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" title="Realtime Sync Connected" />
            </div>
          ) : (
            <div className="flex justify-center py-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" title="Realtime Sync Connected" />
            </div>
          )}

          {onLogout && (
            <button
              type="button"
              onClick={() => {
                onCloseMobile();
                onLogout();
              }}
              title="Log Out of Store Admin"
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-red-600/10 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/20 font-bold text-xs transition-all cursor-pointer shadow-2xs ${
                isCollapsed ? 'justify-center px-2' : 'justify-center'
              }`}
            >
              <LogOut className="w-3.5 h-3.5" />
              {!isCollapsed && <span>Log Out</span>}
            </button>
          )}
        </div>
      </aside>
    </>
  );
};
