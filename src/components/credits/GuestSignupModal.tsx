import { useEffect, useState, useRef } from 'react';
import { BookOpen, ArrowRight, X, Mail, Lock, Eye, EyeOff, Headphones } from 'lucide-react';
import { cn } from '../../lib/utils';
import * as pixel from '../../lib/pixel';
import { track as jTrack } from '../../lib/journey';
import { useAuthStore } from '../../store/auth';

const GOOGLE_CLIENT_ID = '296594825511-3m0g5t2l0ombm3j8cdc5ncqe673obg4d.apps.googleusercontent.com';

interface GuestSignupModalProps {
  onSignUp: () => void;
  onDismiss: () => void;
  variant?: 'novel' | 'audio'; // audio variant shows different copy
}

export function GuestSignupModal({ onSignUp, onDismiss, variant = 'novel' }: GuestSignupModalProps) {
  const { login, register, googleLogin, loading } = useAuthStore();
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const [googleReady, setGoogleReady] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  // Load Google script
  useEffect(() => {
    if ((window as any).google?.accounts?.id) { setGoogleReady(true); return; }
    if (document.getElementById('google-gsi-script')) {
      const check = setInterval(() => {
        if ((window as any).google?.accounts?.id) { setGoogleReady(true); clearInterval(check); }
      }, 100);
      setTimeout(() => clearInterval(check), 5000);
      return;
    }
    const script = document.createElement('script');
    script.id = 'google-gsi-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => setGoogleReady(true);
    document.head.appendChild(script);
  }, []);

  // Route Google sign-in through a ref so the effect below can stay stable
  // even when the parent passes fresh `onSignUp` refs on every render
  // (which it does — AudioPlayerBar re-renders ~4x/sec on timeupdate).
  // Without this, the render-button effect re-ran every parent tick, wiping
  // the Google iframe (innerHTML = '') and re-injecting it — since the
  // modal is flex-centered, the 40px iframe collapsing/reappearing made the
  // whole card jump up and down.
  const onSignUpRef = useRef(onSignUp);
  useEffect(() => { onSignUpRef.current = onSignUp; }, [onSignUp]);

  useEffect(() => {
    if (!googleReady || !googleBtnRef.current) return;
    const google = (window as any).google;
    if (!google?.accounts?.id) return;
    const cb = async (response: any) => {
      try {
        await googleLogin(response.credential);
        pixel.trackCustom('GuestSignupModalSignUp');
        jTrack('guest_signup_modal_google');
        onSignUpRef.current();
      } catch { /* error shown via state */ }
    };
    googleBtnRef.current.innerHTML = '';
    google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: cb });
    google.accounts.id.renderButton(googleBtnRef.current, {
      theme: 'outline', size: 'large', width: googleBtnRef.current.offsetWidth || 300,
      text: 'continue_with', shape: 'pill',
    });
  }, [googleReady, googleLogin]);

  useEffect(() => {
    pixel.trackCustom('GuestSignupModalShown');
    jTrack('guest_signup_modal_shown', { variant });
  }, [variant]);

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
    jTrack('guest_signup_modal_dismissed', { variant });
    onDismiss();
  };

  const passwordInvalid = mode === 'register' ? password.length > 0 && password.length < 8 : false;
  const submitDisabled = loading || !email.trim() || !password || (mode === 'register' && password.length < 8);

  const isAudio = variant === 'audio';
  const Icon = isAudio ? Headphones : BookOpen;
  const heading = isAudio ? 'Keep listening.' : "Don't lose your story.";
  const subtext = isAudio
    ? 'Sign up free to save your audiobook and keep listening. Plus 100 credits for more chapters.'
    : 'Create a free account to keep your novel — plus 100 credits for audiobooks and more.';
  const dismissText = isAudio ? 'Not now →' : 'Read Chapter First →';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      <div className="relative bg-white rounded-3xl shadow-2xl border border-black/5 w-full max-w-md mx-4 animate-scale-in overflow-hidden">
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-black/5 transition-all z-10"
        >
          <X size={18} />
        </button>
        <div className="p-6 sm:p-8">
          {/* Header */}
          <div className="flex flex-col items-center text-center mb-5">
            <div className={cn(
              'w-12 h-12 rounded-2xl flex items-center justify-center mb-4',
              isAudio ? 'bg-gradient-to-br from-violet-100 to-purple-100' : 'bg-gradient-to-br from-amber-100 to-orange-100'
            )}>
              <Icon size={20} className={isAudio ? 'text-violet-700' : 'text-amber-700'} />
            </div>
            <h2 className="text-xl font-serif font-semibold">{heading}</h2>
            <p className="text-sm text-text-tertiary mt-1 max-w-xs">{subtext}</p>
          </div>

          {/* Google Sign-In */}
          <div ref={googleBtnRef} className="w-full flex justify-center mb-3" />

          {/* Sign up with email — collapsed by default */}
          {!showEmailForm ? (
            <>
              <button
                onClick={() => setShowEmailForm(true)}
                className="w-full py-2.5 rounded-xl text-sm font-medium text-text-secondary border border-black/10 hover:bg-black/[0.03] transition-all"
              >
                Sign up with email
              </button>
              <p className="text-center text-xs text-text-tertiary mt-3">
                Already have an account? <button onClick={() => { setShowEmailForm(true); setMode('login'); }} className="text-text-primary font-medium hover:underline">Sign in</button>
              </p>
            </>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-3 animate-fade-in">
                {mode === 'register' && (
                  <input
                    type="text"
                    placeholder="Name (optional)"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-black/10 bg-white/80 text-sm outline-none focus:border-black/30 focus:ring-1 focus:ring-black/10 transition-all"
                  />
                )}
                <div className="relative">
                  <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary" />
                  <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
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
                {error && <p className="text-xs text-red-600 px-1">{error}</p>}
                <button
                  type="submit"
                  disabled={submitDisabled}
                  className="w-full py-3 rounded-xl text-sm font-semibold bg-text-primary text-text-inverse shadow-md hover:shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Working...' : mode === 'register' ? 'Create Free Account' : 'Sign In'}
                </button>
              </form>
              <p className="text-center text-xs text-text-tertiary mt-3">
                {mode === 'register' ? (
                  <>Already have an account? <button onClick={() => { setMode('login'); setError(''); }} className="text-text-primary font-medium hover:underline">Sign in</button></>
                ) : (
                  <>No account? <button onClick={() => { setMode('register'); setError(''); }} className="text-text-primary font-medium hover:underline">Create one free</button></>
                )}
              </p>
            </>
          )}

          {/* Dismiss */}
          <button
            onClick={handleDismiss}
            className="mt-4 w-full text-center text-sm text-text-tertiary hover:text-text-primary transition-colors flex items-center justify-center gap-1"
          >
            {dismissText}
          </button>
        </div>
      </div>
    </div>
  );
}
