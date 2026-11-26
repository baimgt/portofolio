let csrfToken = '';

export function setCsrfToken(value: string) {
  csrfToken = value;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData))
    headers.set('Content-Type', 'application/json');
  if (csrfToken) headers.set('X-CSRF-Token', csrfToken);
  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (response.status === 413) {
    throw new Error('Ukuran file terlalu besar untuk server (maksimal 4 MB di Vercel).');
  }
  if (!response.headers.get('content-type')?.includes('application/json')) {
    const isLocal =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    throw new Error(
      isLocal
        ? 'Server tidak tersedia. Jalankan aplikasi dengan npm run dev.'
        : `API serverless tidak merespons JSON (HTTP ${response.status}). Periksa deployment Vercel atau koneksi database.`,
    );
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Permintaan gagal. Silakan coba lagi.');
  return result as T;
}

export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append('image', file);
  const result = await api<{ url: string }>('/admin/upload', { method: 'POST', body: form });
  return result.url;
}

export async function uploadAudio(file: File): Promise<string> {
  const form = new FormData();
  form.append('audio', file);
  const result = await api<{ url: string }>('/admin/upload-audio', { method: 'POST', body: form });
  return result.url;
}
