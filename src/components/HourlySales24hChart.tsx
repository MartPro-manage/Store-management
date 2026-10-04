import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  AreaChart,
  Area
} from 'recharts';
import { Sale, ProductReturn, Product } from '../types';
import { 
  Clock, 
  Calendar, 
  TrendingUp, 
  ShoppingBag, 
  CreditCard, 
  Banknote, 
  Sparkles,
  Flame,
  ChevronLeft,
  ChevronRight,
  BarChart2,
  Package
} from 'lucide-react';

interface HourlySales24hChartProps {
  sales?: Sale[];
  returns?: ProductReturn[];
  products?: Product[];
  initialDate?: string; // YYYY-MM-DD
  className?: string;
}

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

// Extract YYYY-MM-DD from Date or string
function getLocalDateStr(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Format hour (0..23) to 12-hour AM/PM label
function formatHour12(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  if (hour > 12) return `${hour - 12} PM`;
  return `${hour} AM`;
}

// Format full hour range label e.g. "02:00 PM - 03:00 PM"
function formatHourRange(hour: number): string {
  const start = formatHour12(hour);
  const nextHour = (hour + 1) % 24;
  const end = formatHour12(nextHour);
  const padStart = String(hour).padStart(2, '0');
  return `${start} - ${end} (${padStart}:00)`;
}

export const HourlySales24hChart: React.FC<HourlySales24hChartProps> = ({
  sales = [],
  returns = [],
  products = [],
  initialDate,
  className = ''
}) => {
  const todayStr = useMemo(() => getLocalDateStr(new Date()), []);
  const [selectedDate, setSelectedDate] = useState<string>(initialDate || todayStr);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [chartType, setChartStyle] = useState<'bar' | 'area'>('bar');

  // Navigate date offset
  const handleDateShift = (offsetDays: number) => {
    const current = new Date(selectedDate);
    if (isNaN(current.getTime())) return;
    current.setDate(current.getDate() + offsetDays);
    setSelectedDate(getLocalDateStr(current));
  };

  // Filter sales for selectedDate
  const filteredSalesForDate = useMemo(() => {
    return (sales || []).filter(s => getLocalDateStr(s.timestamp) === selectedDate);
  }, [sales, selectedDate]);

  // Aggregate 24-Hour data
  const hourlyData = useMemo(() => {
    // Array of 24 hours
    const hours = Array.from({ length: 24 }, (_, i) => {
      return {
        hour: i,
        hourLabel: formatHour12(i),
        hourLabel24: `${String(i).padStart(2, '0')}:00`,
        rangeLabel: formatHourRange(i),
        revenue: 0,
        ordersCount: 0,
        unitsSold: 0,
        cashRevenue: 0,
        onlineRevenue: 0,
        discountAmount: 0,
        productsSoldMap: new Map<string, { name: string; qty: number; revenue: number }>()
      };
    });

    filteredSalesForDate.forEach(sale => {
      const saleDate = new Date(sale.timestamp);
      if (isNaN(saleDate.getTime())) return;
      const hour = saleDate.getHours();
      if (hour < 0 || hour > 23) return;

      const hObj = hours[hour];
      const saleTotal = sale.totalAmount || 0;

      hObj.revenue += saleTotal;
      hObj.ordersCount += 1;
      hObj.discountAmount += (sale.discountAmount || 0);

      if (sale.paymentMethod === 'online') {
        hObj.onlineRevenue += saleTotal;
      } else {
        hObj.cashRevenue += saleTotal;
      }

      (sale.items || []).forEach(item => {
        const qty = item.quantity || 0;
        hObj.unitsSold += qty;

        const prodName = item.name || 'Unnamed Product';
        const itemTotal = (item as any).totalPrice || (item.price * qty) || 0;

        const existing = hObj.productsSoldMap.get(prodName);
        if (existing) {
          existing.qty += qty;
          existing.revenue += itemTotal;
        } else {
          hObj.productsSoldMap.set(prodName, { name: prodName, qty, revenue: itemTotal });
        }
      });
    });

    return hours;
  }, [filteredSalesForDate]);

  // Summary Metrics for the 24h Period
  const daySummary = useMemo(() => {
    let totalRev = 0;
    let totalOrders = 0;
    let totalUnits = 0;
    let peakHourObj = hourlyData[0];
    let busiestHourObj = hourlyData[0];

    hourlyData.forEach(h => {
      totalRev += h.revenue;
      totalOrders += h.ordersCount;
      totalUnits += h.unitsSold;

      if (h.revenue > peakHourObj.revenue) {
        peakHourObj = h;
      }
      if (h.ordersCount > busiestHourObj.ordersCount) {
        busiestHourObj = h;
      }
    });

    return {
      totalRev,
      totalOrders,
      totalUnits,
      peakHourObj,
      busiestHourObj
    };
  }, [hourlyData]);

  // Data for the currently selected hour details card
  const activeHourDetails = useMemo(() => {
    if (selectedHour === null) return null;
    const hData = hourlyData[selectedHour];
    if (!hData) return null;

    const topProds = Array.from(hData.productsSoldMap.values())
      .sort((a: { revenue: number }, b: { revenue: number }) => b.revenue - a.revenue)
      .slice(0, 5);

    return {
      ...hData,
      topProducts: topProds
    };
  }, [hourlyData, selectedHour]);

  // Yesterday date string helper
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return getLocalDateStr(d);
  }, []);

  return (
    <div className={`bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-6 ${className}`}>
      
      {/* Header & Date Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-orange-100 text-orange-700 rounded-2xl">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                <span>24-Hour Sales Analytics</span>
                <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 text-[10px] font-extrabold uppercase">
                  Hourly Graph
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Inspect sales revenue and transaction velocity for every hour of the day
              </p>
            </div>
          </div>
        </div>

        {/* Date Selector Bar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200 text-xs font-bold">
            <button
              type="button"
              onClick={() => setSelectedDate(todayStr)}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                selectedDate === todayStr
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(yesterdayStr)}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                selectedDate === yesterdayStr
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Yesterday
            </button>
          </div>

          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-2xl p-1">
            <button
              type="button"
              onClick={() => handleDateShift(-1)}
              className="p-1.5 rounded-xl hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
              title="Previous Day"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-2 py-1 bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
            />

            <button
              type="button"
              onClick={() => handleDateShift(1)}
              className="p-1.5 rounded-xl hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
              title="Next Day"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Chart Style Toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200 text-xs font-bold">
            <button
              type="button"
              onClick={() => setChartStyle('bar')}
              className={`p-1.5 rounded-xl transition-all cursor-pointer ${
                chartType === 'bar' ? 'bg-white text-orange-600 shadow-xs' : 'text-slate-500'
              }`}
              title="Bar Chart View"
            >
              <BarChart2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setChartStyle('area')}
              className={`p-1.5 rounded-xl transition-all cursor-pointer ${
                chartType === 'area' ? 'bg-white text-orange-600 shadow-xs' : 'text-slate-500'
              }`}
              title="Area Line View"
            >
              <TrendingUp className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards for Selected Date */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200 space-y-1">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Day Sales</div>
          <div className="text-base sm:text-lg font-black font-mono text-slate-900">
            {formatCurrency(daySummary.totalRev)}
          </div>
          <div className="text-[10px] text-slate-500 font-semibold">{daySummary.totalOrders} total transactions</div>
        </div>

        <div className="bg-orange-50/70 rounded-2xl p-3.5 border border-orange-200 space-y-1">
          <div className="text-[11px] font-bold text-orange-800 uppercase tracking-wider flex items-center gap-1">
            <Flame className="w-3.5 h-3.5 text-orange-600" /> Peak Sales Hour
          </div>
          <div className="text-base sm:text-lg font-black font-mono text-orange-900">
            {daySummary.peakHourObj.revenue > 0 ? formatCurrency(daySummary.peakHourObj.revenue) : 'Rs. 0.00'}
          </div>
          <div className="text-[10px] text-orange-700 font-bold">
            {daySummary.peakHourObj.revenue > 0 ? daySummary.peakHourObj.rangeLabel : 'No Sales Yet'}
          </div>
        </div>

        <div className="bg-emerald-50/70 rounded-2xl p-3.5 border border-emerald-200 space-y-1">
          <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
            <ShoppingBag className="w-3.5 h-3.5 text-emerald-600" /> Busiest Hour
          </div>
          <div className="text-base sm:text-lg font-black font-mono text-emerald-900">
            {daySummary.busiestHourObj.ordersCount} Orders
          </div>
          <div className="text-[10px] text-emerald-700 font-bold">
            {daySummary.busiestHourObj.ordersCount > 0 ? daySummary.busiestHourObj.rangeLabel : 'No Sales Yet'}
          </div>
        </div>

        <div className="bg-blue-50/70 rounded-2xl p-3.5 border border-blue-200 space-y-1">
          <div className="text-[11px] font-bold text-blue-800 uppercase tracking-wider flex items-center gap-1">
            <Package className="w-3.5 h-3.5 text-blue-600" /> Items Sold
          </div>
          <div className="text-base sm:text-lg font-black font-mono text-blue-900">
            {daySummary.totalUnits} Units
          </div>
          <div className="text-[10px] text-blue-700 font-semibold">Across 24 Hours</div>
        </div>
      </div>

      {/* Recharts 24-Hour Graph Container */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
          <span>Click any hour bar below to inspect detailed transaction breakdown for that hour:</span>
          {selectedHour !== null && (
            <button
              type="button"
              onClick={() => setSelectedHour(null)}
              className="text-orange-600 hover:text-orange-700 font-bold cursor-pointer underline"
            >
              Clear Hour Selection
            </button>
          )}
        </div>

        <div className="h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'bar' ? (
              <BarChart
                data={hourlyData}
                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                onClick={(e: any) => {
                  if (e && e.activePayload && e.activePayload.length > 0) {
                    const hIndex = e.activePayload[0].payload.hour;
                    setSelectedHour(hIndex);
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="hourLabel"
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickLine={false}
                  interval={1}
                />
                <YAxis
                  tickFormatter={formatCompactCurrency}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length > 0) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-slate-900 text-white p-3 rounded-2xl shadow-xl text-xs space-y-1 border border-slate-800">
                          <div className="font-extrabold text-orange-400">{data.rangeLabel}</div>
                          <div className="font-mono font-bold text-sm text-white">
                            {formatCurrency(data.revenue)}
                          </div>
                          <div className="text-[11px] text-slate-300 flex items-center justify-between gap-3 pt-1 border-t border-slate-800">
                            <span>Orders: <strong>{data.ordersCount}</strong></span>
                            <span>Items: <strong>{data.unitsSold}</strong></span>
                          </div>
                          <div className="text-[10px] text-slate-400 italic">Click bar to view hour details</div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="revenue" radius={[6, 6, 0, 0]} cursor="pointer">
                  {hourlyData.map((entry) => {
                    const isSelected = selectedHour === entry.hour;
                    const isPeak = daySummary.peakHourObj.revenue > 0 && entry.hour === daySummary.peakHourObj.hour;
                    let fill = '#f97316'; // default orange
                    if (isSelected) fill = '#ea580c'; // darker orange
                    else if (isPeak) fill = '#f59e0b'; // amber peak
                    else if (entry.revenue === 0) fill = '#e2e8f0';

                    return <Cell key={`cell-${entry.hour}`} fill={fill} />;
                  })}
                </Bar>
              </BarChart>
            ) : (
              <AreaChart
                data={hourlyData}
                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                onClick={(e: any) => {
                  if (e && e.activePayload && e.activePayload.length > 0) {
                    const hIndex = e.activePayload[0].payload.hour;
                    setSelectedHour(hIndex);
                  }
                }}
              >
                <defs>
                  <linearGradient id="hourlyRevGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="hourLabel" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} interval={1} />
                <YAxis tickFormatter={formatCompactCurrency} tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length > 0) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-slate-900 text-white p-3 rounded-2xl shadow-xl text-xs space-y-1">
                          <div className="font-extrabold text-orange-400">{data.rangeLabel}</div>
                          <div className="font-mono font-bold text-sm text-white">{formatCurrency(data.revenue)}</div>
                          <div className="text-[11px] text-slate-300">Orders: {data.ordersCount} | Items: {data.unitsSold}</div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#ea580c" strokeWidth={3} fillOpacity={1} fill="url(#hourlyRevGradient)" cursor="pointer" />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* Selected Hour Deep Inspection Card */}
      {activeHourDetails ? (
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl p-5 shadow-lg border border-slate-700 space-y-4 animate-in fade-in duration-200">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-orange-500/20 text-orange-400 rounded-2xl border border-orange-500/30">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">
                  Specific Hour Breakdown: {activeHourDetails.rangeLabel}
                </h3>
                <p className="text-xs text-slate-400">
                  Detailed activity and top products sold during this specific hour
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedHour(null)}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold border border-slate-700 cursor-pointer"
            >
              Close Hour Detail
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-800/80 p-3 rounded-2xl border border-slate-700">
              <span className="text-slate-400 block font-medium">Hourly Revenue</span>
              <strong className="text-base font-mono font-bold text-orange-400">
                {formatCurrency(activeHourDetails.revenue)}
              </strong>
            </div>

            <div className="bg-slate-800/80 p-3 rounded-2xl border border-slate-700">
              <span className="text-slate-400 block font-medium">Invoices / Orders</span>
              <strong className="text-base font-mono font-bold text-white">
                {activeHourDetails.ordersCount} orders
              </strong>
            </div>

            <div className="bg-slate-800/80 p-3 rounded-2xl border border-slate-700">
              <span className="text-slate-400 block font-medium">Units Sold</span>
              <strong className="text-base font-mono font-bold text-emerald-400">
                {activeHourDetails.unitsSold} items
              </strong>
            </div>

            <div className="bg-slate-800/80 p-3 rounded-2xl border border-slate-700">
              <span className="text-slate-400 block font-medium">Payment Method Split</span>
              <div className="font-mono text-[11px] mt-0.5 space-y-0.5">
                <div className="text-emerald-300">Cash: Rs. {activeHourDetails.cashRevenue.toFixed(0)}</div>
                <div className="text-blue-300">Online: Rs. {activeHourDetails.onlineRevenue.toFixed(0)}</div>
              </div>
            </div>
          </div>

          {/* Top Products Sold in this Hour */}
          <div className="pt-2">
            <h4 className="text-xs font-bold text-slate-300 mb-2 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-orange-400" /> Top Products Sold in this Hour:
            </h4>

            {activeHourDetails.topProducts.length === 0 ? (
              <div className="text-xs text-slate-400 italic bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
                No sales recorded during this hour.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                {activeHourDetails.topProducts.map((p, idx) => (
                  <div key={idx} className="bg-slate-800/90 p-2.5 rounded-xl border border-slate-700 flex items-center justify-between">
                    <div className="truncate pr-2">
                      <div className="font-bold text-slate-100 truncate">{p.name}</div>
                      <div className="text-[10px] text-slate-400">{p.qty} units sold</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono font-bold text-orange-400">Rs. {p.revenue.toFixed(2)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 text-center text-xs text-slate-500 font-medium">
          💡 Click on any bar in the 24-hour graph above to inspect specific hour sales, order counts, and top items sold!
        </div>
      )}
    </div>
  );
};
