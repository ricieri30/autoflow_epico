import { z } from "zod";

// ──────────────────────────────────────────────────────────────────
// Middleware de validacao de entrada (Zod).
// Uso: router.post("/rota", auth, validate(Schema), handler)
// - Valida e SANITIZA req.body contra o schema.
// - Em caso de erro, responde 400 com a lista de campos invalidos
//   ANTES de tocar no banco (defesa contra payloads malformados).
// - Em caso de sucesso, substitui req.body pelos dados ja parseados
//   (com defaults aplicados e campos desconhecidos removidos).
// ──────────────────────────────────────────────────────────────────
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({
      field: i.path.join(".") || "(body)",
      message: i.message,
    }));
    return res.status(400).json({ error: "invalid_input", issues });
  }
  req.body = result.data;
  next();
};

// Helpers reutilizaveis
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "horario deve ser HH:MM");
const nonEmpty = (msg) => z.string().trim().min(1, msg);

// ── Auth ──────────────────────────────────────────────────────────
export const ChangePasswordSchema = z.object({
  currentPassword: nonEmpty("senha atual obrigatoria"),
  newPassword: z.string().min(6, "a nova senha deve ter ao menos 6 caracteres"),
});

// ── Templates ─────────────────────────────────────────────────────
export const TemplateSchema = z.object({
  name: nonEmpty("nome obrigatorio").max(200),
  body: nonEmpty("corpo obrigatorio").max(8000),
  vars: z.array(z.string()).optional().default([]),
});

// ── Contacts ──────────────────────────────────────────────────────
export const ContactCreateSchema = z.object({
  phoneE164: nonEmpty("phoneE164 obrigatorio").max(20),
  name: z.string().max(200).optional().default(""),
  tags: z.array(z.string()).optional().default([]),
  subscriptionStart: z.string().nullable().optional(),
  subscriptionEnd: z.string().nullable().optional(),
  subscriptionNotes: z.string().max(2000).optional().default(""),
});

export const ContactUpdateSchema = z.object({
  name: z.string().max(200).optional(),
  tags: z.array(z.string()).optional(),
  optIn: z.boolean().optional(),
  subscriptionStart: z.string().nullable().optional(),
  subscriptionEnd: z.string().nullable().optional(),
  subscriptionNotes: z.string().max(2000).optional(),
});

// ── Auto-Reply ────────────────────────────────────────────────────
export const AutoReplySchema = z.object({
  keyword: nonEmpty("keyword obrigatoria").max(500),
  reply: nonEmpty("reply obrigatoria").max(8000),
  targetPhone: z.string().max(20).optional().default(""),
  targetName: z.string().max(200).optional().default(""),
  startTime: hhmm.optional().default("00:00"),
  endTime: hhmm.optional().default("23:59"),
  active: z.boolean().optional(),
});

export const AutoReplyTestSchema = z.object({
  phone: nonEmpty("phone obrigatorio").max(40),
  text: nonEmpty("text obrigatorio").max(8000),
});

// ── Scheduled ─────────────────────────────────────────────────────
export const ScheduledSchema = z.object({
  phoneE164: nonEmpty("phoneE164 obrigatorio").max(20),
  message: nonEmpty("message obrigatoria").max(8000),
  scheduledAt: nonEmpty("scheduledAt obrigatorio"),
  name: z.string().max(200).optional().default(""),
  contactName: z.string().max(200).optional().default(""),
  templateId: z.string().max(64).nullable().optional(),
});

// ── Recurring preview (cron) ──────────────────────────────────────
export const RecurringPreviewSchema = z.object({
  pattern: nonEmpty("pattern (cron) obrigatorio").max(120),
  tz: z.string().max(64).optional().default("America/Sao_Paulo"),
  count: z.number().int().min(1).max(50).optional().default(5),
});

// ── Pipeline contacts ─────────────────────────────────────────────
export const PipelineContactSchema = z.object({
  phoneE164: nonEmpty("phoneE164 obrigatorio").max(20),
  contactId: z.string().max(64).optional(),
  name: z.string().max(200).optional().default(""),
});
