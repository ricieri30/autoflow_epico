// ════════════════════════════════════════════════════════════════════
// WA Gateway (whatsapp-web.js) — migrado de Baileys.
//
// Usa whatsapp-web.js (Chrome headless / Puppeteer), delegando a
// criptografia Signal ao WhatsApp Web real (Meta). Elimina o "Bad MAC /
// modo zumbi" inerente ao Baileys.
//
// Preserva EXATAMENTE os contratos que API e Worker consomem:
//   GET  /status  -> { status, hasQr, zombie, lastInboundAgoSec, lastHealthyAgoSec, healthy }
//   GET  /qr      -> { qr, status }
//   GET  /contacts?q=&limit= -> [{ name, phone, uncertain }]
//   POST /send { to, text, replyTo? }
//   POST /send-media { to, type, url, caption }
//   GET  /health
//   POST /logout
// E faz POST no WEBHOOK_URL a cada mensagem recebida:
//   { from, text, pushName, fromLid, fromReal, replyTo }
//
// Sessão persiste em AUTH_DIR (volume wa_auth) via LocalAuth.
// ════════════════════════════════════════════════════════════════════
const express = require("express");
const qrcode = require("qrcode");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");

const PORT = process.env.PORT || 3333;
const AUTH_DIR = process.env.AUTH_DIR || "/app/auth";
const WEBHOOK_URL = process.env.WEBHOOK_URL || "http://api:3000/api/internal/message";
const MEDIA_DIR = process.env.MEDIA_DIR || "/media";
const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/google-chrome-stable";

const log = (...a) => console.log("[wa-gateway]", ...a);

// ── estado em memória ──────────────────────────────────────────────
let client = null;
let status = "starting"; // starting | qr | connected | disconnected
let qrDataUrl = null;
let _lastInboundAt = Date.now();
let _lastHealthyAt = Date.now();
let _zombie = false;
let _loggingOut = false;
let _restarting = false;
const contacts = new Map(); // phone -> { name, phone, uncertain }

// ── helpers ─────────────────────────────────────────────────────────
const onlyDigits = (s = "") => String(s).replace(/\D/g, "");
const phoneFromJid = (jid = "") => onlyDigits(String(jid).replace(/[:@].*$/, ""));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Resolve referência local:<arquivo> -> caminho no volume compartilhado
function resolveLocalPath(url = "") {
  if (typeof url === "string" && url.startsWith("local:")) {
    const safe = url.slice(6).replace(/[^a-zA-Z0-9._-]/g, "");
    return path.join(MEDIA_DIR, safe);
  }
  return null;
}
// Converte áudio (mp3/m4a/wav) para ogg/opus — formato de voz do WhatsApp
function toOpus(inputPath) {
  return new Promise((resolve, reject) => {
    const out = inputPath + ".voz.ogg";
    const ff = spawn("ffmpeg", ["-y", "-i", inputPath, "-c:a", "libopus", "-b:a", "64k", "-ar", "48000", "-ac", "1", out]);
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code !== 0) return reject(new Error("ffmpeg_falhou_" + code));
      try { const b = fs.readFileSync(out); fs.unlinkSync(out); resolve(b); } catch (e) { reject(e); }
    });
  });
}

function rememberContact(phone, name) {
  const p = onlyDigits(phone);
  if (!p) return;
  const prev = contacts.get(p) || {};
  const nm = (name && String(name).trim()) || prev.name || "";
  contacts.set(p, { name: nm, phone: p, uncertain: false });
}

function listContacts(q = "", limit = 50) {
  const term = String(q || "").toLowerCase().trim();
  const out = [];
  const seenName = new Set();
  const seenPhone = new Set();
  for (const c of contacts.values()) {
    if (!c.phone) continue;
    if (term && !(`${c.name}`.toLowerCase().includes(term) || c.phone.includes(onlyDigits(term)))) continue;
    const nameKey = (c.name || "").toLowerCase().trim();
    if (nameKey && seenName.has(nameKey)) continue;
    if (seenPhone.has(c.phone)) continue;
    if (nameKey) seenName.add(nameKey);
    seenPhone.add(c.phone);
    out.push({ name: c.name || "", phone: c.phone, uncertain: !!c.uncertain });
    if (out.length >= Number(limit || 50)) break;
  }
  out.sort((a, b) => (a.uncertain - b.uncertain) || (b.name ? 1 : 0) - (a.name ? 1 : 0));
  return out;
}

// Reenvia ao webhook com até 2 retentativas
async function postWebhook(payload, attempt = 0) {
  try {
    const r = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok && attempt < 2) { await sleep(800 * (attempt + 1)); return postWebhook(payload, attempt + 1); }
  } catch (e) {
    if (attempt < 2) { await sleep(800 * (attempt + 1)); return postWebhook(payload, attempt + 1); }
    log("webhook falhou após retries:", e.message);
  }
}

// ── whatsapp-web.js ─────────────────────────────────────────────────
function buildClient() {
  return new Client({
    authStrategy: new LocalAuth({ dataPath: AUTH_DIR }),
    puppeteer: {
      executablePath: CHROME_PATH,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
      ],
    },
  });
}

function extractText(msg) {
  return msg.body || "";
}

async function start() {
  _loggingOut = false;
  if (client) { try { await client.destroy(); } catch (e) {} client = null; }
  status = "starting";
  qrDataUrl = null;
  client = buildClient();

  client.on("qr", async (qr) => {
    status = "qr";
    try { qrDataUrl = await qrcode.toDataURL(qr); } catch { qrDataUrl = null; }
    log("QR disponível — escaneie no WhatsApp.");
  });

  client.on("authenticated", () => { log("autenticado."); });

  client.on("ready", async () => {
    status = "connected";
    qrDataUrl = null;
    _lastHealthyAt = Date.now();
    _zombie = false;
    log("✅ WhatsApp conectado.");
    // pré-carrega contatos conhecidos (best-effort)
    try {
      const cs = await client.getContacts();
      for (const c of cs) {
        if (!c || c.isGroup || !c.number) continue;
        rememberContact(c.number, c.name || c.pushname || c.verifiedName || "");
      }
      log("contatos carregados:", contacts.size);
    } catch (e) { log("falha ao carregar contatos:", e.message); }
  });

  client.on("auth_failure", (msg) => {
    status = "disconnected";
    log("❌ falha de autenticação:", msg);
  });

  client.on("disconnected", (reason) => {
    status = "disconnected";
    qrDataUrl = null;
    log("desconectado:", reason, "- reconectando em 5s...");
    if (_loggingOut) return;
    setTimeout(() => { start().catch((e) => log("erro na reconexão:", e.message)); }, 5000);
  });

  // mensagens recebidas -> webhook
  client.on("message", async (msg) => {
    try {
      _lastInboundAt = Date.now(); _lastHealthyAt = Date.now(); _zombie = false;
      if (msg.fromMe) return;
      const from = msg.from || "";
      if (from === "status@broadcast" || from.endsWith("@g.us")) return; // ignora status e grupos
      const text = extractText(msg);
      if (!text) return;

      let pushName = "";
      try { const c = await msg.getContact(); pushName = c?.pushname || c?.name || ""; } catch (e) {}

      const realDigits = phoneFromJid(from);
      rememberContact(realDigits, pushName);

      await postWebhook({
        from,
        text,
        pushName,
        fromReal: realDigits,
        fromLid: "",
        replyTo: from,
      });
    } catch (e) {
      log("erro processando msg:", e.message);
    }
  });

  await client.initialize();
}

// ── health-check leve (detecta zumbi) ───────────────────────────────
const HEALTH_INTERVAL_MS = 60 * 1000;
async function _healthCheck() {
  try {
    if (status !== "connected" || !client) return;
    let state = null;
    try { state = await client.getState(); } catch (e) { state = null; }
    if (state === "CONNECTED") {
      _lastHealthyAt = Date.now();
      if (_zombie) { _zombie = false; log("saúde restabelecida."); }
    } else {
      _zombie = true;
      log("watchdog: estado anômalo (" + state + ") — reiniciando.");
      if (!_restarting) { _restarting = true; try { await client.destroy(); } catch (e) {} _restarting = false; start().catch((e) => log(e.message)); }
    }
  } catch (e) { log("erro no health-check:", e.message); }
}
setInterval(_healthCheck, HEALTH_INTERVAL_MS);

// ── envio ───────────────────────────────────────────────────────────
// Resolve o chatId (@c.us) a partir de "to"/"replyTo", tratando 9º dígito BR.
async function targetChatId({ to, replyTo }) {
  if (replyTo && String(replyTo).includes("@")) return replyTo;
  const d = onlyDigits(to);
  if (!d) throw new Error("invalid_destination");
  const cands = [d];
  if (d.length === 13 && d.startsWith("55") && d[4] === "9") cands.push(d.slice(0, 4) + d.slice(5));
  if (d.length === 12 && d.startsWith("55")) cands.push(d.slice(0, 4) + "9" + d.slice(4));
  for (const cand of cands) {
    try {
      const wid = await client.getNumberId(cand);
      if (wid && wid._serialized) return wid._serialized;
    } catch (e) {}
  }
  return d + "@c.us";
}

async function sendText({ to, text, replyTo }) {
  if (!client || status !== "connected") throw new Error("not_connected");
  const chatId = await targetChatId({ to, replyTo });
  const r = await client.sendMessage(chatId, String(text || ""));
  return { ok: true, id: r?.id?._serialized || r?.id?.id || null, jid: chatId };
}

async function sendMedia({ to, type, url, caption }) {
  if (!client || status !== "connected") throw new Error("not_connected");
  const chatId = await targetChatId({ to });
  const localPath = resolveLocalPath(url);
  let media = null;
  let opts = {};

  if (type === "audio") {
    let buffer = null;
    if (localPath && fs.existsSync(localPath)) {
      buffer = /\.(ogg|oga|opus)$/i.test(localPath) ? fs.readFileSync(localPath) : await toOpus(localPath);
    }
    if (buffer) media = new MessageMedia("audio/ogg; codecs=opus", buffer.toString("base64"), "voz.ogg");
    else media = await MessageMedia.fromUrl(url, { unsafeMime: true });
    opts = { sendAudioAsVoice: true };
  } else {
    if (localPath && fs.existsSync(localPath)) {
      const b = fs.readFileSync(localPath);
      const mime = type === "image" ? "image/jpeg" : type === "video" ? "video/mp4" : "application/octet-stream";
      media = new MessageMedia(mime, b.toString("base64"), path.basename(localPath));
    } else {
      media = await MessageMedia.fromUrl(url, { unsafeMime: true });
    }
    if (type === "document") opts = { sendMediaAsDocument: true };
    if (caption) opts.caption = caption;
  }

  const r = await client.sendMessage(chatId, media, opts);
  return { ok: true, id: r?.id?._serialized || r?.id?.id || null, jid: chatId };
}

// ── HTTP ────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, status }));
app.get("/status", (_req, res) => res.json({
  status,
  hasQr: !!qrDataUrl,
  zombie: _zombie,
  lastInboundAgoSec: Math.round((Date.now() - _lastInboundAt) / 1000),
  lastHealthyAgoSec: Math.round((Date.now() - _lastHealthyAt) / 1000),
  healthy: !_zombie && status === "connected",
}));
app.get("/qr", (_req, res) => res.json({ qr: qrDataUrl, status }));

app.get("/contacts", (req, res) => {
  res.json(listContacts(req.query.q, req.query.limit));
});

app.post("/send", async (req, res) => {
  try { res.json(await sendText(req.body || {})); }
  catch (e) { res.status(e.message === "not_connected" ? 409 : 500).json({ error: e.message }); }
});

app.post("/send-media", async (req, res) => {
  try { res.json(await sendMedia(req.body || {})); }
  catch (e) { res.status(e.message === "not_connected" ? 409 : 500).json({ error: e.message }); }
});

app.post("/logout", async (_req, res) => {
  try {
    _loggingOut = true;
    log("logout solicitado via API");
    res.json({ ok: true, message: "sessao encerrada, gerando novo QR" });
    try { if (client) await client.logout(); } catch (e) { log("logout falhou:", e.message); }
    try { if (client) await client.destroy(); } catch (e) {}
    client = null; status = "disconnected"; qrDataUrl = null; _zombie = false;
    setTimeout(() => { start().catch((e) => log("falha ao reiniciar pos-logout:", e.message)); }, 1500);
  } catch (e) {
    try { res.status(500).json({ ok: false, error: e.message }); } catch (_) {}
  }
});

app.listen(PORT, () => log(`✅ WA Gateway :${PORT}`));
start().catch((e) => { log("falha ao iniciar:", e.message); status = "disconnected"; });
