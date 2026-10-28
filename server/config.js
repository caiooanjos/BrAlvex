// Configuração lida exclusivamente de variáveis de ambiente (veja .env.example).

function int(value, fallback) {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
}

export class ConfigError extends Error {}

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === "production";
  const config = {
    production,
    host: env.HOST || "127.0.0.1",
    port: int(env.PORT, 3000),
    siteUrl: (env.SITE_URL || "http://localhost:3000").replace(/\/+$/, ""),
    trustProxy: env.TRUST_PROXY ? (/^\d+$/.test(env.TRUST_PROXY) ? Number(env.TRUST_PROXY) : env.TRUST_PROXY) : false,
    db: {
      host: env.DB_HOST || "127.0.0.1",
      port: int(env.DB_PORT, 3306),
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      connectionLimit: int(env.DB_CONNECTION_LIMIT, 5),
    },
    sessionSecret: env.SESSION_SECRET,
    formTokenSecret: env.FORM_TOKEN_SECRET,
    sessionIdleMinutes: int(env.SESSION_IDLE_MINUTES, 30),
    sessionAbsoluteHours: int(env.SESSION_ABSOLUTE_HOURS, 8),
    formTokenMinSeconds: int(env.FORM_TOKEN_MIN_SECONDS, 3),
    formTokenMaxHours: int(env.FORM_TOKEN_MAX_HOURS, 48),
    leadRateLimit: { windowMinutes: int(env.LEAD_RATE_WINDOW_MINUTES, 10), max: int(env.LEAD_RATE_MAX, 5) },
    loginRateLimit: { windowMinutes: int(env.LOGIN_RATE_WINDOW_MINUTES, 15), max: int(env.LOGIN_RATE_MAX, 10) },
    retentionDays: env.LEAD_RETENTION_DAYS ? int(env.LEAD_RETENTION_DAYS, 0) : null,
    smtp: env.SMTP_HOST
      ? {
          host: env.SMTP_HOST,
          port: int(env.SMTP_PORT, 465),
          secure: env.SMTP_SECURE ? env.SMTP_SECURE === "true" : int(env.SMTP_PORT, 465) === 465,
          user: env.SMTP_USER,
          pass: env.SMTP_PASSWORD,
        }
      : null,
    notifyFrom: env.NOTIFY_FROM || env.SMTP_USER || null,
    notifyTo: env.NOTIFY_TO || "contact@bralvex.com",
    adminTimeZone: env.ADMIN_TIMEZONE || "America/Sao_Paulo",
    sessionCookieName: production ? "__Secure-bralvex_admin" : "bralvex_admin",
  };

  const missing = ["DB_USER", "DB_PASSWORD", "DB_NAME", "SESSION_SECRET", "FORM_TOKEN_SECRET"].filter((key) => !env[key]);
  if (missing.length) throw new ConfigError(`Variáveis de ambiente ausentes: ${missing.join(", ")}`);
  for (const key of ["SESSION_SECRET", "FORM_TOKEN_SECRET"]) {
    if (env[key].length < 32) throw new ConfigError(`${key} deve ter pelo menos 32 caracteres aleatórios.`);
  }
  if (env.SESSION_SECRET === env.FORM_TOKEN_SECRET) throw new ConfigError("SESSION_SECRET e FORM_TOKEN_SECRET devem ser diferentes.");
  if (production && !config.siteUrl.startsWith("https://")) throw new ConfigError("Em produção, SITE_URL deve usar https://.");
  return config;
}
