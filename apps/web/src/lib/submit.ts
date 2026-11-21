'use client';

import type { ApiErrorBody } from '@od/shared';
import { PUBLIC_API_URL } from './config';

export interface SubmitResult<T> {
  ok: boolean;
  data?: T;
  message?: string;
  fields?: Record<string, string>;
  code?: string;
}

/** Sends JSON to the API from the browser and turns errors into plain messages. */
export async function postJson<T>(path: string, body: unknown): Promise<SubmitResult<T>> {
  let response: Response;
  try {
    response = await fetch(`${PUBLIC_API_URL}/v1${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return {
      ok: false,
      message: 'We could not reach the shop. Check your connection and try again.',
    };
  }
  if (response.ok) {
    const type = response.headers.get('content-type') ?? '';
    return {
      ok: true,
      data: (type.includes('json') ? await response.json() : await response.blob()) as T,
    };
  }
  const body2 = (await response.json().catch(() => null)) as ApiErrorBody | null;
  const fields: Record<string, string> = {};
  for (const field of body2?.error.fields ?? []) fields[field.path] ??= field.message;
  return {
    ok: false,
    code: body2?.error.code,
    message: body2?.error.message ?? 'Something went wrong. Please try again.',
    fields,
  };
}

/** A text field from a submitted form. File inputs and missing fields give an empty string. */
export function formText(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}
