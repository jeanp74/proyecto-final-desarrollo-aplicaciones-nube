// pharmacy-frontend/src/api.js

// ==== Storage keys (mantengo compatibilidad con tu clave anterior) ====
const PHARM_KEY_NEW = "pharmacy_react_api_base";
const PHARM_KEY_OLD = "products_react_api_base"; // compat

const PATIENTS_KEY = "patients_api_base";
const DOCTORS_KEY  = "doctors_api_base";

// ==== Defaults (puedes sobreescribir con VITE_* en .env) ====
const PHARM_DEFAULT =
  import.meta.env.VITE_API_BASE ||
  "https://pharmacy-proyecto-final-desarrollo-cgeyfreje5aqdxbr.brazilsouth-01.azurewebsites.net/";

const PATIENTS_DEFAULT =
  import.meta.env.VITE_PATIENTS_API_BASE ||
  "https://patients-proyecto-final-desarrollo-dvdpe0eegng6atfy.brazilsouth-01.azurewebsites.net/";

const DOCTORS_DEFAULT =
  import.meta.env.VITE_DOCTORS_API_BASE ||
  "https://doctors-proyecto-final-desarrollo-b7aqbdbpcgd0d7bq.brazilsouth-01.azurewebsites.net/";

// ==== Utils ====
function joinUrl(base, path) {
  if (!base) base = "/";
  if (!path) path = "";
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

// ==== Pharmacy API base ====
export function getApiBase() {
  return (
    localStorage.getItem(PHARM_KEY_NEW) ||
    localStorage.getItem(PHARM_KEY_OLD) ||
    PHARM_DEFAULT
  );
}
export function setApiBase(v) {
  // guardo en la nueva y dejo la vieja por compat
  localStorage.setItem(PHARM_KEY_NEW, v);
  localStorage.setItem(PHARM_KEY_OLD, v);
}

// ==== Pacientes API base ====
export function getPatientsBase() {
  return localStorage.getItem(PATIENTS_KEY) || PATIENTS_DEFAULT;
}
export function setPatientsBase(v) {
  localStorage.setItem(PATIENTS_KEY, v);
}

// ==== Doctores API base ====
export function getDoctorsBase() {
  return localStorage.getItem(DOCTORS_KEY) || DOCTORS_DEFAULT;
}
export function setDoctorsBase(v) {
  localStorage.setItem(DOCTORS_KEY, v);
}

// ==== Fetch helpers (Pharmacy) ====
export async function api(path, options = {}) {
  const url = joinUrl(getApiBase(), path);
  const resp = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const ct = resp.headers.get("content-type") || "";
  const data = ct.includes("application/json")
    ? await resp.json()
    : await resp.text();
  if (!resp.ok) {
    const detail =
      typeof data === "string"
        ? data
        : data?.detail || data?.error || JSON.stringify(data);
    throw new Error(`HTTP ${resp.status}: ${detail}`);
  }
  return data;
}

// ==== GET contra una base externa (Pacientes/Doctores) ====
export async function extGet(base, path) {
  const url = joinUrl(base, path);
  const resp = await fetch(url, { headers: { "Content-Type": "application/json" } });
  const ct = resp.headers.get("content-type") || "";
  const data = ct.includes("application/json")
    ? await resp.json()
    : await resp.text();
  if (!resp.ok) {
    const detail =
      typeof data === "string"
        ? data
        : data?.detail || data?.error || JSON.stringify(data);
    throw new Error(`HTTP ${resp.status}: ${detail}`);
  }
  return data;
}
