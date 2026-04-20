// API client for Theodore backend

const API_BASE = '/api';

export class ApiError extends Error {
  status: number;
  body: any;
  constructor(message: string, status: number, body: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options?.headers || {}),
  };
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers,
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(body.error || `API error ${res.status}`, res.status, body);
  }
  return res.json();
}

// ========== Health ==========
export const api = {
  health: () => request<{ status: string; database: string }>('/health'),

  // ========== Auth ==========
  authRegister: (data: { email: string; password: string; name?: string }) =>
    request<{ user: any }>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  authLogin: (data: { email: string; password: string }) =>
    request<{ user: any }>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  authLogout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  authMe: () => request<{ user: any }>('/auth/me'),
  authGoogle: (data: { credential: string }) =>
    request<{ user: any; token: string }>('/auth/google', { method: 'POST', body: JSON.stringify(data) }),
  authForgotPassword: (data: { email: string }) =>
    request<{ ok: boolean; message: string; resetToken?: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  authResetPassword: (data: { token: string; password: string }) =>
    request<{ ok: boolean; user: any }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // ========== Users ==========
  getMe: () => request<any>('/users/me'),
  updateMe: (data: any) => request<any>('/users/me', { method: 'PATCH', body: JSON.stringify(data) }),

  // ========== Projects ==========
  listProjects: (_userId?: string) => request<any[]>('/projects'),
  getProject: (id: string) => request<any>(`/projects/${id}`),
  createProject: (data: any) => request<any>('/projects', { method: 'POST', body: JSON.stringify(data) }),
  updateProject: (id: string, data: any) =>
    request<any>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteProject: (id: string) => request<any>(`/projects/${id}`, { method: 'DELETE' }),

  // ========== Chapters ==========
  listChapters: (projectId: string) => request<any[]>(`/projects/${projectId}/chapters`),
  createChapter: (data: any) => request<any>('/chapters', { method: 'POST', body: JSON.stringify(data) }),
  updateChapter: (id: string, data: any) =>
    request<any>(`/chapters/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteChapter: (id: string) => request<any>(`/chapters/${id}`, { method: 'DELETE' }),

  // ========== Canon ==========
  listCanon: (projectId: string) => request<any[]>(`/projects/${projectId}/canon`),
  createCanon: (data: any) => request<any>('/canon', { method: 'POST', body: JSON.stringify(data) }),
  updateCanon: (id: string, data: any) =>
    request<any>(`/canon/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCanon: (id: string) => request<any>(`/canon/${id}`, { method: 'DELETE' }),

  // ========== Transactions ==========
  listTransactions: (userId: string) => request<any[]>(`/users/${userId}/transactions`),
  createTransaction: (data: any) => request<any>('/transactions', { method: 'POST', body: JSON.stringify(data) }),

  // ========== TTS / Audiobook ==========
  ttsVoices: () => request<{ voices: Array<{ id: string; name: string; desc: string; gender: string; tone: string; previewUrl?: string }> }>('/tts/voices'),
  ttsGenerate: async (data: {
    chapterId: string;
    prose: string;
    narratorVoice: string;
    onProgress?: (pct: number) => void;
    characterVoices: Record<string, string>;
    characterDescriptions?: Record<string, string>;
    narratorStyle?: string;
    model?: string;
    provider?: 'elevenlabs' | 'openai' | 'fish' | 'grok';
    speed?: number;
    multiVoice?: boolean;
    sceneSFX?: Array<{ prompt: string; audioUrl?: string; position: string; enabled: boolean }>;
    chapterNumber?: number;
    chapterTitle?: string;
    isGuest?: boolean;
  }) => {
    // Async job-based generation: submit job, then poll for completion.
    // Unauthenticated guests get one free OpenAI sample per IP per day via
    // the /tts/generate/guest endpoint; the authenticated path requires login.
    const endpoint = data.isGuest ? '/tts/generate/guest' : '/tts/generate';
    // Retry submit once on transient network errors (e.g. Render cold start,
    // Safari "Load failed" on brief connectivity drop). Do NOT retry on an
    // ApiError — those are deliberate server responses (402, 429, 400, etc).
    const submit = () => request<{ jobId: string; status: string }>(
      endpoint,
      { method: 'POST', body: JSON.stringify(data) }
    );
    let jobResponse: { jobId: string; status: string };
    try {
      jobResponse = await submit();
    } catch (err: any) {
      if (err instanceof ApiError) throw err;
      await new Promise(r => setTimeout(r, 1500));
      jobResponse = await submit();
    }

    if (!jobResponse.jobId) {
      // Fallback: server returned result directly (shouldn't happen but just in case)
      return jobResponse as any;
    }

    // Poll for completion every 2 seconds
    const maxAttempts = 300; // 10 minutes max
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const status = await request<{
        status: string;
        progress?: number;
        audioUrl?: string;
        durationEstimate?: number;
        segments?: number;
        creditsUsed?: number;
        creditsRemaining?: number;
        error?: string;
      }>(`/tts/job/${jobResponse.jobId}`);

      if (status.progress && data.onProgress) {
        data.onProgress(status.progress);
      }

      if (status.status === 'complete') {
        return {
          audioUrl: status.audioUrl!,
          durationEstimate: status.durationEstimate!,
          segments: status.segments!,
          creditsUsed: status.creditsUsed!,
          creditsRemaining: status.creditsRemaining!,
        };
      }

      if (status.status === 'error') {
        throw new Error(status.error || 'Audio generation failed');
      }
    }

    throw new Error('Audio generation timed out');
  },

  ttsPreview: (voice: string, text?: string) =>
    fetch(`/api/tts/preview`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voice, text }),
    }),

  // ========== Music (ElevenLabs) ==========
  musicStatus: () => request<{ available: boolean }>('/music/status'),
  musicGenerate: (data: {
    sceneId: string;
    prompt: string;
    genre?: string;
    durationHint?: number;
  }) => request<{
    audioUrl: string;
    title: string;
    durationSeconds: number;
    creditsUsed: number;
    creditsRemaining: number;
  }>('/music/generate', { method: 'POST', body: JSON.stringify(data) }),

  // ========== Sound Effects (ElevenLabs) ==========
  sfxStatus: () => request<{ available: boolean }>('/sfx/status'),
  sfxGenerate: (data: {
    prompt: string;
    durationSeconds?: number;
  }) => request<{
    audioUrl: string;
    durationSeconds: number;
    creditsUsed: number;
    creditsRemaining: number;
  }>('/sfx/generate', { method: 'POST', body: JSON.stringify(data) }),

  // ========== Audio Generations (Server-side storage) ==========
  audioGenerations: (projectId: string) => request<{
    generations: Array<{
      id: number;
      userId: string;
      projectId: string;
      chapterId: string;
      sceneId: string | null;
      version: number;
      audioUrl: string;
      durationSeconds: number | null;
      segments: number | null;
      voiceConfig: Record<string, any>;
      sfxConfig: any[];
      creditsUsed: number;
      isActive: boolean;
      createdAt: string;
    }>;
  }>(`/audio/generations/${projectId}`),

  audioActivateVersion: (id: number) => request<{ ok: boolean; audioUrl: string }>(
    `/audio/generations/${id}/activate`,
    { method: 'PUT' }
  ),

  sfxLibrary: () => request<{
    sfx: Array<{
      id: number;
      prompt: string;
      audioUrl: string;
      durationSeconds: number | null;
      position: string;
      source: string;
      usageCount: number;
    }>;
  }>('/sfx/library'),

  sfxLibrarySearch: (query: string) => request<{
    sfx: Array<{
      id: number;
      prompt: string;
      audioUrl: string;
      durationSeconds: number | null;
      position: string;
      source: string;
      usageCount: number;
    }>;
  }>(`/sfx/library/search?q=${encodeURIComponent(query)}`),

  // ========== Guest Backup ==========
  // Unauthenticated: snapshot the guest's in-progress local state to the server
  // so signup doesn't lose it if localStorage dies (different device, incognito,
  // cache clear, long delay). Cookie-keyed; server no-ops for logged-in users.
  guestBackup: (data: { projects: any[]; chapters: any[]; canonEntries: any[]; activeProjectId?: string | null }) =>
    request<{ ok: boolean; sizeBytes?: number; skipped?: string }>(
      '/guest/backup',
      { method: 'POST', body: JSON.stringify(data) }
    ),

  // ========== Billing ==========
  billingPlans: () => request<any>('/billing/plans'),
  billingStatus: () => request<any>('/billing/status'),
  billingCheckout: (data: { tier: 'writer' | 'author' | 'studio' | 'publisher' }) =>
    request<{ url: string; sessionId: string }>('/billing/checkout', { method: 'POST', body: JSON.stringify(data) }),
  billingPortal: () => request<{ url: string }>('/billing/portal', { method: 'POST' }),
  billingCancel: () => request<{ ok: boolean; cancelAt?: number }>('/billing/cancel', { method: 'POST' }),
  billingReactivate: () => request<{ ok: boolean }>('/billing/reactivate', { method: 'POST' }),
  billingRefund: (data: { reason: string }) =>
    request<{ ok: boolean; message: string }>('/billing/refund', { method: 'POST', body: JSON.stringify(data) }),
};
