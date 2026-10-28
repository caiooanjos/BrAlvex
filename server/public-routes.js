import { randomUUID } from "node:crypto";
import express from "express";
import { rateLimit } from "express-rate-limit";
import pt from "../site/content/pt.js";
import en from "../site/content/en.js";
import { renderNoJsErrors } from "../site/templates.js";
import {
  FORM_VERSION,
  MARKETING_TEXT_VERSION,
  PRIVACY_NOTICE_VERSION,
  cleanAttribution,
  validateLead,
} from "../shared/form-schema.js";
import { insertLead } from "./leads-repo.js";
import { sameOrigin } from "./security.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHOICE_FIELDS = ["objective", "sector", "company_size", "data_availability", "timing", "country"];
const langs = [pt, en];

function contentFor(lang) {
  return lang === "en" ? en : pt;
}

function messagesFor(c, errors) {
  const t = c.trial;
  return Object.entries(errors).map(([field, code]) => {
    let message = t.errors[code] || t.errors.invalid_option;
    if (code === "required" && CHOICE_FIELDS.includes(field)) message = t.errors.requiredChoice;
    if (code === "too_short" && field === "challenge") message = t.errors.challengeShort.replace("{min}", "20");
    return `${t.fields[field]}: ${message}`;
  });
}

export function publicRoutes({ config, pool, tokens, notifier, log }) {
  const router = express.Router();
  const bodyJson = express.json({ limit: "16kb", strict: true, type: "application/json" });
  const bodyForm = express.urlencoded({ extended: false, limit: "16kb", parameterLimit: 60 });

  // Resposta no formato adequado: JSON para o formulário com JavaScript, HTML para o envio sem JavaScript.
  function reply(req, res, status, body) {
    if (!req.is("application/x-www-form-urlencoded")) return res.status(status).json(body);
    const c = contentFor(req.body?.lang);
    if (body.ok) return res.redirect(303, c.routes.trialReceived);
    const messages = body.errors
      ? messagesFor(c, body.errors)
      : [
          (body.error === "rate_limited"
            ? c.trial.failure.rate
            : body.error === "token_expired"
              ? c.trial.failure.expired
              : body.error === "rejected"
                ? c.trial.failure.rejected
                : c.trial.failure.server
          ).replace("{email}", "contact@bralvex.com"),
        ];
    return res.status(status).type("html").send(renderNoJsErrors(c, langs, config.siteUrl, messages));
  }

  const leadLimiter = rateLimit({
    windowMs: config.leadRateLimit.windowMinutes * 60 * 1000,
    limit: config.leadRateLimit.max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (req, res) => reply(req, res, 429, { ok: false, error: "rate_limited" }),
  });

  router.get("/api/form-token", (req, res) => {
    res.set("Cache-Control", "no-store").json({ token: tokens.issue() });
  });

  router.post("/api/leads", sameOrigin(config.siteUrl), leadLimiter, bodyJson, bodyForm, async (req, res, next) => {
    try {
      if (!req.is("application/json") && !req.is("application/x-www-form-urlencoded")) {
        return res.status(415).json({ ok: false, error: "unsupported_media_type" });
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};

      // Campo-armadilha invisível para pessoas.
      const trap = body.fax_number;
      if (typeof trap === "string" ? trap.trim() !== "" : trap !== undefined) {
        return reply(req, res, 400, { ok: false, error: "rejected" });
      }
      const tokenState = tokens.verify(body.form_token);
      if (tokenState === "expired") return reply(req, res, 400, { ok: false, error: "token_expired" });
      if (tokenState !== "ok") return reply(req, res, 400, { ok: false, error: "rejected" });
      if (body.form_version !== FORM_VERSION || body.privacy_notice_version !== PRIVACY_NOTICE_VERSION) {
        return reply(req, res, 400, { ok: false, error: "outdated" });
      }
      const lang = body.lang === "en" ? "en" : body.lang === "pt" ? "pt" : null;
      if (!lang) return reply(req, res, 400, { ok: false, error: "rejected" });

      let submissionKey = body.submission_key;
      if (submissionKey === undefined || submissionKey === "") submissionKey = randomUUID();
      if (typeof submissionKey !== "string" || !UUID_RE.test(submissionKey)) {
        return reply(req, res, 400, { ok: false, error: "rejected" });
      }

      const result = validateLead(body);
      if (!result.ok) return reply(req, res, 422, { ok: false, errors: result.errors });

      const saved = await insertLead(pool, result.value, {
        submissionKey: submissionKey.toLowerCase(),
        lang,
        formVersion: FORM_VERSION,
        privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
        marketingTextVersion: MARKETING_TEXT_VERSION,
        attribution: cleanAttribution(body),
      });
      log.info("lead.created", { duplicate: saved.duplicate });

      // Resposta só depois da gravação confirmada no banco.
      reply(req, res, saved.duplicate ? 200 : 201, { ok: true });

      if (!saved.duplicate) {
        notifier.notifyNewLead({ publicId: saved.publicId, lang, objective: result.value.objective }).catch(() => {});
      }
    } catch (err) {
      next(err);
    }
  });

  return router;
}
