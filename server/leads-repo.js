import { randomUUID } from "node:crypto";
import { OPTIONS } from "../shared/form-schema.js";
import { q } from "./db.js";

export const STATUSES = ["new", "contacting", "evaluating", "approved_for_trial", "closed"];
export const PAGE_SIZE = 25;
export const EXPORT_LIMIT = 10000;
export const NOTES_MAX = 5000;

export async function insertLead(pool, lead, meta) {
  const publicId = randomUUID();
  try {
    await q(
      pool,
      `INSERT INTO leads (
        public_id, submission_key, lang, form_version,
        objective, objective_other, company, sector, sector_other, job_role, website, company_size,
        challenge, data_availability, timing, full_name, email, country, whatsapp,
        privacy_notice_version, privacy_notice_shown_at,
        marketing_opt_in, marketing_opt_in_at, marketing_text_version,
        referrer_host, utm_source, utm_medium, utm_campaign, utm_term, utm_content,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3),
        ?, IF(?, UTC_TIMESTAMP(3), NULL), ?, ?, ?, ?, ?, ?, ?, 'new', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
      [
        publicId, meta.submissionKey, meta.lang, meta.formVersion,
        lead.objective, lead.objective_other, lead.company, lead.sector, lead.sector_other, lead.job_role, lead.website,
        lead.company_size, lead.challenge, lead.data_availability, lead.timing, lead.full_name, lead.email, lead.country,
        lead.whatsapp, meta.privacyNoticeVersion,
        lead.marketing_opt_in ? 1 : 0, lead.marketing_opt_in ? 1 : 0, lead.marketing_opt_in ? meta.marketingTextVersion : null,
        meta.attribution.referrer_host, meta.attribution.utm_source, meta.attribution.utm_medium,
        meta.attribution.utm_campaign, meta.attribution.utm_term, meta.attribution.utm_content,
      ],
    );
    return { publicId, duplicate: false };
  } catch (err) {
    // Reenvio da mesma solicitação (duplo clique, nova tentativa após falha de rede): não cria um segundo registro.
    if (err.code === "ER_DUP_ENTRY" && String(err.message).includes("submission_key")) {
      const rows = await q(pool, "SELECT public_id FROM leads WHERE submission_key = ?", [meta.submissionKey]);
      if (rows.length) return { publicId: rows[0].public_id, duplicate: true };
    }
    throw err;
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Normaliza filtros vindos da query string; valores fora do aceito são ignorados. */
export function parseFilters(query) {
  const str = (v) => (typeof v === "string" ? v.trim() : "");
  const f = {
    q: str(query.q).slice(0, 100),
    status: STATUSES.includes(str(query.status)) ? str(query.status) : "",
    lang: ["pt", "en"].includes(str(query.lang)) ? str(query.lang) : "",
    objective: OPTIONS.objective.includes(str(query.objective)) ? str(query.objective) : "",
    from: DATE_RE.test(str(query.from)) && !Number.isNaN(Date.parse(str(query.from))) ? str(query.from) : "",
    to: DATE_RE.test(str(query.to)) && !Number.isNaN(Date.parse(str(query.to))) ? str(query.to) : "",
  };
  const page = Number.parseInt(str(query.page), 10);
  f.page = Number.isFinite(page) && page > 0 && page < 100000 ? page : 1;
  return f;
}

function where(f) {
  const clauses = [];
  const params = [];
  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    clauses.push("(full_name LIKE ? OR company LIKE ? OR email LIKE ?)");
    params.push(like, like, like);
  }
  for (const key of ["status", "lang", "objective"]) {
    if (f[key]) {
      clauses.push(`${key} = ?`);
      params.push(f[key]);
    }
  }
  if (f.from) {
    clauses.push("created_at >= ?");
    params.push(`${f.from} 00:00:00.000`);
  }
  if (f.to) {
    clauses.push("created_at < DATE_ADD(?, INTERVAL 1 DAY)");
    params.push(`${f.to} 00:00:00.000`);
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

export async function listLeads(pool, f) {
  const w = where(f);
  const [{ total }] = await q(pool, `SELECT COUNT(*) AS total FROM leads ${w.sql}`, w.params);
  const rows = await q(
    pool,
    `SELECT public_id, created_at, lang, objective, company, full_name, email, country, status, last_contact_at
     FROM leads ${w.sql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [...w.params, PAGE_SIZE, (f.page - 1) * PAGE_SIZE],
  );
  return { total: Number(total), rows, pages: Math.max(1, Math.ceil(Number(total) / PAGE_SIZE)) };
}

export async function exportLeads(pool, f) {
  const w = where(f);
  return q(
    pool,
    `SELECT public_id, created_at, updated_at, lang, form_version, status, last_contact_at,
            objective, objective_other, company, sector, sector_other, job_role, website, company_size,
            challenge, data_availability, timing, full_name, email, country, whatsapp,
            marketing_opt_in, marketing_opt_in_at, privacy_notice_version,
            referrer_host, utm_source, utm_medium, utm_campaign, utm_term, utm_content, internal_notes
     FROM leads ${w.sql} ORDER BY created_at DESC, id DESC LIMIT ?`,
    [...w.params, EXPORT_LIMIT],
  );
}

export async function getLead(pool, publicId) {
  const rows = await q(pool, "SELECT * FROM leads WHERE public_id = ?", [publicId]);
  return rows[0] || null;
}

export async function updateLead(pool, publicId, { status, notes, lastContactAt }) {
  const result = await q(
    pool,
    "UPDATE leads SET status = ?, internal_notes = ?, last_contact_at = ?, updated_at = UTC_TIMESTAMP(3) WHERE public_id = ?",
    [status, notes, lastContactAt, publicId],
  );
  return result.affectedRows > 0;
}

export async function deleteLead(pool, publicId) {
  const result = await q(pool, "DELETE FROM leads WHERE public_id = ?", [publicId]);
  return result.affectedRows > 0;
}

export async function audit(pool, adminId, action, { leadId = null, meta = null } = {}) {
  await q(pool, "INSERT INTO admin_audit_log (admin_id, action, lead_public_id, meta, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(3))", [
    adminId,
    action,
    leadId,
    meta ? String(meta).slice(0, 255) : null,
  ]);
}
