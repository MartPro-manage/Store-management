import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Trash2, 
  Edit3, 
  Calendar, 
  CalendarDays, 
  Filter, 
  Search, 
  DollarSign, 
  Tag, 
  CreditCard, 
  Banknote, 
  Download, 
  FileSpreadsheet, 
  ChevronLeft, 
  ChevronRight, 
  Check, 
  X, 
  AlertCircle, 
  ReceiptText, 
  ArrowDownRight,
  TrendingDown,
  Layers,
  Sparkles,
  PieChart as PieChartIcon
} from 'lucide-react';
import { Expense, Store, UserAccount } from '../types';
import { db, collection, addDoc, doc, deleteDoc, updateDoc, cleanFirestoreData } from '../lib/firebase';

export type ExpenseFilterMode = 'all' | 'date' | 'month' | 'year';

interface StoreAdminExpensesProps {
  store: Store;
  currentUser: UserAccount;
  expenses: Expense[];
  initialFilterMode?: ExpenseFilterMode;
  onFilterModeChange?: (mode: ExpenseFilterMode) => void;
}

const EXPENSE_CATEGORIES = [
  'Utilities & Bills',
  'Store Rent',
  'Packaging & Bags',
  'Staff & Wages',
  'Tea & Refreshments',
  'Cleaning & Supplies',
  'Maintenance & Repairs',
  'Generator Fuel',
  'Transportation',
  'Marketing & Signage',
  'General Overhead'
];

const COMMON_EXPENSE_PRESETS = [
  { name: 'Electricity Bill', category: 'Utilities & Bills' },
  { name: 'Store Rent', category: 'Store Rent' },
  { name: 'Plastic Shopping Bags', category: 'Packaging & Bags' },
  { name: 'Staff Daily Tea & Lunch', category: 'Tea & Refreshments' },
  { name: 'Generator Diesel Fuel', category: 'Generator Fuel' },
  { name: 'Cleaning Detergents & Mops', category: 'Cleaning & Supplies' },
  { name: 'Counter Thermal Paper Rolls', category: 'Packaging & Bags' },
  { name: 'Maintenance / AC Repair', category: 'Maintenance & Repairs' }
];

export const StoreAdminExpenses: React.FC<StoreAdminExpensesProps> = ({
  store,
  currentUser,
  expenses,
  initialFilterMode = 'month',
  onFilterModeChange
}) => {
  // Current local date values
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
  const currentDay = String(now.getDate()).padStart(2, '0');
  const todayStr = `${currentYear}-${currentMonth}-${currentDay}`;
  const currentYearMonthStr = `${currentYear}-${currentMonth}`;

  // Filter state
  const [filterMode, setFilterMode] = useState<ExpenseFilterMode>(initialFilterMode);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentYearMonthStr);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Form & modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form input values
  const [expenseName, setExpenseName] = useState('');
  const [expenseAmount, setExpenseAmount] = useState<string>('');
  const [expenseDate, setExpenseDate] = useState(todayStr);
  const [expenseCategory, setExpenseCategory] = useState('Utilities & Bills');
  const [expensePaymentMethod, setExpensePaymentMethod] = useState<'cash' | 'online'>('cash');
  const [expenseNotes, setExpenseNotes] = useState('');

  // Handle filter mode changes
  const handleModeChange = (mode: ExpenseFilterMode) => {
    setFilterMode(mode);
    if (onFilterModeChange) {
      onFilterModeChange(mode);
    }
  };

  // Open Add Modal with fresh or preset values
  const handleOpenAddModal = (presetName?: string, presetCategory?: string) => {
    setEditingExpense(null);
    setExpenseName(presetName || '');
    setExpenseAmount('');
    setExpenseDate(todayStr);
    setExpenseCategory(presetCategory || 'Utilities & Bills');
    setExpensePaymentMethod('cash');
    setExpenseNotes('');
    setErrorMessage(null);
    setIsAddModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (expense: Expense) => {
    setEditingExpense(expense);
    setExpenseName(expense.name);
    setExpenseAmount(String(expense.amount));
    setExpenseDate(expense.date || todayStr);
    setExpenseCategory(expense.category || 'Utilities & Bills');
    setExpensePaymentMethod(expense.paymentMethod || 'cash');
    setExpenseNotes(expense.notes || '');
    setErrorMessage(null);
    setIsAddModalOpen(true);
  };

  // Save Expense (Create or Update)
  const handleSubmitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedName = expenseName.trim();
    if (!trimmedName) {
      setErrorMessage('Please enter an expense name or title.');
      return;
    }

    const parsedAmount = parseFloat(expenseAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrorMessage('Please enter a valid expense pricing/amount greater than 0.');
      return;
    }

    if (!expenseDate) {
      setErrorMessage('Please select a valid date for the expense.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingExpense) {
        // Update existing expense
        const expenseDocRef = doc(db, 'expenses', editingExpense.id);
        const updateData = {
          name: trimmedName,
          amount: parsedAmount,
          category: expenseCategory,
          date: expenseDate,
          paymentMethod: expensePaymentMethod,
          notes: expenseNotes.trim() || undefined
        };
        await updateDoc(expenseDocRef, cleanFirestoreData(updateData));
        setSuccessMessage(`Expense "${trimmedName}" updated successfully.`);
      } else {
        // Create new expense
        const newExpenseData = {
          storeId: store.id,
          name: trimmedName,
          amount: parsedAmount,
          category: expenseCategory,
          date: expenseDate,
          paymentMethod: expensePaymentMethod,
          notes: expenseNotes.trim() || undefined,
          recordedBy: currentUser.name || currentUser.username,
          timestamp: new Date().toISOString()
        };
        await addDoc(collection(db, 'expenses'), cleanFirestoreData(newExpenseData));
        setSuccessMessage(`Expense "${trimmedName}" of Rs. ${parsedAmount.toLocaleString()} logged successfully.`);
      }

      setIsAddModalOpen(false);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      console.error('Error saving expense:', err);
      setErrorMessage(err.message || 'Failed to save expense. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Expense
  const confirmDeleteExpense = async () => {
    if (!expenseToDelete) return;

    setIsSubmitting(true);
    try {
      await deleteDoc(doc(db, 'expenses', expenseToDelete.id));
      setSuccessMessage(`Expense "${expenseToDelete.name}" deleted.`);
      setTimeout(() => setSuccessMessage(null), 3000);
      setExpenseToDelete(null);
    } catch (err: any) {
      console.error('Error deleting expense:', err);
      setErrorMessage('Failed to delete expense: ' + err.message);
      setTimeout(() => setErrorMessage(null), 4000);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered Expenses List based on Mode (Date, Month, Year, All)
  const filteredExpenses = useMemo(() => {
    return expenses.filter(exp => {
      // 1. Mode Filter
      if (filterMode === 'date') {
        if (exp.date !== selectedDate) return false;
      } else if (filterMode === 'month') {
        const expMonth = exp.date ? exp.date.substring(0, 7) : '';
        if (expMonth !== selectedMonth) return false;
      } else if (filterMode === 'year') {
        const expYear = exp.date ? parseInt(exp.date.substring(0, 4), 10) : 0;
        if (expYear !== selectedYear) return false;
      }

      // 2. Category Filter
      if (selectedCategory !== 'all') {
        if (exp.category !== selectedCategory) return false;
      }

      // 3. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = exp.name?.toLowerCase().includes(q);
        const matchesNotes = exp.notes?.toLowerCase().includes(q);
        const matchesCategory = exp.category?.toLowerCase().includes(q);
        const matchesRecorder = exp.recordedBy?.toLowerCase().includes(q);
        const matchesAmount = exp.amount?.toString().includes(q);
        if (!matchesName && !matchesNotes && !matchesCategory && !matchesRecorder && !matchesAmount) {
          return false;
        }
      }

      return true;
    });
  }, [expenses, filterMode, selectedDate, selectedMonth, selectedYear, selectedCategory, searchQuery]);

  // Aggregate Metrics
  const totalFilteredAmount = useMemo(() => {
    return filteredExpenses.reduce((acc, curr) => acc + (curr.amount || 0), 0);
  }, [filteredExpenses]);

  // Today's total expenses
  const todayTotal = useMemo(() => {
    return expenses
      .filter(e => e.date === todayStr)
      .reduce((acc, curr) => acc + (curr.amount || 0), 0);
  }, [expenses, todayStr]);

  // This month's total expenses
  const currentMonthTotal = useMemo(() => {
    return expenses
      .filter(e => e.date && e.date.startsWith(currentYearMonthStr))
      .reduce((acc, curr) => acc + (curr.amount || 0), 0);
  }, [expenses, currentYearMonthStr]);

  // This year's total expenses
  const currentYearTotal = useMemo(() => {
    return expenses
      .filter(e => e.date && e.date.startsWith(String(currentYear)))
      .reduce((acc, curr) => acc + (curr.amount || 0), 0);
  }, [expenses, currentYear]);

  // Cash vs Online Breakdown in filtered set
  const paymentBreakdown = useMemo(() => {
    let cash = 0;
    let online = 0;
    filteredExpenses.forEach(e => {
      if (e.paymentMethod === 'online') {
        online += e.amount || 0;
      } else {
        cash += e.amount || 0;
      }
    });
    return { cash, online };
  }, [filteredExpenses]);

  // Category Distribution in filtered set
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    filteredExpenses.forEach(e => {
      const cat = e.category || 'Other';
      map[cat] = (map[cat] || 0) + (e.amount || 0);
    });
    return Object.entries(map)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredExpenses]);

  // Export Filtered Expenses to CSV
  const handleExportCSV = () => {
    if (filteredExpenses.length === 0) {
      alert('No expense records to export.');
      return;
    }

    const headers = ['Date', 'Expense Name', 'Category', 'Pricing / Amount (PKR)', 'Payment Method', 'Recorded By', 'Notes'];
    const rows = filteredExpenses.map(e => [
      `"${e.date || ''}"`,
      `"${(e.name || '').replace(/"/g, '""')}"`,
      `"${(e.category || '').replace(/"/g, '""')}"`,
      e.amount || 0,
      `"${e.paymentMethod || 'cash'}"`,
      `"${(e.recordedBy || '').replace(/"/g, '""')}"`,
      `"${(e.notes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Expenses_${store.name.replace(/\s+/g, '_')}_${filterMode}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Month options for dropdown (Last 12 months)
  const monthOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    const dateCursor = new Date();
    for (let i = 0; i < 24; i++) {
      const y = dateCursor.getFullYear();
      const m = String(dateCursor.getMonth() + 1).padStart(2, '0');
      const val = `${y}-${m}`;
      const label = dateCursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      options.push({ value: val, label });
      dateCursor.setMonth(dateCursor.getMonth() - 1);
    }
    return options;
  }, []);

  // Year options (Current year and past 3 years)
  const yearOptions = useMemo(() => {
    const list: number[] = [];
    for (let y = currentYear; y >= currentYear - 4; y--) {
      list.push(y);
    }
    return list;
  }, [currentYear]);

  // Formatted active period title
  const activePeriodTitle = useMemo(() => {
    switch (filterMode) {
      case 'date': {
        const [y, m, d] = selectedDate.split('-').map(Number);
        const dt = new Date(y, m - 1, d);
        return selectedDate === todayStr 
          ? `Today (${dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})`
          : dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      }
      case 'month': {
        const [y, m] = selectedMonth.split('-').map(Number);
        const dt = new Date(y, m - 1, 1);
        return dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      }
      case 'year':
        return `Year ${selectedYear}`;
      case 'all':
      default:
        return 'All Time (Complete History)';
    }
  }, [filterMode, selectedDate, selectedMonth, selectedYear, todayStr]);

  return (
    <div className="space-y-6">
      {/* Top Notification Toast */}
      <AnimatePresence>
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between gap-3 shadow-sm"
          >
            <div className="flex items-center gap-2">
              <Check className="w-5 h-5 text-emerald-600 shrink-0" />
              <span className="text-xs sm:text-sm font-bold">{successMessage}</span>
            </div>
            <button
              onClick={() => setSuccessMessage(null)}
              className="p-1 rounded-lg text-emerald-700 hover:bg-emerald-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* EXPENSE KPIS BANNER */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total In Selected Filter */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Filtered Outflow</span>
            <div className="p-2 rounded-xl bg-red-50 text-red-600 border border-red-200">
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-red-600 font-mono">
              Rs. {totalFilteredAmount.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-1 truncate">
              {activePeriodTitle} • {filteredExpenses.length} entries
            </p>
          </div>
        </div>

        {/* Today's Expenses */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Today's Expenses</span>
            <div className="p-2 rounded-xl bg-orange-50 text-orange-600 border border-orange-200">
              <Calendar className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-slate-900 font-mono">
              Rs. {todayTotal.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-1">
              Paid out today ({todayStr})
            </p>
          </div>
        </div>

        {/* This Month's Expenses */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">This Month</span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-200">
              <CalendarDays className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-blue-600 font-mono">
              Rs. {currentMonthTotal.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-1">
              {now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} total
            </p>
          </div>
        </div>

        {/* This Year's Outflows */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Year {currentYear} Total</span>
            <div className="p-2 rounded-xl bg-purple-50 text-purple-600 border border-purple-200">
              <ReceiptText className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-slate-900 font-mono">
              Rs. {currentYearTotal.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-1">
              Annual cumulative operating costs
            </p>
          </div>
        </div>
      </div>

      {/* QUICK PRESETS & LOG ACTION BAR */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <ReceiptText className="w-5 h-5 text-orange-600" /> Log Store Expenses & Pricing
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Record utility bills, store rent, packaging bags, generator diesel, and day-to-day store expenditures.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Download CSV of current filtered expenses"
            >
              <Download className="w-4 h-4 text-slate-600" /> Export CSV
            </button>

            <button
              type="button"
              onClick={() => handleOpenAddModal()}
              className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Add New Expense
            </button>
          </div>
        </div>

        {/* 1-Click Fast Presets */}
        <div className="pt-2 border-t border-slate-100">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
            Quick Fill Common Outflows:
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {COMMON_EXPENSE_PRESETS.map((preset, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleOpenAddModal(preset.name, preset.category)}
                className="px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-orange-50 hover:text-orange-700 hover:border-orange-300 border border-slate-200 text-slate-700 text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3 h-3 text-orange-500" /> {preset.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* FILTER CONTROLS: DATE, MONTH, YEAR */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        {/* Navigation Mode Selector */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-500 mr-2 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" /> Review Period:
            </span>

            {/* By Date Tab */}
            <button
              type="button"
              onClick={() => handleModeChange('date')}
              className={`px-3.5 py-2 rounded-xl font-bold text-xs cursor-pointer transition-all flex items-center gap-1.5 ${
                filterMode === 'date'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" /> Filter by Date
            </button>

            {/* By Month Tab */}
            <button
              type="button"
              onClick={() => handleModeChange('month')}
              className={`px-3.5 py-2 rounded-xl font-bold text-xs cursor-pointer transition-all flex items-center gap-1.5 ${
                filterMode === 'month'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" /> Filter by Month
            </button>

            {/* By Year Tab */}
            <button
              type="button"
              onClick={() => handleModeChange('year')}
              className={`px-3.5 py-2 rounded-xl font-bold text-xs cursor-pointer transition-all flex items-center gap-1.5 ${
                filterMode === 'year'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <ReceiptText className="w-3.5 h-3.5" /> Filter by Year
            </button>

            {/* All Time Tab */}
            <button
              type="button"
              onClick={() => handleModeChange('all')}
              className={`px-3.5 py-2 rounded-xl font-bold text-xs cursor-pointer transition-all flex items-center gap-1.5 ${
                filterMode === 'all'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <Layers className="w-3.5 h-3.5" /> All Time
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">Active Selection:</span>
            <span className="px-3 py-1 rounded-xl bg-orange-50 border border-orange-200 text-orange-800 font-extrabold text-xs">
              {activePeriodTitle}
            </span>
          </div>
        </div>

        {/* Mode Specific Controls & Search */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          {/* Specific Mode Picker */}
          <div className="md:col-span-5">
            {filterMode === 'date' && (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs font-semibold focus:outline-none focus:border-orange-500"
                />
                <button
                  type="button"
                  onClick={() => setSelectedDate(todayStr)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                    selectedDate === todayStr ? 'bg-orange-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const yst = new Date();
                    yst.setDate(yst.getDate() - 1);
                    setSelectedDate(yst.toISOString().slice(0, 10));
                  }}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer transition-colors"
                >
                  Yesterday
                </button>
              </div>
            )}

            {filterMode === 'month' && (
              <div className="flex items-center gap-2">
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs font-bold focus:outline-none focus:border-orange-500"
                >
                  {monthOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setSelectedMonth(currentYearMonthStr)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                >
                  Current Month
                </button>
              </div>
            )}

            {filterMode === 'year' && (
              <div className="flex items-center gap-2">
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs font-bold focus:outline-none focus:border-orange-500"
                >
                  {yearOptions.map(y => (
                    <option key={y} value={y}>
                      Year {y}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setSelectedYear(currentYear)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                >
                  Current Year
                </button>
              </div>
            )}

            {filterMode === 'all' && (
              <p className="text-xs text-slate-500 font-medium italic">
                Showing all lifetime expenses recorded for {store.name}
              </p>
            )}
          </div>

          {/* Category Filter */}
          <div className="md:col-span-3">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs font-medium focus:outline-none focus:border-orange-500"
            >
              <option value="all">All Categories ({EXPENSE_CATEGORIES.length})</option>
              {EXPENSE_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Search Query */}
          <div className="md:col-span-4 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search expense name, notes or amount..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs focus:outline-none focus:border-orange-500 font-medium"
            />
          </div>
        </div>
      </div>

      {/* EXPENSE SUMMARY BAR & CATEGORY INSIGHTS */}
      {filteredExpenses.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Payment Method Breakdown */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Disbursement Mode</span>
              <Banknote className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-medium text-slate-700">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /> Cash from Drawer:
                </span>
                <span className="font-mono font-bold text-slate-900">
                  Rs. {paymentBreakdown.cash.toLocaleString('en-PK', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-medium text-slate-700">
                  <span className="w-2 h-2 rounded-full bg-blue-500" /> Online / Bank:
                </span>
                <span className="font-mono font-bold text-slate-900">
                  Rs. {paymentBreakdown.online.toLocaleString('en-PK', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Top 3 Categories */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs md:col-span-2">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Top Outflow Drivers</span>
              <PieChartIcon className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {categoryBreakdown.slice(0, 3).map((item, idx) => {
                const pct = totalFilteredAmount > 0 ? (item.amount / totalFilteredAmount) * 100 : 0;
                return (
                  <div key={idx} className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                    <span className="font-bold text-slate-800">{item.name}:</span>{' '}
                    <span className="font-mono font-black text-red-600">Rs. {item.amount.toLocaleString()}</span>{' '}
                    <span className="text-[10px] text-slate-400 font-bold">({pct.toFixed(0)}%)</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* EXPENSES LOGGED TABLE */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h4 className="text-base font-black text-slate-900">
              Logged Expenses Records
            </h4>
            <p className="text-xs text-slate-500 font-medium">
              Showing {filteredExpenses.length} entries for {activePeriodTitle}
            </p>
          </div>

          <div className="text-right">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Total Period Cost</span>
            <span className="text-lg sm:text-xl font-black text-red-600 font-mono">
              Rs. {totalFilteredAmount.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {filteredExpenses.length === 0 ? (
          <div className="py-16 px-4 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
              <ReceiptText className="w-6 h-6" />
            </div>
            <h5 className="text-sm font-bold text-slate-700">No Expenses Found</h5>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              No store expenses are logged for {activePeriodTitle} matching your current criteria.
            </p>
            <button
              type="button"
              onClick={() => handleOpenAddModal()}
              className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs inline-flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" /> Log First Expense
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4">Expense Title & Description</th>
                  <th className="py-3.5 px-4">Category</th>
                  <th className="py-3.5 px-4">Mode</th>
                  <th className="py-3.5 px-4 text-right">Pricing / Amount</th>
                  <th className="py-3.5 px-4">Logged By</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredExpenses.map((expense) => (
                  <tr key={expense.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-medium text-slate-600 whitespace-nowrap">
                      {expense.date}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900 text-xs">
                        {expense.name}
                      </div>
                      {expense.notes && (
                        <div className="text-[11px] text-slate-500 font-medium italic mt-0.5">
                          {expense.notes}
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        {expense.category || 'General'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {expense.paymentMethod === 'online' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1 w-max">
                          <CreditCard className="w-3 h-3" /> Online
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 w-max">
                          <Banknote className="w-3 h-3" /> Cash
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <span className="font-mono font-black text-red-600 text-sm">
                        Rs. {expense.amount.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                      {expense.recordedBy || 'Admin'}
                    </td>

                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(expense)}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-orange-100 text-slate-600 hover:text-orange-700 transition-colors cursor-pointer"
                          title="Edit Expense"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setExpenseToDelete(expense)}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-red-100 text-slate-600 hover:text-red-700 transition-colors cursor-pointer"
                          title="Delete Expense"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50/80 border-t-2 border-slate-200 font-bold text-xs">
                  <td colSpan={4} className="py-3.5 px-4 text-slate-700 uppercase tracking-wider">
                    Total Filtered Outflow ({filteredExpenses.length} transactions)
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-black text-red-600 text-base">
                    Rs. {totalFilteredAmount.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ADD / EDIT EXPENSE MODAL */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs"
              onClick={() => setIsAddModalOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full z-10 overflow-hidden relative"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <ReceiptText className="w-5 h-5 text-orange-600" />
                    {editingExpense ? 'Edit Expense Record' : 'Record New Expense'}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Store: {store.name}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Form */}
              <form onSubmit={handleSubmitExpense} className="p-6 space-y-4">
                {errorMessage && (
                  <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {/* Expense Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Expense Title / Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Electricity Bill, Shop Rent, Staff Tea, Generator Diesel"
                    value={expenseName}
                    onChange={(e) => setExpenseName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-xs font-semibold focus:outline-none focus:border-orange-500"
                  />
                </div>

                {/* Pricing / Amount & Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Pricing / Amount (Rs.) <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">
                        Rs.
                      </span>
                      <input
                        type="number"
                        step="any"
                        min="0.01"
                        required
                        placeholder="0.00"
                        value={expenseAmount}
                        onChange={(e) => setExpenseAmount(e.target.value)}
                        className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-xs font-black font-mono focus:outline-none focus:border-orange-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={expenseDate}
                      onChange={(e) => setExpenseDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-xs font-semibold focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                {/* Category & Payment Method */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Category
                    </label>
                    <select
                      value={expenseCategory}
                      onChange={(e) => setExpenseCategory(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-xs font-semibold focus:outline-none focus:border-orange-500 bg-white"
                    >
                      {EXPENSE_CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Payment Mode
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setExpensePaymentMethod('cash')}
                        className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                          expensePaymentMethod === 'cash'
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Banknote className="w-3.5 h-3.5" /> Cash
                      </button>

                      <button
                        type="button"
                        onClick={() => setExpensePaymentMethod('online')}
                        className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                          expensePaymentMethod === 'online'
                            ? 'bg-blue-50 border-blue-500 text-blue-700'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <CreditCard className="w-3.5 h-3.5" /> Online
                      </button>
                    </div>
                  </div>
                </div>

                {/* Optional Notes */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Notes & Reference (Optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Invoice #, vendor name, or specific details..."
                    value={expenseNotes}
                    onChange={(e) => setExpenseNotes(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-xs font-medium focus:outline-none focus:border-orange-500 resize-none"
                  />
                </div>

                {/* Submit & Cancel Buttons */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    disabled={isSubmitting}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <span>Saving...</span>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>{editingExpense ? 'Update Expense' : 'Save Expense'}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
        {/* Delete Expense Confirmation Modal */}
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
                  Are you sure you want to permanently delete the expense <strong className="text-slate-900">"{expenseToDelete.name}"</strong>?
                </p>
                <div className="bg-rose-50 text-rose-800 p-2.5 rounded-xl border border-rose-200 text-xs font-mono font-bold mt-2">
                  Amount: Rs. {Number(expenseToDelete.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setExpenseToDelete(null)}
                  disabled={isSubmitting}
                  className="w-1/2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteExpense}
                  disabled={isSubmitting}
                  className="w-1/2 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs transition-colors cursor-pointer shadow-sm disabled:opacity-50"
                >
                  {isSubmitting ? 'Deleting...' : 'Yes, Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
