// API client for Theodore backend

const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
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

  // ========== Users ==========
  getUser: (id: string) => request<any>(`/users/${id}`),
  upsertUser: (data: any) => request<any>('/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: string, data: any) => request<any>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // ========== Projects ==========
  listProjects: (userId?: string) =>
    request<any[]>(userId ? `/projects?userId=${userId}` : '/projects'),
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
};
