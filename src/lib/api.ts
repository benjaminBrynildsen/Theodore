// API client for Theodore backend

const API_BASE = '/api';

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
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
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
  getUser: (id: string) => request<any>(`/users/${id}`), // legacy
  upsertUser: (data: any) => request<any>('/users', { method: 'POST', body: JSON.stringify(data) }), // legacy
  updateUser: (id: string, data: any) => request<any>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }), // legacy

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
  ttsGenerate: (data: {
    chapterId: string;
    prose: string;
    narratorVoice: string;
    characterVoices: Record<string, string>;
    characterDescriptions?: Record<string, string>;
    narratorStyle?: string;
    model?: string;
    speed?: number;
    multiVoice?: boolean;
  }) => request<{
    audioUrl: string;
    durationEstimate: number;
    segments: number;
    creditsUsed: number;
    creditsRemaining: number;
  }>('/tts/generate', { method: 'POST', body: JSON.stringify(data) }),

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

  // ========== Billing ==========
  billingPlans: () => request<any>('/billing/plans'),
  billingStatus: () => request<any>('/billing/status'),
  billingCheckout: (data: { tier: 'writer' | 'author' | 'studio' }) =>
    request<{ url: string; sessionId: string }>('/billing/checkout', { method: 'POST', body: JSON.stringify(data) }),
  billingPortal: () => request<{ url: string }>('/billing/portal', { method: 'POST' }),
};
