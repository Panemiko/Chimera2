// Valor padrao para dev local. Na imagem Docker, o entrypoint sobrescreve
// este arquivo na subida com o VITE_SERVER_URL do compose (sem rebuild).
window.__APP_CONFIG__ = { serverUrl: "http://localhost:3000" };
