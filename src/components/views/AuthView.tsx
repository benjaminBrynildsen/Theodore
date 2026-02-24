import { useEffect, useState } from 'react';
import { Lock, Mail, Sparkles, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '../../store/auth';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';

type Mode = 'login' | 'register' | 'forgot';

interface AuthViewProps {
  onBack?: () => void;
}

export function AuthView({ onBack }: AuthViewProps) {
  const { login, register, loading, error: authError } = useAuthStore();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [devResetToken, setDevResetToken] = useState('');
  const rotatingWords = ['impulse', 'inspiration', 'intention', 'insight', 'instinct', 'ambition', 'aspiration', 'objective', 'outline', 'idea'];
  const [wordIndex, setWordIndex] = useState(0);
  const [speedStep, setSpeedStep] = useState(0);
  const [wordVisible, setWordVisible] = useState(true);
  const speedCurveMs = [1000, 900, 820, 760, 700, 660, 620, 590, 560, 540];
  const finalWordIndex = rotatingWords.length - 1;
  const passwordInvalid = mode === 'register' ? password.length < 8 : mode === 'login' ? password.length === 0 : false;
  const submitDisabled = loading || !email.trim() || passwordInvalid;
  const modeCopy: Record<Mode, { title: string; subtitle: string }> = {
    login: {
      title: 'Welcome back',
      subtitle: 'Sign in to continue writing.',
    },
    register: {
      title: 'Create account',
      subtitle: 'Start a new secure workspace.',
    },
    forgot: {
      title: 'Reset password',
      subtitle: 'Request a reset link.',
    },
  };

  useEffect(() => {
    if (wordIndex >= finalWordIndex) {
      setWordVisible(true);
      return;
    }

    const delay = speedCurveMs[Math.min(speedStep, speedCurveMs.length - 1)];
    const fadeWindow = 140;
    const fadeAt = Math.max(0, delay - fadeWindow);

    const hideTimeout = setTimeout(() => {
      setWordVisible(false);
    }, fadeAt);

    const swapTimeout = setTimeout(() => {
      setWordIndex((prev) => Math.min(prev + 1, finalWordIndex));
      setWordVisible(true);
      setSpeedStep((prev) => Math.min(prev + 1, speedCurveMs.length - 1));
    }, delay);

    return () => {
      clearTimeout(hideTimeout);
      clearTimeout(swapTimeout);
    };
  }, [finalWordIndex, speedCurveMs.length, speedStep, wordIndex]);

  const submit = async () => {
    if (!email.trim()) return;
    setStatus('saving');
    setMessage('');
    setDevResetToken('');
    try {
      if (mode === 'login') {
        await login(email.trim(), password);
      } else if (mode === 'register') {
        await register(email.trim(), password, name.trim() || undefined);
      } else {
        const result = await api.authForgotPassword({ email: email.trim() });
        setStatus('success');
        setMessage(result.message || 'If the email exists, a reset link has been sent.');
        if (result.resetToken) {
          setDevResetToken(result.resetToken);
        }
        return;
      }
      setStatus('success');
    } catch (e: any) {
      const raw = String(e?.message || 'Authentication failed.');
      const normalized = raw.toLowerCase();
      const friendlyMessage = normalized.includes('invalid email or password')
        ? 'Incorrect email or password.'
        : normalized.includes('failed to fetch') || normalized.includes('networkerror')
        ? 'Cannot reach Theodore auth server. Make sure the server is running on port 3001.'
        : raw;
      setStatus('error');
      setMessage(friendlyMessage);
    }
  };

  return (
    <div className="h-screen w-full bg-[#f6f6f4] flex flex-col items-center justify-center px-4">
      {onBack && (
        <button
          onClick={onBack}
          className="self-start ml-4 sm:ml-auto sm:mr-auto sm:max-w-4xl sm:w-full mb-4 flex items-center gap-1.5 text-sm text-black/40 hover:text-black/70 transition-colors"
        >
          <ArrowLeft size={16} />
          Back
        </button>
      )}
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-[1fr_1fr] rounded-[28px] overflow-hidden border border-black/10 shadow-[0_24px_60px_rgba(0,0,0,0.10)] bg-white">
        <div className="p-8 lg:p-10 border-b lg:border-b-0 lg:border-r border-black/10 bg-white flex flex-col items-center justify-center text-center">
          <div className="text-[11px] uppercase tracking-[0.18em] font-semibold text-black/50">Theodore</div>
          <h1 className="mt-4 max-w-[460px] font-serif text-[44px] leading-[1.08] tracking-[-0.02em] text-black">
            All you need is an{' '}
            <span className="inline-flex items-baseline"><span
              className={cn(
                'inline-block font-medium transition-all duration-200',
                wordVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'
              )}
            >
              {rotatingWords[wordIndex]}
            </span><span
              className={cn(
                'inline-block h-[0.9em] w-[2px] translate-y-[0.05em] rounded-full bg-black/80 transition-opacity duration-200',
                wordIndex === finalWordIndex ? 'caret-blink opacity-100' : 'opacity-0'
              )}
            /></span>
          </h1>
        </div>

        <div className="p-8 lg:p-10 bg-[#fbfbfb]">
          <h2 className="text-2xl font-serif text-text-primary">{modeCopy[mode].title}</h2>
          <p className="text-sm text-text-secondary mt-1 mb-5">{modeCopy[mode].subtitle}</p>

          <div className="flex items-center gap-1 rounded-xl bg-black/[0.04] p-1 mb-5">
            {([
              { id: 'login' as const, label: 'Sign In' },
              { id: 'register' as const, label: 'Create Account' },
              { id: 'forgot' as const, label: 'Reset Password' },
            ]).map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setMode(tab.id);
                  setStatus('idle');
                  setMessage('');
                  setDevResetToken('');
                }}
                className={cn(
                  'flex-1 rounded-lg py-2 text-xs font-medium transition-all',
                  mode === tab.id ? 'bg-white shadow-sm text-text-primary' : 'text-text-tertiary hover:text-text-primary'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {mode === 'register' && (
            <div className="mb-3">
              <label className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full mt-1 rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-black/20 focus:ring-2 focus:ring-black/5"
              />
            </div>
          )}

          <div className="mb-3">
            <label className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Email</label>
            <div className="relative mt-1">
              <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-black/10 bg-white pl-9 pr-3 py-2.5 text-sm outline-none focus:border-black/20 focus:ring-2 focus:ring-black/5"
              />
            </div>
          </div>

          {mode !== 'forgot' && (
            <div className="mb-4">
              <label className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Password</label>
              <div className="relative mt-1">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
                <input
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'}
                  className="w-full rounded-xl border border-black/10 bg-white pl-9 pr-3 py-2.5 text-sm outline-none focus:border-black/20 focus:ring-2 focus:ring-black/5"
                />
              </div>
            </div>
          )}

          <button
            onClick={submit}
            disabled={submitDisabled}
            className={cn(
              'w-full rounded-xl py-3 text-sm font-semibold transition-all',
              submitDisabled
                ? 'bg-black/10 text-text-tertiary cursor-not-allowed'
                : 'bg-black text-white hover:shadow-lg active:scale-[0.99]'
            )}
          >
            {loading || status === 'saving'
              ? 'Working...'
              : mode === 'login'
              ? 'Sign In'
              : mode === 'register'
              ? 'Create Account'
              : 'Send Reset Link'}
          </button>

          {(status === 'error' || !!authError) && (
            <div className="mt-3 text-xs rounded-lg border border-red-200 bg-red-50 text-red-700 px-3 py-2">
              {message || authError || 'Request failed.'}
            </div>
          )}
          {status === 'success' && mode === 'forgot' && (
            <div className="mt-3 text-xs rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 px-3 py-2">
              {message}
              {devResetToken && (
                <div className="mt-2 font-mono break-all text-[11px]">
                  Dev reset token: {devResetToken}
                </div>
              )}
            </div>
          )}

          <div className="mt-4 flex items-center gap-2 text-xs text-black/50">
            <Sparkles size={12} />
            <span>Secure sign-in with persistent sessions.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
