// Transport for long book-planning calls (thread map, arc map).
//
// Signed-in users run the plan as a server-side job and poll for it, so the
// work survives iOS suspending the page (phone locked, app switched) — a
// single long request is killed in that case ("Load failed"). Guests, who
// can't create jobs, stream instead. The job id is kept in localStorage so a
// reload can pick the job back up.

import { generateStream } from './generate';
import { useAuthStore } from '../store/auth';

const POLL_MS = 2000;
const GIVE_UP_MS = 12 * 60 * 1000;

export interface PlanRequest {
  prompt: string;
  model: string;
  projectId: string;
  /** Server action name, e.g. 'plan-threads'. */
  action: string;
  /** localStorage key for the in-flight job id. */
  jobKey: string;
  /** Used in error messages ("The thread map …"). */
  label: string;
}

export function savedJobId(jobKey: string): string | null {
  try { return localStorage.getItem(jobKey); } catch { return null; }
}

function saveJobId(jobKey: string, jobId: string | null) {
  try {
    if (jobId) localStorage.setItem(jobKey, jobId);
    else localStorage.removeItem(jobKey);
  } catch { /* storage unavailable */ }
}

const sleep = (ms: number) => new Promise<void>((resolve) => {
  // Wake early when the page becomes visible again (timers stall while hidden).
  const done = () => { clearTimeout(t); document.removeEventListener('visibilitychange', onVis); resolve(); };
  const onVis = () => { if (document.visibilityState === 'visible') done(); };
  const t = setTimeout(done, ms);
  document.addEventListener('visibilitychange', onVis);
});

async function pollJob(jobId: string, label: string, onPartial: (text: string) => void): Promise<string> {
  const started = Date.now();
  for (;;) {
    let res: Response | null = null;
    try {
      res = await fetch(`/api/generate/job/${encodeURIComponent(jobId)}`, { credentials: 'include' });
    } catch {
      // Network blip or suspended page — keep waiting; the job runs server-side.
    }
    if (res?.status === 404) throw new Error(`The ${label} job was lost. Try again.`);
    if (res?.ok) {
      const data = await res.json().catch(() => null) as { status?: string; text?: string; partial?: string; error?: string } | null;
      if (data?.status === 'complete') return data.text || '';
      if (data?.status === 'error') throw new Error(data.error || `The ${label} failed.`);
      if (data?.partial) onPartial(data.partial);
    }
    if (Date.now() - started > GIVE_UP_MS) throw new Error(`The ${label} is taking too long. Try again.`);
    await sleep(POLL_MS);
  }
}

async function requestViaJob(req: PlanRequest, onPartial: (text: string) => void, resumeJobId?: string | null): Promise<string> {
  let jobId = resumeJobId || null;
  if (!jobId) {
    const res = await fetch('/api/generate/job', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: req.prompt, model: req.model, maxTokens: 8000, action: req.action, projectId: req.projectId }),
    });
    if (res.status === 402) throw new Error('INSUFFICIENT_CREDITS');
    const data = await res.json().catch(() => ({})) as { jobId?: string; error?: string };
    if (!res.ok || !data.jobId) throw new Error(data.error || `The ${req.label} failed (${res.status}).`);
    jobId = data.jobId;
    saveJobId(req.jobKey, jobId);
  }
  try {
    return await pollJob(jobId, req.label, onPartial);
  } finally {
    saveJobId(req.jobKey, null);
  }
}

async function requestViaStream(req: PlanRequest, onPartial: (text: string) => void): Promise<string> {
  let text = '';
  let failure: string | null = null;
  await generateStream(
    { prompt: req.prompt, model: req.model, maxTokens: 8000, action: req.action, projectId: req.projectId },
    (chunk) => { text += chunk; onPartial(text); },
    undefined,
    (error) => { failure = error; },
  );
  if (failure) throw new Error(failure);
  return text;
}

/** Run a planning call; returns the full model text. `resumeJobId` re-attaches to a running job. */
export function runPlanRequest(req: PlanRequest, onPartial: (text: string) => void, resumeJobId?: string | null): Promise<string> {
  return useAuthStore.getState().user
    ? requestViaJob(req, onPartial, resumeJobId)
    : requestViaStream(req, onPartial);
}
