import type { ApiErrorBody } from '@od/shared';

// All admin calls go to the API with the HttpOnly session cookie. The admin app
// never sees or stores a token itself.

export const API_URL = (
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000'
).replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

let onSignedOut: () => void = () => undefined;
export function whenSignedOut(callback: () => void): void {
  onSignedOut = callback;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const isForm = body instanceof FormData;
  const response = await fetch(`${API_URL}/v1/admin${path}`, {
    method,
    credentials: 'include',
    headers: {
      ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  if (response.ok) {
    const type = response.headers.get('content-type') ?? '';
    return (type.includes('json') ? await response.json() : await response.blob()) as T;
  }
  const error = (await response.json().catch(() => null)) as ApiErrorBody | null;
  if (response.status === 401 && error?.error.code === 'signed_out') onSignedOut();
  const fields: Record<string, string> = {};
  for (const field of error?.error.fields ?? []) fields[field.path] ??= field.message;
  throw new ApiError(
    response.status,
    error?.error.code ?? 'error',
    error?.error.message ?? 'Something went wrong.',
    fields,
  );
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  /** Deletes only after the person has confirmed on screen; the API refuses without this header. */
  remove: <T>(path: string) => request<T>('DELETE', path, undefined, { 'X-Confirm-Delete': 'yes' }),
  upload: <T>(path: string, form: FormData) => request<T>('POST', path, form),
  download: async (path: string, filename: string) => {
    const blob = await request<Blob>('GET', path);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  },
};

export function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  return new Date(value).toLocaleString('en-NZ', {
    timeZone: 'Pacific/Fiji',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
