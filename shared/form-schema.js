// Esquema do formulário de solicitação de teste.
// Arquivo isomórfico: usado pelo navegador (validação de conveniência) e pelo servidor (validação obrigatória).

export const FORM_VERSION = "trial-2026-10-v1";
export const PRIVACY_NOTICE_VERSION = "privacy-notice-2026-10-draft";
export const MARKETING_TEXT_VERSION = "marketing-optin-2026-10-v1";

export const OPTIONS = {
  objective: ["reduce_costs", "improve_forecasts", "optimize_processes", "api_integration", "other"],
  sector: [
    "agribusiness", "energy", "finance", "manufacturing", "logistics", "healthcare", "retail",
    "technology", "construction", "education", "public_sector", "services", "other",
  ],
  company_size: ["solo", "2_10", "11_50", "51_200", "201_1000", "1000_plus"],
  data_availability: ["organized", "scattered", "none", "unknown"],
  timing: ["now", "3_months", "later", "researching"],
};

// ISO 3166-1 alfa-2. Os nomes são gerados por Intl.DisplayNames no idioma da página.
export const COUNTRIES = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
  "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP " +
  "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT " +
  "MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
  "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG " +
  "UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" ");

export const LIMITS = {
  objective_other: 120,
  company: 150,
  sector_other: 120,
  job_role: 100,
  website: 200,
  challenge: 1000,
  challenge_min: 20,
  full_name: 150,
  email: 254,
  utm: 100,
};

// Campos de cada etapa (a etapa 8 é a revisão).
export const STEPS = [
  ["objective", "objective_other"],
  ["company", "sector", "sector_other", "job_role", "website"],
  ["company_size"],
  ["challenge"],
  ["data_availability"],
  ["timing"],
  ["full_name", "email", "country", "whatsapp", "marketing_opt_in"],
];

export const UTM_FIELDS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];

export const FREE_EMAIL_DOMAINS = [
  "gmail.com", "googlemail.com", "hotmail.com", "outlook.com", "live.com", "msn.com", "yahoo.com", "yahoo.com.br",
  "icloud.com", "me.com", "aol.com", "uol.com.br", "bol.com.br", "terra.com.br", "proton.me", "protonmail.com",
  "gmx.com", "mail.com", "zoho.com",
];

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g;
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const HOST_RE = /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;
const UTM_RE = /^[\p{L}\p{N} _.\-+:|/~()]+$/u;

export function cleanText(value, { multiline = false } = {}) {
  if (typeof value !== "string") return "";
  let text = value.normalize("NFC").replace(CONTROL_CHARS, "");
  if (multiline) {
    text = text.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n");
  } else {
    text = text.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ");
  }
  return text.trim();
}

export function isFreeEmail(email) {
  const domain = String(email || "").split("@")[1]?.toLowerCase();
  return Boolean(domain && FREE_EMAIL_DOMAINS.includes(domain));
}

function normalizeWebsite(raw) {
  if (!raw) return { value: null };
  if (raw.length > LIMITS.website) return { error: "too_long" };
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return { error: "invalid_url" };
  }
  if (!["http:", "https:"].includes(url.protocol) || !HOST_RE.test(url.hostname) || url.username || url.password) {
    return { error: "invalid_url" };
  }
  // Guarda apenas host e caminho: query strings e fragmentos podem carregar dados pessoais.
  const path = url.pathname === "/" ? "" : url.pathname;
  const value = `${url.protocol}//${url.hostname.toLowerCase()}${path}`;
  return value.length > LIMITS.website ? { error: "too_long" } : { value };
}

function normalizePhone(raw) {
  if (!raw) return { value: null };
  if (raw.length > 25 || !/^\+?[\d\s().-]+$/.test(raw)) return { error: "invalid_phone" };
  const digits = raw.replace(/\D/g, "");
  if (!raw.trim().startsWith("+") || digits.length < 8 || digits.length > 15) return { error: "invalid_phone" };
  return { value: `+${digits}` };
}

function text(errors, out, input, field, { required = true, min = 2, max, multiline = false } = {}) {
  const value = cleanText(input[field], { multiline });
  if (!value) {
    if (required) errors[field] = "required";
    out[field] = null;
    return;
  }
  if (value.length < min) errors[field] = "too_short";
  else if (value.length > max) errors[field] = "too_long";
  out[field] = value;
}

function choice(errors, out, input, field) {
  const value = typeof input[field] === "string" ? input[field] : "";
  if (!value) errors[field] = "required";
  else if (!OPTIONS[field].includes(value)) errors[field] = "invalid_option";
  out[field] = value || null;
}

function bool(value) {
  return value === true || value === "true" || value === "on" || value === "1" || value === 1;
}

/**
 * Valida e normaliza as respostas. `fields` restringe a validação às etapas informadas (uso no navegador).
 * Retorna { ok, value, errors } em que errors é { campo: código }.
 */
export function validateLead(input, { fields } = {}) {
  const src = input && typeof input === "object" ? input : {};
  const errors = {};
  const out = {};

  choice(errors, out, src, "objective");
  if (out.objective === "other") text(errors, out, src, "objective_other", { max: LIMITS.objective_other });
  else out.objective_other = null;

  text(errors, out, src, "company", { max: LIMITS.company });
  choice(errors, out, src, "sector");
  if (out.sector === "other") text(errors, out, src, "sector_other", { max: LIMITS.sector_other });
  else out.sector_other = null;
  text(errors, out, src, "job_role", { max: LIMITS.job_role });
  const website = normalizeWebsite(cleanText(src.website));
  if (website.error) errors.website = website.error;
  out.website = website.value ?? null;

  choice(errors, out, src, "company_size");
  text(errors, out, src, "challenge", { min: LIMITS.challenge_min, max: LIMITS.challenge, multiline: true });
  choice(errors, out, src, "data_availability");
  choice(errors, out, src, "timing");

  text(errors, out, src, "full_name", { max: LIMITS.full_name });
  const email = cleanText(src.email).toLowerCase();
  if (!email) errors.email = "required";
  else if (email.length > LIMITS.email || !EMAIL_RE.test(email)) errors.email = "invalid_email";
  out.email = email || null;

  const country = typeof src.country === "string" ? src.country.toUpperCase() : "";
  if (!country) errors.country = "required";
  else if (!COUNTRIES.includes(country)) errors.country = "invalid_option";
  out.country = country || null;

  const phone = normalizePhone(cleanText(src.whatsapp));
  if (phone.error) errors.whatsapp = phone.error;
  out.whatsapp = phone.value ?? null;

  out.marketing_opt_in = bool(src.marketing_opt_in);

  if (fields) {
    for (const key of Object.keys(errors)) if (!fields.includes(key)) delete errors[key];
  }
  return { ok: Object.keys(errors).length === 0, value: out, errors };
}

/** Valida metadados de origem (UTMs e host de referência). Valores inválidos são descartados, não rejeitados. */
export function cleanAttribution(input) {
  const src = input && typeof input === "object" ? input : {};
  const out = {};
  for (const field of UTM_FIELDS) {
    const value = cleanText(src[field]);
    out[field] = value && value.length <= LIMITS.utm && UTM_RE.test(value) ? value : null;
  }
  const host = cleanText(src.referrer_host).toLowerCase();
  out.referrer_host = host && HOST_RE.test(host) ? host : null;
  return out;
}
