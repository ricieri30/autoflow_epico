import cors from "cors";

// CORS com allowlist. Defina CORS_ORIGINS no .env como lista separada por virgula,
// ex.: CORS_ORIGINS=https://app.seudominio.com,https://admin.seudominio.com
// Sem CORS_ORIGINS definido, o padrao e negar origens cross-site (apenas same-origin via proxy nginx).
const raw = (process.env.CORS_ORIGINS || "").trim();
const allowlist = raw ? raw.split(",").map(s => s.trim()).filter(Boolean) : [];

export const corsMiddleware = cors({
  origin(origin, cb) {
    // Requisicoes same-origin / curl / health-check nao mandam Origin -> permite.
    if (!origin) return cb(null, true);
    if (allowlist.includes(origin)) return cb(null, true);
    return cb(new Error("origin_not_allowed"), false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});
