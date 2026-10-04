import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Trash2, 
  Receipt, 
  Calendar, 
  DollarSign, 
  Search, 
  TrendingDown, 
  Tag, 
  Filter, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  ArrowUpDown,
  CreditCard,
  Banknote,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  db, 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  handleFirestoreError, 
  OperationType 
} from '../lib/firebase';
import { Store, UserAccount, Expense } from '../types';

interface StoreExpensesViewProps {
  store: Store;
  currentUser: UserAccount;
  onExpensesChanged?: (expenses: Expense[]) => void;
}

const PRESET_EXPENSE_CATEGORIES = [
  'Utilities (Electricity, Water, Gas)',
  'Rent & Lease',
  'Staff Salaries & Wages',
  'Store Supplies & Packaging',
  'Maintenance & Repairs',
  'Transport & Logistics',
  'Tea & Refreshments',
  'Taxes & Government Fees',
  'Marketing & Advertising',
  'Miscellaneous'
];

export const StoreExpensesView: React.FC<StoreExpensesViewProps> = ({
  store,
  currentUser,
  onExpensesChanged
}) => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const [isMonthlyDeleteModalOpen, setIsMonthlyDeleteModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  
  // Date range filters: 'today' | 'this_month' | 'this_year' | 'all' | 'custom'
  const [timeFilter, setTimeFilter] = useState<'today' | 'this_month' | 'this_year' | 'all' | 'custom'>('this_month');
  const [customStartDate, setCustomStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [customEndDate, setCustomEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Form State for new expense
  const [expenseName, setExpenseName] = useState('');
  const [expenseAmount, setExpenseAmount] = useState<string>('');
  const [expenseCategory, setExpenseCategory] = useState(PRESET_EXPENSE_CATEGORIES[0]);
  const [customCategoryInput, setCustomCategoryInput] = useState('');
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'online'>('cash');
  const [expenseNotes, setExpenseNotes] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const curr = store?.currencySymbol || 'Rs.';

  // Subscribe to real-time expenses for this store
  useEffect(() => {
    if (!store?.id) return;

    const q = query(
      collection(db, 'expenses'),
      where('storeId', '==', store.id)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Expense[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Expense);
      });
      // Sort newest first
      list.sort((a, b) => new Date(b.date || b.timestamp).getTime() - new Date(a.date || a.timestamp).getTime());
      setExpenses(list);
      if (onExpensesChanged) {
        onExpensesChanged(list);
      }
    }, (err) => {
      console.error('Error fetching expenses:', err);
      handleFirestoreError(err, OperationType.GET, 'expenses');
    });

    return () => unsubscribe();
  }, [store?.id]);

  const showNotification = (type: 'success' | 'error', text: string) => {
    setFeedbackMsg({ type, text });
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  // Filtered expenses based on time filter, category, and search query
  const filteredExpenses = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const currentMonthStr = todayStr.substring(0, 7); // YYYY-MM
    const currentYearStr = todayStr.substring(0, 4); // YYYY

    return expenses.filter(exp => {
      const expDate = exp.date || exp.timestamp.split('T')[0];

      // Time filtering
      if (timeFilter === 'today' && expDate !== todayStr) return false;
      if (timeFilter === 'this_month' && !expDate.startsWith(currentMonthStr)) return false;
      if (timeFilter === 'this_year' && !expDate.startsWith(currentYearStr)) return false;
      if (timeFilter === 'custom') {
        if (customStartDate && expDate < customStartDate) return false;
        if (customEndDate && expDate > customEndDate) return false;
      }

      // Category filtering
      if (selectedCategory !== 'all' && exp.category !== selectedCategory) {
        return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const queryStr = searchTerm.toLowerCase();
        const matchesName = exp.name?.toLowerCase().includes(queryStr);
        const matchesNotes = exp.notes?.toLowerCase().includes(queryStr);
        const matchesCategory = exp.category?.toLowerCase().includes(queryStr);
        const matchesRecorder = exp.recordedBy?.toLowerCase().includes(queryStr);
        if (!matchesName && !matchesNotes && !matchesCategory && !matchesRecorder) {
          return false;
        }
      }

      return true;
    });
  }, [expenses, timeFilter, selectedCategory, searchTerm, customStartDate, customEndDate]);

  // Aggregate Total for current view
  const totalExpenseAmount = useMemo(() => {
    return filteredExpenses.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);
  }, [filteredExpenses]);

  // Handle Add Expense Submit
  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseName.trim()) {
      showNotification('error', 'Please enter an expense title/name.');
      return;
    }

    const amountNum = parseFloat(expenseAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      showNotification('error', 'Please enter a valid expense amount.');
      return;
    }

    const categoryToSave = expenseCategory === '__custom__' 
      ? (customCategoryInput.trim() || 'Miscellaneous') 
      : expenseCategory;

    setLoading(true);
    try {
      const newExpense: Omit<Expense, 'id'> = {
        storeId: store.id,
        name: expenseName.trim(),
        amount: amountNum,
        category: categoryToSave,
        notes: expenseNotes.trim(),
        date: expenseDate || new Date().toISOString().split('T')[0],
        paymentMethod,
        timestamp: new Date().toISOString(),
        recordedBy: currentUser.name || currentUser.username || 'Admin'
      };

      await addDoc(collection(db, 'expenses'), newExpense);

      showNotification('success', `Expense of ${curr} ${amountNum.toFixed(2)} recorded successfully!`);
      // Reset form
      setExpenseName('');
      setExpenseAmount('');
      setExpenseNotes('');
      setCustomCategoryInput('');
      setExpenseDate(new Date().toISOString().split('T')[0]);
      setIsAddModalOpen(false);
    } catch (err: any) {
      console.error('Error saving expense:', err);
      handleFirestoreError(err, OperationType.CREATE, 'expenses');
      showNotification('error', 'Failed to save expense: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  // Handle Delete Single Expense
  const confirmDeleteSingleExpense = async () => {
    if (!expenseToDelete) return;

    setLoading(true);
    try {
      await deleteDoc(doc(db, 'expenses', expenseToDelete.id));
      showNotification('success', `Expense "${expenseToDelete.name}" deleted.`);
      setExpenseToDelete(null);
    } catch (err: any) {
      console.error('Error deleting expense:', err);
      handleFirestoreError(err, OperationType.DELETE, `expenses/${expenseToDelete.id}`);
      showNotification('error', 'Failed to delete expense: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle Delete Monthly Expenses
  const confirmDeleteMonthlyExpenses = async () => {
    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthlyExpenses = expenses.filter(exp => {
      const expDate = exp.date || exp.timestamp.split('T')[0];
      return expDate.startsWith(currentMonthStr);
    });

    if (monthlyExpenses.length === 0) {
      showNotification('error', 'No expenses found for this month to delete.');
      setIsMonthlyDeleteModalOpen(false);
      return;
    }

    setLoading(true);
    try {
      for (const exp of monthlyExpenses) {
        await deleteDoc(doc(db, 'expenses', exp.id));
      }
      showNotification('success', `Successfully deleted ${monthlyExpenses.length} monthly expenses.`);
      setIsMonthlyDeleteModalOpen(false);
    } catch (err: any) {
      console.error('Error deleting monthly expenses:', err);
      showNotification('error', 'Failed to delete monthly expenses: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl border border-rose-200">
              <TrendingDown className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900">Store Expense Management</h3>
              <p className="text-xs text-slate-500 font-medium">
                Track operational costs, supplies, utilities, and wages to calculate accurate net profit
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsMonthlyDeleteModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer shrink-0"
            title="Delete all expense records for the current month"
          >
            <Trash2 className="w-4 h-4" /> Delete Monthly Expenses
          </button>

          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" /> Add New Expense
          </button>
        </div>
      </div>

      {/* Notification banner */}
      {feedbackMsg && (
        <div className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 ${
          feedbackMsg.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
            : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>
          {feedbackMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Filtered Expenses</span>
            <div className="p-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-200">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-2xl sm:text-3xl font-extrabold text-rose-600 font-mono">
            {curr} {totalExpenseAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium capitalize">
            Period: {timeFilter.replace('_', ' ')} ({filteredExpenses.length} entries)
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">All-Time Recorded</span>
            <div className="p-2 rounded-xl bg-slate-50 text-slate-700 border border-slate-200">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-2xl sm:text-3xl font-extrabold text-slate-900 font-mono">
            {curr} {expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">
            Total of {expenses.length} store expense records
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Average Expense</span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-2xl sm:text-3xl font-extrabold text-amber-600 font-mono">
            {curr} {filteredExpenses.length > 0 ? (totalExpenseAmount / filteredExpenses.length).toFixed(2) : '0.00'}
          </div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">
            Per transaction in filtered scope
          </p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          
          {/* Time Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setTimeFilter('today')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                timeFilter === 'today'
                  ? 'bg-rose-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setTimeFilter('this_month')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                timeFilter === 'this_month'
                  ? 'bg-rose-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              This Month
            </button>
            <button
              type="button"
              onClick={() => setTimeFilter('this_year')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                timeFilter === 'this_year'
                  ? 'bg-rose-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              This Year
            </button>
            <button
              type="button"
              onClick={() => setTimeFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                timeFilter === 'all'
                  ? 'bg-rose-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Time
            </button>
            <button
              type="button"
              onClick={() => setTimeFilter('custom')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                timeFilter === 'custom'
                  ? 'bg-rose-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Custom Range
            </button>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[220px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search expenses..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-orange-500 font-medium"
            />
          </div>
        </div>

        {/* Custom Range Inputs if selected */}
        {timeFilter === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-xs">
            <span className="font-bold text-slate-600">From:</span>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-medium"
            />
            <span className="font-bold text-slate-600">To:</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-medium"
            />
          </div>
        )}
      </div>

      {/* Expenses Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Expenses List ({filteredExpenses.length})
          </span>
          <span className="text-xs font-mono font-extrabold text-rose-600">
            Total: {curr} {totalExpenseAmount.toFixed(2)}
          </span>
        </div>

        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Expense Title</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Payment</th>
                <th className="py-3 px-4 text-right">Amount ({curr})</th>
                <th className="py-3 px-4">Recorded By</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 font-medium">
                    No expenses found for this time period.
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-slate-600 whitespace-nowrap">
                      {exp.date || exp.timestamp.split('T')[0]}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{exp.name}</div>
                      {exp.notes && (
                        <div className="text-[11px] text-slate-500 font-normal mt-0.5">{exp.notes}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold text-[10px] border border-slate-200">
                        {exp.category || 'General'}
                      </span>
                    </td>
                    <td className="py-3 px-4 uppercase font-bold text-[10px] text-slate-500 whitespace-nowrap">
                      {exp.paymentMethod || 'cash'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-extrabold text-rose-600 text-sm whitespace-nowrap">
                      {curr} {Number(exp.amount).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-medium whitespace-nowrap">
                      {exp.recordedBy || 'Admin'}
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setExpenseToDelete(exp)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Delete expense"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add New Expense Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-rose-50 text-rose-600 rounded-xl border border-rose-200">
                    <TrendingDown className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-sm">Add Store Expense</h4>
                    <p className="text-[11px] text-slate-500">Record a new cost or operational expenditure</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleCreateExpense} className="space-y-3.5 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Expense Title / Description *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Electricity Bill, Shop Cleaning, Packaging Rolls..."
                    value={expenseName}
                    onChange={(e) => setExpenseName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-orange-500 font-medium"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Amount ({curr}) *
                    </label>
                    <input
                      type="number"
                      step="any"
                      required
                      min="0.01"
                      placeholder="0.00"
                      value={expenseAmount}
                      onChange={(e) => setExpenseAmount(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono font-bold focus:outline-none focus:border-orange-500"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={expenseDate}
                      onChange={(e) => setExpenseDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono font-medium focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Category
                  </label>
                  <select
                    value={expenseCategory}
                    onChange={(e) => setExpenseCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-medium focus:outline-none focus:border-orange-500"
                  >
                    {PRESET_EXPENSE_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    <option value="__custom__">+ Custom Category...</option>
                  </select>

                  {expenseCategory === '__custom__' && (
                    <input
                      type="text"
                      placeholder="Enter custom category name..."
                      value={customCategoryInput}
                      onChange={(e) => setCustomCategoryInput(e.target.value)}
                      className="w-full mt-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-orange-500"
                    />
                  )}
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Payment Method
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('cash')}
                      className={`py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                        paymentMethod === 'cash'
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <Banknote className="w-4 h-4" /> Cash
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('online')}
                      className={`py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                        paymentMethod === 'online'
                          ? 'bg-blue-50 border-blue-300 text-blue-700'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <CreditCard className="w-4 h-4" /> Online / Bank
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Notes / Remarks (Optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Invoice #, vendor name, or additional remarks..."
                    value={expenseNotes}
                    onChange={(e) => setExpenseNotes(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-orange-500 font-medium"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {loading ? 'Saving...' : 'Save Expense'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
        {/* Single Expense Delete Confirmation Modal */}
        {expenseToDelete && (
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
                <h3 className="text-base font-black text-slate-900">Delete Expense?</h3>
                <p className="text-xs text-slate-500">
                  Are you sure you want to permanently delete expense <strong className="text-slate-900">"{expenseToDelete.name}"</strong>?
                </p>
                <div className="bg-rose-50 text-rose-800 p-2.5 rounded-xl border border-rose-200 text-xs font-mono font-bold mt-2">
                  Amount: {curr} {Number(expenseToDelete.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setExpenseToDelete(null)}
                  disabled={loading}
                  className="w-1/2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteSingleExpense}
                  disabled={loading}
                  className="w-1/2 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs transition-colors cursor-pointer shadow-sm disabled:opacity-50"
                >
                  {loading ? 'Deleting...' : 'Yes, Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Delete Monthly Expenses Confirmation Modal */}
        {isMonthlyDeleteModalOpen && (
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
                <h3 className="text-base font-black text-slate-900">Delete Current Month's Expenses?</h3>
                <p className="text-xs text-slate-500">
                  Are you sure you want to permanently delete all expense records for the current active month? This action cannot be undone.
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsMonthlyDeleteModalOpen(false)}
                  disabled={loading}
                  className="w-1/2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteMonthlyExpenses}
                  disabled={loading}
                  className="w-1/2 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs transition-colors cursor-pointer shadow-sm disabled:opacity-50"
                >
                  {loading ? 'Deleting All...' : 'Confirm Delete All'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
