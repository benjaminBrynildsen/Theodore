import { useEffect, useState } from 'react';
import { BookOpen, ArrowRight, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import * as pixel from '../../lib/pixel';
import { track as jTrack } from '../../lib/journey';
import { useAuthStore } from '../../store/auth';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';

interface GuestSignupModalProps {
  onSignUp: () => void;
  onDismiss: () => void;
}

export function GuestSignupModal({ onSignUp, onDismiss }: GuestSignupModalProps) {
  const { login, register, loading } = useAuthStore();
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    pixel.trackCustom('GuestSignupModalShown');
    jTrack('guest_signup_modal_shown');
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setError('');
    try {
      if (mode === 'register') {
        await register(email.trim(), password, name.trim() || undefined);
      } else {
        await login(email.trim(), password);
      }
      pixel.trackCustom('GuestSignupModalSignUp');
      jTrack('guest_signup_modal_signup');
      onSignUp();
    } catch (err: any) {
      const msg = String(err?.message || 'Something went wrong.');
      setError(
        msg.toLowerCase().includes('invalid email or password') ? 'Incorrect email or password.' :
        msg.toLowerCase().includes('already exists') ? 'Account exists — try signing in instead.' :
        msg
      );
    }
  };

  const handleDismiss = () => {
    pixel.trackCustom('GuestSignupModalDismissed');
    jTrack('guest_signup_modal_dismissed');
    onDismiss();
  };

  const passwordInvalid = mode === 'register' ? password.length > 0 && password.length < 8 : false;
  const submitDisabled = loading || !email.trim() || !password || (mode === 'register' && password.length < 8);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop — don't dismiss on tap (too easy to accidentally close on mobile) */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      <div className="relative bg-white rounded-3xl shadow-2xl border border-black/5 w-full max-w-md mx-4 animate-scale-in overflow-hidden">
        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-black/5 transition-all z-10"
        >
          <X size={18} />
        </button>
        <div className="p-6 sm:p-8">
          {/* Header */}
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center mb-4">
              <BookOpen size={20} className="text-amber-700" />
            </div>
            <h2 className="text-xl font-serif font-semibold">
              Don&apos;t lose your story.
            </h2>
            <p className="text-sm text-text-tertiary mt-1 max-w-xs">
              {mode === 'register'
                ? 'Create a free account to keep your novel — plus 100 credits for audiobooks and more.'
                : 'Sign in to save your novel to your account.'}
            </p>
          </div>

          {/* Inline auth form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'register' && (
              <div className="relative">
                <input
                  type="text"
                  placeholder="Name (optional)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-black/10 bg-white/80 text-sm outline-none focus:border-black/30 focus:ring-1 focus:ring-black/10 transition-all"
                />
              </div>
            )}
            <div className="relative">
              <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="w-full pl-11 pr-4 py-3 rounded-xl border border-black/10 bg-white/80 text-sm outline-none focus:border-black/30 focus:ring-1 focus:ring-black/10 transition-all"
              />
            </div>
            <div className="relative">
              <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder={mode === 'register' ? 'Password (8+ characters)' : 'Password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                className={cn(
                  'w-full pl-11 pr-11 py-3 rounded-xl border bg-white/80 text-sm outline-none transition-all',
                  passwordInvalid ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : 'border-black/10 focus:border-black/30 focus:ring-1 focus:ring-black/10'
                )}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {error && (
              <p className="text-xs text-red-600 px-1">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitDisabled}
              className={cn(
                'w-full py-3 rounded-xl text-sm font-semibold transition-all active:scale-[0.98]',
                'bg-text-primary text-text-inverse shadow-md hover:shadow-lg',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {loading ? 'Working...' : mode === 'register' ? 'Create Free Account' : 'Sign In'}
            </button>
          </form>

          {/* Toggle login/register */}
          <p className="text-center text-xs text-text-tertiary mt-4">
            {mode === 'register' ? (
              <>Already have an account? <button onClick={() => { setMode('login'); setError(''); }} className="text-text-primary font-medium hover:underline">Sign in</button></>
            ) : (
              <>No account? <button onClick={() => { setMode('register'); setError(''); }} className="text-text-primary font-medium hover:underline">Create one free</button></>
            )}
          </p>

          {/* Dismiss */}
          <button
            onClick={handleDismiss}
            className="mt-4 w-full text-center text-sm text-text-tertiary hover:text-text-primary transition-colors flex items-center justify-center gap-1"
          >
            Read Chapter First
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
