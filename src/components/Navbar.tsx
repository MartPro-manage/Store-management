import React from 'react';
import { motion } from 'motion/react';
import { AuthState } from '../types';
import { Logo } from './Logo';
import { 
  LogOut, 
  User, 
  Store as StoreIcon, 
  ShieldCheck, 
  Calculator, 
  PackageCheck, 
  PackagePlus,
  Wifi, 
  Truck, 
  LayoutDashboard, 
  ScanLine, 
  Users
} from 'lucide-react';

export type AppNavView = 'dashboard' | 'pos' | 'inventory' | 'suppliers' | 'staff' | 'price_checker' | 'attendance';

interface NavbarProps {
  auth: AuthState;
  activeView: AppNavView;
  onSelectView: (view: AppNavView) => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ 
  auth, 
  activeView, 
  onSelectView, 
  onLogout 
}) => {
  const { user, store } = auth;

  const getRoleLabel = (role?: string) => {
    switch (role) {
      case 'super_admin':
        return { 
          label: 'SUPER ADMIN', 
          color: 'bg-red-50 text-red-700 border-red-200 shadow-red-100', 
          icon: ShieldCheck 
        };
      case 'store_admin':
      case 'admin':
        return { 
          label: 'CHAIN OWNER', 
          color: 'bg-orange-50 text-orange-700 border-orange-200 shadow-orange-100', 
          icon: StoreIcon 
        };
      case 'branch_admin':
        return { 
          label: 'BRANCH ADMIN', 
          color: 'bg-amber-50 text-amber-700 border-amber-200 shadow-amber-100', 
          icon: StoreIcon 
        };
      case 'cash_counter':
        return { 
          label: `CASH COUNTER ${user?.counterNumber ? `#${user.counterNumber}` : ''}`, 
          color: 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-emerald-100', 
          icon: Calculator 
        };
      case 'product_register':
        return { 
          label: 'PRODUCT REGISTER', 
          color: 'bg-blue-50 text-blue-700 border-blue-200 shadow-blue-100', 
          icon: PackageCheck 
        };
      case 'customer_price_checker':
        return { 
          label: 'PRICE CHECKER', 
          color: 'bg-purple-50 text-purple-700 border-purple-200 shadow-purple-100', 
          icon: ScanLine 
        };
      default:
        return { 
          label: (role || 'STAFF').replace(/_/g, ' ').toUpperCase(), 
          color: 'bg-slate-100 text-slate-700 border-slate-200 shadow-slate-100', 
          icon: User 
        };
    }
  };

  const roleInfo = getRoleLabel(user?.role);
  const RoleIcon = roleInfo.icon;

  // Single unified navigation options list - Dashboard is explicitly the first option
  // Super Admin has centralized master control and does not use store-level interface slide bar
  const isSuperAdmin = user?.role === 'super_admin';
  const isStoreAdmin = user?.role === 'store_admin' || user?.role === 'admin';

  const navItems = [
    {
      id: 'dashboard' as AppNavView,
      label: isStoreAdmin ? 'Executive Analytics' : 'Dashboard',
      shortLabel: isStoreAdmin ? 'Analytics' : 'Dashboard',
      icon: LayoutDashboard,
      roles: ['store_admin', 'admin', 'branch_admin']
    },
    {
      id: 'pos' as AppNavView,
      label: 'Cash Counter POS',
      shortLabel: 'POS',
      icon: Calculator,
      roles: ['branch_admin', 'cash_counter']
    },
    {
      id: 'inventory' as AppNavView,
      label: 'Product Register',
      shortLabel: 'Register',
      icon: PackagePlus,
      roles: ['branch_admin', 'product_register']
    },
    {
      id: 'suppliers' as AppNavView,
      label: 'Supplier',
      shortLabel: 'Supplier',
      icon: Truck,
      roles: ['branch_admin']
    },
    {
      id: 'staff' as AppNavView,
      label: 'Staff Sessions',
      shortLabel: 'Staff',
      icon: Users,
      roles: ['branch_admin']
    },
    {
      id: 'price_checker' as AppNavView,
      label: 'Price Checker',
      shortLabel: 'Kiosk',
      icon: ScanLine,
      roles: ['branch_admin', 'customer_price_checker']
    }
  ];

  const visibleNavItems = isSuperAdmin ? [] : navItems.filter(item => 
    !user?.role || item.roles.includes(user.role)
  );

  return (
    <header 
      id="main-navigation-bar"
      className="bg-white/95 backdrop-blur-md border-b border-slate-200 text-slate-900 sticky top-0 z-40 shadow-xs transition-all shrink-0 select-none"
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-5 lg:px-6 h-16 flex items-center justify-between gap-3">
        
        {/* Left: Brand & Store Indicator */}
        <div className="flex items-center gap-3 shrink-0">
          <div 
            onClick={() => onSelectView('dashboard')}
            className="flex items-center cursor-pointer transition-transform hover:scale-[1.02]"
            title="Go to Dashboard"
          >
            <Logo size="sm" showSubtitle={false} lightMode={true} />
          </div>

          {store && (
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200/80 rounded-full text-xs font-bold text-slate-800 shadow-2xs">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <StoreIcon className="w-3.5 h-3.5 text-orange-600" />
              <span className="truncate max-w-[130px]">{store.name}</span>
            </div>
          )}
        </div>

        {/* Center: Dedicated Navigation Tabs - Hidden for Super Admin to remove slide bar */}
        {visibleNavItems.length > 0 && (
          <nav 
            aria-label="Interface Selector" 
            className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none"
          >
            {visibleNavItems.map((item) => {
              const isActive = activeView === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  id={`nav-btn-${item.id}`}
                  type="button"
                  onClick={() => onSelectView(item.id)}
                  className={`px-3 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-orange-600 text-white shadow-sm shadow-orange-600/30 ring-2 ring-orange-500/20'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900'
                  }`}
                  title={`Switch to ${item.label}`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-600'}`} />
                  <span className="hidden md:inline">{item.label}</span>
                  <span className="md:hidden">{item.shortLabel}</span>
                </button>
              );
            })}
          </nav>
        )}

        {/* Right: Cloud Connection, User Role Badge & Logout */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="hidden 2xl:flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[11px] font-bold">
            <Wifi className="w-3 h-3 text-emerald-600" />
            <span>Cloud Connected</span>
          </div>

          <div className="hidden sm:flex flex-col items-end">
            <div className="text-xs font-extrabold text-slate-900 truncate max-w-[120px]">
              {user?.name || user?.username}
            </div>
            <div className={`text-[9px] font-black tracking-wider px-2 py-0.2 rounded-full border shadow-2xs ${roleInfo.color} flex items-center gap-1`}>
              <RoleIcon className="w-2.5 h-2.5" />
              <span className="truncate max-w-[100px]">{roleInfo.label}</span>
            </div>
          </div>

          <div className="h-6 w-px bg-slate-200 hidden sm:block" />

          <button
            id="nav-logout-btn"
            type="button"
            onClick={onLogout}
            title="Log Out of Mart Pro"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 hover:text-red-800 border border-red-200 transition-all text-xs font-bold cursor-pointer shadow-2xs"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Log Out</span>
          </button>
        </div>

      </div>
    </header>
  );
};
