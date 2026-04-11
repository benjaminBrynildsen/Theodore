import { useEffect } from 'react';
import { BookOpen, Sparkles, ArrowRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import * as pixel from '../../lib/pixel';
import { track as jTrack } from '../../lib/journey';

interface GuestSignupModalProps {
  onSignUp: () => void;
  onDismiss: () => void;
}

export function GuestSignupModal({ onSignUp, onDismiss }: GuestSignupModalProps) {
  useEffect(() => {
    pixel.trackCustom('GuestSignupModalShown');
    jTrack('guest_signup_modal_shown');
  }, []);

  const handleSignUp = () => {
    pixel.trackCustom('GuestSignupModalSignUp');
    jTrack('guest_signup_modal_signup');
    onSignUp();
  };

  const handleDismiss = () => {
    pixel.trackCustom('GuestSignupModalDismissed');
    jTrack('guest_signup_modal_dismissed');
    onDismiss();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-white/70 backdrop-blur-2xl" onClick={handleDismiss} />

      <div className="relative bg-white rounded-3xl shadow-2xl border border-black/5 w-full max-w-md mx-4 animate-scale-in overflow-hidden">
        <div className="p-8 flex flex-col items-center text-center">
          {/* Icon */}
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center mb-5">
            <BookOpen size={24} className="text-amber-700" />
          </div>

          {/* Heading */}
          <h2 className="text-2xl font-serif font-semibold mb-2">
            Don&apos;t lose your story.
          </h2>

          {/* Subtext */}
          <p className="text-sm text-text-tertiary leading-relaxed max-w-xs">
            Your novel is ready. Create a free account to keep it — plus get 100 credits to generate audiobooks, new chapters, and more.
          </p>

          {/* Primary CTA */}
          <button
            onClick={handleSignUp}
            className={cn(
              'mt-6 w-full py-3 rounded-2xl text-sm font-semibold transition-all active:scale-[0.98]',
              'bg-text-primary text-text-inverse shadow-md hover:shadow-lg',
              'flex items-center justify-center gap-2'
            )}
          >
            <Sparkles size={16} />
            Sign Up Free — Keep My Novel
          </button>

          {/* Secondary dismiss */}
          <button
            onClick={handleDismiss}
            className="mt-3 text-sm text-text-tertiary hover:text-text-primary transition-colors flex items-center gap-1"
          >
            Read Chapter First
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
