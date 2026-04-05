import { useEffect, useState } from 'react';
import {
  Users, CreditCard, TrendingUp, Activity, FileText,
  ChevronRight, ArrowLeft, BarChart3, Zap, BookOpen,
  Headphones, Image, Music, Sparkles, RefreshCw,
} from 'lucide-react';
import { cn } from '../../lib/utils';

const API = '/api/admin';

interface Overview {
  totalUsers: number;
  totalProjects: number;
  totalChapters: number;
  totalCreditsUsed: number;
  totalAudioGens: number;
  recentSignups: number;
  monthlySignups: number;
  mrr: number;
  planBreakdown: { plan: string; count: number }[];
  creditsByAction: { action: string; totalCredits: number; count: number }[];
  costs?: {
    totalMonthlyCost: number;
    profit: number;
    margin: number;
    totalProviderCost: number;
    providers: {
      elevenlabs: { chars: number; sfxCount: number; musicCount: number; cost: number };
      openaiText: { inputTokens: number; outputTokens: number; cost: number };
      openaiTTS: { chars: number; cost: number };
    };
    breakdown: { action: string; credits: number; count: number; inputTokens: number; outputTokens: number; audioDuration: number; estimatedCost: number }[];
    usage: {
      totalCredits: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      totalAudioDurationSec: number;
    };
  };
}

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  creditsRemaining: number;
  creditsTotal: number;
  stripeSubscriptionStatus: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ActivityRow {
  id: number;
  userId: string;
  action: string;
  creditsUsed: number;
  model: string;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
  userPlan: string | null;
}

interface UserDetail {
  user: UserRow & { stripeCustomerId: string | null; stripeSubscriptionId: string | null; stripeCancelAtPeriodEnd: boolean };
  projects: { id: string; title: string; type: string; status: string; createdAt: string }[];
  recentTransactions: any[];
  totalCreditsUsed: number;
}

interface DailyStats {
  signups: { day: string; count: number }[];
  creditsPerDay: { day: string; total: number; count: number }[];
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

const ACTION_ICONS: Record<string, typeof Zap> = {
  'generate': Sparkles,
  'generate-stream': Sparkles,
  'generate-audio': Headphones,
  'generate-image': Image,
  'generate-music': Music,
  'generate-sfx': Activity,
};

const PLAN_COLORS: Record<string, string> = {
  free: 'bg-gray-100 text-gray-600',
  writer: 'bg-blue-100 text-blue-700',
  author: 'bg-purple-100 text-purple-700',
  studio: 'bg-amber-100 text-amber-800',
};

const PLAN_LABELS: Record<string, string> = {
  free: 'Dreamer',
  writer: 'Writer',
  author: 'Author',
  studio: 'Studio',
};

function StatCard({ label, value, sub, icon: Icon }: { label: string; value: string | number; sub?: string; icon: typeof Users }) {
  return (
    <div className="glass-pill rounded-2xl p-4 sm:p-5">
      <div className="flex items-start justify-between mb-2">
        <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider">{label}</span>
        <Icon size={16} className="text-text-tertiary" />
      </div>
      <div className="text-2xl sm:text-3xl font-semibold text-text-primary">{value}</div>
      {sub && <div className="text-xs text-text-tertiary mt-1">{sub}</div>}
    </div>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider', PLAN_COLORS[plan] || PLAN_COLORS.free)}>
      {PLAN_LABELS[plan] || plan}
    </span>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

type View = 'overview' | 'users' | 'activity' | 'user-detail';

export function AdminDashboard({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<View>('overview');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [usersList, setUsersList] = useState<{ users: UserRow[]; total: number } | null>(null);
  const [activityList, setActivityList] = useState<ActivityRow[]>([]);
  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, stats] = await Promise.all([
        fetchJson<Overview>('/overview'),
        fetchJson<DailyStats>('/stats/daily'),
      ]);
      setOverview(ov);
      setDailyStats(stats);
    } catch (e: any) {
      setError(e.message === '403' ? 'Access denied — admin only.' : 'Failed to load dashboard.');
    }
    setLoading(false);
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await fetchJson<{ users: UserRow[]; total: number }>('/users?limit=100');
      setUsersList(data);
    } catch { setError('Failed to load users.'); }
    setLoading(false);
  };

  const loadActivity = async () => {
    setLoading(true);
    try {
      const data = await fetchJson<{ activity: ActivityRow[] }>('/activity?limit=100');
      setActivityList(data.activity);
    } catch { setError('Failed to load activity.'); }
    setLoading(false);
  };

  const loadUserDetail = async (userId: string) => {
    setLoading(true);
    try {
      const data = await fetchJson<UserDetail>(`/users/${userId}`);
      setUserDetail(data);
      setView('user-detail');
    } catch { setError('Failed to load user.'); }
    setLoading(false);
  };

  useEffect(() => { loadOverview(); }, []);

  useEffect(() => {
    if (view === 'users' && !usersList) loadUsers();
    if (view === 'activity' && activityList.length === 0) loadActivity();
  }, [view]);

  if (error === 'Access denied — admin only.') {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-4xl mb-4">🔒</div>
          <h2 className="text-xl font-serif font-semibold mb-2">Admin Access Required</h2>
          <p className="text-sm text-text-tertiary mb-4">You don't have permission to view this page.</p>
          <button onClick={onClose} className="text-sm text-text-secondary hover:text-text-primary underline">Go back</button>
        </div>
      </div>
    );
  }

  const tabs: { id: View; label: string; icon: typeof Users }[] = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'activity', label: 'Activity', icon: Activity },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-black/5">
        <button onClick={onClose} className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-black/5 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-lg font-serif font-semibold">Admin Dashboard</h1>
        <button
          onClick={() => { if (view === 'overview') loadOverview(); else if (view === 'users') loadUsers(); else loadActivity(); }}
          className="ml-auto p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-black/5 transition-colors"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex px-4 sm:px-6 gap-1 border-b border-black/5">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => { setView(id); setError(null); }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-all border-b-2 -mb-px',
              view === id || (view === 'user-detail' && id === 'users')
                ? 'border-text-primary text-text-primary'
                : 'border-transparent text-text-tertiary hover:text-text-secondary'
            )}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {loading && !overview && (
          <div className="flex items-center justify-center py-12">
            <div className="glass-pill px-4 py-2 text-sm text-text-secondary">Loading...</div>
          </div>
        )}

        {error && error !== 'Access denied — admin only.' && (
          <div className="glass-pill rounded-xl p-4 text-sm text-error mb-4">{error}</div>
        )}

        {/* ========== Overview ========== */}
        {view === 'overview' && overview && (
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Top stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Total Users" value={overview.totalUsers} sub={`+${overview.recentSignups} this week`} icon={Users} />
              <StatCard label="MRR" value={`$${overview.mrr}`} sub={`${overview.planBreakdown.filter(p => p.plan !== 'free').reduce((a, b) => a + b.count, 0)} paid`} icon={CreditCard} />
              <StatCard label="Credits Used" value={overview.totalCreditsUsed.toLocaleString()} icon={Zap} />
              <StatCard label="Projects" value={overview.totalProjects} sub={`${overview.totalChapters} chapters`} icon={BookOpen} />
            </div>

            {/* Plan breakdown + Credits by action */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="glass-pill rounded-2xl p-4 sm:p-5">
                <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">Plan Distribution</h3>
                <div className="space-y-2">
                  {overview.planBreakdown.map(({ plan, count }) => {
                    const pct = overview.totalUsers > 0 ? (count / overview.totalUsers) * 100 : 0;
                    return (
                      <div key={plan} className="flex items-center gap-3">
                        <PlanBadge plan={plan} />
                        <div className="flex-1 h-2 bg-black/5 rounded-full overflow-hidden">
                          <div className="h-full bg-text-primary/30 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-sm font-medium text-text-secondary w-10 text-right">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="glass-pill rounded-2xl p-4 sm:p-5">
                <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">Credit Usage by Action</h3>
                <div className="space-y-2">
                  {overview.creditsByAction.map(({ action, totalCredits, count }) => {
                    const Icon = ACTION_ICONS[action] || Zap;
                    return (
                      <div key={action} className="flex items-center gap-3">
                        <Icon size={14} className="text-text-tertiary flex-shrink-0" />
                        <span className="text-sm text-text-secondary flex-1 truncate">{action}</span>
                        <span className="text-xs text-text-tertiary">{count}×</span>
                        <span className="text-sm font-medium text-text-primary w-16 text-right">{totalCredits.toLocaleString()}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Daily chart (simple bar representation) */}
            {dailyStats && dailyStats.creditsPerDay.length > 0 && (
              <div className="glass-pill rounded-2xl p-4 sm:p-5">
                <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">Credits / Day (Last 30 Days)</h3>
                <div className="flex items-end gap-1 h-24">
                  {dailyStats.creditsPerDay.map((d, i) => {
                    const maxVal = Math.max(...dailyStats.creditsPerDay.map(x => Number(x.total)));
                    const pct = maxVal > 0 ? (Number(d.total) / maxVal) * 100 : 0;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                        <div
                          className="w-full bg-text-primary/20 hover:bg-text-primary/40 rounded-t transition-colors cursor-default"
                          style={{ height: `${Math.max(2, pct)}%` }}
                          title={`${new Date(d.day).toLocaleDateString()}: ${Number(d.total).toLocaleString()} credits (${d.count} actions)`}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[9px] text-text-tertiary">{formatDate(dailyStats.creditsPerDay[0].day)}</span>
                  <span className="text-[9px] text-text-tertiary">{formatDate(dailyStats.creditsPerDay[dailyStats.creditsPerDay.length - 1].day)}</span>
                </div>
              </div>
            )}

            {/* Monthly Cost & Profit */}
            {overview.costs && (
              <div className="bg-white rounded-2xl border border-black/5 p-5 space-y-4">
                <h3 className="text-sm font-semibold">Monthly P&L</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-green-50 rounded-xl p-3">
                    <div className="text-[10px] font-medium text-green-700 uppercase tracking-wider">Revenue (MRR)</div>
                    <div className="text-lg font-bold text-green-800">${overview.mrr}</div>
                  </div>
                  <div className="bg-red-50 rounded-xl p-3">
                    <div className="text-[10px] font-medium text-red-700 uppercase tracking-wider">Total Cost</div>
                    <div className="text-lg font-bold text-red-800">${overview.costs.totalMonthlyCost}</div>
                  </div>
                  <div className={cn("rounded-xl p-3", overview.costs.profit >= 0 ? "bg-emerald-50" : "bg-orange-50")}>
                    <div className={cn("text-[10px] font-medium uppercase tracking-wider", overview.costs.profit >= 0 ? "text-emerald-700" : "text-orange-700")}>Profit</div>
                    <div className={cn("text-lg font-bold", overview.costs.profit >= 0 ? "text-emerald-800" : "text-orange-800")}>${overview.costs.profit}</div>
                  </div>
                  <div className="bg-blue-50 rounded-xl p-3">
                    <div className="text-[10px] font-medium text-blue-700 uppercase tracking-wider">Margin</div>
                    <div className="text-lg font-bold text-blue-800">{overview.costs.margin}%</div>
                  </div>
                </div>

                {/* Provider costs — what we actually spent */}
                <div className="space-y-3">
                  <div className="text-xs font-medium text-text-secondary">Provider Costs (from user activity)</div>

                  {/* ElevenLabs */}
                  <div className="bg-purple-50 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-purple-800">ElevenLabs</div>
                      <div className="text-[10px] text-purple-600">
                        {(overview.costs.providers.elevenlabs.chars / 1000).toFixed(1)}K chars
                        {overview.costs.providers.elevenlabs.sfxCount > 0 && ` · ${overview.costs.providers.elevenlabs.sfxCount} SFX`}
                        {overview.costs.providers.elevenlabs.musicCount > 0 && ` · ${overview.costs.providers.elevenlabs.musicCount} music`}
                      </div>
                    </div>
                    <div className="text-lg font-bold text-purple-800">${overview.costs.providers.elevenlabs.cost}</div>
                  </div>

                  {/* OpenAI Text */}
                  <div className="bg-sky-50 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-sky-800">OpenAI (Text Gen)</div>
                      <div className="text-[10px] text-sky-600">
                        {(overview.costs.providers.openaiText.inputTokens / 1000).toFixed(1)}K in · {(overview.costs.providers.openaiText.outputTokens / 1000).toFixed(1)}K out
                      </div>
                    </div>
                    <div className="text-lg font-bold text-sky-800">${overview.costs.providers.openaiText.cost}</div>
                  </div>

                  {/* OpenAI TTS */}
                  <div className="bg-sky-50 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-sky-800">OpenAI (Budget TTS)</div>
                      <div className="text-[10px] text-sky-600">{(overview.costs.providers.openaiTTS.chars / 1000).toFixed(1)}K characters used</div>
                    </div>
                    <div className="text-lg font-bold text-sky-800">${overview.costs.providers.openaiTTS.cost}</div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-black/10">
                    <span className="text-xs font-semibold">Total Provider Cost</span>
                    <span className="text-sm font-bold">${overview.costs.totalProviderCost}</span>
                  </div>
                </div>

                {/* Action breakdown */}
                <div className="space-y-2">
                  <div className="text-xs font-medium text-text-secondary">By Action</div>
                  {overview.costs.breakdown.map(({ action, credits, count, inputTokens, outputTokens, audioDuration, estimatedCost }) => (
                    <div key={action} className="flex items-center justify-between text-xs py-1.5 border-b border-black/5">
                      <div className="flex flex-col">
                        <span className="text-text-secondary">{action}</span>
                        <span className="text-[10px] text-text-tertiary">
                          {count}× · {credits.toLocaleString()} cr
                          {inputTokens > 0 && ` · ${(inputTokens / 1000).toFixed(1)}K in`}
                          {outputTokens > 0 && ` / ${(outputTokens / 1000).toFixed(1)}K out`}
                          {audioDuration > 0 && ` · ${Math.round(audioDuration / 60)}min audio`}
                        </span>
                      </div>
                      <span className="font-medium flex-shrink-0">${estimatedCost}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard label="Audio Generations" value={overview.totalAudioGens} icon={Headphones} />
              <StatCard label="Monthly Signups" value={overview.monthlySignups} icon={TrendingUp} />
              <StatCard label="Avg Credits/User" value={overview.totalUsers > 0 ? Math.round(overview.totalCreditsUsed / overview.totalUsers) : 0} icon={FileText} />
            </div>
          </div>
        )}

        {/* ========== Users ========== */}
        {view === 'users' && usersList && (
          <div className="max-w-5xl mx-auto">
            <div className="text-xs text-text-tertiary mb-3">{usersList.total} total users</div>
            <div className="space-y-1">
              {usersList.users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => loadUserDetail(u.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl glass-pill hover:bg-white/60 transition-all text-left"
                >
                  <div className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center text-xs font-semibold text-text-tertiary">
                    {(u.name || u.email)?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text-primary truncate">{u.name || u.email}</div>
                    <div className="text-[11px] text-text-tertiary truncate">{u.email}</div>
                  </div>
                  <PlanBadge plan={u.plan} />
                  <div className="text-right hidden sm:block">
                    <div className="text-xs text-text-secondary">{u.creditsRemaining}/{u.creditsTotal}</div>
                    <div className="text-[10px] text-text-tertiary">{timeAgo(u.createdAt)}</div>
                  </div>
                  <ChevronRight size={14} className="text-text-tertiary" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ========== User Detail ========== */}
        {view === 'user-detail' && userDetail && (
          <div className="max-w-4xl mx-auto space-y-4">
            <button
              onClick={() => setView('users')}
              className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-primary transition-colors mb-2"
            >
              <ArrowLeft size={14} /> Back to users
            </button>

            <div className="glass-pill rounded-2xl p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-xl font-semibold">{userDetail.user.name || 'No name'}</h2>
                  <div className="text-sm text-text-tertiary">{userDetail.user.email}</div>
                  <div className="text-[11px] text-text-tertiary mt-1">Joined {formatDate(userDetail.user.createdAt)}</div>
                </div>
                <PlanBadge plan={userDetail.user.plan} />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="glass-pill rounded-xl p-3 text-center">
                  <div className="text-lg font-semibold">{userDetail.user.creditsRemaining}</div>
                  <div className="text-[10px] text-text-tertiary">Credits Left</div>
                </div>
                <div className="glass-pill rounded-xl p-3 text-center">
                  <div className="text-lg font-semibold">{userDetail.totalCreditsUsed.toLocaleString()}</div>
                  <div className="text-[10px] text-text-tertiary">Total Used</div>
                </div>
                <div className="glass-pill rounded-xl p-3 text-center">
                  <div className="text-lg font-semibold">{userDetail.projects.length}</div>
                  <div className="text-[10px] text-text-tertiary">Projects</div>
                </div>
              </div>

              {userDetail.user.stripeSubscriptionId && (
                <div className="mt-3 text-xs text-text-tertiary">
                  Stripe: {userDetail.user.stripeSubscriptionStatus}
                  {userDetail.user.stripeCancelAtPeriodEnd && ' (canceling at period end)'}
                </div>
              )}
            </div>

            {/* Projects */}
            {userDetail.projects.length > 0 && (
              <div className="glass-pill rounded-2xl p-4">
                <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">Projects</h3>
                <div className="space-y-1.5">
                  {userDetail.projects.map(p => (
                    <div key={p.id} className="flex items-center gap-2 text-sm">
                      <BookOpen size={13} className="text-text-tertiary" />
                      <span className="flex-1 text-text-primary">{p.title}</span>
                      <span className="text-[10px] text-text-tertiary">{p.type}</span>
                      <span className="text-[10px] text-text-tertiary">{timeAgo(p.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent transactions */}
            {userDetail.recentTransactions.length > 0 && (
              <div className="glass-pill rounded-2xl p-4">
                <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">Recent Activity</h3>
                <div className="space-y-1">
                  {userDetail.recentTransactions.slice(0, 20).map((tx: any) => {
                    const Icon = ACTION_ICONS[tx.action] || Zap;
                    return (
                      <div key={tx.id} className="flex items-center gap-2 text-sm py-1">
                        <Icon size={13} className="text-text-tertiary" />
                        <span className="flex-1 text-text-secondary">{tx.action}</span>
                        <span className="text-xs font-medium text-text-primary">-{tx.creditsUsed}</span>
                        <span className="text-[10px] text-text-tertiary w-16 text-right">{timeAgo(tx.createdAt)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========== Activity Feed ========== */}
        {view === 'activity' && (
          <div className="max-w-5xl mx-auto">
            <div className="text-xs text-text-tertiary mb-3">Recent generations across all users</div>
            <div className="space-y-1">
              {activityList.map((a) => {
                const Icon = ACTION_ICONS[a.action] || Zap;
                return (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 rounded-xl glass-pill">
                    <Icon size={14} className="text-text-tertiary flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-text-primary truncate">
                        {a.userName || a.userEmail || 'Unknown'}
                      </div>
                      <div className="text-[11px] text-text-tertiary">{a.action} · {a.model}</div>
                    </div>
                    {a.userPlan && <PlanBadge plan={a.userPlan} />}
                    <div className="text-right">
                      <div className="text-xs font-medium text-text-primary">-{a.creditsUsed}</div>
                      <div className="text-[10px] text-text-tertiary">{timeAgo(a.createdAt)}</div>
                    </div>
                  </div>
                );
              })}
              {activityList.length === 0 && !loading && (
                <div className="text-center text-sm text-text-tertiary py-8">No activity yet</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
