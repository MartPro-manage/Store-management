import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import { Sale, ProductReturn, Product } from '../types';
import { HourlySales24hChart } from './HourlySales24hChart';
import { 
  TrendingUp, 
  Calendar, 
  BarChart3, 
  Layers, 
  DollarSign, 
  ArrowUpRight, 
  Sparkles,
  RotateCcw,
  CheckCircle2,
  CalendarDays,
  CreditCard,
  Banknote,
  Clock
} from 'lucide-react';

interface SalesRevenueChartProps {
  sales?: Sale[];
  returns?: ProductReturn[];
  products?: Product[];
  className?: string;
}

type TimeframeMode = 'hourly' | 'daily' | 'weekly';
type DailyRange = '7d' | '14d' | '30d' | 'all';
type WeeklyRange = '4w' | '8w' | '12w' | 'all';
type ChartStyle = 'area' | 'bar';

// Helper to format currency
function formatCurrency(amount: number): string {
  const safe = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  return `Rs. ${safe.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Compact currency formatter for Y-axis (e.g. 5k, 25k, 1M)
function formatCompactCurrency(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(0)}k`;
  return String(val);
}

// Helper to extract YYYY-MM-DD from ISO string or Date
function toLocalDateStr(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Helper to get week start (Monday)
function getMondayOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export const SalesRevenueChart: React.FC<SalesRevenueChartProps> = ({
  sales = [],
  returns = [],
  products = [],
  className = ''
}) => {
  const [timeframe, setTimeframe] = useState<TimeframeMode>('daily');
  const [dailyRange, setDailyRange] = useState<DailyRange>('14d');
  const [weeklyRange, setWeeklyRange] = useState<WeeklyRange>('8w');
  const [chartStyle, setChartStyle] = useState<ChartStyle>('area');
  const [showProfit, setShowProfit] = useState<boolean>(true);

  // Map product cost lookup for accurate cost calculation
  const productCostMap = useMemo(() => {
    const map = new Map<string, number>();
    (products || []).forEach((p) => {
      if (p.id) map.set(p.id, p.costPrice || 0);
      if (p.barcode) map.set(p.barcode, p.costPrice || 0);
    });
    return map;
  }, [products]);

  // Aggregate daily records
  const dailyData = useMemo(() => {
    // 1. Group all sales and returns by YYYY-MM-DD
    const dateMap = new Map<string, {
      grossRevenue: number;
      cashRevenue: number;
      onlineRevenue: number;
      discountAmount: number;
      grossCost: number;
      invoices: number;
      refundAmount: number;
      returnedCost: number;
      unitsSold: number;
      unitsReturned: number;
    }>();

    const getOrCreate = (dateStr: string) => {
      if (!dateMap.has(dateStr)) {
        dateMap.set(dateStr, {
          grossRevenue: 0,
          cashRevenue: 0,
          onlineRevenue: 0,
          discountAmount: 0,
          grossCost: 0,
          invoices: 0,
          refundAmount: 0,
          returnedCost: 0,
          unitsSold: 0,
          unitsReturned: 0
        });
      }
      return dateMap.get(dateStr)!;
    };

    (sales || []).forEach((s) => {
      const dStr = toLocalDateStr(s.timestamp);
      if (!dStr) return;
      const rec = getOrCreate(dStr);
      rec.invoices += 1;
      const total = s.totalAmount || 0;
      rec.grossRevenue += total;
      rec.discountAmount += (s.discountAmount || 0);

      if (s.paymentMethod === 'online') {
        rec.onlineRevenue += total;
      } else {
        rec.cashRevenue += total;
      }

      let cost = 0;
      (s.items || []).forEach((item) => {
        const qty = item.quantity || 0;
        rec.unitsSold += qty;
        let unitCost = 0;
        if (typeof item.costPrice === 'number' && item.costPrice >= 0) {
          unitCost = item.costPrice;
        } else {
          unitCost = (item.productId && productCostMap.get(item.productId)) || 
                     (item.barcode && productCostMap.get(item.barcode)) || 0;
        }
        cost += unitCost * qty;
      });
      rec.grossCost += cost;
    });

    (returns || []).forEach((r) => {
      const dStr = toLocalDateStr(r.timestamp);
      if (!dStr) return;
      const rec = getOrCreate(dStr);
      rec.refundAmount += (r.refundAmount || 0);
      const retQty = r.quantity || 0;
      rec.unitsReturned += retQty;

      const unitCost = (r.productId && productCostMap.get(r.productId)) ||
                       (r.barcode && productCostMap.get(r.barcode)) || 0;
      rec.returnedCost += unitCost * retQty;
    });

    // 2. Determine target dates range
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let daysCount = 14;
    if (dailyRange === '7d') daysCount = 7;
    else if (dailyRange === '14d') daysCount = 14;
    else if (dailyRange === '30d') daysCount = 30;

    const list: Array<{
      date: string;
      label: string;
      fullDateLabel: string;
      grossRevenue: number;
      refundAmount: number;
      netRevenue: number;
      netCost: number;
      netProfit: number;
      profitMargin: number;
      cashRevenue: number;
      onlineRevenue: number;
      invoices: number;
      unitsSold: number;
    }> = [];

    if (dailyRange === 'all') {
      // Collect all dates that exist
      const allDates = Array.from(dateMap.keys()).sort((a, b) => a.localeCompare(b));
      if (allDates.length === 0) {
        // Just show current week empty
        allDates.push(toLocalDateStr(today));
      }

      allDates.forEach((dStr) => {
        const data = dateMap.get(dStr) || {
          grossRevenue: 0,
          cashRevenue: 0,
          onlineRevenue: 0,
          discountAmount: 0,
          grossCost: 0,
          invoices: 0,
          refundAmount: 0,
          returnedCost: 0,
          unitsSold: 0,
          unitsReturned: 0
        };
        const [y, m, d] = dStr.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        const netRevenue = Math.max(0, data.grossRevenue - data.refundAmount);
        const netCost = Math.max(0, data.grossCost - data.returnedCost);
        const netProfit = netRevenue - netCost;
        const profitMargin = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;

        list.push({
          date: dStr,
          label: dateObj.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
          fullDateLabel: dateObj.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
          grossRevenue: Number(data.grossRevenue.toFixed(2)),
          refundAmount: Number(data.refundAmount.toFixed(2)),
          netRevenue: Number(netRevenue.toFixed(2)),
          netCost: Number(netCost.toFixed(2)),
          netProfit: Number(netProfit.toFixed(2)),
          profitMargin: Number(profitMargin.toFixed(1)),
          cashRevenue: Number(data.cashRevenue.toFixed(2)),
          onlineRevenue: Number(data.onlineRevenue.toFixed(2)),
          invoices: data.invoices,
          unitsSold: Math.max(0, data.unitsSold - data.unitsReturned)
        });
      });
    } else {
      // Build consecutive day sequence from (today - (daysCount - 1)) up to today
      for (let i = daysCount - 1; i >= 0; i--) {
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() - i);
        const dStr = toLocalDateStr(targetDate);
        const data = dateMap.get(dStr) || {
          grossRevenue: 0,
          cashRevenue: 0,
          onlineRevenue: 0,
          discountAmount: 0,
          grossCost: 0,
          invoices: 0,
          refundAmount: 0,
          returnedCost: 0,
          unitsSold: 0,
          unitsReturned: 0
        };

        const netRevenue = Math.max(0, data.grossRevenue - data.refundAmount);
        const netCost = Math.max(0, data.grossCost - data.returnedCost);
        const netProfit = netRevenue - netCost;
        const profitMargin = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;

        list.push({
          date: dStr,
          label: targetDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
          fullDateLabel: targetDate.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
          grossRevenue: Number(data.grossRevenue.toFixed(2)),
          refundAmount: Number(data.refundAmount.toFixed(2)),
          netRevenue: Number(netRevenue.toFixed(2)),
          netCost: Number(netCost.toFixed(2)),
          netProfit: Number(netProfit.toFixed(2)),
          profitMargin: Number(profitMargin.toFixed(1)),
          cashRevenue: Number(data.cashRevenue.toFixed(2)),
          onlineRevenue: Number(data.onlineRevenue.toFixed(2)),
          invoices: data.invoices,
          unitsSold: Math.max(0, data.unitsSold - data.unitsReturned)
        });
      }
    }

    return list;
  }, [sales, returns, dailyRange, productCostMap]);

  // Aggregate weekly records
  const weeklyData = useMemo(() => {
    const weekMap = new Map<string, {
      mondayDate: Date;
      grossRevenue: number;
      cashRevenue: number;
      onlineRevenue: number;
      grossCost: number;
      invoices: number;
      refundAmount: number;
      returnedCost: number;
      unitsSold: number;
      unitsReturned: number;
    }>();

    const getOrCreateWeek = (date: Date) => {
      const monday = getMondayOfWeek(date);
      const key = toLocalDateStr(monday);
      if (!weekMap.has(key)) {
        weekMap.set(key, {
          mondayDate: monday,
          grossRevenue: 0,
          cashRevenue: 0,
          onlineRevenue: 0,
          grossCost: 0,
          invoices: 0,
          refundAmount: 0,
          returnedCost: 0,
          unitsSold: 0,
          unitsReturned: 0
        });
      }
      return weekMap.get(key)!;
    };

    (sales || []).forEach((s) => {
      const d = new Date(s.timestamp);
      if (isNaN(d.getTime())) return;
      const rec = getOrCreateWeek(d);
      rec.invoices += 1;
      const total = s.totalAmount || 0;
      rec.grossRevenue += total;
      if (s.paymentMethod === 'online') {
        rec.onlineRevenue += total;
      } else {
        rec.cashRevenue += total;
      }

      let cost = 0;
      (s.items || []).forEach((item) => {
        const qty = item.quantity || 0;
        rec.unitsSold += qty;
        let unitCost = 0;
        if (typeof item.costPrice === 'number' && item.costPrice >= 0) {
          unitCost = item.costPrice;
        } else {
          unitCost = (item.productId && productCostMap.get(item.productId)) || 
                     (item.barcode && productCostMap.get(item.barcode)) || 0;
        }
        cost += unitCost * qty;
      });
      rec.grossCost += cost;
    });

    (returns || []).forEach((r) => {
      const d = new Date(r.timestamp);
      if (isNaN(d.getTime())) return;
      const rec = getOrCreateWeek(d);
      rec.refundAmount += (r.refundAmount || 0);
      const retQty = r.quantity || 0;
      rec.unitsReturned += retQty;

      const unitCost = (r.productId && productCostMap.get(r.productId)) ||
                       (r.barcode && productCostMap.get(r.barcode)) || 0;
      rec.returnedCost += unitCost * retQty;
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentMonday = getMondayOfWeek(today);

    let weeksCount = 8;
    if (weeklyRange === '4w') weeksCount = 4;
    else if (weeklyRange === '8w') weeksCount = 8;
    else if (weeklyRange === '12w') weeksCount = 12;

    const list: Array<{
      weekKey: string;
      label: string;
      fullDateLabel: string;
      grossRevenue: number;
      refundAmount: number;
      netRevenue: number;
      netCost: number;
      netProfit: number;
      profitMargin: number;
      cashRevenue: number;
      onlineRevenue: number;
      invoices: number;
      unitsSold: number;
    }> = [];

    if (weeklyRange === 'all') {
      const allWeekKeys = Array.from(weekMap.keys()).sort((a, b) => a.localeCompare(b));
      if (allWeekKeys.length === 0) {
        allWeekKeys.push(toLocalDateStr(currentMonday));
      }

      allWeekKeys.forEach((key) => {
        const [y, m, d] = key.split('-').map(Number);
        const mon = new Date(y, m - 1, d);
        const sun = new Date(mon);
        sun.setDate(mon.getDate() + 6);

        const data = weekMap.get(key) || {
          mondayDate: mon,
          grossRevenue: 0,
          cashRevenue: 0,
          onlineRevenue: 0,
          grossCost: 0,
          invoices: 0,
          refundAmount: 0,
          returnedCost: 0,
          unitsSold: 0,
          unitsReturned: 0
        };

        const netRevenue = Math.max(0, data.grossRevenue - data.refundAmount);
        const netCost = Math.max(0, data.grossCost - data.returnedCost);
        const netProfit = netRevenue - netCost;
        const profitMargin = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;

        const startMonth = mon.toLocaleDateString('en-US', { month: 'short' });
        const endMonth = sun.toLocaleDateString('en-US', { month: 'short' });
        const rangeLabel = startMonth === endMonth 
          ? `${mon.getDate()} - ${sun.getDate()} ${startMonth}`
          : `${mon.getDate()} ${startMonth} - ${sun.getDate()} ${endMonth}`;

        list.push({
          weekKey: key,
          label: `${mon.getDate()} ${startMonth}`,
          fullDateLabel: `Week: ${rangeLabel} ${sun.getFullYear()}`,
          grossRevenue: Number(data.grossRevenue.toFixed(2)),
          refundAmount: Number(data.refundAmount.toFixed(2)),
          netRevenue: Number(netRevenue.toFixed(2)),
          netCost: Number(netCost.toFixed(2)),
          netProfit: Number(netProfit.toFixed(2)),
          profitMargin: Number(profitMargin.toFixed(1)),
          cashRevenue: Number(data.cashRevenue.toFixed(2)),
          onlineRevenue: Number(data.onlineRevenue.toFixed(2)),
          invoices: data.invoices,
          unitsSold: Math.max(0, data.unitsSold - data.unitsReturned)
        });
      });
    } else {
      for (let i = weeksCount - 1; i >= 0; i--) {
        const targetMon = new Date(currentMonday);
        targetMon.setDate(currentMonday.getDate() - (i * 7));
        const key = toLocalDateStr(targetMon);

        const sun = new Date(targetMon);
        sun.setDate(targetMon.getDate() + 6);

        const data = weekMap.get(key) || {
          mondayDate: targetMon,
          grossRevenue: 0,
          cashRevenue: 0,
          onlineRevenue: 0,
          grossCost: 0,
          invoices: 0,
          refundAmount: 0,
          returnedCost: 0,
          unitsSold: 0,
          unitsReturned: 0
        };

        const netRevenue = Math.max(0, data.grossRevenue - data.refundAmount);
        const netCost = Math.max(0, data.grossCost - data.returnedCost);
        const netProfit = netRevenue - netCost;
        const profitMargin = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;

        const startMonth = targetMon.toLocaleDateString('en-US', { month: 'short' });
        const endMonth = sun.toLocaleDateString('en-US', { month: 'short' });
        const rangeLabel = startMonth === endMonth 
          ? `${targetMon.getDate()} - ${sun.getDate()} ${startMonth}`
          : `${targetMon.getDate()} ${startMonth} - ${sun.getDate()} ${endMonth}`;

        list.push({
          weekKey: key,
          label: `${targetMon.getDate()} ${startMonth}`,
          fullDateLabel: `Week: ${rangeLabel} ${sun.getFullYear()}`,
          grossRevenue: Number(data.grossRevenue.toFixed(2)),
          refundAmount: Number(data.refundAmount.toFixed(2)),
          netRevenue: Number(netRevenue.toFixed(2)),
          netCost: Number(netCost.toFixed(2)),
          netProfit: Number(netProfit.toFixed(2)),
          profitMargin: Number(profitMargin.toFixed(1)),
          cashRevenue: Number(data.cashRevenue.toFixed(2)),
          onlineRevenue: Number(data.onlineRevenue.toFixed(2)),
          invoices: data.invoices,
          unitsSold: Math.max(0, data.unitsSold - data.unitsReturned)
        });
      }
    }

    return list;
  }, [sales, returns, weeklyRange, productCostMap]);

  // Active dataset depending on mode
  const activeData = timeframe === 'daily' ? dailyData : weeklyData;

  // Compute summary stats for the active chart window
  const stats = useMemo(() => {
    let totalNetRevenue = 0;
    let totalGrossRevenue = 0;
    let totalRefunds = 0;
    let totalNetProfit = 0;
    let totalInvoices = 0;
    let peakValue = 0;
    let peakLabel = '';

    activeData.forEach((item) => {
      totalNetRevenue += item.netRevenue;
      totalGrossRevenue += item.grossRevenue;
      totalRefunds += item.refundAmount;
      totalNetProfit += item.netProfit;
      totalInvoices += item.invoices;

      if (item.netRevenue > peakValue) {
        peakValue = item.netRevenue;
        peakLabel = item.fullDateLabel;
      }
    });

    const averageRevenue = activeData.length > 0 ? totalNetRevenue / activeData.length : 0;
    const overallMargin = totalNetRevenue > 0 ? (totalNetProfit / totalNetRevenue) * 100 : 0;

    return {
      totalNetRevenue,
      totalGrossRevenue,
      totalRefunds,
      totalNetProfit,
      totalInvoices,
      averageRevenue,
      overallMargin,
      peakValue,
      peakLabel
    };
  }, [activeData]);

  // Custom high-contrast clean Tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900/95 text-white p-3.5 rounded-xl shadow-2xl border border-slate-700/80 backdrop-blur-md min-w-[220px] text-xs space-y-2">
          <div className="border-b border-slate-800 pb-1.5 flex items-center justify-between">
            <span className="font-bold text-slate-200 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-orange-400" />
              {data.fullDateLabel}
            </span>
          </div>

          <div className="space-y-1.5 pt-0.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />
                Net Revenue:
              </span>
              <span className="font-mono font-bold text-white">
                {formatCurrency(data.netRevenue)}
              </span>
            </div>

            {showProfit && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
                  Net Profit:
                </span>
                <span className={`font-mono font-bold ${data.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {formatCurrency(data.netProfit)}
                  <span className="text-[10px] text-slate-400 font-normal ml-1">
                    ({data.profitMargin}%)
                  </span>
                </span>
              </div>
            )}

            {data.refundAmount > 0 && (
              <div className="flex items-center justify-between text-[11px] text-rose-300">
                <span>Customer Refunds:</span>
                <span className="font-mono">-{formatCurrency(data.refundAmount)}</span>
              </div>
            )}

            <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-slate-400 text-[11px]">
              <span>Invoices: <strong className="text-white">{data.invoices}</strong></span>
              <span>Units: <strong className="text-white">{data.unitsSold}</strong></span>
            </div>

            {(data.cashRevenue > 0 || data.onlineRevenue > 0) && (
              <div className="text-[10px] text-slate-400 pt-1 flex items-center justify-between font-mono">
                <span>Cash: Rs. {data.cashRevenue.toFixed(0)}</span>
                <span>Online: Rs. {data.onlineRevenue.toFixed(0)}</span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className={`bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-6 ${className}`}>
      
      {/* Header with Title & Interactive Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-orange-50 text-orange-700 border border-orange-200 flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-orange-600" /> Revenue Analytics
            </span>
            <span className="text-xs font-semibold text-slate-500">
              Interactive Recharts Visualization
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-1 flex items-center gap-2">
            <span>Sales & Revenue Trends</span>
            <span className="text-xs font-bold text-orange-600 bg-orange-100/60 px-2 py-0.5 rounded-lg">
              {timeframe === 'hourly' ? '24h Hourly View' : timeframe === 'daily' ? 'Daily View' : 'Weekly Aggregations'}
            </span>
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Analyze revenue flow, customer refund impacts, and hourly transaction speed over time.
          </p>
        </div>

        {/* Controls Toolbar */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          
          {/* Hourly vs Daily vs Weekly Toggle */}
          <div className="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200 shadow-2xs">
            <button
              type="button"
              onClick={() => setTimeframe('hourly')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                timeframe === 'hourly'
                  ? 'bg-white text-orange-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock className="w-3.5 h-3.5" /> 24h Hourly
            </button>
            <button
              type="button"
              onClick={() => setTimeframe('daily')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                timeframe === 'daily'
                  ? 'bg-white text-orange-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" /> Daily
            </button>
            <button
              type="button"
              onClick={() => setTimeframe('weekly')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                timeframe === 'weekly'
                  ? 'bg-white text-orange-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" /> Weekly
            </button>
          </div>

          {/* Time Range Selector */}
          {timeframe === 'daily' ? (
            <div className="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200 shadow-2xs">
              {(['7d', '14d', '30d', 'all'] as DailyRange[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setDailyRange(r)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    dailyRange === r
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {r === '7d' ? '7 Days' : r === '14d' ? '14 Days' : r === '30d' ? '30 Days' : 'All'}
                </button>
              ))}
            </div>
          ) : (
            <div className="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200 shadow-2xs">
              {(['4w', '8w', '12w', 'all'] as WeeklyRange[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setWeeklyRange(r)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    weeklyRange === r
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {r === '4w' ? '4 Wks' : r === '8w' ? '8 Wks' : r === '12w' ? '12 Wks' : 'All'}
                </button>
              ))}
            </div>
          )}

          {/* Chart Style Toggle (Area vs Bar) */}
          <div className="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200 shadow-2xs">
            <button
              type="button"
              onClick={() => setChartStyle('area')}
              title="Smooth Area Chart"
              className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                chartStyle === 'area' ? 'bg-white text-orange-600 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setChartStyle('bar')}
              title="Bar Chart"
              className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                chartStyle === 'bar' ? 'bg-white text-orange-600 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Show Profit Toggle */}
          <button
            type="button"
            onClick={() => setShowProfit(!showProfit)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              showProfit 
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300' 
                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${showProfit ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            Profit Overlay
          </button>
        </div>
      </div>

      {/* Conditional 24h Hourly Graph vs Daily/Weekly Charts */}
      {timeframe === 'hourly' ? (
        <HourlySales24hChart sales={sales} returns={returns} products={products} />
      ) : (
        <>
          {/* KPI Performance Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/80">
        
        {/* Total Window Revenue */}
        <div className="space-y-0.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {timeframe === 'daily' ? 'Period Net Revenue' : 'Weekly Net Total'}
          </span>
          <div className="font-mono font-black text-base sm:text-lg text-orange-600">
            {formatCurrency(stats.totalNetRevenue)}
          </div>
          <div className="text-[11px] text-slate-500">
            Gross: Rs. {stats.totalGrossRevenue.toFixed(0)} {stats.totalRefunds > 0 ? `(-Rs. ${stats.totalRefunds.toFixed(0)})` : ''}
          </div>
        </div>

        {/* Realized Profit */}
        <div className="space-y-0.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Period Net Profit
          </span>
          <div className={`font-mono font-black text-base sm:text-lg ${stats.totalNetProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {formatCurrency(stats.totalNetProfit)}
          </div>
          <div className="text-[11px] font-bold text-emerald-700">
            {stats.overallMargin.toFixed(1)}% margin
          </div>
        </div>

        {/* Average per unit */}
        <div className="space-y-0.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {timeframe === 'daily' ? 'Average Daily Revenue' : 'Average Weekly Revenue'}
          </span>
          <div className="font-mono font-black text-base sm:text-lg text-slate-800">
            {formatCurrency(stats.averageRevenue)}
          </div>
          <div className="text-[11px] text-slate-500 font-medium">
            Across {activeData.length} {timeframe === 'daily' ? 'days' : 'weeks'}
          </div>
        </div>

        {/* Peak Performance */}
        <div className="space-y-0.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-500" /> Peak {timeframe === 'daily' ? 'Day' : 'Week'}
          </span>
          <div className="font-mono font-black text-base sm:text-lg text-amber-600 truncate">
            {stats.peakValue > 0 ? formatCurrency(stats.peakValue) : 'Rs. 0'}
          </div>
          <div className="text-[11px] text-slate-500 truncate" title={stats.peakLabel}>
            {stats.peakLabel || 'No sales recorded'}
          </div>
        </div>

      </div>

      {/* Main Recharts Container */}
      <div className="w-full h-[320px] sm:h-[350px]">
        {activeData.every(d => d.grossRevenue === 0 && d.refundAmount === 0) ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
            <Calendar className="w-8 h-8 text-slate-400 mb-2" />
            <p className="text-sm font-bold text-slate-700">No Sales Recorded In This Time Window</p>
            <p className="text-xs text-slate-500 max-w-sm mt-0.5">
              As cashiers complete orders at the POS cash counter, daily and weekly revenue curves will plot automatically here.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {chartStyle === 'area' ? (
              <AreaChart data={activeData as any[]} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  {/* Revenue Gradient */}
                  <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ea580c" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#ea580c" stopOpacity={0.0} />
                  </linearGradient>
                  {/* Profit Gradient */}
                  <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                
                <XAxis 
                  dataKey="label" 
                  tickLine={false} 
                  axisLine={{ stroke: '#cbd5e1' }}
                  tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                  dy={6}
                />
                
                <YAxis 
                  tickLine={false} 
                  axisLine={false}
                  tickFormatter={formatCompactCurrency}
                  tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                  dx={-4}
                />

                <Tooltip content={<CustomTooltip />} />
                
                <Legend 
                  verticalAlign="top" 
                  align="right"
                  wrapperStyle={{ paddingBottom: '8px', fontSize: '12px', fontWeight: 'bold' }}
                />

                {/* Net Revenue Area */}
                <Area 
                  name="Net Revenue" 
                  type="monotone" 
                  dataKey="netRevenue" 
                  stroke="#ea580c" 
                  strokeWidth={2.5}
                  fillOpacity={1} 
                  fill="url(#revenueGradient)" 
                  activeDot={{ r: 6, fill: '#ea580c', stroke: '#fff', strokeWidth: 2 }}
                />

                {/* Net Profit Area (optional overlay) */}
                {showProfit && (
                  <Area 
                    name="Net Profit" 
                    type="monotone" 
                    dataKey="netProfit" 
                    stroke="#10b981" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#profitGradient)" 
                    activeDot={{ r: 5, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
                  />
                )}
              </AreaChart>
            ) : (
              <BarChart data={activeData as any[]} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                
                <XAxis 
                  dataKey="label" 
                  tickLine={false} 
                  axisLine={{ stroke: '#cbd5e1' }}
                  tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                  dy={6}
                />
                
                <YAxis 
                  tickLine={false} 
                  axisLine={false}
                  tickFormatter={formatCompactCurrency}
                  tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                  dx={-4}
                />

                <Tooltip content={<CustomTooltip />} />
                
                <Legend 
                  verticalAlign="top" 
                  align="right"
                  wrapperStyle={{ paddingBottom: '8px', fontSize: '12px', fontWeight: 'bold' }}
                />

                <Bar 
                  name="Net Revenue" 
                  dataKey="netRevenue" 
                  fill="#ea580c" 
                  radius={[6, 6, 0, 0]} 
                  maxBarSize={48}
                />

                {showProfit && (
                  <Bar 
                    name="Net Profit" 
                    dataKey="netProfit" 
                    fill="#10b981" 
                    radius={[6, 6, 0, 0]} 
                    maxBarSize={48}
                  />
                )}
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </div>

      {/* Footer Insight Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 pt-2 border-t border-slate-100">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500" /> Net Revenue (Gross Sales - Return Refunds)
          </span>
          {showProfit && (
            <span className="flex items-center gap-1.5 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Net Realized Profit (Revenue - Wholesale COGS)
            </span>
          )}
        </div>
        <span className="text-[11px] font-mono text-slate-400">
          Auto-updates via Cloud Firestore
        </span>
      </div>
        </>
      )}

    </div>
  );
};
