import { mainAppUrl } from './api';

export function CreateCTA({ authorName, variant = 'sticky' }: { authorName?: string; variant?: 'sticky' | 'card' | 'inline' }) {
  const href = mainAppUrl();

  if (variant === 'card') {
    return (
      <a
        href={href}
        className="block rounded-2xl bg-gradient-to-br from-amber-100 via-rose-100 to-purple-100 p-6 shadow-lg hover:shadow-xl transition-all"
      >
        <p className="text-xs uppercase tracking-widest text-neutral-600 mb-2">Theodore · Story Engine</p>
        <h3 className="text-xl font-serif font-semibold text-neutral-900 leading-tight">
          {authorName ? `${authorName} wrote this on Theodore.` : 'This was written on Theodore.'}
        </h3>
        <p className="text-sm text-neutral-700 mt-2">Turn any idea into a full book with voice narration — free to try.</p>
        <span className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-900 text-white text-sm font-medium">
          Create your story free →
        </span>
      </a>
    );
  }

  if (variant === 'inline') {
    return (
      <a href={href} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800 transition-colors">
        Create your story free →
      </a>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-black/80 backdrop-blur-lg">
      <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <div className="text-white text-sm leading-tight">
          <div className="font-semibold">Write your own story</div>
          <div className="text-white/60 text-xs">AI-powered novels + audiobooks. Free to start.</div>
        </div>
        <a
          href={href}
          className="shrink-0 px-4 py-2.5 rounded-full bg-white text-black text-sm font-semibold hover:scale-105 active:scale-95 transition-transform"
        >
          Create free →
        </a>
      </div>
    </div>
  );
}
