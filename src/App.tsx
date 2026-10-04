import React, { useState, useEffect } from 'react';
import { AuthState, Store, Sale, UserAccount } from './types';
import { ensureSuperAdminExists, db, doc, updateDoc, setDoc, collection, query, where, getDocs, onSnapshot } from './lib/firebase';
import { Login } from './components/Login';
import { Navbar, AppNavView } from './components/Navbar';
import { SuperAdminDashboard } from './components/SuperAdminDashboard';
import { StoreAdminDashboard } from './components/StoreAdminDashboard';
import { ProductRegisterView } from './components/ProductRegisterView';
import { CashCounterView } from './components/CashCounterView';
import { CustomerPriceCheckerView } from './components/CustomerPriceCheckerView';
import { SupplierManagementView } from './components/SupplierManagementView';
import { StaffSessionsView } from './components/StaffSessionsView';
import { StaffAttendanceView } from './components/StaffAttendanceView';
import { ReceiptModal } from './components/ReceiptModal';
import { PublicReceiptView } from './components/PublicReceiptView';

export default function App() {
  const [auth, setAuth] = useState<AuthState>({
    user: null,
    store: null
  });

  // URL query params & hash detection for scanned QR codes (e.g. ?receiptId=... or ?no=... or #data=...)
  const [publicReceiptTarget, setPublicReceiptTarget] = useState<{ id?: string | null; number?: string | null; encodedData?: string | null } | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const rId = params.get('receiptId') || params.get('receipt') || params.get('r');
      const rNo = params.get('no') || params.get('receiptNo');
      let dataPayload = params.get('data') || params.get('d');

      const hash = window.location.hash;
      if (hash.includes('data=')) {
        dataPayload = hash.split('data=')[1]?.split('&')[0];
      }

      if (rId || rNo || dataPayload) {
        return { id: rId, number: rNo, encodedData: dataPayload };
      }
    } catch (e) {
      console.warn('URL parsing error:', e);
    }
    return null;
  });

  // Dynamic Interface Switching state - Clicking any navbar button will instantly display only that interface
  const [activeNavView, setActiveNavView] = useState<AppNavView>('dashboard');

  // Inspected store for Super Admin
  const [inspectedStore, setInspectedStore] = useState<Store | null>(null);

  // Synchronized store users for attendance and operations
  const [storeUsers, setStoreUsers] = useState<UserAccount[]>([]);

  useEffect(() => {
    const storeIdToWatch = inspectedStore?.id || auth.store?.id;
    if (!storeIdToWatch) return;

    const rawIds = [storeIdToWatch, 'all', auth.store?.parentStoreId].filter(Boolean) as string[];
    const uniqueIds = Array.from(new Set(rawIds));

    const q = query(
      collection(db, 'users'),
      where('storeId', 'in', uniqueIds)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const list: UserAccount[] = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() } as UserAccount);
      });
      setStoreUsers(list);
    }, (err) => {
      console.warn('Error fetching store users:', err);
    });

    return () => unsub();
  }, [auth.store?.id, auth.store?.parentStoreId, inspectedStore?.id]);

  // Selected receipt to view
  const [selectedReceiptSale, setSelectedReceiptSale] = useState<Sale | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);

  // Seed Super Admin on boot after initial connection initialization
  useEffect(() => {
    const timer = setTimeout(() => {
      ensureSuperAdminExists();
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  const handleExitPublicReceipt = () => {
    // Clear URL search params and hash cleanly without page reload
    try {
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.pushState({}, document.title, cleanUrl);
    } catch (e) {
      console.warn(e);
    }
    setPublicReceiptTarget(null);
  };

  // If user scanned a QR code or navigated via ?receiptId=..., render Public E-Receipt View directly
  if (publicReceiptTarget) {
    return (
      <PublicReceiptView
        receiptId={publicReceiptTarget.id}
        receiptNumber={publicReceiptTarget.number}
        encodedData={publicReceiptTarget.encodedData}
        onExitToLogin={handleExitPublicReceipt}
      />
    );
  }

  const handleLoginSuccess = (newAuth: AuthState) => {
    setAuth(newAuth);
    setInspectedStore(newAuth.store);
    
    // Set initial view according to role
    if (newAuth.user?.role === 'cash_counter') {
      setActiveNavView('pos');
    } else if (newAuth.user?.role === 'product_register') {
      setActiveNavView('inventory');
    } else if (newAuth.user?.role === 'customer_price_checker') {
      setActiveNavView('price_checker');
    } else {
      setActiveNavView('dashboard');
    }
  };

  const handleLogout = () => {
    const loggedUser = auth.user;
    const currentStore = auth.store;
    const activeSessionId = localStorage.getItem('martpro_current_session_id');

    // 1. Immediately reset auth state and close modals so user sees Login screen immediately with ZERO lag!
    setAuth({ user: null, store: null });
    setActiveNavView('dashboard');
    setInspectedStore(null);
    setSelectedReceiptSale(null);
    setIsReceiptModalOpen(false);
    localStorage.removeItem('martpro_current_session_id');

    // 2. Perform background cleanup asynchronously without blocking the user
    (async () => {
      // Auto-hold active billing carts to prevent data loss
      try {
        const keysToProcess: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('martpro_active_cart_draft_')) {
            keysToProcess.push(key);
          }
        }

        for (const key of keysToProcess) {
          const rawDraft = localStorage.getItem(key);
          if (rawDraft) {
            try {
              const draft = JSON.parse(rawDraft);
              if (draft.items && draft.items.length > 0) {
                const heldId = `autoheld_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                const storeId = draft.storeId || currentStore?.id || 'default';
                await setDoc(doc(db, 'held_bills', heldId), {
                  id: heldId,
                  storeId: storeId,
                  counterId: draft.counterNumber?.toString() || loggedUser?.counterNumber?.toString() || '1',
                  counterName: `Counter #${draft.counterNumber || loggedUser?.counterNumber || 1}`,
                  cashierUsername: draft.cashierUsername || loggedUser?.username || 'cashier',
                  items: draft.items,
                  subtotal: draft.subtotal || 0,
                  total: draft.total || 0,
                  heldAt: new Date().toISOString(),
                  isAutoHeld: true,
                  notes: 'Auto-held during logout'
                });
              }
            } catch (pErr) {
              console.warn('Draft parse error during logout:', pErr);
            }
            localStorage.removeItem(key);
          }
        }
      } catch (err) {
        console.warn('Auto-holding bill on logout warning:', err);
      }

      // Record logout time in staff_sessions
      const nowIso = new Date().toISOString();
      if (activeSessionId) {
        try {
          await updateDoc(doc(db, 'staff_sessions', activeSessionId), {
            logoutTime: nowIso,
            status: 'offline'
          });
        } catch (err) {
          console.warn('Could not record logout time:', err);
        }
      }

      // Query and mark any other active sessions for this user as offline
      if (loggedUser) {
        try {
          const uQuery = query(
            collection(db, 'staff_sessions'),
            where('userId', '==', loggedUser.id),
            where('status', '==', 'online')
          );
          const uSnap = await getDocs(uQuery);
          const updates = uSnap.docs.map(d => updateDoc(doc(db, 'staff_sessions', d.id), {
            logoutTime: nowIso,
            status: 'offline'
          }));
          await Promise.allSettled(updates);

          try {
            await updateDoc(doc(db, 'users', loggedUser.id), {
              isOnline: false,
              lastLogout: nowIso
            });
          } catch {
            // ignore
          }
        } catch (sessErr) {
          console.warn('Error clearing user online status:', sessErr);
        }
      }
    })().catch(e => console.warn('Background logout cleanup error:', e));
  };

  const handleViewReceipt = (sale: Sale) => {
    setSelectedReceiptSale(sale);
    setIsReceiptModalOpen(true);
  };

  // Render Login if not authenticated
  if (!auth.user) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  const userRole = auth.user.role;
  const activeStore = inspectedStore || auth.store;

  // Universal return action: returns back to main panel / default view
  const handleUniversalReturn = () => {
    if (userRole === 'cash_counter') {
      setActiveNavView('pos');
    } else if (userRole === 'product_register') {
      setActiveNavView('inventory');
    } else if (userRole === 'customer_price_checker') {
      setActiveNavView('price_checker');
    } else {
      setActiveNavView('dashboard');
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-slate-50 text-slate-900 font-sans selection:bg-orange-500 selection:text-white">
      {/* Top Navbar with Dynamic Interface Switching - Moves separately from page interface */}
      <Navbar 
        auth={auth} 
        activeView={activeNavView}
        onSelectView={(view) => setActiveNavView(view)}
        onLogout={handleLogout} 
      />

      {/* Main Content Body - Dynamically renders ONLY the selected view and scrolls separately (scroll slide bar hidden for super admin) */}
      <main className={`flex-1 min-h-0 flex flex-col ${
        activeNavView === 'dashboard' || activeNavView === 'pos' || activeNavView === 'price_checker'
          ? 'overflow-hidden'
          : userRole === 'super_admin' 
            ? 'overflow-y-auto scrollbar-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden' 
            : 'overflow-y-auto'
      }`}>

        {/* 1. SUPPLIER MODULE (Explicitly in Main Navigation) */}
        {activeNavView === 'suppliers' && activeStore && (
          <SupplierManagementView 
            store={activeStore} 
            currentUser={auth.user} 
            onBack={handleUniversalReturn}
          />
        )}

        {/* 2. STAFF & SALARIES */}
        {activeNavView === 'staff' && activeStore && (
          <StaffSessionsView 
            store={activeStore} 
            currentUser={auth.user} 
            onBack={handleUniversalReturn}
          />
        )}

        {/* 3. CASH COUNTER POINT OF SALE (POS) */}
        {activeNavView === 'pos' && activeStore && (
          <CashCounterView 
            store={activeStore} 
            currentUser={auth.user} 
            onBack={handleUniversalReturn}
            onLogout={handleLogout}
          />
        )}

        {/* 4. PRODUCT REGISTER & STOCK IN */}
        {activeNavView === 'inventory' && activeStore && (
          <ProductRegisterView 
            store={activeStore} 
            currentUser={auth.user} 
            onBack={handleUniversalReturn}
          />
        )}

        {/* 5. CUSTOMER PRICE CHECKER KIOSK */}
        {activeNavView === 'price_checker' && activeStore && (
          <CustomerPriceCheckerView 
            store={activeStore} 
            currentUser={auth.user} 
            onBack={handleUniversalReturn}
          />
        )}

        {/* 6. STAFF ATTENDANCE & MONTHLY REPORTS */}
        {activeNavView === 'attendance' && activeStore && (
          <StaffAttendanceView 
            store={activeStore} 
            currentUser={auth.user} 
            storeUsers={storeUsers}
            onBack={handleUniversalReturn}
          />
        )}

        {/* 6. PRIMARY DASHBOARD / MAIN PANEL */}
        {activeNavView === 'dashboard' && (
          <div className="h-full w-full flex-1 min-h-0 flex flex-col">
            {userRole === 'super_admin' ? (
              inspectedStore ? (
                <div className="h-full w-full flex-1 min-h-0 flex flex-col">
                  <div className="bg-orange-50 border-b border-orange-200 px-6 py-2.5 flex items-center justify-between text-xs text-orange-950 font-medium shrink-0">
                    <span className="font-bold text-orange-700">
                      Inspecting Store: {inspectedStore.name}
                    </span>
                    <button
                      onClick={() => setInspectedStore(null)}
                      className="px-3 py-1 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-lg cursor-pointer transition-colors shadow-sm"
                    >
                      ← Back to Central Super Admin
                    </button>
                  </div>

                  <div className="flex-1 min-h-0 h-full w-full">
                    <StoreAdminDashboard
                      store={inspectedStore}
                      currentUser={auth.user}
                      onNavigateToPOS={() => setActiveNavView('pos')}
                      onNavigateToInventory={() => setActiveNavView('inventory')}
                      onNavigateToSuppliers={() => setActiveNavView('suppliers')}
                      onNavigateToLiveSessions={() => setActiveNavView('staff')}
                      onViewReceipt={handleViewReceipt}
                      onLogout={handleLogout}
                    />
                  </div>
                </div>
              ) : (
                <div className="h-full w-full flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain">
                  <SuperAdminDashboard
                    onSelectStoreToManage={(store) => setInspectedStore(store)}
                    onLogout={handleLogout}
                  />
                </div>
              )
            ) : (userRole === 'admin' || userRole === 'store_admin' || userRole === 'branch_admin') && activeStore ? (
              <StoreAdminDashboard
                store={activeStore}
                currentUser={auth.user}
                onNavigateToPOS={() => setActiveNavView('pos')}
                onNavigateToInventory={() => setActiveNavView('inventory')}
                onNavigateToSuppliers={() => setActiveNavView('suppliers')}
                onNavigateToLiveSessions={() => setActiveNavView('staff')}
                onViewReceipt={handleViewReceipt}
                onLogout={handleLogout}
              />
            ) : userRole === 'cash_counter' && activeStore ? (
              <CashCounterView 
                store={activeStore} 
                currentUser={auth.user} 
                onLogout={handleLogout}
                onBack={handleUniversalReturn}
              />
            ) : userRole === 'product_register' && activeStore ? (
              <ProductRegisterView 
                store={activeStore} 
                currentUser={auth.user} 
                onBack={handleUniversalReturn}
              />
            ) : userRole === 'customer_price_checker' && activeStore ? (
              <CustomerPriceCheckerView 
                store={activeStore} 
                currentUser={auth.user} 
                onBack={handleUniversalReturn}
              />
            ) : null}
          </div>
        )}

      </main>

      {/* Global Receipt Modal for Viewing Historical or Inspected Receipts */}
      <ReceiptModal
        sale={selectedReceiptSale}
        store={activeStore}
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
      />
    </div>
  );
}
