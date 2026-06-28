import cors from "cors";

// CORS com allowlist. Defina CORS_ORIGINS no .env como lista separada por virgula,
// ex.: CORS_ORIGINS=https://app.seudominio.com,https://admin.seudominio.com
// Se CORS_ORIGINS estiver vazio, o app esta atras do proxy nginx (same-origin):
// nesse cenario nao ha cross-site real, entao liberamos a requisicao.
const raw = (process.env.CORS_ORIGINS || "").trim();
const allowlist = raw ? raw.split(",").map(s => s.trim()).filter(Boolean) : [];

export const corsMiddleware = cors({
  origin(origin, cb) {
    // Requisicoes sem Origin (curl / health-check / server-to-server) -> permite.
    if (!origin) return cb(null, true);
    // Sem allowlist configurada: assume deploy same-origin via nginx -> permite.
    if (allowlist.length === 0) return cb(null, true);
    // Com allowlist: so permite origens explicitamente autorizadas.
    if (allowlist.includes(origin)) return cb(null, true);
    return cb(new Error("origin_not_allowed"), false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});
