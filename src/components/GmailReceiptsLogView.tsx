import React, { useState, useEffect, useMemo } from 'react';
import { 
  db, 
  collection, 
  doc,
  getDoc,
  query, 
  where, 
  onSnapshot, 
  orderBy 
} from '../lib/firebase';
import { Store, SentReceiptLog, Sale } from '../types';
import { sendDirectEReceipt, getCachedGmailAddress } from '../lib/gmail';
import { 
  Mail, 
  Search, 
  Calendar, 
  Filter, 
  ExternalLink, 
  Copy, 
  Check, 
  RefreshCw, 
  Receipt, 
  CheckCircle2, 
  Clock, 
  DollarSign, 
  Users, 
  Send, 
  Sparkles, 
  ShieldCheck,
  Eye
} from 'lucide-react';

interface GmailReceiptsLogViewProps {
  store: Store;
  onViewReceipt?: (saleId: string, receiptNumber: string) => void;
}

type DateFilterType = 'all' | 'today' | 'yesterday' | 'last_7_days' | 'this_month';

export const GmailReceiptsLogView: React.FC<GmailReceiptsLogViewProps> = ({
  store,
  onViewReceipt
}) => {
  const [logs, setLogs] = useState<SentReceiptLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilterType>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  const curr = store.currencySymbol || 'Rs.';

  // Realtime subscription to sent_receipts collection
  useEffect(() => {
    setLoading(true);
    try {
      // Query receipts for this store, or fallback to all if store.id is 'all'
      let q = query(
        collection(db, 'sent_receipts'),
        orderBy('sentAt', 'desc')
      );

      if (store.id && store.id !== 'all') {
        q = query(
          collection(db, 'sent_receipts'),
          where('storeId', '==', store.id),
          orderBy('sentAt', 'desc')
        );
      }

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const items: SentReceiptLog[] = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as SentReceiptLog));
        
        setLogs(items);
        setLoading(false);
      }, (err) => {
        console.warn('Realtime sent_receipts query fallback:', err);
        // Fallback without orderBy if index is still indexing
        const fallbackQuery = store.id && store.id !== 'all'
          ? query(collection(db, 'sent_receipts'), where('storeId', '==', store.id))
          : collection(db, 'sent_receipts');

        onSnapshot(fallbackQuery, (snapshot) => {
          const items: SentReceiptLog[] = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as SentReceiptLog));
          // Sort client-side
          items.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
          setLogs(items);
          setLoading(false);
        });
      });

      return () => unsubscribe();
    } catch (e) {
      console.error('Failed to setup sent_receipts listener:', e);
      setLoading(false);
    }
  }, [store.id]);

  // Date filtering logic
  const filteredLogs = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const currentYearMonth = now.toISOString().slice(0, 7);

    return logs.filter(log => {
      // Date filter
      const logDate = log.sentAt ? log.sentAt.slice(0, 10) : '';
      if (dateFilter === 'today' && logDate !== todayStr) return false;
      if (dateFilter === 'yesterday' && logDate !== yesterdayStr) return false;
      if (dateFilter === 'last_7_days' && new Date(log.sentAt) < sevenDaysAgo) return false;
      if (dateFilter === 'this_month' && !log.sentAt.startsWith(currentYearMonth)) return false;

      // Text search filter
      if (searchTerm.trim()) {
        const queryLower = searchTerm.toLowerCase();
        const matchesEmail = log.customerEmail?.toLowerCase().includes(queryLower);
        const matchesReceipt = log.receiptNumber?.toLowerCase().includes(queryLower);
        const matchesCashier = log.cashierName?.toLowerCase().includes(queryLower);
        const matchesStore = log.storeName?.toLowerCase().includes(queryLower);
        const matchesItems = log.itemsSummary?.toLowerCase().includes(queryLower);

        if (!matchesEmail && !matchesReceipt && !matchesCashier && !matchesStore && !matchesItems) {
          return false;
        }
      }

      return true;
    });
  }, [logs, dateFilter, searchTerm]);

  // Metrics calculations
  const totalSentCount = filteredLogs.length;
  const totalAmountSum = filteredLogs.reduce((sum, l) => sum + (Number(l.totalAmount) || 0), 0);
  const uniqueEmailsCount = new Set(filteredLogs.map(l => l.customerEmail?.toLowerCase()).filter(Boolean)).size;

  const handleCopyLink = (url?: string, logId?: string) => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    if (logId) {
      setCopiedId(logId);
      setTimeout(() => setCopiedId(null), 2500);
    }
  };

  const handleResendReceipt = async (log: SentReceiptLog) => {
    setResendingId(log.id);
    try {
      let saleToDispatch: Sale | null = null;
      
      // Try to load full original sale document from Firestore
      if (log.saleId) {
        try {
          const saleDocSnap = await getDoc(doc(db, 'sales', log.saleId));
          if (saleDocSnap.exists()) {
            saleToDispatch = { id: saleDocSnap.id, ...saleDocSnap.data() } as Sale;
          }
        } catch (fetchErr) {
          console.warn('Could not fetch full sale for resend:', fetchErr);
        }
      }

      if (!saleToDispatch) {
        saleToDispatch = {
          id: log.saleId || log.receiptNumber,
          storeId: log.storeId,
          storeName: log.storeName,
          counterId: 'main',
          counterName: 'Cash Counter',
          cashierName: log.cashierName || 'Cashier',
          cashierUsername: log.cashierName || 'Cashier',
          items: [],
          totalAmount: log.totalAmount,
          paymentMethod: (log.paymentMethod as any) || 'cash',
          receiptNumber: log.receiptNumber,
          timestamp: log.sentAt
        };
      }

      const res = await sendDirectEReceipt({
        toEmail: log.customerEmail,
        sale: saleToDispatch,
        store
      });

      if (res.success) {
        setActionSuccessMsg(`✅ Full E-Receipt ${log.receiptNumber} successfully re-sent via Gmail to ${log.customerEmail}!`);
        setTimeout(() => setActionSuccessMsg(null), 4000);
      } else {
        setActionSuccessMsg(`⚠️ Notice: ${res.error || 'Failed to resend'}`);
        setTimeout(() => setActionSuccessMsg(null), 4000);
      }
    } catch (e: any) {
      setActionSuccessMsg(`⚠️ Notice: ${e?.message || 'Error resending'}`);
      setTimeout(() => setActionSuccessMsg(null), 4000);
    } finally {
      setResendingId(null);
    }
  };

  const currentConnectedSender = getCachedGmailAddress() || 'supermarketmanage@gmail.com';

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-orange-50 text-orange-700 border border-orange-200 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-orange-600" /> Direct Gmail E-Receipts Audit Log
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-600" /> Active Channel: {currentConnectedSender}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Customer Gmail E-Receipts
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 font-medium max-w-2xl">
            Realtime audit ledger of all digital tax invoices dispatched directly to customer Gmail inboxes. Sent straight through the official Google Gmail API without third-party email relays.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-right">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Dispatch Channel</span>
            <span className="text-xs font-black text-emerald-600 flex items-center justify-end gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Google Gmail API
            </span>
          </div>
        </div>
      </div>

      {/* Action Feedback Banner */}
      {actionSuccessMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl font-bold text-xs sm:text-sm flex items-center gap-2.5 shadow-sm animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {/* Key Metric Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Metric 1 */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total E-Receipts Sent</span>
            <div className="p-2 bg-orange-50 text-orange-600 rounded-xl">
              <Mail className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900">
            {totalSentCount.toLocaleString()}
          </div>
          <p className="text-[11px] text-slate-500">
            Dispatched via <strong className="text-slate-800">{currentConnectedSender}</strong>
          </p>
        </div>

        {/* Metric 2 */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Sales Invoiced</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900">
            {curr} {totalAmountSum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-500">
            Value of orders with digital customer slips
          </p>
        </div>

        {/* Metric 3 */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Unique Customer Gmails</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900">
            {uniqueEmailsCount.toLocaleString()}
          </div>
          <p className="text-[11px] text-slate-500">
            Distinct customers reached via digital email slip
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by customer Gmail, receipt #, cashier, or items..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-orange-500 focus:bg-white transition-all"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600"
              >
                Clear
              </button>
            )}
          </div>

          {/* Quick Date Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {[
              { id: 'all', label: 'All Time' },
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: 'last_7_days', label: 'Last 7 Days' },
              { id: 'this_month', label: 'This Month' }
            ].map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setDateFilter(f.id as DateFilterType)}
                className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  dateFilter === f.id
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Table / List View */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-orange-600" />
            <h3 className="text-sm font-black text-slate-900">
              Dispatched E-Receipts ({filteredLogs.length})
            </h3>
          </div>
          <span className="text-[11px] text-slate-400 font-medium">
            Sender: <strong className="text-slate-700 font-mono">{currentConnectedSender}</strong>
          </span>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-400 space-y-3">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-orange-500" />
            <p className="text-xs font-semibold">Loading sent receipt logs...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-16 text-center space-y-3 px-4">
            <div className="w-14 h-14 bg-orange-50 border border-orange-100 text-orange-500 rounded-3xl flex items-center justify-center mx-auto">
              <Mail className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-800">No E-Receipts Found</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {searchTerm || dateFilter !== 'all'
                ? 'No e-receipts matched your current search filters. Try resetting filters.'
                : `Digital receipts sent to customers from the Cash Counter or Admin will be automatically recorded here. Receipts are sent directly via Gmail (${currentConnectedSender}).`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 text-[11px] font-extrabold uppercase text-slate-600 border-b border-slate-200">
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Receipt #</th>
                  <th className="py-3 px-4">Customer Gmail</th>
                  <th className="py-3 px-4">Total Bill</th>
                  <th className="py-3 px-4">Payment</th>
                  <th className="py-3 px-4">Cashier</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredLogs.map((log) => {
                  const dateStr = log.sentAt ? new Date(log.sentAt).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  }) : 'N/A';

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {dateStr}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">
                          {log.receiptNumber}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 font-bold text-slate-800">
                          <Mail className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                          <span className="truncate max-w-[200px]" title={log.customerEmail}>
                            {log.customerEmail}
                          </span>
                        </div>
                        {log.itemsSummary && (
                          <p className="text-[10px] text-slate-400 truncate max-w-[240px] mt-0.5" title={log.itemsSummary}>
                            {log.itemsSummary}
                          </p>
                        )}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap font-black text-slate-900 font-mono">
                        {log.currencySymbol || curr} {(Number(log.totalAmount) || 0).toFixed(2)}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                          log.paymentMethod === 'online'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}>
                          {log.paymentMethod || 'cash'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-600 font-medium">
                        {log.cashierName || 'Cashier'}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-extrabold text-[10px] border border-emerald-200 flex items-center gap-1 w-max">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Dispatched
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap space-x-1.5">
                        {/* Copy Link Button */}
                        {log.receiptUrl && (
                          <button
                            type="button"
                            onClick={() => handleCopyLink(log.receiptUrl, log.id)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1"
                            title="Copy customer public receipt link"
                          >
                            {copiedId === log.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}

                        {/* Open Public URL */}
                        {log.receiptUrl && (
                          <a
                            href={log.receiptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1"
                            title="Open digital receipt pass in new tab"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}

                        {/* Resend Receipt Button */}
                        <button
                          type="button"
                          disabled={resendingId === log.id}
                          onClick={() => handleResendReceipt(log)}
                          className="px-2.5 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 rounded-lg text-[11px] font-bold transition-all cursor-pointer inline-flex items-center gap-1"
                          title="Resend e-receipt to customer email"
                        >
                          <Send className={`w-3 h-3 ${resendingId === log.id ? 'animate-pulse' : ''}`} />
                          {resendingId === log.id ? 'Sending...' : 'Resend'}
                        </button>
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
  );
};
