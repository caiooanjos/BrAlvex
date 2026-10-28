import { hash, verify } from "@node-rs/argon2";
import express from "express";
import { rateLimit } from "express-rate-limit";
import { cleanText } from "../shared/form-schema.js";
import { deletePage, detailPage, listPage, loginPage, makeFormatter, messagePage, optionLabel, STATUS_LABELS } from "./admin-views.js";
import { toCsv } from "./csv.js";
import { q } from "./db.js";
import { audit, deleteLead, exportLeads, getLead, listLeads, NOTES_MAX, parseFilters, STATUSES, updateLead } from "./leads-repo.js";
import { AttemptLimiter, checkCsrf, newCsrfToken, sameOrigin } from "./security.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const GENERIC_LOGIN_ERROR = "E-mail ou senha inválidos.";
const TOO_MANY = "Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.";

export function adminRoutes({ config, pool, log }) {
  const router = express.Router();
  const fmt = makeFormatter(config.adminTimeZone || "America/Sao_Paulo");
  const form = express.urlencoded({ extended: false, limit: "32kb", parameterLimit: 20 });
  const origin = sameOrigin(config.siteUrl);
  const absoluteMs = config.sessionAbsoluteHours * 3600 * 1000;
  const emailLimiter = new AttemptLimiter({ max: 5, windowMs: config.loginRateLimit.windowMinutes * 60 * 1000 });
  // Hash fictício para que e-mails inexistentes levem o mesmo tempo de verificação.
  const dummyHash = hash(`dummy-${Date.now()}-${Math.random()}`);

  router.use((req, res, next) => {
    res.set("X-Robots-Tag", "noindex, nofollow");
    res.set("Cache-Control", "no-store");
    next();
  });

  const loginLimiter = rateLimit({
    windowMs: config.loginRateLimit.windowMinutes * 60 * 1000,
    limit: config.loginRateLimit.max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (req, res) => res.status(429).type("html").send(loginPage({ error: TOO_MANY })),
  });

  function deny(req, res) {
    if (req.method === "GET") return res.redirect(302, "/admin/login");
    return res.status(401).type("html").send(messagePage({ title: "Sessão expirada", message: "Entre novamente para continuar." }));
  }

  async function requireAdmin(req, res, next) {
    try {
      const s = req.session;
      if (!s?.adminId) return deny(req, res);
      if (!s.authAt || Date.now() - s.authAt > absoluteMs) {
        return s.destroy(() => deny(req, res));
      }
      const rows = await q(pool, "SELECT id, email, is_active, password_changed_at FROM admins WHERE id = ?", [s.adminId]);
      const admin = rows[0];
      // Senha redefinida depois do login invalida a sessão.
      if (!admin || !admin.is_active || new Date(admin.password_changed_at).getTime() > s.authAt) {
        return s.destroy(() => deny(req, res));
      }
      req.admin = admin;
      next();
    } catch (err) {
      next(err);
    }
  }

  function csrf(req, res, next) {
    if (checkCsrf(req)) return next();
    log.info("admin.csrf_rejected");
    res.status(403).type("html").send(messagePage({ title: "Ação recusada", message: "O formulário expirou. Recarregue a página e tente novamente." }));
  }

  const view = (req) => ({ admin: req.admin, csrf: req.session.csrf, fmt });

  router.get("/admin", (req, res) => res.redirect(302, "/admin/leads"));
  router.get("/admin/", (req, res) => res.redirect(302, "/admin/leads"));

  router.get("/admin/login", (req, res) => {
    if (req.session?.adminId) return res.redirect(302, "/admin/leads");
    res.type("html").send(loginPage({}));
  });

  router.post("/admin/login", origin, loginLimiter, form, async (req, res, next) => {
    try {
      const email = cleanText(req.body?.email).toLowerCase().slice(0, 254);
      const password = typeof req.body?.password === "string" ? req.body.password.slice(0, 1024) : "";
      if (emailLimiter.blocked(email)) return res.status(429).type("html").send(loginPage({ error: TOO_MANY, email }));

      const rows = email ? await q(pool, "SELECT id, password_hash, is_active FROM admins WHERE email = ?", [email]) : [];
      const admin = rows[0];
      let ok = false;
      if (admin && admin.is_active && password) ok = await verify(admin.password_hash, password).catch(() => false);
      else await verify(await dummyHash, password || "x").catch(() => false);

      if (!ok) {
        emailLimiter.fail(email);
        log.info("admin.login_failed");
        return res.status(401).type("html").send(loginPage({ error: GENERIC_LOGIN_ERROR, email }));
      }
      emailLimiter.reset(email);
      req.session.regenerate(async (err) => {
        if (err) return next(err);
        req.session.adminId = admin.id;
        req.session.authAt = Date.now();
        req.session.csrf = newCsrfToken();
        try {
          await q(pool, "UPDATE admins SET last_login_at = UTC_TIMESTAMP(3) WHERE id = ?", [admin.id]);
          await audit(pool, admin.id, "login");
        } catch (e) {
          return next(e);
        }
        req.session.save((saveErr) => (saveErr ? next(saveErr) : res.redirect(303, "/admin/leads")));
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/admin/logout", origin, form, requireAdmin, csrf, async (req, res, next) => {
    try {
      await audit(pool, req.admin.id, "logout");
      req.session.destroy((err) => {
        if (err) return next(err);
        res.clearCookie(config.sessionCookieName, { path: "/admin" });
        res.redirect(303, "/admin/login");
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/admin/leads", requireAdmin, async (req, res, next) => {
    try {
      const filters = parseFilters(req.query);
      const result = await listLeads(pool, filters);
      const flash = req.query.deleted === "1" ? "Solicitação excluída." : null;
      res.type("html").send(listPage({ ...view(req), filters, result, flash }));
    } catch (err) {
      next(err);
    }
  });

  router.get("/admin/leads/export.csv", requireAdmin, async (req, res, next) => {
    try {
      const filters = parseFilters(req.query);
      const rows = await exportLeads(pool, filters);
      const header = [
        "id", "recebida_em_utc", "atualizada_em_utc", "idioma", "versao_formulario", "status", "ultimo_contato",
        "objetivo", "objetivo_outro", "empresa", "setor", "setor_outro", "cargo", "site", "porte",
        "desafio", "dados", "momento", "nome", "email", "pais", "whatsapp",
        "novidades_email", "novidades_email_em_utc", "aviso_privacidade",
        "origem", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "observacoes_internas",
      ];
      const data = rows.map((r) => [
        r.public_id, r.created_at, r.updated_at, r.lang, r.form_version, STATUS_LABELS[r.status], fmt.isoDate(r.last_contact_at),
        optionLabel("objective", r.objective), r.objective_other, r.company, optionLabel("sector", r.sector), r.sector_other,
        r.job_role, r.website, optionLabel("company_size", r.company_size), r.challenge,
        optionLabel("data_availability", r.data_availability), optionLabel("timing", r.timing),
        r.full_name, r.email, r.country, r.whatsapp, r.marketing_opt_in ? "sim" : "não", r.marketing_opt_in_at,
        r.privacy_notice_version, r.referrer_host, r.utm_source, r.utm_medium, r.utm_campaign, r.utm_term, r.utm_content,
        r.internal_notes,
      ]);
      await audit(pool, req.admin.id, "export_csv", { meta: `rows=${rows.length}` });
      const stamp = new Date().toISOString().slice(0, 10);
      res.set("Content-Type", "text/csv; charset=utf-8");
      res.set("Content-Disposition", `attachment; filename="solicitacoes-bralvex-${stamp}.csv"`);
      res.send(toCsv(header, data));
    } catch (err) {
      next(err);
    }
  });

  async function loadLead(req, res, next) {
    try {
      const id = String(req.params.id || "").toLowerCase();
      const lead = UUID_RE.test(id) ? await getLead(pool, id) : null;
      if (!lead) return res.status(404).type("html").send(messagePage({ ...view(req), title: "Não encontrada", message: "Solicitação não encontrada." }));
      req.lead = lead;
      next();
    } catch (err) {
      next(err);
    }
  }

  router.get("/admin/leads/:id", requireAdmin, loadLead, async (req, res, next) => {
    try {
      await audit(pool, req.admin.id, "view_lead", { leadId: req.lead.public_id });
      const flash = req.query.saved === "1" ? "Alterações salvas." : null;
      res.type("html").send(detailPage({ ...view(req), lead: req.lead, flash }));
    } catch (err) {
      next(err);
    }
  });

  router.post("/admin/leads/:id", origin, form, requireAdmin, csrf, loadLead, async (req, res, next) => {
    try {
      const status = String(req.body.status || "");
      const notesRaw = cleanText(req.body.notes, { multiline: true });
      const lastContact = String(req.body.last_contact || "");
      const errors = [];
      if (!STATUSES.includes(status)) errors.push("Status inválido.");
      if (notesRaw.length > NOTES_MAX) errors.push(`As observações excedem ${NOTES_MAX} caracteres.`);
      if (lastContact && (!DATE_RE.test(lastContact) || Number.isNaN(Date.parse(lastContact)))) errors.push("Data do último contato inválida.");
      if (errors.length) {
        return res.status(422).type("html").send(detailPage({ ...view(req), lead: req.lead, error: errors.join(" ") }));
      }
      const before = req.lead;
      await updateLead(pool, before.public_id, {
        status,
        notes: notesRaw || null,
        lastContactAt: lastContact ? `${lastContact} 00:00:00.000` : null,
      });
      // Registra apenas o que mudou, sem copiar o conteúdo das observações.
      const changes = [];
      if (status !== before.status) changes.push(`status:${before.status}->${status}`);
      if ((notesRaw || null) !== (before.internal_notes || null)) changes.push("notes");
      if (lastContact !== fmt.isoDate(before.last_contact_at)) changes.push("last_contact");
      if (changes.length) await audit(pool, req.admin.id, "update_lead", { leadId: before.public_id, meta: changes.join(";") });
      res.redirect(303, `/admin/leads/${before.public_id}?saved=1`);
    } catch (err) {
      next(err);
    }
  });

  router.get("/admin/leads/:id/delete", requireAdmin, loadLead, (req, res) => {
    res.type("html").send(deletePage({ ...view(req), lead: req.lead, retentionDays: config.retentionDays }));
  });

  router.post("/admin/leads/:id/delete", origin, form, requireAdmin, csrf, loadLead, async (req, res, next) => {
    try {
      if (req.body.confirm !== "yes") {
        return res.status(422).type("html").send(deletePage({ ...view(req), lead: req.lead, retentionDays: config.retentionDays }));
      }
      await deleteLead(pool, req.lead.public_id);
      await audit(pool, req.admin.id, "delete_lead", { leadId: req.lead.public_id });
      res.redirect(303, "/admin/leads?deleted=1");
    } catch (err) {
      next(err);
    }
  });

  return router;
}
