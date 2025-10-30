const STORAGE_KEY = 'products_react_api_base';

export function getApiBase() {
  // return localStorage.getItem(STORAGE_KEY) || import.meta.env.VITE_API_BASE || 'http://localhost:4002';
  return localStorage.getItem(STORAGE_KEY) || import.meta.env.VITE_API_BASE || 'https://products-api-cloud-afa3h7hhhkb6cbhn.chilecentral-01.azurewebsites.net/';
}

export function setApiBase(v) {
  localStorage.setItem(STORAGE_KEY, v);
}

export async function api(path, options = {}) {
  const url = `${getApiBase()}${path}`;
  const resp = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const ct = resp.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await resp.json() : await resp.text();
  if (!resp.ok) {
    const detail = typeof data === 'string' ? data : (data?.detail || data?.error || JSON.stringify(data));
    throw new Error(`HTTP ${resp.status}: ${detail}`);
  }
  return data;
}
