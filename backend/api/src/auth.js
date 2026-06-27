import jwt from "jsonwebtoken";

// Verifica o JWT e popula req.user. Falha cedo se o segredo nao estiver setado.
export function auth(req, res, next) {
  if (!process.env.JWT_SECRET) {
    console.error("[auth] JWT_SECRET ausente no ambiente");
    return res.status(500).json({ error: "server_misconfigured" });
  }
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "unauthorized" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "invalid_token" });
  }
}

// Hierarquia de papeis: admin > operator > viewer.
// requireRole("operator") permite operator e admin; requireRole("admin") so admin.
const ROLE_RANK = { viewer: 1, operator: 2, admin: 3 };
export function requireRole(minRole) {
  const min = ROLE_RANK[minRole] || 99;
  return (req, res, next) => {
    const rank = ROLE_RANK[req.user && req.user.role] || 0;
    if (rank >= min) return next();
    return res.status(403).json({ error: "forbidden", required: minRole });
  };
}

// Atalho retrocompativel com o codigo legado (rotas de backup usavam adminOnly).
export const adminOnly = requireRole("admin");
