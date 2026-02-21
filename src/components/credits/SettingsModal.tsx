import { useState } from 'react';
import { X, Coins, Key, CreditCard, History, ChevronRight } from 'lucide-react';
import { useCreditsStore } from '../../store/credits';
import { PLAN_DETAILS, CREDIT_COSTS } from '../../types/credits';
import { cn } from '../../lib/utils';

export function SettingsModal() {
  const { showSettingsModal, setShowSettingsModal, setShowUpgradeModal, plan, transactions, setByokKey } = useCreditsStore();
  const [activeTab, setActiveTab] = useState<'overview' | 'usage' | 'api'>('overview');
  const [apiKeyInput, setApiKeyInput] = useState('');

  if (!showSettingsModal) return null;

  const details = PLAN_DETAILS[plan.tier];
  const percentage = plan.creditsTotal > 0 ? (plan.creditsRemaining / plan.creditsTotal) * 100 : 100;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-white/70 backdrop-blur-2xl" onClick={() => setShowSettingsModal(false)} />
      
      <div className="relative bg-white rounded-3xl shadow-2xl border border-black/5 w-full max-w-lg mx-4 animate-scale-in overflow-hidden">
        <div className="flex items-center justify-between p-6 pb-4">
          <h2 className="text-xl font-serif font-semibold">Settings</h2>
          <button onClick={() => setShowSettingsModal(false)} className="p-2 rounded-xl text-text-tertiary hover:text-text-primary hover:bg-white/40 transition-all">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 mb-4">
          {[
            { id: 'overview' as const, label: 'Plan', icon: Coins },
            { id: 'usage' as const, label: 'Usage', icon: History },
            { id: 'api' as const, label: 'API Key', icon: Key },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all',
                activeTab === id
                  ? 'bg-text-primary text-text-inverse shadow-sm'
                  : 'text-text-secondary hover:bg-black/5'
              )}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="px-6 pb-6 animate-fade-in">
            {/* Current Plan */}
            <div className="glass rounded-2xl p-5 mb-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-semibold">{details.name} Plan</div>
                  <div className="text-xs text-text-tertiary">{details.price}</div>
                </div>
                <button
                  onClick={() => { setShowSettingsModal(false); setShowUpgradeModal(true); }}
                  className="text-xs font-medium px-3 py-1.5 rounded-xl bg-text-primary text-text-inverse hover:shadow-md transition-all active:scale-[0.98]"
                >
                  Change Plan
                </button>
              </div>

              {plan.tier !== 'byok' && (
                <>
                  {/* Credits Bar */}
                  <div className="mb-2">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-text-secondary">{plan.creditsRemaining.toLocaleString()} remaining</span>
                      <span className="text-text-tertiary">{plan.creditsTotal.toLocaleString()} total</span>
                    </div>
                    <div className="w-full h-2 bg-black/5 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-500',
                          percentage < 20 ? 'bg-error' : percentage < 50 ? 'bg-warning' : 'bg-success'
                        )}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-xs text-text-tertiary">
                    {plan.creditsUsed.toLocaleString()} credits used this period
                  </div>
                </>
              )}

              {plan.tier === 'byok' && (
                <div className="text-xs text-text-secondary">
                  Using your own API key — unlimited usage, you pay API costs directly.
                </div>
              )}
            </div>

            {/* Credit Costs Reference */}
            <div className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2">Credit Costs</div>
            <div className="space-y-1">
              {Object.entries(CREDIT_COSTS).map(([action, cost]) => (
                <div key={action} className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-black/3 transition-colors">
                  <span className="text-sm text-text-secondary">{cost.label}</span>
                  <span className="text-xs text-text-tertiary font-mono">~{cost.typical} credits</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Usage Tab */}
        {activeTab === 'usage' && (
          <div className="px-6 pb-6 animate-fade-in">
            {transactions.length === 0 ? (
              <div className="text-center py-12 text-text-tertiary text-sm">
                No usage yet. Start writing to see your credit usage here.
              </div>
            ) : (
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {[...transactions].reverse().map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-black/3 transition-colors">
                    <div>
                      <div className="text-sm">{CREDIT_COSTS[tx.action]?.label || tx.action}</div>
                      <div className="text-xs text-text-tertiary">
                        {new Date(tx.timestamp).toLocaleString()} · {tx.model}
                      </div>
                    </div>
                    <span className="text-xs font-mono text-text-secondary">
                      -{tx.creditsUsed}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* API Key Tab */}
        {activeTab === 'api' && (
          <div className="px-6 pb-6 animate-fade-in">
            <div className="glass rounded-2xl p-5 mb-4">
              <h3 className="text-sm font-semibold mb-1">Bring Your Own Key</h3>
              <p className="text-xs text-text-tertiary mb-4">
                Connect your own API key for unlimited usage. You'll pay API costs directly to the provider. Platform fee: $5/mo.
              </p>
              
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-text-tertiary uppercase tracking-wider">API Key</label>
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="sk-..."
                    className="w-full mt-1 px-3 py-2.5 rounded-xl glass-input text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Provider</label>
                  <div className="flex gap-2 mt-1">
                    {['Anthropic', 'OpenAI', 'OpenRouter'].map((provider) => (
                      <button
                        key={provider}
                        className="flex-1 py-2 text-xs rounded-xl glass-pill text-text-secondary hover:bg-white/60 transition-all"
                      >
                        {provider}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => {
                    if (apiKeyInput) {
                      setByokKey(apiKeyInput);
                      setApiKeyInput('');
                    }
                  }}
                  disabled={!apiKeyInput}
                  className={cn(
                    'w-full py-2.5 rounded-xl text-sm font-medium transition-all',
                    apiKeyInput
                      ? 'bg-text-primary text-text-inverse shadow-md hover:shadow-lg active:scale-[0.98]'
                      : 'bg-black/5 text-text-tertiary cursor-not-allowed'
                  )}
                >
                  Connect Key
                </button>
              </div>
            </div>

            <div className="text-xs text-text-tertiary text-center glass-pill py-2 px-4 rounded-xl">
              🔒 Keys are encrypted and never shared. Used only for your generations.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
