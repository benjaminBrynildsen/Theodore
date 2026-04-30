import { useEffect, useState } from 'react';
import {
  Users, CreditCard, TrendingUp, Activity, FileText,
  ChevronRight, ChevronDown, ArrowLeft, BarChart3, Zap, BookOpen,
  Headphones, Image, Music, Sparkles, RefreshCw, Globe,
  Film, Upload, Trash2, CheckCircle2, Mail, ExternalLink, Volume2, Bell,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { CREATORS } from '../../data/creators';
import { OutreachTab } from './OutreachTab';
import { PushTab } from './PushTab';

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
  funnel?: {
    signedUp: number;
    guestsUsedChat?: number;
    openedImagineChat: number;
    createdProject: number;
    wroteChapter: number;
    generatedAi: number;
  };
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
  userId: string | null;
  action: string;
  creditsUsed: number;
  model: string | null;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
  userPlan: string | null;
  isGuest?: boolean;
  country?: string | null;
  ipHashPrefix?: string;
  guestMetadata?: string | null;
}

/** Human-readable labels for raw action strings in the admin activity feed. */
const ACTION_LABELS: Record<string, string> = {
  'plan-project': '💬 Chatted in Imagine',
  'scaffold-chapters': '📚 Created Novel',
  'generate-chapter': '✏️ Generated Chapter',
  'extend-chapter': '✏️ Extended Chapter',
  'dialogue-clarity-pass': '✏️ Dialogue Cleanup',
  'generate-chapter-outline': '📋 Scene Outline',
  'scene-prose-split': '📋 Split Prose → Scenes',
  'inline-edit': '✏️ Inline Edit',
  'generate-audio': '🎧 Generated Audio',
  'generate-image': '🖼️ Generated Image',
  'sfx-ambience': '🔊 SFX Planning',
  'dialogue-tagging': '🏷️ Dialogue Tagging',
  'extract-continuity': '🔗 Continuity Extraction',
  'entity-refine': '🧩 Canon Refinement',
  'auto-fill': '🧩 Canon Auto-fill',
  'generate-stream': '💬 Chatted in Imagine',
  'generate': '💬 Chatted in Imagine',
  'tts': '🎧 Generated Audio',
  'project-created': '📚 Created Novel',
};

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

interface TrafficStats {
  views: { total: number; last24h: number; last7d: number; last30d: number };
  visitors: { total: number; last24h: number; last7d: number; last30d: number };
  topReferrers: { host: string; count: number }[];
  topCountries: { country: string; count: number }[];
  topPaths: { path: string; count: number }[];
  topCampaigns: { source: string | null; medium: string | null; campaign: string | null; count: number }[];
  daily: { day: string; views: number; visitors: number }[];
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

function StatCard({ label, value, sub, icon: Icon, onClick }: { label: string; value: string | number; sub?: string; icon: typeof Users; onClick?: () => void }) {
  const body = (
    <>
      <div className="flex items-start justify-between mb-2">
        <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider">{label}</span>
        <Icon size={16} className="text-text-tertiary" />
      </div>
      <div className="text-2xl sm:text-3xl font-semibold text-text-primary">{value}</div>
      {sub && <div className="text-xs text-text-tertiary mt-1">{sub}</div>}
    </>
  );
  if (onClick) {
    return (
      <button onClick={onClick} className="glass-pill rounded-2xl p-4 sm:p-5 text-left hover:bg-white/60 active:scale-[0.98] transition-all">
        {body}
      </button>
    );
  }
  return <div className="glass-pill rounded-2xl p-4 sm:p-5">{body}</div>;
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

type View = 'overview' | 'traffic' | 'users' | 'activity' | 'journey' | 'journey-detail' | 'user-detail' | 'creators' | 'grok-probe' | 'outreach' | 'push';

interface JourneySession {
  session_id: string;
  started_at: string;
  last_event_at: string;
  event_count: number;
  city: string | null;
  region: string | null;
  country: string | null;
  ip_hash: string | null;
  duration_seconds: number;
  event_types: string[];
}

interface JourneyDetail {
  sessionId: string;
  city: string | null;
  region: string | null;
  country: string | null;
  ipHash: string | null;
  startedAt: string;
  durationSeconds: number;
  eventCount: number;
  events: { event: string; data: any; page: string | null; timestamp: string }[];
}

export function AdminDashboard({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<View>('overview');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [usersList, setUsersList] = useState<{ users: UserRow[]; total: number } | null>(null);
  const [activityList, setActivityList] = useState<ActivityRow[]>([]);
  const [adminIpHash, setAdminIpHash] = useState<string | null>(null);
  // IP hashes the admin has marked as "me" (persisted in localStorage).
  // Supports multiple devices — click "Mark as me" on any guest row to add it.
  const [myIpHashes, setMyIpHashes] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('theodore:admin-my-ips');
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  });
  const [hideMyGuest, setHideMyGuest] = useState(() => {
    try { return localStorage.getItem('theodore:admin-hide-my-guest') === 'true'; } catch { return false; }
  });
  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStats | null>(null);
  const [traffic, setTraffic] = useState<TrafficStats | null>(null);
  const [journeys, setJourneys] = useState<JourneySession[]>([]);
  const [userJourneys, setUserJourneys] = useState<JourneySession[]>([]);
  const [journeyDetail, setJourneyDetail] = useState<JourneyDetail | null>(null);
  const [journeyDetailOrigin, setJourneyDetailOrigin] = useState<View>('journey');
  const [journeyFilter, setJourneyFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

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

  const loadTraffic = async () => {
    setLoading(true);
    try {
      const data = await fetchJson<TrafficStats>('/traffic');
      setTraffic(data);
    } catch { setError('Failed to load traffic.'); }
    setLoading(false);
  };

  const loadActivity = async () => {
    setLoading(true);
    try {
      const data = await fetchJson<{
        activity: ActivityRow[];
        adminIpHash?: string;
        knownAdminIps?: string[];
      }>('/activity?limit=100');
      setActivityList(data.activity);
      // The server accumulates every IP hash the admin has ever loaded the
      // dashboard from (stored in the admin user's settings). Use the full
      // server-side list so all devices share the same "You" tags.
      if (data.knownAdminIps?.length) {
        setAdminIpHash(data.adminIpHash || null);
        setMyIpHashes(() => {
          const next = new Set(data.knownAdminIps!);
          localStorage.setItem('theodore:admin-my-ips', JSON.stringify([...next]));
          return next;
        });
      } else if (data.adminIpHash) {
        setAdminIpHash(data.adminIpHash);
        setMyIpHashes((prev) => {
          const next = new Set(prev);
          next.add(data.adminIpHash!);
          localStorage.setItem('theodore:admin-my-ips', JSON.stringify([...next]));
          return next;
        });
      }
    } catch { setError('Failed to load activity.'); }
    setLoading(false);
  };

  const toggleMyIp = (hash: string) => {
    setMyIpHashes((prev) => {
      const next = new Set(prev);
      if (next.has(hash)) next.delete(hash);
      else next.add(hash);
      localStorage.setItem('theodore:admin-my-ips', JSON.stringify([...next]));
      return next;
    });
  };

  const toggleHideMyGuest = () => {
    setHideMyGuest((prev) => {
      const next = !prev;
      localStorage.setItem('theodore:admin-hide-my-guest', String(next));
      return next;
    });
  };

  const loadJourneys = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (journeyFilter === '/go/') params.set('page', '/go/');
      const data = await fetchJson<{ sessions: JourneySession[] }>(`/journeys?${params}`);
      setJourneys(data.sessions || []);
    } catch { setError('Failed to load journeys.'); }
    setLoading(false);
  };

  const loadJourneyDetail = async (sessionId: string, origin: View = 'journey') => {
    setLoading(true);
    try {
      const data = await fetchJson<JourneyDetail>(`/journeys/${sessionId}`);
      setJourneyDetail(data);
      setJourneyDetailOrigin(origin);
      setView('journey-detail');
    } catch { setError('Failed to load journey detail.'); }
    setLoading(false);
  };

  const loadUserDetail = async (userId: string) => {
    setLoading(true);
    setUserJourneys([]);
    try {
      const data = await fetchJson<UserDetail>(`/users/${userId}`);
      setUserDetail(data);
      setView('user-detail');
      // Fetch bundled journeys in parallel — don't block the detail render.
      fetchJson<{ sessions: JourneySession[] }>(`/users/${userId}/journeys`)
        .then(j => setUserJourneys(j.sessions || []))
        .catch(() => { /* silently absent is fine */ });
    } catch { setError('Failed to load user.'); }
    setLoading(false);
  };

  useEffect(() => { loadOverview(); }, []);

  useEffect(() => {
    if (view === 'users' && !usersList) loadUsers();
    if (view === 'activity' && activityList.length === 0) loadActivity();
    if (view === 'traffic' && !traffic) loadTraffic();
    if (view === 'journey') loadJourneys();
  }, [view, journeyFilter]);

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
    { id: 'traffic', label: 'Traffic', icon: Globe },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'activity', label: 'Activity', icon: Activity },
    { id: 'journey', label: 'Journey', icon: TrendingUp },
    { id: 'creators', label: 'Creators', icon: Film },
    { id: 'outreach', label: 'Outreach', icon: Mail },
    { id: 'push', label: 'Push', icon: Bell },
    { id: 'grok-probe', label: 'Grok Probe', icon: Image },
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
          onClick={() => {
            if (view === 'overview') loadOverview();
            else if (view === 'traffic') loadTraffic();
            else if (view === 'users') loadUsers();
            else if (view === 'journey' || view === 'journey-detail') loadJourneys();
            else loadActivity();
          }}
          className="ml-auto p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-black/5 transition-colors"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Tabs — mobile dropdown, desktop inline */}
      {(() => {
        const currentTab = tabs.find((t) => t.id === view) ?? tabs[0];
        const CurrentIcon = currentTab.icon;
        return (
          <div className="border-b border-black/5">
            {/* Mobile dropdown */}
            <div className="sm:hidden relative px-4 py-2">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg bg-black/5 hover:bg-black/10 transition-colors"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                  <CurrentIcon size={15} />
                  {currentTab.label}
                </span>
                <ChevronDown
                  size={16}
                  className={cn('text-text-tertiary transition-transform', menuOpen && 'rotate-180')}
                />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                  <div className="absolute left-4 right-4 mt-1 rounded-xl bg-white shadow-lg border border-black/10 overflow-hidden z-40">
                    {tabs.map(({ id, label, icon: Icon }) => (
                      <button
                        key={id}
                        onClick={() => { setView(id); setError(null); setMenuOpen(false); }}
                        className={cn(
                          'w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-left border-b border-black/5 last:border-b-0 transition-colors',
                          view === id || (view === 'user-detail' && id === 'users')
                            ? 'bg-black/5 text-text-primary'
                            : 'text-text-secondary hover:bg-black/5'
                        )}
                      >
                        <Icon size={15} />
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            {/* Desktop tabs */}
            <div className="hidden sm:flex px-6 gap-1">
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
          </div>
        );
      })()}

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
              <StatCard label="Total Users" value={overview.totalUsers} sub={`+${overview.recentSignups} this week`} icon={Users} onClick={() => setView('users')} />
              <StatCard label="MRR" value={`$${overview.mrr}`} sub={`${overview.planBreakdown.filter(p => p.plan !== 'free').reduce((a, b) => a + b.count, 0)} paid`} icon={CreditCard} />
              <StatCard label="Credits Used" value={overview.totalCreditsUsed.toLocaleString()} icon={Zap} />
              <StatCard label="Projects" value={overview.totalProjects} sub={`${overview.totalChapters} chapters`} icon={BookOpen} />
            </div>

            {/* ===== Activation Funnel ===== */}
            {overview.funnel && (
              <div className="glass-pill rounded-2xl p-4 sm:p-5">
                <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">Activation Funnel</h3>
                <p className="text-[11px] text-text-tertiary mb-4">How many signups are actually using the product.</p>
                <div className="space-y-2">
                  {(() => {
                    const f = overview.funnel!;
                    const base = Math.max(f.signedUp, 1);
                    const steps: { label: string; value: number; hint: string }[] = [
                      { label: 'Guest visitors (chat)', value: f.guestsUsedChat || 0, hint: 'Tried Imagine without signing up' },
                      { label: 'Signed up', value: f.signedUp, hint: 'Accounts created' },
                      { label: 'Opened Imagine chat', value: f.openedImagineChat, hint: 'Started planning a story (signed-in)' },
                      { label: 'Created a project', value: f.createdProject, hint: 'Saved a project' },
                      { label: 'Wrote a chapter', value: f.wroteChapter, hint: 'At least one chapter' },
                      { label: 'Generated AI content', value: f.generatedAi, hint: 'Used write/continue' },
                    ];
                    return steps.map((s) => {
                      const pct = (s.value / base) * 100;
                      return (
                        <div key={s.label} className="flex items-center gap-3">
                          <div className="w-40 shrink-0">
                            <div className="text-xs font-medium text-text-secondary">{s.label}</div>
                            <div className="text-[10px] text-text-tertiary">{s.hint}</div>
                          </div>
                          <div className="flex-1 h-3 bg-black/5 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-text-primary/40 rounded-full transition-all"
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                          <span className="text-sm font-semibold text-text-primary w-12 text-right tabular-nums">{s.value}</span>
                          <span className="text-[11px] text-text-tertiary w-10 text-right tabular-nums">{Math.round(pct)}%</span>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

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

                  {/* OpenAI */}
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

        {/* ========== Traffic ========== */}
        {view === 'traffic' && (
          <div className="max-w-5xl mx-auto space-y-6">
            {!traffic && !loading && (
              <div className="glass-pill rounded-2xl p-8 text-center text-sm text-text-tertiary">
                No traffic data yet. Visits will start appearing here on the next deploy.
              </div>
            )}
            {traffic && (
              <>
                {/* Top stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard label="Views (24h)" value={traffic.views.last24h.toLocaleString()} sub={`${traffic.visitors.last24h} visitors`} icon={Activity} />
                  <StatCard label="Views (7d)" value={traffic.views.last7d.toLocaleString()} sub={`${traffic.visitors.last7d} visitors`} icon={TrendingUp} />
                  <StatCard label="Views (30d)" value={traffic.views.last30d.toLocaleString()} sub={`${traffic.visitors.last30d} visitors`} icon={BarChart3} />
                  <StatCard label="Total Views" value={traffic.views.total.toLocaleString()} sub={`${traffic.visitors.total.toLocaleString()} visitors`} icon={Globe} />
                </div>

                {/* Daily sparkline (14d) */}
                <div className="glass-pill rounded-2xl p-4 sm:p-5">
                  <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">Last 14 Days</h3>
                  {traffic.daily.length === 0 ? (
                    <div className="text-xs text-text-tertiary">No visits in the last 14 days.</div>
                  ) : (
                    <div className="flex items-end gap-1 h-24">
                      {traffic.daily.map((d) => {
                        const max = Math.max(...traffic.daily.map((x) => x.views), 1);
                        const pct = (d.views / max) * 100;
                        const date = new Date(d.day);
                        return (
                          <div key={d.day} className="flex-1 flex flex-col items-center gap-1 group">
                            <div className="flex-1 w-full flex items-end">
                              <div
                                className="w-full bg-text-primary/30 rounded-t group-hover:bg-text-primary/60 transition-colors"
                                style={{ height: `${pct}%` }}
                                title={`${date.toLocaleDateString()}: ${d.views} views · ${d.visitors} visitors`}
                              />
                            </div>
                            <span className="text-[9px] text-text-tertiary">{date.getDate()}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Two-col: Referrers + Countries */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="glass-pill rounded-2xl p-4 sm:p-5">
                    <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">Top Referrers (30d)</h3>
                    {traffic.topReferrers.length === 0 ? (
                      <div className="text-xs text-text-tertiary">No referrer data yet.</div>
                    ) : (
                      <div className="space-y-2">
                        {traffic.topReferrers.map((r) => {
                          const max = traffic.topReferrers[0]?.count || 1;
                          const pct = (r.count / max) * 100;
                          return (
                            <div key={r.host} className="flex items-center gap-3">
                              <span className="text-xs font-medium text-text-secondary truncate w-32">{r.host}</span>
                              <div className="flex-1 h-2 bg-black/5 rounded-full overflow-hidden">
                                <div className="h-full bg-text-primary/30 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-sm font-medium text-text-secondary w-10 text-right">{r.count}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="glass-pill rounded-2xl p-4 sm:p-5">
                    <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">Top Countries (30d)</h3>
                    {traffic.topCountries.length === 0 ? (
                      <div className="text-xs text-text-tertiary">
                        No country data yet — Cloudflare's <code>cf-ipcountry</code> header is required for this.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {traffic.topCountries.map((r) => {
                          const max = traffic.topCountries[0]?.count || 1;
                          const pct = (r.count / max) * 100;
                          return (
                            <div key={r.country} className="flex items-center gap-3">
                              <span className="text-xs font-mono font-medium text-text-secondary w-10">{r.country}</span>
                              <div className="flex-1 h-2 bg-black/5 rounded-full overflow-hidden">
                                <div className="h-full bg-text-primary/30 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-sm font-medium text-text-secondary w-10 text-right">{r.count}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Top paths */}
                <div className="glass-pill rounded-2xl p-4 sm:p-5">
                  <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">Top Pages (30d)</h3>
                  <div className="space-y-2">
                    {traffic.topPaths.map((r) => {
                      const max = traffic.topPaths[0]?.count || 1;
                      const pct = (r.count / max) * 100;
                      return (
                        <div key={r.path} className="flex items-center gap-3">
                          <span className="text-xs font-mono text-text-secondary truncate flex-1">{r.path}</span>
                          <div className="w-32 h-2 bg-black/5 rounded-full overflow-hidden">
                            <div className="h-full bg-text-primary/30 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-sm font-medium text-text-secondary w-10 text-right">{r.count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* UTM campaigns */}
                <div className="glass-pill rounded-2xl p-4 sm:p-5">
                  <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">Ad Campaigns (UTM, 30d)</h3>
                  {traffic.topCampaigns.length === 0 ? (
                    <div className="text-xs text-text-tertiary">
                      No tagged traffic yet. Add <code>?utm_source=facebook&amp;utm_medium=cpc&amp;utm_campaign=launch</code> to your ad URLs to track them here.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {traffic.topCampaigns.map((r, i) => (
                        <div key={i} className="flex items-center gap-3 text-xs">
                          <span className="font-mono font-medium text-text-secondary">{r.source || '—'}</span>
                          <span className="text-text-tertiary">/</span>
                          <span className="font-mono text-text-secondary">{r.medium || '—'}</span>
                          <span className="text-text-tertiary">/</span>
                          <span className="font-mono text-text-secondary flex-1 truncate">{r.campaign || '—'}</span>
                          <span className="font-medium text-text-secondary w-10 text-right">{r.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
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

            {/* Bundled Journey — every session from IPs linked to this user */}
            <div className="glass-pill rounded-2xl p-4">
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Journey</h3>
                <span className="text-[10px] text-text-tertiary">{userJourneys.length} session{userJourneys.length === 1 ? '' : 's'}</span>
              </div>
              {userJourneys.length === 0 ? (
                <div className="text-xs text-text-tertiary py-2">No sessions linked yet. Signups through Google-only (no guest flow) start linking on their next visit after this feature ships.</div>
              ) : (
                <div className="space-y-1">
                  {userJourneys.map((s) => {
                    const dur = s.duration_seconds;
                    const durLabel = dur < 60 ? `${dur}s` : `${Math.floor(dur / 60)}m ${dur % 60}s`;
                    const signedIn = !!(s as any).signed_in;
                    const matchType = (s as any).match_type as string | undefined;
                    const matchedTokens = (s as any).matched_tokens as string[] | null;
                    const hasEngagement = s.event_types.some(e =>
                      ['prompt_submit', 'play_audio', 'focus_input', 'chat_auto_send', 'first_ai_response'].includes(e)
                    );
                    const matchLabel =
                      matchType === 'guest_cookie' ? { text: 'linked', cls: 'bg-emerald-100 text-emerald-700', title: 'Linked via guest cookie — reliable' } :
                      matchType === 'user_id' ? { text: 'signed in', cls: 'bg-emerald-100 text-emerald-700', title: 'Event was tagged with this user_id' } :
                      matchType === 'ip_hash' ? { text: 'ip match', cls: 'bg-amber-100 text-amber-700', title: 'Matched via IP hash — loose' } :
                      matchType === 'fuzzy_prompt' ? { text: 'likely (title)', cls: 'bg-blue-100 text-blue-700', title: `Prompt text contains token from one of the user's project titles${matchedTokens?.length ? ': ' + matchedTokens.map(t => t.replace(/%/g,'')).join(', ') : ''}` } :
                      matchType === 'fuzzy_time' ? { text: 'maybe (time)', cls: 'bg-orange-100 text-orange-700', title: 'Session ended within 2 minutes of signup — guess' } :
                      signedIn ? { text: 'signed in', cls: 'bg-emerald-100 text-emerald-700', title: '' } :
                      { text: 'pre-signup', cls: 'bg-black/5 text-text-tertiary', title: '' };
                    return (
                      <button
                        key={s.session_id}
                        onClick={() => loadJourneyDetail(s.session_id, 'user-detail')}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all hover:bg-black/[0.03]',
                          hasEngagement && 'bg-green-50/30'
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-text-primary flex items-center gap-1.5">
                            {s.city || 'Unknown'}{s.region ? `, ${s.region}` : ''}{s.country ? ` · ${s.country}` : ''}
                            <span
                              title={matchLabel.title}
                              className={cn('text-[9px] px-1.5 py-0.5 rounded-full font-semibold', matchLabel.cls)}
                            >{matchLabel.text}</span>
                          </div>
                          <div className="text-[11px] text-text-tertiary mt-0.5 flex flex-wrap gap-1">
                            {s.event_types.filter(e => e !== 'engaged' && e !== 'exit').slice(0, 8).map(e => (
                              <span key={e} className={cn(
                                'px-1.5 py-0.5 rounded-full',
                                ['prompt_submit', 'chat_auto_send', 'first_ai_response'].includes(e)
                                  ? 'bg-green-100 text-green-700'
                                  : e === 'play_audio' ? 'bg-purple-100 text-purple-700'
                                  : e === 'focus_input' ? 'bg-amber-100 text-amber-700'
                                  : 'bg-black/[0.04] text-text-tertiary'
                              )}>{e.replace(/_/g, ' ')}</span>
                            ))}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-xs font-medium text-text-primary">{durLabel}</div>
                          <div className="text-[10px] text-text-tertiary">{s.event_count} events</div>
                          <div className="text-[10px] text-text-tertiary">{timeAgo(s.started_at)}</div>
                        </div>
                        <ChevronRight size={14} className="text-text-tertiary flex-shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========== Journey ========== */}
        {view === 'journey' && (
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs text-text-tertiary">
                Every visitor's full session — from landing to exit. Click a session to see the timeline.
              </div>
              <div className="flex gap-1">
                {[
                  { id: 'all', label: 'All' },
                  { id: '/go/', label: '/go/ only' },
                  { id: 'engaged', label: 'Engaged' },
                  { id: 'not-me', label: 'Not me' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setJourneyFilter(f.id)}
                    className={cn(
                      'text-[10px] px-2.5 py-1 rounded-full border transition-all',
                      journeyFilter === f.id
                        ? 'bg-text-primary text-text-inverse border-text-primary'
                        : 'border-black/10 text-text-tertiary hover:text-text-primary'
                    )}
                  >{f.label}</button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              {journeys.filter((s) => {
                const isAdmin = !!(s as any).is_admin || s.region === 'Missouri' || s.city?.includes('St. Louis') || s.city?.includes('Saint Louis') || s.city?.includes('Roxana');
                const hasGoPage = s.event_types.some(e => e === 'page_load') && (s as any).pages?.includes('/go/');
                const hasEngagement = s.event_types.some(e =>
                  ['prompt_submit', 'play_audio', 'focus_input', 'chat_auto_send', 'first_ai_response'].includes(e)
                );
                if (journeyFilter === '/go/') return true; // server filter handles this
                if (journeyFilter === 'engaged') return hasEngagement;
                if (journeyFilter === 'not-me') return !isAdmin;
                return true;
              }).map((s) => {
                const isAdmin = !!(s as any).is_admin || s.region === 'Missouri' || s.city?.includes('St. Louis') || s.city?.includes('Saint Louis') || s.city?.includes('Roxana');
                const dur = s.duration_seconds;
                const durLabel = dur < 60 ? `${dur}s` : `${Math.floor(dur / 60)}m ${dur % 60}s`;
                const hasEngagement = s.event_types.some(e =>
                  ['prompt_submit', 'play_audio', 'focus_input', 'chat_auto_send', 'first_ai_response'].includes(e)
                );
                return (
                  <button
                    key={s.session_id}
                    onClick={() => loadJourneyDetail(s.session_id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 rounded-xl glass-pill text-left transition-all hover:bg-black/[0.03]',
                      isAdmin && 'border border-dashed border-blue-200 bg-blue-50/30',
                      hasEngagement && !isAdmin && 'border border-green-200 bg-green-50/20'
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-text-primary flex items-center gap-1.5">
                        {s.city || 'Unknown'}{s.region ? `, ${s.region}` : ''}{s.country ? ` · ${s.country}` : ''}
                        {isAdmin && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">You</span>
                        )}
                      </div>
                      <div className="text-[11px] text-text-tertiary mt-0.5 flex flex-wrap gap-1">
                        {s.event_types.filter(e => e !== 'engaged' && e !== 'exit').map(e => (
                          <span key={e} className={cn(
                            'px-1.5 py-0.5 rounded-full',
                            ['prompt_submit', 'chat_auto_send', 'first_ai_response'].includes(e)
                              ? 'bg-green-100 text-green-700'
                              : e === 'play_audio' ? 'bg-purple-100 text-purple-700'
                              : e === 'focus_input' ? 'bg-amber-100 text-amber-700'
                              : 'bg-black/[0.04] text-text-tertiary'
                          )}>{e.replace(/_/g, ' ')}</span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs font-medium text-text-primary">{durLabel}</div>
                      <div className="text-[10px] text-text-tertiary">{s.event_count} events</div>
                      <div className="text-[10px] text-text-tertiary">{timeAgo(s.started_at)}</div>
                    </div>
                    <ChevronRight size={14} className="text-text-tertiary flex-shrink-0" />
                  </button>
                );
              })}
              {journeys.length === 0 && !loading && (
                <div className="text-center text-sm text-text-tertiary py-8">No journeys recorded yet. Give it a few minutes of traffic.</div>
              )}
            </div>
          </div>
        )}

        {/* ========== Journey Detail ========== */}
        {view === 'journey-detail' && journeyDetail && (
          <div className="max-w-3xl mx-auto">
            <button
              onClick={() => setView(journeyDetailOrigin)}
              className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-primary mb-4"
            >
              <ArrowLeft size={14} /> {journeyDetailOrigin === 'user-detail' ? 'Back to user' : 'Back to journeys'}
            </button>
            <div className="glass-pill px-4 py-3 rounded-xl mb-4">
              <div className="text-sm font-medium">
                {journeyDetail.city || 'Unknown'}{journeyDetail.region ? `, ${journeyDetail.region}` : ''}{journeyDetail.country ? ` · ${journeyDetail.country}` : ''}
              </div>
              <div className="text-[11px] text-text-tertiary mt-1">
                Duration: {journeyDetail.durationSeconds < 60 ? `${journeyDetail.durationSeconds}s` : `${Math.floor(journeyDetail.durationSeconds / 60)}m ${journeyDetail.durationSeconds % 60}s`}
                {' · '}{journeyDetail.eventCount} events
                {' · '}{new Date(journeyDetail.startedAt).toLocaleString()}
              </div>
            </div>
            <div className="space-y-0.5">
              {journeyDetail.events.map((e, i) => {
                const ts = new Date(e.timestamp);
                const prevTs = i > 0 ? new Date(journeyDetail.events[i - 1].timestamp) : ts;
                const gap = Math.round((ts.getTime() - prevTs.getTime()) / 1000);
                const isKey = ['prompt_submit', 'chat_auto_send', 'first_ai_response', 'prompt_redirect_arrived', 'play_audio'].includes(e.event);
                return (
                  <div key={i} className="flex gap-3 items-start">
                    {/* Timeline line */}
                    <div className="flex flex-col items-center flex-shrink-0 w-8">
                      <div className={cn(
                        'w-2.5 h-2.5 rounded-full mt-1.5',
                        isKey ? 'bg-green-500' : e.event === 'exit' ? 'bg-red-400' : e.event === 'error' ? 'bg-red-600' : 'bg-black/20'
                      )} />
                      {i < journeyDetail.events.length - 1 && (
                        <div className="w-px flex-1 bg-black/10 min-h-[1.5rem]" />
                      )}
                    </div>
                    <div className="flex-1 pb-3 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          'text-xs font-medium',
                          isKey ? 'text-green-700'
                            : e.event === 'exit' ? 'text-red-600'
                            : e.event === 'error' ? 'text-red-600'
                            : 'text-text-primary'
                        )}>
                          {e.event.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[10px] text-text-tertiary">
                          {i > 0 ? `+${gap}s` : '0s'}
                        </span>
                      </div>
                      {e.data && Object.keys(e.data).length > 0 && (() => {
                        // Clean up display — shorten URLs, hide noisy keys
                        const clean: [string, string][] = [];
                        for (const [k, v] of Object.entries(e.data as Record<string, unknown>)) {
                          if (v === null || v === undefined) continue;
                          const s = String(v);
                          if (k === 'url') {
                            try { const u = new URL(s); clean.push(['from', u.pathname.slice(0, 30)]); }
                            catch { clean.push([k, s.slice(0, 40)]); }
                          } else if (k === 'referrer') {
                            if (!s || s === 'null') continue;
                            try { clean.push(['via', new URL(s).hostname]); }
                            catch { clean.push(['via', s.slice(0, 30)]); }
                          } else if (k === 'prompt') {
                            clean.push(['prompt', s.length > 50 ? s.slice(0, 50) + '…' : s]);
                          } else if (k === 'element') {
                            clean.push(['clicked', s.length > 30 ? s.slice(0, 30) + '…' : s]);
                          } else if (k === 'time_on_page') {
                            const sec = parseInt(s);
                            clean.push(['duration', sec < 60 ? `${sec}s` : `${Math.floor(sec/60)}m ${sec%60}s`]);
                          } else if (k === 'depth_pct' || k === 'max_scroll') {
                            clean.push([k === 'depth_pct' ? 'scroll' : 'max scroll', `${s}%`]);
                          } else if (k === 'seconds') {
                            clean.push(['at', `${s}s`]);
                          } else if (k === 'tag') {
                            continue; // skip HTML tag name, not useful
                          } else {
                            clean.push([k, s.length > 40 ? s.slice(0, 40) + '…' : s]);
                          }
                        }
                        return clean.length > 0 ? (
                          <div className="text-[11px] text-text-tertiary mt-0.5 flex flex-wrap gap-1">
                            {clean.map(([k, v]) => (
                              <span key={k} className="px-1.5 py-0.5 rounded bg-black/[0.04] truncate max-w-[200px]">
                                {k}: {v}
                              </span>
                            ))}
                          </div>
                        ) : null;
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========== Activity Feed ========== */}
        {view === 'activity' && (
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs text-text-tertiary">Recent generations across all users (including signed-out guests)</div>
              <button
                onClick={toggleHideMyGuest}
                className={cn(
                  'text-[10px] px-2.5 py-1 rounded-full border transition-all',
                  hideMyGuest
                    ? 'bg-text-primary text-text-inverse border-text-primary'
                    : 'border-black/10 text-text-tertiary hover:text-text-primary'
                )}
              >
                {hideMyGuest ? 'Showing real users only' : 'Hide my testing'}
              </button>
            </div>
            <div className="space-y-1">
              {activityList
                .filter((a) => {
                  if (!hideMyGuest) return true;
                  if (!a.isGuest) return true;
                  return !myIpHashes.has(a.ipHashPrefix || '');
                })
                .map((a) => {
                const Icon = ACTION_ICONS[a.action] || Zap;
                const isMe = a.isGuest && myIpHashes.has(a.ipHashPrefix || '');
                return (
                  <div
                    key={`${a.isGuest ? 'g' : 'u'}-${a.id}`}
                    className={cn(
                      'flex items-center gap-3 px-4 py-2.5 rounded-xl glass-pill',
                      a.isGuest && !isMe && 'border border-dashed border-black/10',
                      isMe && 'border border-dashed border-blue-200 bg-blue-50/30'
                    )}
                  >
                    <Icon size={14} className="text-text-tertiary flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-text-primary truncate flex items-center gap-1.5">
                        {a.isGuest ? (
                          <span className="italic text-text-secondary">{a.userName || 'Anonymous guest'}</span>
                        ) : (
                          a.userName || a.userEmail || 'Unknown'
                        )}
                        {a.isGuest && a.country && (
                          <span className="text-[10px] text-text-tertiary" title={a.country}>
                            {a.country}
                          </span>
                        )}
                        {isMe && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">You</span>
                        )}
                        {a.isGuest && !isMe && (
                          <button
                            onClick={() => a.ipHashPrefix && toggleMyIp(a.ipHashPrefix)}
                            className="text-[9px] px-1.5 py-0.5 rounded-full border border-black/10 text-text-tertiary hover:text-text-primary hover:border-black/20 transition-colors"
                            title="Mark this IP as yours (for filtering)"
                          >
                            Mark as me
                          </button>
                        )}
                      </div>
                      <div className="text-[11px] text-text-tertiary">
                        {a.guestMetadata && a.action === 'project-created'
                          ? `📚 Created novel: "${a.guestMetadata}"`
                          : (ACTION_LABELS[a.action] || a.action)}
                        {a.model ? ` · ${a.model}` : ''}
                      </div>
                    </div>
                    {a.isGuest ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-amber-100 text-amber-800">
                        Guest
                      </span>
                    ) : (
                      a.userPlan && <PlanBadge plan={a.userPlan} />
                    )}
                    <div className="text-right">
                      <div className="text-xs font-medium text-text-primary">
                        {a.isGuest ? 'free' : `-${a.creditsUsed}`}
                      </div>
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

        {/* ========== Creators ========== */}
        {view === 'creators' && <CreatorsPanel />}

        {/* ========== Outreach ========== */}
        {view === 'outreach' && <OutreachTab />}

        {/* ========== Push Notifications ========== */}
        {view === 'push' && <PushTab />}

        {/* ========== Grok image-reference probe ========== */}
        {view === 'grok-probe' && <GrokProbePanel />}
      </div>
    </div>
  );
}

// Fires /api/admin/debug/grok-image-ref-test for a given project and lays the
// four variants (none | image | images | image_url) out side-by-side so you
// can visually confirm which field xAI actually honors.
function GrokProbePanel() {
  const [projectId, setProjectId] = useState('');
  const [prompt, setPrompt] = useState('The same character, side profile, standing on a grassy hill at sunrise, same outfit and hair');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{
    model: string;
    promptUsed: string;
    heroUrl: string;
    heroBytes: number;
    results: Array<{ label: string; ok: boolean; imageUrl?: string; error?: string; status?: number }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!projectId.trim()) { setError('Enter a project ID first.'); return; }
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const resp = await fetch('/api/admin/debug/grok-image-ref-test', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: projectId.trim(), prompt: prompt.trim() || undefined }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data?.error || `Request failed (${resp.status})`);
        return;
      }
      setResult(data);
    } catch (e: any) {
      setError(e?.message || 'Request failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="glass rounded-2xl p-5">
        <h2 className="text-sm font-serif font-semibold mb-1">Grok image reference-input probe</h2>
        <p className="text-xs text-text-tertiary mb-4">
          Uses the project's hero shot + your prompt, fires four xAI calls varying only the image field
          name. Visually compare — whichever variant matches the hero's character while <code>none</code>{' '}
          doesn't is the field xAI honors. If all four look like <code>none</code>, xAI is ignoring image input.
        </p>

        <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider block mb-1">Project ID</label>
        <input
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          placeholder="e.g. proj_abc123"
          className="w-full px-3 py-2 rounded-lg text-xs bg-black/5 border-none outline-none mb-3 font-mono"
        />

        <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider block mb-1">Test prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 rounded-lg text-xs bg-black/5 border-none outline-none mb-4 resize-none"
        />

        <button
          onClick={run}
          disabled={running || !projectId.trim()}
          className={cn(
            'px-4 py-2 rounded-xl text-xs font-medium transition-all',
            running || !projectId.trim()
              ? 'bg-black/10 text-text-tertiary cursor-not-allowed'
              : 'bg-text-primary text-text-inverse hover:shadow-md',
          )}
        >
          {running ? 'Running 4 variants…' : 'Run probe'}
        </button>

        {error && <div className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
      </div>

      {result && (
        <div className="glass rounded-2xl p-5 space-y-4">
          <div className="text-[11px] text-text-tertiary">
            Model: <code>{result.model}</code> · Hero:{' '}
            <a href={result.heroUrl} target="_blank" rel="noreferrer" className="underline">{result.heroUrl}</a>{' '}
            ({Math.round(result.heroBytes / 1024)} KB)
          </div>

          <div className="rounded-xl overflow-hidden border border-black/10 max-w-xs">
            <img src={result.heroUrl} alt="Hero reference" className="w-full h-auto" />
            <div className="text-[10px] text-center py-1 bg-black/5">Hero reference</div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {result.results.map((r) => (
              <div key={r.label} className={cn(
                'rounded-xl overflow-hidden border',
                r.ok ? 'border-black/10' : 'border-red-200 bg-red-50',
              )}>
                {r.ok && r.imageUrl ? (
                  <a href={r.imageUrl} target="_blank" rel="noreferrer">
                    <img src={r.imageUrl} alt={r.label} className="w-full h-auto" />
                  </a>
                ) : (
                  <div className="aspect-square flex items-center justify-center p-3 text-[10px] text-red-700 text-center">
                    {r.error || 'failed'}
                    {r.status && <div className="mt-1 opacity-60">HTTP {r.status}</div>}
                  </div>
                )}
                <div className="text-[10px] text-center py-1 bg-black/5 font-mono">{r.label}</div>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-text-tertiary leading-relaxed">
            Compare each variant to the hero. The variant that matches = field xAI uses. If every variant
            looks identical to <code>none</code> and unlike the hero, xAI is ignoring image input entirely.
          </p>
        </div>
      )}
    </div>
  );
}

interface UploadState {
  slug: string;
  progress: number;
}

function CreatorsPanel() {
  const [videos, setVideos] = useState<Set<string>>(new Set());
  const [upload, setUpload] = useState<UploadState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [bump, setBump] = useState(0); // cache-bust video previews after upload

  const loadVideos = async () => {
    try {
      const res = await fetch('/api/creator-videos');
      const data = await res.json();
      setVideos(new Set<string>(data.videos || []));
    } catch {
      setError('Could not load video manifest.');
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => { loadVideos(); }, []);

  const handleFile = (slug: string, file: File) => {
    setError(null);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/admin/creator-videos/${slug}`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setUpload({ slug, progress: Math.round((e.loaded / e.total) * 100) });
      }
    };
    xhr.onload = () => {
      setUpload(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        setVideos((prev) => new Set(prev).add(slug));
        setBump((n) => n + 1);
      } else {
        try { setError(JSON.parse(xhr.responseText).error || `Upload failed (${xhr.status})`); }
        catch { setError(`Upload failed (${xhr.status})`); }
      }
    };
    xhr.onerror = () => {
      setUpload(null);
      setError('Network error during upload.');
    };
    const fd = new FormData();
    fd.append('video', file);
    setUpload({ slug, progress: 0 });
    xhr.send(fd);
  };

  const handleDelete = async (slug: string) => {
    if (!confirm(`Delete the video for ${slug}?`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/creator-videos/${slug}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(String(res.status));
      setVideos((prev) => {
        const next = new Set(prev);
        next.delete(slug);
        return next;
      });
    } catch {
      setError('Delete failed.');
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="glass-pill rounded-2xl p-4 sm:p-5">
        <h2 className="text-sm font-semibold mb-1">Welcome videos</h2>
        <p className="text-xs text-text-tertiary leading-relaxed">
          Upload a short personalized MP4 for each creator. It renders under the "Hey {'{name}'}" hero on their page at{' '}
          <code className="text-[11px] bg-black/5 px-1.5 py-0.5 rounded">theodore.tools/creators/[slug]</code>.
          Max 150 MB. Record on your phone, tap upload — the file survives deploys on the persistent disk.
        </p>
      </div>

      {error && (
        <div className="glass-pill rounded-xl p-3 text-sm text-error">{error}</div>
      )}

      {!loaded && (
        <div className="text-center text-sm text-text-tertiary py-8">Loading creators…</div>
      )}

      {loaded && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {CREATORS.map((c) => {
            const hasVideo = videos.has(c.slug);
            const isUploading = upload?.slug === c.slug;
            return (
              <div key={c.slug} className="glass-pill rounded-2xl p-4 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <img
                    src={c.photo}
                    alt={c.channelName}
                    className="w-12 h-12 rounded-full object-cover bg-black/5 shrink-0"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">{c.fullName}</div>
                    <div className="text-[11px] text-text-tertiary truncate">{c.channelName}</div>
                    {c.pronunciation && (
                      <div className="flex items-center gap-1 mt-1 text-[10px] text-text-tertiary italic">
                        <Volume2 size={10} className="shrink-0" />
                        <span className="truncate">{c.pronunciation}</span>
                      </div>
                    )}
                  </div>
                  {hasVideo ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full shrink-0">
                      <CheckCircle2 size={11} /> Live
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary bg-black/5 px-2 py-0.5 rounded-full shrink-0">
                      Empty
                    </span>
                  )}
                </div>

                {hasVideo && (
                  <video
                    key={`${c.slug}-${bump}`}
                    src={`/uploads/creator-videos/${c.slug}.mp4?v=${bump}`}
                    controls
                    preload="metadata"
                    playsInline
                    className="w-full rounded-lg bg-black aspect-video object-cover"
                  />
                )}

                {isUploading ? (
                  <div className="space-y-1.5">
                    <div className="h-1.5 bg-black/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-text-primary transition-all"
                        style={{ width: `${upload!.progress}%` }}
                      />
                    </div>
                    <div className="text-[11px] text-text-tertiary text-center">
                      Uploading… {upload!.progress}%
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <label className="flex-1 cursor-pointer">
                      <input
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleFile(c.slug, f);
                          e.target.value = '';
                        }}
                      />
                      <div className="flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg bg-text-primary text-white hover:opacity-90 transition-opacity">
                        <Upload size={13} />
                        {hasVideo ? 'Replace' : 'Upload'}
                      </div>
                    </label>
                    {hasVideo && (
                      <button
                        onClick={() => handleDelete(c.slug)}
                        className="px-3 py-2 rounded-lg bg-black/5 hover:bg-black/10 text-text-tertiary hover:text-error transition-colors"
                        title="Delete video"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <a
                    href={`/creators/${c.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-text-secondary hover:text-text-primary bg-black/5 hover:bg-black/10 rounded-lg py-2 transition-colors"
                  >
                    <ExternalLink size={12} />
                    Page
                  </a>
                  <a
                    href={`mailto:${c.email}?subject=${encodeURIComponent(c.subject)}&body=${encodeURIComponent(c.body)}`}
                    className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-text-secondary hover:text-text-primary bg-black/5 hover:bg-black/10 rounded-lg py-2 transition-colors"
                  >
                    <Mail size={12} />
                    Email
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
