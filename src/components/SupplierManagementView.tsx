import React, { useState, useEffect, useMemo } from 'react';
import { Store, UserAccount, Product, SupplierOrder, SupplierOrderItem } from '../types';
import { db, collection, query, where, onSnapshot, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc } from '../lib/firebase';
import { UniversalBackButton } from './UniversalBackButton';
import { 
  Truck, 
  Plus, 
  CheckCircle2, 
  Clock, 
  Download, 
  Search, 
  Phone, 
  User, 
  Package, 
  FileText, 
  Trash2, 
  Check, 
  AlertCircle,
  Calendar,
  Layers,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  RotateCcw,
  CreditCard,
  Banknote,
  X,
  ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SupplierManagementViewProps {
  store: Store;
  currentUser: UserAccount;
  onBack: () => void;
}

export const SupplierManagementView: React.FC<SupplierManagementViewProps> = ({
  store,
  currentUser,
  onBack
}) => {
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeTab, setActiveTab] = useState<'queue' | 'new_order' | 'archive'>('queue');

  // New Order Form State
  const [supplierName, setSupplierName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [selectedProductCategory, setSelectedProductCategory] = useState('all');

  // Selected checklist items: map productId -> SupplierOrderItem
  const [checklist, setChecklist] = useState<Record<string, SupplierOrderItem>>({});

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<SupplierOrder | null>(null);

  // Payment Terms Modal when submitting order to queue
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedPaymentTerms, setSelectedPaymentTerms] = useState<'advance' | 'cod'>('advance');
  const [advanceAmountInput, setAdvanceAmountInput] = useState<string>('0');

  // Direct Product Name & Quantity input for Order Table
  const [customProductName, setCustomProductName] = useState('');
  const [customProductQty, setCustomProductQty] = useState<number>(10);
  const [customProductUnit, setCustomProductUnit] = useState('pcs');

  // Delivery & Payment Modal when marking order as delivered
  const [deliveryModalOrder, setDeliveryModalOrder] = useState<SupplierOrder | null>(null);
  const [codAmountInput, setCodAmountInput] = useState<string>('0');
  const [remainingBalanceInput, setRemainingBalanceInput] = useState<string>('0');

  // Subscribe to real-time products
  useEffect(() => {
    if (!store?.id) return;
    const qProducts = query(
      collection(db, 'products'),
      where('storeId', '==', store.id)
    );
    const unsub = onSnapshot(qProducts, (snapshot) => {
      const prods: Product[] = [];
      snapshot.forEach(docSnap => {
        prods.push({ id: docSnap.id, ...docSnap.data() } as Product);
      });
      setProducts(prods);
    });
    return () => unsub();
  }, [store?.id]);

  // Subscribe to real-time supplier orders
  useEffect(() => {
    if (!store?.id) return;
    const qOrders = query(
      collection(db, 'supplier_orders'),
      where('storeId', '==', store.id)
    );
    const unsub = onSnapshot(qOrders, (snapshot) => {
      const list: SupplierOrder[] = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() } as SupplierOrder);
      });
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setOrders(list);
    });
    return () => unsub();
  }, [store?.id]);

  // Show notification helper
  const showToast = (type: 'success' | 'error', text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 3500);
  };

  // Direct Add Product Name & Quantity to Order Table
  const handleAddCustomItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!customProductName.trim()) {
      showToast('error', 'Please enter a product name.');
      return;
    }

    const key = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const matchingProd = products.find(p => p.name.toLowerCase() === customProductName.trim().toLowerCase());

    setChecklist(prev => ({
      ...prev,
      [key]: {
        id: key,
        productId: matchingProd?.id,
        name: customProductName.trim(),
        category: matchingProd?.category || 'General',
        barcode: matchingProd?.barcode || '',
        shortcutCode: matchingProd?.shortcutCode || '',
        currentStock: matchingProd?.stockQuantity || 0,
        orderQuantity: customProductQty || 1,
        unitType: customProductUnit || 'pcs',
        costPrice: matchingProd?.costPrice || 0,
        estimatedTotal: 0,
        checked: true
      }
    }));

    setCustomProductName('');
    setCustomProductQty(10);
    showToast('success', `Added "${customProductName.trim()}" to order table.`);
  };

  const handleRemoveChecklistItem = (key: string) => {
    setChecklist(prev => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  };

  // Toggle item in checklist
  const handleToggleProduct = (product: Product) => {
    setChecklist(prev => {
      const copy = { ...prev };
      if (copy[product.id]) {
        delete copy[product.id];
      } else {
        const costPrice = product.costPrice || (product.price ? Math.round(product.price * 0.75) : 0);
        const defaultQty = product.stockQuantity <= (product.minStockLevel || 5) ? 25 : 10;
        copy[product.id] = {
          id: `item-${Date.now()}-${product.id}`,
          productId: product.id,
          name: product.name,
          category: product.category || 'General',
          barcode: product.barcode || '',
          shortcutCode: product.shortcutCode || '',
          currentStock: product.stockQuantity || 0,
          orderQuantity: defaultQty,
          unitType: product.unitType || (product.sellBy === 'weight' ? 'kg' : 'piece'),
          costPrice,
          estimatedTotal: defaultQty * costPrice,
          checked: true
        };
      }
      return copy;
    });
  };

  // Update quantity in checklist
  const handleUpdateChecklistQty = (productId: string, qty: number) => {
    if (qty <= 0) return;
    setChecklist(prev => {
      const item = prev[productId];
      if (!item) return prev;
      const cost = item.costPrice || 0;
      return {
        ...prev,
        [productId]: {
          ...item,
          orderQuantity: qty,
          estimatedTotal: Math.round(qty * cost * 100) / 100
        }
      };
    });
  };

  // Update wholesale price in checklist
  const handleUpdateChecklistPrice = (productId: string, costPrice: number) => {
    if (costPrice < 0) return;
    setChecklist(prev => {
      const item = prev[productId];
      if (!item) return prev;
      const qty = item.orderQuantity || 1;
      return {
        ...prev,
        [productId]: {
          ...item,
          costPrice,
          estimatedTotal: Math.round(qty * costPrice * 100) / 100
        }
      };
    });
  };

  // Categories list
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set).sort();
  }, [products]);

  // Filtered products for checklist
  const filteredProducts = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    return products.filter(p => {
      const matchCat = selectedProductCategory === 'all' || p.category === selectedProductCategory;
      if (!matchCat) return false;
      if (!term) return true;
      return (
        p.name?.toLowerCase().includes(term) ||
        p.shortcutCode?.toLowerCase().includes(term) ||
        p.barcode?.toLowerCase().includes(term)
      );
    });
  }, [products, productSearch, selectedProductCategory]);

  // Calculate estimated total for new order
  const newOrderTotal = useMemo(() => {
    const items = Object.values(checklist) as SupplierOrderItem[];
    return items.reduce((acc, item) => acc + (item.estimatedTotal || 0), 0);
  }, [checklist]);

  // Step 1: Open Payment Terms Modal when user submits new order form
  const handleSubmitOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierName.trim()) {
      showToast('error', 'Please enter a Supplier Name.');
      return;
    }

    const items = Object.values(checklist) as SupplierOrderItem[];
    if (items.length === 0) {
      showToast('error', 'Please select at least one product from the checklist.');
      return;
    }

    // Default advance amount input to estimated order total
    setAdvanceAmountInput(newOrderTotal.toString());
    setIsPaymentModalOpen(true);
  };

  // Step 2: Confirm Payment Terms & Add Order to Queue
  const handleConfirmPaymentAndQueue = async () => {
    const items = Object.values(checklist) as SupplierOrderItem[];
    if (items.length === 0 || !supplierName.trim()) return;

    setIsSubmitting(true);
    try {
      const orderId = `order_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const isAdvance = selectedPaymentTerms === 'advance';
      const advancePaid = isAdvance ? (parseFloat(advanceAmountInput) || 0) : 0;

      let paymentExpenseId: string | undefined;

      // If Advance payment, record expense immediately to cut/deduct from revenue!
      if (isAdvance && advancePaid > 0) {
        const expRef = await addDoc(collection(db, 'expenses'), {
          storeId: store.id,
          title: `Advance Supply Payment: ${supplierName.trim()} (#${orderId.slice(-6)})`,
          amount: advancePaid,
          category: 'Transport & Logistics',
          date: new Date().toISOString().split('T')[0],
          paymentMethod: 'cash',
          notes: `Advance payment for wholesale supplier order #${orderId.slice(-6)}`,
          createdAt: new Date().toISOString()
        });
        paymentExpenseId = expRef.id;
      }

      const orderPayload: SupplierOrder = {
        id: orderId,
        storeId: store.id,
        supplierName: supplierName.trim(),
        contactNumber: contactNumber.trim(),
        items,
        status: 'pending',
        paymentTerms: selectedPaymentTerms,
        advancePaidAmount: advancePaid,
        totalPaidAmount: advancePaid,
        paymentExpenseId,
        notes: notes.trim() || undefined,
        totalEstimatedAmount: newOrderTotal,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'supplier_orders', orderId), orderPayload);

      if (isAdvance) {
        showToast('success', `Order for "${supplierName}" added to Queue! Advance payment of Rs. ${advancePaid.toFixed(2)} recorded as store expense.`);
      } else {
        showToast('success', `Order for "${supplierName}" added to Queue with Cash on Delivery (COD) payment terms!`);
      }

      // Reset form & close modal
      setSupplierName('');
      setContactNumber('');
      setNotes('');
      setChecklist({});
      setIsPaymentModalOpen(false);
      setActiveTab('queue');
    } catch (err: any) {
      console.error(err);
      showToast('error', 'Failed to save order: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 3: Open Delivery Confirmation Modal for an Order in Queue
  const openDeliveryModal = (order: SupplierOrder) => {
    setDeliveryModalOrder(order);
    if (order.paymentTerms === 'cod') {
      setCodAmountInput((order.totalEstimatedAmount || 0).toString());
    } else {
      const rem = Math.max(0, (order.totalEstimatedAmount || 0) - (order.advancePaidAmount || 0));
      setRemainingBalanceInput(rem.toString());
    }
  };

  // Step 4: Confirm Order Delivery, Record Final Expense, and Restock Product Inventory
  const handleConfirmDeliveryAndRestock = async () => {
    if (!deliveryModalOrder) return;
    setIsSubmitting(true);

    try {
      const order = deliveryModalOrder;
      let deliveryExpenseId: string | undefined;

      if (order.paymentTerms === 'cod') {
        const codPaid = parseFloat(codAmountInput) || 0;

        // Create COD Expense record to cut/deduct from revenue!
        if (codPaid > 0) {
          const expRef = await addDoc(collection(db, 'expenses'), {
            storeId: store.id,
            title: `COD Supply Payment: ${order.supplierName} (#${order.id.slice(-6)})`,
            amount: codPaid,
            category: 'Transport & Logistics',
            date: new Date().toISOString().split('T')[0],
            paymentMethod: 'cash',
            notes: `COD payment for delivered supplier order #${order.id.slice(-6)}`,
            createdAt: new Date().toISOString()
          });
          deliveryExpenseId = expRef.id;
        }

        await updateDoc(doc(db, 'supplier_orders', order.id), {
          status: 'delivered',
          codPaidAmount: codPaid,
          totalPaidAmount: codPaid,
          deliveryExpenseId,
          deliveredAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      } else {
        // Advance Payment Terms: check if remaining balance was paid on delivery
        const remPaid = parseFloat(remainingBalanceInput) || 0;

        if (remPaid > 0) {
          const expRef = await addDoc(collection(db, 'expenses'), {
            storeId: store.id,
            title: `Final Supply Balance: ${order.supplierName} (#${order.id.slice(-6)})`,
            amount: remPaid,
            category: 'Transport & Logistics',
            date: new Date().toISOString().split('T')[0],
            paymentMethod: 'cash',
            notes: `Remaining balance payment on delivery for supplier order #${order.id.slice(-6)}`,
            createdAt: new Date().toISOString()
          });
          deliveryExpenseId = expRef.id;
        }

        const totalPaid = (order.advancePaidAmount || 0) + remPaid;
        await updateDoc(doc(db, 'supplier_orders', order.id), {
          status: 'delivered',
          totalPaidAmount: totalPaid,
          deliveryExpenseId,
          deliveredAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }

      // Restock product inventory in products collection
      for (const item of order.items) {
        if (item.productId) {
          const prodRef = doc(db, 'products', item.productId);
          const prodSnap = await getDoc(prodRef);
          if (prodSnap.exists()) {
            const currentQty = Number(prodSnap.data().stockQuantity) || 0;
            const newQty = Math.round((currentQty + item.orderQuantity) * 1000) / 1000;
            await updateDoc(prodRef, {
              stockQuantity: newQty,
              updatedAt: new Date().toISOString()
            });
          }
        }
      }

      showToast('success', `Order #${order.id.slice(-6)} marked as DELIVERED! Product inventory restocked and payment recorded.`);
      setDeliveryModalOrder(null);
    } catch (err: any) {
      console.error(err);
      showToast('error', 'Failed to update delivery status: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete / Discard order
  const confirmDeleteOrder = async () => {
    if (!orderToDelete) return;
    try {
      await deleteDoc(doc(db, 'supplier_orders', orderToDelete.id));
      showToast('success', `Supplier order #${orderToDelete.id.slice(-6)} deleted.`);
      setOrderToDelete(null);
    } catch (err: any) {
      console.error(err);
      showToast('error', 'Failed to delete order: ' + err.message);
    }
  };

  // Export list containing ONLY Product Name and Quantity
  const handleExportOrders = (specificOrder?: SupplierOrder) => {
    let itemsToExport: { name: string; quantity: string | number }[] = [];

    if (specificOrder) {
      itemsToExport = (specificOrder.items || []).map(i => ({
        name: i.name,
        quantity: `${i.orderQuantity} ${i.unitType || ''}`.trim()
      }));
    } else if (Object.keys(checklist).length > 0) {
      // Export current order table checklist
      itemsToExport = (Object.values(checklist) as SupplierOrderItem[]).map(i => ({
        name: i.name,
        quantity: `${i.orderQuantity} ${i.unitType || ''}`.trim()
      }));
    } else if (orders.length > 0) {
      // Export all items across active supplier orders
      const map = new Map<string, { name: string; qty: number; unit: string }>();
      const activeOrAll = orders.filter(o => o.status !== 'delivered');
      const targetList = activeOrAll.length > 0 ? activeOrAll : orders;

      targetList.forEach(order => {
        (order.items || []).forEach(item => {
          const key = (item.name || '').toLowerCase().trim();
          const existing = map.get(key);
          if (existing) {
            existing.qty += (item.orderQuantity || 0);
          } else {
            map.set(key, { name: item.name || 'Unnamed Item', qty: item.orderQuantity || 0, unit: item.unitType || '' });
          }
        });
      });

      itemsToExport = Array.from(map.values()).map(val => ({
        name: val.name,
        quantity: `${val.qty} ${val.unit}`.trim()
      }));
    }

    if (itemsToExport.length === 0) {
      showToast('error', 'No products or order items to export.');
      return;
    }

    const headers = ['Product Name', 'Quantity'];
    const rows = itemsToExport.map(item => [
      `"${(item.name || '').replace(/"/g, '""')}"`,
      `"${String(item.quantity).replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const filename = specificOrder 
      ? `Supplier_Order_${(specificOrder.supplierName || 'Order').replace(/\s+/g, '_')}_Items.csv`
      : `Supplier_Products_And_Quantities_${new Date().toISOString().split('T')[0]}.csv`;
    
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('success', 'Products & Quantities table exported successfully!');
  };

  const activeOrders = orders.filter(o => o.status !== 'delivered');
  const deliveredOrders = orders.filter(o => o.status === 'delivered');

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 flex flex-col">
      {/* Top Action & Navigation Bar */}
      <div className="bg-white border-b border-slate-200 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-3">
          
          <div className="flex items-center gap-3">
            {/* Universal Return Button */}
            <UniversalBackButton onBack={onBack} label="Back to Dashboard" />

            <div className="h-6 w-px bg-slate-200 hidden sm:block" />

            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-orange-600 text-white flex items-center justify-center shadow-xs">
                <Truck className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-base font-black text-slate-900 leading-tight">Supplier Management</h1>
                <p className="text-[11px] text-slate-500">Procurement & inventory supply queue</p>
              </div>
            </div>
          </div>

          {/* Tab Navigation & Export Actions */}
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveTab('queue')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'queue'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Clock className="w-3.5 h-3.5 text-orange-600" />
                <span>Active Queue</span>
                {activeOrders.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-orange-100 text-orange-800 text-[10px]">
                    {activeOrders.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('new_order')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'new_order'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Plus className="w-3.5 h-3.5 text-emerald-600" />
                <span>Create Order</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('archive')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'archive'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                <span>Delivered Archive</span>
                {deliveredOrders.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-800 text-[10px]">
                    {deliveredOrders.length}
                  </span>
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={() => handleExportOrders()}
              id="export-supplier-orders-btn"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors cursor-pointer shadow-xs"
              title="Download full supplier orders list as CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export List</span>
            </button>
          </div>

        </div>
      </div>

      {/* Notification Toast */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`max-w-md mx-auto mt-4 px-4 py-3 rounded-xl text-xs font-bold shadow-md flex items-center gap-2 ${
              notification.type === 'success'
                ? 'bg-emerald-600 text-white'
                : 'bg-red-600 text-white'
            }`}
          >
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{notification.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full">
        
        {/* 1. ACTIVE ORDERS QUEUE */}
        {activeTab === 'queue' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-900">Active Supply Orders Queue</h2>
                <p className="text-xs text-slate-500">Orders waiting for delivery and fulfillment</p>
              </div>
              <button
                onClick={() => setActiveTab('new_order')}
                className="px-3.5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Supplier Order</span>
              </button>
            </div>

            {activeOrders.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
                <Truck className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                <h3 className="text-base font-bold text-slate-800">No Orders in Active Queue</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  All supplier orders have been delivered, or no new orders have been submitted yet.
                </p>
                <button
                  onClick={() => setActiveTab('new_order')}
                  className="mt-4 px-4 py-2 rounded-xl bg-orange-600 text-white text-xs font-bold cursor-pointer hover:bg-orange-700"
                >
                  Create New Order Checklist
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeOrders.map((order) => {
                  const createdDate = new Date(order.createdAt).toLocaleDateString();
                  const createdTime = new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                  return (
                    <div
                      key={order.id}
                      className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:border-orange-300 transition-all flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
                          <div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 font-bold text-[10px] uppercase tracking-wider">
                                In Queue • Pending Delivery
                              </span>
                              {order.paymentTerms === 'advance' ? (
                                <span className="px-2 py-0.5 rounded-md bg-emerald-100 border border-emerald-300 text-emerald-900 font-bold text-[10px] uppercase tracking-wider flex items-center gap-1">
                                  <Banknote className="w-3 h-3 text-emerald-600" /> Advance Paid: Rs. {(order.advancePaidAmount || 0).toFixed(2)}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-md bg-orange-100 border border-orange-300 text-orange-900 font-bold text-[10px] uppercase tracking-wider flex items-center gap-1">
                                  <Truck className="w-3 h-3 text-amber-600" /> Cash on Delivery (COD)
                                </span>
                              )}
                            </div>
                            <h3 className="text-base font-black text-slate-900 mt-1">
                              {order.supplierName}
                            </h3>
                            {order.contactNumber && (
                              <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                                <Phone className="w-3 h-3 text-slate-400" />
                                <span>{order.contactNumber}</span>
                              </p>
                            )}
                          </div>

                          <div className="text-right">
                            <span className="text-[11px] text-slate-400 block">{createdDate}</span>
                            <span className="text-[11px] text-slate-400 font-mono">{createdTime}</span>
                          </div>
                        </div>

                        {/* Order Items Summary */}
                        <div className="py-3">
                          <p className="text-xs font-bold text-slate-700 mb-2 flex items-center justify-between">
                            <span>Products ({(order.items || []).length}):</span>
                            <span className="text-slate-500 font-normal">
                              Est. Total: <strong>Rs. {Number(order.totalEstimatedAmount || 0).toFixed(2)}</strong>
                            </span>
                          </p>
                          <div className="bg-slate-50 rounded-xl p-2.5 max-h-36 overflow-y-auto custom-scrollbar space-y-1 text-xs">
                            {(order.items || []).map((item, idx) => (
                              <div key={idx} className="flex items-center justify-between text-slate-700 py-0.5">
                                <div className="truncate pr-2">
                                  <span className="font-bold">{item.name}</span>
                                  {item.shortcutCode && (
                                    <span className="text-[10px] text-orange-600 font-mono ml-1">
                                      #{item.shortcutCode}
                                    </span>
                                  )}
                                </div>
                                <span className="font-mono font-bold text-slate-900 shrink-0">
                                  {item.orderQuantity} {item.unitType || 'pcs'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {order.notes && (
                          <div className="text-xs text-slate-500 italic bg-amber-50/50 p-2 rounded-lg border border-amber-100 mb-3">
                            "{order.notes}"
                          </div>
                        )}
                      </div>

                      {/* Action buttons: Export, Delivered & Delete */}
                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => handleExportOrders(order)}
                          className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer border border-slate-200"
                          title="Export product and quantity table CSV for this order"
                        >
                          <Download className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setOrderToDelete(order)}
                          className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                          title="Delete / Cancel Order"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => openDeliveryModal(order)}
                          className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors cursor-pointer shadow-xs"
                          title="Mark order as delivered, record payment expense, and restock inventory"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Delivered (Remove from Queue)</span>
                        </button>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 2. CREATE NEW ORDER (WITH PRODUCT CHECKLIST) */}
        {activeTab === 'new_order' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <h2 className="text-lg font-black text-slate-900 mb-1">Create Supplier Order</h2>
            <p className="text-xs text-slate-500 mb-6">
              Enter supplier details and select required inventory products from the checklist
            </p>

            <form onSubmit={handleSubmitOrder} className="space-y-6">
              {/* Supplier Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Supplier Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder="e.g. Metro Wholesale / Ali Distributors"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-xs sm:text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Contact / Phone Number
                  </label>
                  <input
                    type="text"
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    placeholder="e.g. +92 300 1234567"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-xs sm:text-sm"
                  />
                </div>

                <div className="sm:col-span-2 md:col-span-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Order Notes / Delivery Instructions
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Urgent morning delivery before 10 AM"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-xs sm:text-sm"
                  />
                </div>
              </div>

              {/* Direct Add Product Bar */}
              <div className="pt-4 border-t border-slate-200">
                <div className="bg-orange-50/80 p-4 rounded-2xl border border-orange-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-orange-900 uppercase tracking-wider">
                      Add Product & Order Quantity to Order Table:
                    </label>
                    <span className="text-[11px] text-orange-700 font-semibold">
                      Type product name or select from inventory below
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={customProductName}
                        onChange={(e) => setCustomProductName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCustomItem();
                          }
                        }}
                        placeholder="Enter product name (e.g. Milk 1L, Cooking Oil 5L, Rice)..."
                        className="w-full px-3.5 py-2.5 rounded-xl border border-orange-300 text-xs font-bold text-slate-900 focus:outline-none focus:border-orange-600 bg-white shadow-inner"
                        list="store-product-datalist"
                      />
                      <datalist id="store-product-datalist">
                        {products.map(p => (
                          <option key={p.id} value={p.name}>{p.name} (#{p.shortcutCode || p.barcode || '---'})</option>
                        ))}
                      </datalist>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="relative w-24">
                        <input
                          type="number"
                          min="1"
                          value={customProductQty}
                          onChange={(e) => setCustomProductQty(parseInt(e.target.value, 10) || 1)}
                          className="w-full px-3 py-2.5 rounded-xl border border-orange-300 text-xs font-mono font-black text-center text-slate-900 bg-white focus:outline-none focus:border-orange-600 shadow-inner"
                          placeholder="Qty"
                          title="Order Quantity"
                        />
                      </div>

                      <select
                        value={customProductUnit}
                        onChange={(e) => setCustomProductUnit(e.target.value)}
                        className="px-2.5 py-2.5 rounded-xl border border-orange-300 text-xs font-bold text-slate-800 bg-white focus:outline-none cursor-pointer"
                      >
                        <option value="pcs">pcs</option>
                        <option value="kg">kg</option>
                        <option value="packs">packs</option>
                        <option value="boxes">boxes</option>
                        <option value="cartons">boxes/cartons</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => handleAddCustomItem()}
                        className="px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-extrabold text-xs transition-all flex items-center gap-1 cursor-pointer shrink-0 shadow-xs"
                      >
                        <Plus className="w-4 h-4" /> Add Row
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Active Order Table */}
              {Object.keys(checklist).length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                      Order Products Table ({Object.keys(checklist).length} items)
                    </h3>
                    <button
                      type="button"
                      onClick={() => setChecklist({})}
                      className="text-xs font-bold text-slate-500 hover:text-red-600 transition-colors"
                    >
                      Clear Table
                    </button>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-900 text-white font-bold border-b border-slate-800">
                        <tr>
                          <th className="p-2.5">Product Name</th>
                          <th className="p-2.5 w-28">Category</th>
                          <th className="p-2.5 w-32 text-center">Order Quantity</th>
                          <th className="p-2.5 w-12 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(Object.entries(checklist) as [string, SupplierOrderItem][]).map(([key, item]) => (
                          <tr key={key} className="hover:bg-orange-50/40 transition-colors">
                            <td className="p-2.5 font-bold text-slate-900">
                              <div className="flex items-center gap-2">
                                <span>{item.name}</span>
                                {item.shortcutCode && (
                                  <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-mono font-bold">
                                    #{item.shortcutCode}
                                  </span>
                                )}
                              </div>
                            </td>

                            <td className="p-2.5 text-slate-500">
                              {item.category || 'General'}
                            </td>

                            <td className="p-2.5 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <input
                                  type="number"
                                  min="1"
                                  value={item.orderQuantity}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value, 10) || 1;
                                    setChecklist(prev => ({
                                      ...prev,
                                      [key]: { ...prev[key], orderQuantity: val }
                                    }));
                                  }}
                                  className="w-16 px-2 py-1 text-center border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 bg-white"
                                />
                                <span className="text-[10px] text-slate-500 font-bold">{item.unitType || 'pcs'}</span>
                              </div>
                            </td>

                            <td className="p-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveChecklistItem(key)}
                                className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                                title="Remove item"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Product Checklist Section */}
              <div className="pt-4 border-t border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                  <div>
                    <h3 className="text-sm font-black text-slate-900">Product Checklist</h3>
                    <p className="text-xs text-slate-500">
                      Check the products you wish to order from this supplier
                    </p>
                  </div>

                  {/* Search and Category Filter */}
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        placeholder="Search products or #code..."
                        className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:border-orange-500 focus:ring-1 focus:ring-orange-500 w-48 sm:w-60"
                      />
                    </div>

                    <select
                      value={selectedProductCategory}
                      onChange={(e) => setSelectedProductCategory(e.target.value)}
                      className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs bg-white text-slate-700"
                    >
                      <option value="all">All Categories</option>
                      {categories.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Checklist Table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10">
                      <tr>
                        <th className="p-2.5 w-12 text-center">Select</th>
                        <th className="p-2.5 w-20">Code</th>
                        <th className="p-2.5">Product Name</th>
                        <th className="p-2.5 w-28">Category</th>
                        <th className="p-2.5 w-24 text-right">Current Stock</th>
                        <th className="p-2.5 w-32 text-right">Order Quantity</th>
                        <th className="p-2.5 w-28 text-right">Est. Cost/Unit</th>
                        <th className="p-2.5 w-28 text-right">Est. Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredProducts.map((p) => {
                        const isChecked = Boolean(checklist[p.id]);
                        const checkItem = checklist[p.id];
                        const isLowStock = p.stockQuantity <= (p.minStockLevel || 5);

                        return (
                          <tr
                            key={p.id}
                            className={`transition-colors ${
                              isChecked ? 'bg-orange-50/50' : 'hover:bg-slate-50/80'
                            }`}
                          >
                            <td className="p-2.5 text-center">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleProduct(p)}
                                className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500 cursor-pointer"
                              />
                            </td>

                            <td className="p-2.5 font-mono font-bold text-orange-700">
                              #{p.shortcutCode || '----'}
                            </td>

                            <td className="p-2.5 font-bold text-slate-800">
                              <div className="flex items-center gap-1.5">
                                <span>{p.name}</span>
                                {isLowStock && (
                                  <span className="px-1.5 py-0.2 rounded-md bg-red-100 text-red-700 text-[10px] font-bold">
                                    Low Stock
                                  </span>
                                )}
                              </div>
                            </td>

                            <td className="p-2.5 text-slate-500 truncate max-w-[120px]">
                              {p.category || 'General'}
                            </td>

                            <td className={`p-2.5 text-right font-mono font-bold ${
                              isLowStock ? 'text-red-600' : 'text-slate-700'
                            }`}>
                              {p.stockQuantity} {p.unitType || ''}
                            </td>

                            <td className="p-2.5 text-right">
                              {isChecked ? (
                                <div className="flex items-center justify-end gap-1">
                                  <input
                                    type="number"
                                    min="1"
                                    value={checkItem.orderQuantity}
                                    onChange={(e) => handleUpdateChecklistQty(p.id, parseInt(e.target.value, 10) || 1)}
                                    className="w-16 px-2 py-1 text-right border border-orange-300 rounded-lg text-xs font-mono font-bold focus:outline-hidden bg-white"
                                  />
                                  <span className="text-[10px] text-slate-500">{checkItem.unitType}</span>
                                </div>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>

                            <td className="p-2.5 text-right font-mono">
                              {isChecked ? (
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={checkItem.costPrice}
                                  onChange={(e) => handleUpdateChecklistPrice(p.id, parseFloat(e.target.value) || 0)}
                                  className="w-20 px-2 py-1 text-right border border-orange-300 rounded-lg text-xs font-mono font-bold focus:outline-hidden bg-white"
                                  title="Enter wholesale cost price per unit"
                                />
                              ) : (
                                <span className="text-slate-600">Rs. {Number(p.costPrice || (p.price ? p.price * 0.75 : 0)).toFixed(2)}</span>
                              )}
                            </td>

                            <td className="p-2.5 text-right font-mono font-bold text-slate-800">
                              {isChecked ? `Rs. ${Number(checkItem.estimatedTotal || 0).toFixed(2)}` : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Order Summary & Submit Button */}
              <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4 text-xs">
                  <span>Selected Products: <strong>{Object.keys(checklist).length}</strong></span>
                  <span>Estimated Total Amount: <strong className="text-orange-700 text-sm">Rs. {newOrderTotal.toFixed(2)}</strong></span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setChecklist({});
                      setActiveTab('queue');
                    }}
                    className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-xs cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting || Object.keys(checklist).length === 0}
                    className="px-6 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold text-xs cursor-pointer shadow-md transition-colors"
                  >
                    {isSubmitting ? 'Submitting Order...' : 'Submit Order into Queue'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* 3. DELIVERED ARCHIVE */}
        {activeTab === 'archive' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-900">Delivered Orders Archive</h2>
                <p className="text-xs text-slate-500">History of fulfilled shipments from suppliers</p>
              </div>
            </div>

            {deliveredOrders.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
                <CheckCircle2 className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                <h3 className="text-base font-bold text-slate-800">No Delivered Orders Yet</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Once an order in the active queue is marked as delivered, it will be catalogued here.
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3">Order ID</th>
                      <th className="p-3">Supplier</th>
                      <th className="p-3">Contact</th>
                      <th className="p-3">Items</th>
                      <th className="p-3 text-right">Estimated Total</th>
                      <th className="p-3">Created</th>
                      <th className="p-3">Delivered Date</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {deliveredOrders.map((o) => (
                      <tr key={o.id} className="hover:bg-slate-50">
                        <td className="p-3 font-mono text-slate-500">#{o.id.slice(-6)}</td>
                        <td className="p-3 font-bold text-slate-900">{o.supplierName}</td>
                        <td className="p-3 text-slate-600">{o.contactNumber || '-'}</td>
                        <td className="p-3 text-slate-600">
                          {(o.items || []).length} {(o.items || []).length === 1 ? 'item' : 'items'}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-slate-800">
                          Rs. {Number(o.totalEstimatedAmount || 0).toFixed(2)}
                        </td>
                        <td className="p-3 text-slate-500">
                          {new Date(o.createdAt).toLocaleDateString()}
                        </td>
                        <td className="p-3 text-emerald-700 font-bold">
                          {o.deliveredAt ? new Date(o.deliveredAt).toLocaleDateString() : 'Delivered'}
                        </td>
                        <td className="p-3 text-center">
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                            Delivered
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => setOrderToDelete(o)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            title="Delete archived order"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Delete Order Confirmation Modal */}
      {orderToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4"
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto shadow-inner">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-black text-slate-900">Delete Supplier Order?</h3>
              <p className="text-xs text-slate-500">
                Are you sure you want to permanently delete order <strong className="text-slate-900 font-mono">#{orderToDelete.id.slice(-6)}</strong> for supplier <strong className="text-slate-900">{orderToDelete.supplierName}</strong>?
              </p>
              <div className="bg-slate-50 text-slate-700 p-2.5 rounded-xl border border-slate-200 text-xs font-mono mt-2">
                Items: {orderToDelete.items?.length || 0} • Estimated: Rs. {Number(orderToDelete.totalEstimatedAmount || 0).toFixed(2)}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOrderToDelete(null)}
                className="w-1/2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteOrder}
                className="w-1/2 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs transition-colors cursor-pointer shadow-sm"
              >
                Yes, Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Payment Terms & Method Modal */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-orange-100 text-orange-700 rounded-2xl">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Select Order Payment Terms</h3>
                  <p className="text-xs text-slate-500">Choose Advance Payment or COD</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Order Summary */}
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs space-y-1">
              <div className="flex justify-between font-bold text-slate-800">
                <span>Supplier: {supplierName}</span>
                <span>{Object.keys(checklist).length} Items</span>
              </div>
              <div className="flex justify-between font-mono font-bold text-orange-700 text-sm pt-0.5">
                <span>Est. Order Total:</span>
                <span>Rs. {newOrderTotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Selection Buttons */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-700">Choose Payment Method:</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedPaymentTerms('advance')}
                  className={`p-3 rounded-2xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                    selectedPaymentTerms === 'advance'
                      ? 'bg-orange-50 border-orange-500 text-orange-900 font-extrabold ring-1 ring-orange-500'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <Banknote className="w-4 h-4 text-emerald-600" /> Advance
                  </div>
                  <span className="text-[10px] text-slate-500 font-normal">Pay now (Deducted from store profit)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedPaymentTerms('cod')}
                  className={`p-3 rounded-2xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                    selectedPaymentTerms === 'cod'
                      ? 'bg-orange-50 border-orange-500 text-orange-900 font-extrabold ring-1 ring-orange-500'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <Truck className="w-4 h-4 text-amber-600" /> COD (Cash on Delivery)
                  </div>
                  <span className="text-[10px] text-slate-500 font-normal">Pay when order arrives</span>
                </button>
              </div>

              {selectedPaymentTerms === 'advance' ? (
                <div className="space-y-2 p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl">
                  <label className="block text-xs font-bold text-emerald-900">
                    Advance Payment Amount (Rs.):
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-emerald-700">Rs.</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={advanceAmountInput}
                      onChange={(e) => setAdvanceAmountInput(e.target.value)}
                      className="w-full pl-10 pr-3 py-2 bg-white border border-emerald-300 rounded-xl text-sm font-mono font-bold text-slate-900 focus:outline-none focus:border-emerald-600 shadow-xs"
                    />
                  </div>
                  <p className="text-[11px] text-emerald-800 font-medium pt-0.5">
                    ✔ Notice: This advance payment of <strong>Rs. {parseFloat(advanceAmountInput) || 0}</strong> will be recorded as a Store Expense and automatically deducted from store net profit.
                  </p>
                </div>
              ) : (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 space-y-1">
                  <div className="font-bold flex items-center gap-1 text-amber-900">
                    <Clock className="w-4 h-4 text-amber-600" /> Cash on Delivery (COD)
                  </div>
                  <p className="text-[11px] text-amber-800 font-medium">
                    No payment will be deducted right now. When you click "Delivered" upon receiving the supply, you will enter the COD payment amount to deduct from store profit.
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                className="w-1/2 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPaymentAndQueue}
                disabled={isSubmitting}
                className="w-1/2 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-extrabold text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? 'Adding...' : 'Confirm & Add to Queue'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Delivery Confirmation & Payment Modal */}
      {deliveryModalOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-2xl">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Mark Supply Order Delivered</h3>
                  <p className="text-xs text-slate-500">{deliveryModalOrder.supplierName} (#...{deliveryModalOrder.id.slice(-6)})</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeliveryModalOrder(null)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Order Brief */}
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs space-y-1">
              <div className="flex justify-between text-slate-700">
                <span>Products to Restock:</span>
                <strong className="text-slate-900">{(deliveryModalOrder.items || []).length} items</strong>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>Payment Terms:</span>
                <strong className="text-slate-900 uppercase font-mono">{deliveryModalOrder.paymentTerms || 'cod'}</strong>
              </div>
              {deliveryModalOrder.paymentTerms === 'advance' && (
                <div className="flex justify-between text-emerald-700 font-bold">
                  <span>Advance Paid:</span>
                  <span>Rs. {(deliveryModalOrder.advancePaidAmount || 0).toFixed(2)}</span>
                </div>
              )}
            </div>

            {/* Delivery Payment Inputs */}
            {deliveryModalOrder.paymentTerms === 'cod' ? (
              <div className="space-y-2 p-3.5 bg-amber-50 border border-amber-200 rounded-2xl">
                <label className="block text-xs font-bold text-amber-900">
                  COD Payment Amount Paid to Supplier (Rs.):
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-700">Rs.</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={codAmountInput}
                    onChange={(e) => setCodAmountInput(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 bg-white border border-amber-300 rounded-xl text-sm font-mono font-bold text-slate-900 focus:outline-none focus:border-amber-600 shadow-xs"
                  />
                </div>
                <p className="text-[11px] text-amber-800 font-medium pt-0.5">
                  ✔ Notice: This COD payment of <strong>Rs. {parseFloat(codAmountInput) || 0}</strong> will be recorded as a Store Expense and deducted from store net profit.
                </p>
              </div>
            ) : (
              <div className="space-y-2 p-3.5 bg-blue-50 border border-blue-200 rounded-2xl">
                <label className="block text-xs font-bold text-blue-900">
                  Remaining Balance Paid on Delivery (Rs.):
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-blue-700">Rs.</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={remainingBalanceInput}
                    onChange={(e) => setRemainingBalanceInput(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 bg-white border border-blue-300 rounded-xl text-sm font-mono font-bold text-slate-900 focus:outline-none focus:border-blue-600 shadow-xs"
                  />
                </div>
                <p className="text-[11px] text-blue-800 font-medium pt-0.5">
                  ✔ Advance paid: Rs. {deliveryModalOrder.advancePaidAmount || 0}. Remaining balance of <strong>Rs. {parseFloat(remainingBalanceInput) || 0}</strong> will be recorded as a Store Expense and deducted from store net profit.
                </p>
              </div>
            )}

            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-[11px] text-emerald-900 flex items-center gap-2 font-medium">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Inventory stock will be automatically updated for all {(deliveryModalOrder.items || []).length} products in this order.</span>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeliveryModalOrder(null)}
                className="w-1/2 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeliveryAndRestock}
                disabled={isSubmitting}
                className="w-1/2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-md transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? 'Updating...' : 'Confirm Delivery & Restock'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
