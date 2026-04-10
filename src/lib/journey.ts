// ========== Journey Tracker — Client Side ==========
// Lightweight session tracker that captures every user action and sends
// batched events to /api/journey. Works in both the /go/ static page
// (via global window.__journey) and the React app (via this module).

const SESSION_ID = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const FLUSH_INTERVAL = 5000; // send batch every 5 seconds
const API_URL = '/api/journey';
const BEACON_URL = '/api/beacon';

interface JourneyEvent {
  sessionId: string;
  event: string;
  data?: Record<string, unknown>;
  page?: string;
  city?: string;
  region?: string;
  country?: string;
}

let queue: JourneyEvent[] = [];
let geo: { city?: string; region?: string; country?: string } = {};
let flushing = false;
let started = false;

// Resolve geo once on init
function resolveGeo() {
  fetch('https://ipapi.co/json/')
    .then((r) => r.json())
    .then((d) => {
      geo = { city: d.city, region: d.region, country: d.country_code };
    })
    .catch(() => {});
}

function getPage(): string {
  if (typeof window === 'undefined') return '';
  return window.location.pathname + window.location.search;
}

export function track(event: string, data?: Record<string, unknown>) {
  queue.push({
    sessionId: SESSION_ID,
    event,
    data,
    page: getPage(),
    ...geo,
  });
}

async function flush() {
  if (flushing || queue.length === 0) return;
  flushing = true;
  const batch = queue.splice(0, 100);
  try {
    await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: batch }),
    });
  } catch {
    // Put events back on failure
    queue.unshift(...batch);
  }
  flushing = false;
}

function flushBeacon() {
  if (queue.length === 0) return;
  const batch = queue.splice(0, 100);
  const body = JSON.stringify({ events: batch });
  if (navigator.sendBeacon) {
    navigator.sendBeacon(BEACON_URL, body);
  } else {
    fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  }
}

// Auto-track common interactions
function setupAutoTracking() {
  const landed = Date.now();
  let maxScroll = 0;

  // Scroll tracking (throttled)
  let scrollTimer: ReturnType<typeof setTimeout> | null = null;
  window.addEventListener('scroll', () => {
    if (scrollTimer) return;
    scrollTimer = setTimeout(() => {
      scrollTimer = null;
      const pct = Math.round(
        ((window.scrollY + window.innerHeight) / document.body.scrollHeight) * 100
      );
      if (pct > maxScroll + 10) {
        maxScroll = pct;
        track('scroll', { depth_pct: pct });
      }
    }, 300);
  }, { passive: true });

  // Timed engagement milestones
  [5, 15, 30, 60, 120].forEach((sec) => {
    setTimeout(() => track('engaged', { seconds: sec }), sec * 1000);
  });

  // Track clicks on interactive elements
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const el = target.closest('button, a, [role="button"], input, textarea');
    if (!el) return;
    const desc =
      el.getAttribute('data-journey') ||
      el.getAttribute('aria-label') ||
      (el as HTMLButtonElement).innerText?.slice(0, 50) ||
      el.tagName.toLowerCase();
    track('click', { element: desc, tag: el.tagName.toLowerCase() });
  });

  // Track focus on text inputs
  document.addEventListener('focusin', (e) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
      track('focus_input', {
        placeholder: (target as HTMLInputElement).placeholder?.slice(0, 50),
      });
    }
  });

  // Track errors (502s, network failures, JS errors)
  window.addEventListener('error', (e) => {
    track('error', { message: e.message?.slice(0, 100), source: e.filename?.slice(-50) });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const msg = e.reason?.message || String(e.reason);
    if (msg.includes('502') || msg.includes('503') || msg.includes('504') || msg.includes('Failed to fetch')) {
      track('error', { type: 'network', message: msg.slice(0, 100) });
    }
  });

  // Intercept fetch to catch 502/503/504 responses
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    try {
      const res = await origFetch.apply(this, args);
      if (res.status >= 500) {
        const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request)?.url || '';
        track('error', { type: `HTTP ${res.status}`, url: url.slice(0, 80) });
      }
      return res;
    } catch (err: any) {
      track('error', { type: 'network', message: (err?.message || 'fetch failed').slice(0, 100) });
      throw err;
    }
  };

  // Track page exit
  const sendExit = () => {
    const seconds = Math.round((Date.now() - landed) / 1000);
    track('exit', { time_on_page: seconds, max_scroll: maxScroll });
    flushBeacon();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') sendExit();
  });
  window.addEventListener('pagehide', sendExit);
}

// Initialize — call once per page load
export function init() {
  if (started) return;
  started = true;
  resolveGeo();
  track('page_load', { referrer: document.referrer || null, url: window.location.href });
  setupAutoTracking();
  setInterval(flush, FLUSH_INTERVAL);
}

// Expose for /go/ static page
if (typeof window !== 'undefined') {
  (window as any).__journey = { init, track };
}
