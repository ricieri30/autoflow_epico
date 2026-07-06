// Cliente de API minimalista — espelha exatamente o helper do bundle original.
// Todas as chamadas vão para /api/<endpoint>; o token JWT vem do localStorage.

export function getToken() { return localStorage.getItem("token"); }
export function setToken(t) { localStorage.setItem("token", t); }
export function clearToken() { localStorage.removeItem("token"); }

export async function api(endpoint, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api/${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch (_) { /* corpo nao-JSON */ }
    const err = new Error((parsed && parsed.message) || text || `HTTP_${res.status}`);
    err.status = res.status;
    err.data = parsed;
    throw err;
  }
  return res.json();
}
