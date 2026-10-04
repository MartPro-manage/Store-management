import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import { Sale } from '../types';
import { TrendingUp, ShoppingBag, Calendar, ArrowUpRight } from 'lucide-react';

interface SevenDaySalesVolumeChartProps {
  sales?: Sale[];
  className?: string;
}

export const SevenDaySalesVolumeChart: React.FC<SevenDaySalesVolumeChartProps> = ({
  sales = [],
  className = ''
}) => {
  // Generate the last 7 calendar days data (including today)
  const chartData = useMemo(() => {
    const days: { dateStr: string; label: string; dayName: string; unitsSold: number; totalRevenue: number; ordersCount: number }[] = [];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${day}`;
      
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      const monthDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const label = `${dayName} (${monthDay})`;

      days.push({
        dateStr,
        label,
        dayName,
        unitsSold: 0,
        totalRevenue: 0,
        ordersCount: 0
      });
    }

    const dayMap = new Map<string, typeof days[0]>();
    days.forEach((item) => dayMap.set(item.dateStr, item));

    // Aggregate sales into the days
    (sales || []).forEach((sale) => {
      if (!sale.timestamp) return;
      const saleDate = new Date(sale.timestamp);
      if (isNaN(saleDate.getTime())) return;
      const y = saleDate.getFullYear();
      const m = String(saleDate.getMonth() + 1).padStart(2, '0');
      const day = String(saleDate.getDate()).padStart(2, '0');
      const dateKey = `${y}-${m}-${day}`;

      const entry = dayMap.get(dateKey);
      if (entry) {
        entry.ordersCount += 1;
        entry.totalRevenue += (sale.totalAmount || 0);
        const units = (sale.items || []).reduce((acc, it) => acc + (it.quantity || 0), 0);
        entry.unitsSold += units;
      }
    });

    return days;
  }, [sales]);

  // Summary statistics
  const stats = useMemo(() => {
    const totalUnits = chartData.reduce((acc, d) => acc + d.unitsSold, 0);
    const totalRevenue = chartData.reduce((acc, d) => acc + d.totalRevenue, 0);
    const totalOrders = chartData.reduce((acc, d) => acc + d.ordersCount, 0);
    const avgDailyUnits = totalUnits / 7;
    
    let peakDay = chartData[0];
    chartData.forEach((d) => {
      if (d.unitsSold > peakDay.unitsSold) {
        peakDay = d;
      }
    });

    return {
      totalUnits,
      totalRevenue,
      totalOrders,
      avgDailyUnits,
      peakDay
    };
  }, [chartData]);

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-orange-50 text-orange-600 border border-orange-200">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                7-Day Daily Sales Volume Trend
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Visualizing daily product units sold and revenue over the last 7 calendar days
              </p>
            </div>
          </div>
        </div>

        {/* Quick Highlights */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="px-3 py-1.5 rounded-xl bg-orange-50 border border-orange-200 text-xs">
            <span className="text-orange-700 font-medium">7-Day Volume: </span>
            <strong className="text-orange-950 font-black">{(stats?.totalUnits || 0).toLocaleString()} units</strong>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs">
            <span className="text-emerald-700 font-medium">7-Day Revenue: </span>
            <strong className="text-emerald-950 font-black">Rs. {(stats?.totalRevenue || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 })}</strong>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
            <span className="text-slate-600 font-medium">Daily Avg: </span>
            <strong className="text-slate-900 font-bold">{(stats?.avgDailyUnits || 0).toFixed(1)} units/day</strong>
          </div>
        </div>
      </div>

      {/* Recharts Line Chart */}
      <div className="mt-5 w-full h-[280px] sm:h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 15, right: 20, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis 
              dataKey="label" 
              stroke="#64748b" 
              fontSize={11} 
              tickLine={false} 
              axisLine={{ stroke: '#e2e8f0' }}
            />
            <YAxis 
              yAxisId="units"
              stroke="#ea580c" 
              fontSize={11} 
              tickLine={false} 
              axisLine={{ stroke: '#fed7aa' }}
              tickFormatter={(val) => `${val}u`}
            />
            <YAxis 
              yAxisId="revenue"
              orientation="right"
              stroke="#059669" 
              fontSize={11} 
              tickLine={false} 
              axisLine={{ stroke: '#a7f3d0' }}
              tickFormatter={(val) => val >= 1000 ? `${((val || 0) / 1000).toFixed(0)}k` : `${val || 0}`}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload || !payload.length) return null;
                const data = payload[0]?.payload;
                if (!data) return null;

                return (
                  <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl border border-slate-800 text-xs space-y-1.5 min-w-[190px]">
                    <div className="font-bold border-b border-slate-700 pb-1 flex items-center justify-between">
                      <span>{label}</span>
                      <span className="text-slate-400 font-mono text-[10px]">{data.dateStr}</span>
                    </div>
                    <div className="flex items-center justify-between text-orange-300">
                      <span className="flex items-center gap-1.5">
                        <ShoppingBag className="w-3.5 h-3.5 text-orange-400" /> Units Sold:
                      </span>
                      <strong className="font-mono text-sm">{(data.unitsSold || 0).toLocaleString()} units</strong>
                    </div>
                    <div className="flex items-center justify-between text-emerald-300">
                      <span>Total Revenue:</span>
                      <strong className="font-mono">Rs. {(data.totalRevenue || 0).toFixed(2)}</strong>
                    </div>
                    <div className="flex items-center justify-between text-slate-400 text-[11px] pt-1 border-t border-slate-800">
                      <span>Receipts / Invoices:</span>
                      <span className="font-mono">{data.ordersCount}</span>
                    </div>
                  </div>
                );
              }}
            />
            <Legend 
              verticalAlign="top" 
              height={36} 
              iconType="circle"
              formatter={(value) => <span className="text-xs font-semibold text-slate-700 mx-1">{value}</span>}
            />
            <Line
              yAxisId="units"
              type="monotone"
              dataKey="unitsSold"
              name="Sales Volume (Units Sold)"
              stroke="#ea580c"
              strokeWidth={3}
              dot={{ r: 4, fill: '#ea580c', stroke: '#fff', strokeWidth: 2 }}
              activeDot={{ r: 6, fill: '#ea580c', stroke: '#ffedd5', strokeWidth: 3 }}
            />
            <Line
              yAxisId="revenue"
              type="monotone"
              dataKey="totalRevenue"
              name="Sales Revenue (PKR)"
              stroke="#059669"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={{ r: 3, fill: '#059669', stroke: '#fff', strokeWidth: 1.5 }}
              activeDot={{ r: 5, fill: '#059669', stroke: '#d1fae5', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Footer Insight */}
      <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500 font-medium">
        <div className="flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <span>Peak 7-day volume: <strong className="text-slate-800">{stats.peakDay.label}</strong> with <strong className="text-orange-600">{stats.peakDay.unitsSold} units</strong> sold.</span>
        </div>
        <div className="text-slate-400 text-[11px]">
          Total Receipts: {stats.totalOrders} invoices
        </div>
      </div>
    </div>
  );
};
