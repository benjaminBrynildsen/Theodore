import { useState } from 'react';
import { Rocket, TrendingUp, Star, Eye, DollarSign, BarChart3, Calendar, ExternalLink, RefreshCw } from 'lucide-react';
import { useStore } from '../../store';
import { cn } from '../../lib/utils';

interface SalesData {
  date: string;
  units: number;
  revenue: number;
  kenp: number; // Kindle Unlimited pages read
}

interface ReviewSummary {
  average: number;
  total: number;
  breakdown: { stars: number; count: number }[];
  recentQuote: string;
}

export function LaunchDashboard() {
  const { getActiveProject } = useStore();
  const project = getActiveProject();
  const [connected, setConnected] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Mock data — real version connects to KDP API
  const [salesData] = useState<SalesData[]>([
    { date: '2026-02-15', units: 12, revenue: 35.88, kenp: 2400 },
    { date: '2026-02-16', units: 8, revenue: 23.92, kenp: 1800 },
    { date: '2026-02-17', units: 15, revenue: 44.85, kenp: 3200 },
    { date: '2026-02-18', units: 22, revenue: 65.78, kenp: 4100 },
    { date: '2026-02-19', units: 18, revenue: 53.82, kenp: 3600 },
    { date: '2026-02-20', units: 31, revenue: 92.69, kenp: 5800 },
    { date: '2026-02-21', units: 27, revenue: 80.73, kenp: 4900 },
  ]);

  const [reviews] = useState<ReviewSummary>({
    average: 4.3,
    total: 47,
    breakdown: [
      { stars: 5, count: 24 },
      { stars: 4, count: 12 },
      { stars: 3, count: 7 },
      { stars: 2, count: 3 },
      { stars: 1, count: 1 },
    ],
    recentQuote: '"The garden felt so real I could smell the roses. Morgenstern meets VanderMeer in the best possible way."',
  });

  const totalUnits = salesData.reduce((s, d) => s + d.units, 0);
  const totalRevenue = salesData.reduce((s, d) => s + d.revenue, 0);
  const totalKENP = salesData.reduce((s, d) => s + d.kenp, 0);
  const maxUnits = Math.max(...salesData.map(d => d.units));

  const refresh = async () => {
    setRefreshing(true);
    await new Promise(r => setTimeout(r, 1500));
    setRefreshing(false);
  };

  if (!connected) {
    return (
      <div className="p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold">Launch Dashboard</h3>
          <p className="text-xs text-text-tertiary">Track sales, reviews, and rankings after you publish.</p>
        </div>

        <div className="text-center py-10">
          <Rocket size={36} className="mx-auto mb-4 text-text-tertiary" />
          <p className="text-sm text-text-secondary mb-2">Connect your KDP account</p>
          <p className="text-xs text-text-tertiary mb-6 max-w-xs mx-auto">
            Link your Amazon KDP account to track sales, reviews, and rankings directly in Theodore.
          </p>
          <button
            onClick={() => setConnected(true)}
            className="px-5 py-2.5 rounded-xl bg-text-primary text-text-inverse text-sm font-medium flex items-center gap-2 mx-auto hover:shadow-lg transition-all"
          >
            <ExternalLink size={15} /> Connect KDP
          </button>
          <p className="text-[10px] text-text-tertiary mt-3">You can also manually track without connecting.</p>
          <button
            onClick={() => setConnected(true)}
            className="text-xs text-text-tertiary hover:text-text-primary mt-1"
          >
            Use demo data →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Launch Dashboard</h3>
          <p className="text-xs text-text-tertiary">{project?.title} · Last 7 days</p>
        </div>
        <button onClick={refresh} disabled={refreshing} className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary">
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass-pill rounded-xl p-3 text-center">
          <DollarSign size={14} className="mx-auto mb-1 text-success" />
          <div className="text-lg font-mono font-semibold">${totalRevenue.toFixed(0)}</div>
          <div className="text-[10px] text-text-tertiary">Revenue</div>
        </div>
        <div className="glass-pill rounded-xl p-3 text-center">
          <BarChart3 size={14} className="mx-auto mb-1 text-blue-500" />
          <div className="text-lg font-mono font-semibold">{totalUnits}</div>
          <div className="text-[10px] text-text-tertiary">Units Sold</div>
        </div>
        <div className="glass-pill rounded-xl p-3 text-center">
          <Eye size={14} className="mx-auto mb-1 text-purple-500" />
          <div className="text-lg font-mono font-semibold">{(totalKENP / 1000).toFixed(1)}k</div>
          <div className="text-[10px] text-text-tertiary">KENP Read</div>
        </div>
      </div>

      {/* Sales chart */}
      <div>
        <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">Daily Sales</div>
        <div className="flex items-end gap-[6px] h-24">
          {salesData.map((day, i) => {
            const h = (day.units / maxUnits) * 100;
            const isToday = i === salesData.length - 1;
            const dayLabel = new Date(day.date).toLocaleDateString('en', { weekday: 'narrow' });
            return (
              <div key={day.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                <div className="absolute bottom-full mb-1 hidden group-hover:block z-10">
                  <div className="bg-text-primary text-text-inverse text-[9px] px-2 py-1 rounded-lg whitespace-nowrap shadow-lg">
                    {day.units} units · ${day.revenue.toFixed(2)}
                  </div>
                </div>
                <div
                  className={cn('w-full rounded-t-sm transition-all', isToday ? 'bg-text-primary' : 'bg-black/15')}
                  style={{ height: `${h}%` }}
                />
                <span className="text-[8px] text-text-tertiary">{dayLabel}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Rankings */}
      <div className="glass-pill rounded-xl p-4">
        <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">Rankings</div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary">Overall Kindle Store</span>
            <div className="flex items-center gap-1">
              <span className="text-xs font-mono font-semibold">#2,847</span>
              <TrendingUp size={11} className="text-success" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary">Fantasy → Contemporary</span>
            <div className="flex items-center gap-1">
              <span className="text-xs font-mono font-semibold">#47</span>
              <TrendingUp size={11} className="text-success" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary">Literary Fiction → Magical Realism</span>
            <div className="flex items-center gap-1">
              <span className="text-xs font-mono font-semibold">#12</span>
              <TrendingUp size={11} className="text-success" />
            </div>
          </div>
        </div>
      </div>

      {/* Reviews */}
      <div>
        <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">Reviews</div>
        <div className="glass-pill rounded-xl p-4">
          <div className="flex items-center gap-4 mb-3">
            <div className="text-center">
              <div className="text-2xl font-mono font-semibold">{reviews.average}</div>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map(s => (
                  <Star key={s} size={10} className={s <= Math.round(reviews.average) ? 'text-amber-400 fill-amber-400' : 'text-black/10'} />
                ))}
              </div>
              <div className="text-[10px] text-text-tertiary">{reviews.total} reviews</div>
            </div>
            <div className="flex-1 space-y-1">
              {reviews.breakdown.map(({ stars, count }) => (
                <div key={stars} className="flex items-center gap-2">
                  <span className="text-[10px] text-text-tertiary w-3">{stars}</span>
                  <div className="flex-1 h-1.5 bg-black/5 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-400 rounded-full" style={{ width: `${(count / reviews.total) * 100}%` }} />
                  </div>
                  <span className="text-[10px] text-text-tertiary w-4">{count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="text-xs italic text-text-secondary border-t border-black/5 pt-3">
            {reviews.recentQuote}
          </div>
        </div>
      </div>
    </div>
  );
}
