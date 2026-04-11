import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../../store/auth';

const GOOGLE_CLIENT_ID = '296594825511-3m0g5t2l0ombm3j8cdc5ncqe673obg4d.apps.googleusercontent.com';

export function GoogleAuthTest() {
  const { user, googleLogin, loading, error } = useAuthStore();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [status, setStatus] = useState('');

  // Load Google Identity Services script
  useEffect(() => {
    if (document.getElementById('google-gsi-script')) {
      setScriptLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.id = 'google-gsi-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => setScriptLoaded(true);
    document.head.appendChild(script);
  }, []);

  // Initialize Google button once script loads
  useEffect(() => {
    if (!scriptLoaded || !buttonRef.current) return;
    const google = (window as any).google;
    if (!google?.accounts?.id) return;

    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (response: any) => {
        setStatus('Signing in...');
        try {
          await googleLogin(response.credential);
          setStatus('Signed in!');
        } catch (e: any) {
          setStatus('Error: ' + (e.message || 'Failed'));
        }
      },
    });

    google.accounts.id.renderButton(buttonRef.current, {
      theme: 'outline',
      size: 'large',
      width: 320,
      text: 'continue_with',
      shape: 'pill',
    });
  }, [scriptLoaded, googleLogin]);

  return (
    <div className="min-h-screen bg-[#f6f6f4] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-black/10 shadow-xl bg-white p-8">
        <h1 className="text-2xl font-serif font-semibold mb-2">Google Auth Test</h1>
        <p className="text-sm text-black/50 mb-6">Testing Google Sign-In integration</p>

        {/* Google Sign-In button */}
        <div ref={buttonRef} className="flex justify-center mb-6" />

        {!scriptLoaded && (
          <p className="text-sm text-black/40 text-center">Loading Google...</p>
        )}

        {/* Status */}
        {status && (
          <div className="text-sm text-center mb-4 text-black/60">{status}</div>
        )}
        {error && (
          <div className="text-sm text-center mb-4 text-red-600">{error}</div>
        )}

        {/* User info if signed in */}
        {user && (
          <div className="mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200">
            <p className="text-sm font-semibold text-emerald-800">Signed in as:</p>
            <p className="text-sm text-emerald-700">{user.name || 'No name'}</p>
            <p className="text-sm text-emerald-700">{user.email}</p>
            <p className="text-xs text-emerald-600 mt-1">ID: {user.id}</p>
          </div>
        )}

        <div className="mt-6 text-center">
          <a href="/" className="text-sm text-black/40 hover:text-black/70">Back to Theodore</a>
        </div>
      </div>
    </div>
  );
}
