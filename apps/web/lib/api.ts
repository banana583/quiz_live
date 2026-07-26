export const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export function token() {
  return typeof window === 'undefined' ? '' : localStorage.getItem('token') || '';
}

function getErrorMessage(data: any): string {
  const error = data?.error;
  if (typeof error === 'string') return error;
  if (typeof error?.message === 'string') return error.message;

  const fieldErrors = error?.fieldErrors || error?.fields;
  if (fieldErrors) {
    const messages = Object.values(fieldErrors).flat().filter(Boolean).map(String);
    if (messages.length) return messages.join(', ');
  }
  if (error?.formErrors?.length) return error.formErrors.join(', ');
  return 'Произошла ошибка запроса';
}

export async function api(path: string, init: RequestInit = {}) {
  const response = await fetch(API + path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      ...(init.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(getErrorMessage(data));
  return data;
}
