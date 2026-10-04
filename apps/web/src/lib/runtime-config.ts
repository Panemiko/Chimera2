declare global {
  interface Window {
    __APP_CONFIG__?: { serverUrl?: string };
  }
}

// URL base do server (API) resolvida em runtime. No navegador, o valor vem
// do /__config.js, que o entrypoint do Docker gera na subida a partir do
// VITE_SERVER_URL do compose. Trocar o IP depois do build nao exige rebuild.
// `fallback` e o valor gravado no build (dev local).
export function resolveServerUrl(fallback: string): string {
  const fromRuntime = typeof window !== "undefined" ? window.__APP_CONFIG__?.serverUrl : undefined;
  const url = fromRuntime || fallback;
  return url.endsWith("/") ? url.slice(0, -1) : url;
}
