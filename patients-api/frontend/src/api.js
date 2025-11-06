const STORAGE_KEY = 'patients_api_base';

export function getApiBase() {
  // Por defecto, mismo origen (el propio contenedor sirve front+API)
  return localStorage.getItem(STORAGE_KEY) || import.meta.env.VITE_API_BASE || 'https://patients-proyecto-final-desarrollo-dvdpe0eegng6atfy.brazilsouth-01.azurewebsites.net/';
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
