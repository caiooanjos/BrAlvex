import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Token do formulário (armadilha de tempo validada no servidor): registra quando a página foi entregue.
 * Envios rápidos demais (robôs) ou muito antigos são recusados. Não identifica o visitante.
 */
export function createFormTokens(secret, { minSeconds, maxHours }) {
  const sign = (payload) => createHmac("sha256", secret).update(`form:${payload}`).digest("base64url");
  return {
    issue(now = Date.now()) {
      const payload = `${now}.${randomBytes(6).toString("base64url")}`;
      return `${payload}.${sign(payload)}`;
    },
    verify(token, now = Date.now()) {
      if (typeof token !== "string" || token.length > 200) return "invalid";
      const parts = token.split(".");
      if (parts.length !== 3) return "invalid";
      const payload = `${parts[0]}.${parts[1]}`;
      if (!safeEqual(sign(payload), parts[2])) return "invalid";
      const age = now - Number(parts[0]);
      if (!Number.isFinite(age) || age < minSeconds * 1000) return "too_fast";
      if (age > maxHours * 3600 * 1000) return "expired";
      return "ok";
    },
  };
}

export function newCsrfToken() {
  return randomBytes(32).toString("base64url");
}

export function checkCsrf(req) {
  const expected = req.session?.csrf;
  const received = req.body?._csrf;
  return Boolean(expected && typeof received === "string" && safeEqual(expected, received));
}

/** Recusa requisições de escrita vindas de outra origem (complementa SameSite e o token CSRF). */
export function sameOrigin(siteUrl) {
  const allowed = new URL(siteUrl).origin;
  return (req, res, next) => {
    const origin = req.get("origin");
    const referer = req.get("referer");
    let source = origin && origin !== "null" ? origin : null;
    if (!source && referer) {
      try {
        source = new URL(referer).origin;
      } catch {
        source = "invalid";
      }
    }
    const own = `${req.protocol}://${req.get("host")}`;
    if (source && source !== allowed && source !== own) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }
    next();
  };
}

/** Limite simples em memória por chave (ex.: e-mail no login). As chaves não são persistidas. */
export class AttemptLimiter {
  constructor({ max, windowMs }) {
    this.max = max;
    this.windowMs = windowMs;
    this.entries = new Map();
  }

  blocked(key) {
    const entry = this.entries.get(key);
    if (!entry) return false;
    if (Date.now() - entry.start > this.windowMs) {
      this.entries.delete(key);
      return false;
    }
    return entry.count >= this.max;
  }

  fail(key) {
    const now = Date.now();
    const entry = this.entries.get(key);
    if (!entry || now - entry.start > this.windowMs) this.entries.set(key, { start: now, count: 1 });
    else entry.count += 1;
    if (this.entries.size > 10000) {
      for (const [k, v] of this.entries) if (now - v.start > this.windowMs) this.entries.delete(k);
    }
  }

  reset(key) {
    this.entries.delete(key);
  }
}
