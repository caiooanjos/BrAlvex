import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import session from "express-session";
import helmet from "helmet";
import { FORM_TOKEN_PLACEHOLDER } from "../site/templates.js";
import pt from "../site/content/pt.js";
import en from "../site/content/en.js";
import { renderNoJsErrors } from "../site/templates.js";
import { adminRoutes } from "./admin-routes.js";
import { log as defaultLog } from "./log.js";
import { createNotifier } from "./notify.js";
import { publicRoutes } from "./public-routes.js";
import { createFormTokens } from "./security.js";
import { MySqlSessionStore } from "./session-store.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function createApp({ config, pool, log = defaultLog, notifier, distDir = join(ROOT, "dist") }) {
  const app = express();
  const tokens = createFormTokens(config.formTokenSecret, {
    minSeconds: config.formTokenMinSeconds,
    maxHours: config.formTokenMaxHours,
  });
  notifier ??= createNotifier(config, pool, log);

  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", "data:"],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          objectSrc: ["'none'"],
          ...(config.production ? { upgradeInsecureRequests: [] } : {}),
        },
      },
      strictTransportSecurity: config.production ? { maxAge: 31536000 } : false,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Endereço antigo e atalhos → rotas por idioma. O navegador preserva o #âncora dos links existentes.
  const redirects = {
    "/": pt.routes.home,
    "/index.html": pt.routes.home,
    "/pt": pt.routes.home,
    "/en": en.routes.home,
    "/solicitar-teste": pt.routes.trial,
    "/pt/solicitar-teste": pt.routes.trial,
    "/request-trial": en.routes.trial,
    "/en/request-trial": en.routes.trial,
    "/privacidade": pt.routes.privacy,
    "/privacy": en.routes.privacy,
  };
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    const target = redirects[req.path];
    if (!target) return next();
    const query = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
    res.redirect(301, target + query);
  });

  // Páginas do formulário recebem um token novo a cada carregamento (armadilha de tempo contra spam).
  const trialCache = new Map();
  async function trialPage(route) {
    if (!trialCache.has(route) || !config.production) {
      trialCache.set(route, await readFile(join(distDir, route, "index.html"), "utf8"));
    }
    return trialCache.get(route);
  }
  for (const route of [pt.routes.trial, en.routes.trial]) {
    app.get(route, async (req, res, next) => {
      if (!req.path.endsWith("/")) return next();
      try {
        const page = await trialPage(route);
        res.set("Cache-Control", "no-store").type("html").send(page.replace(FORM_TOKEN_PLACEHOLDER, tokens.issue()));
      } catch (err) {
        next(err);
      }
    });
  }

  app.get("/admin/assets/admin.css", (req, res) => res.sendFile(join(ROOT, "server", "admin.css")));

  const store = new MySqlSessionStore(pool, { ttlMs: config.sessionIdleMinutes * 60 * 1000 });
  app.locals.sessionStore = store;
  app.use(
    "/admin",
    session({
      name: config.sessionCookieName,
      secret: config.sessionSecret,
      store,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      unset: "destroy",
      proxy: Boolean(config.trustProxy),
      cookie: {
        httpOnly: true,
        secure: config.production,
        sameSite: "strict",
        path: "/admin",
        maxAge: config.sessionIdleMinutes * 60 * 1000,
      },
    }),
  );

  app.use(publicRoutes({ config, pool, tokens, notifier, log }));
  app.use(adminRoutes({ config, pool, log }));

  app.use(
    express.static(distDir, {
      index: "index.html",
      redirect: true,
      dotfiles: "ignore",
      setHeaders(res, file) {
        res.set("Cache-Control", file.endsWith(".html") || file.endsWith(".xml") ? "no-cache" : "public, max-age=3600");
      },
    }),
  );

  app.use((req, res) => {
    if (req.path.startsWith("/api/")) return res.status(404).json({ ok: false, error: "not_found" });
    res
      .status(404)
      .type("html")
      .send(
        `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Página não encontrada | BrAlveX</title><link rel="stylesheet" href="/original-assets/index-BwCoKsv6.css"><link rel="stylesheet" href="/src/site.css"></head><body><main class="section legal"><div class="container legal__body"><h1>Página não encontrada</h1><p><a href="/pt/">Ir para o site em português</a></p><p lang="en"><a href="/en/">Page not found — go to the English website</a></p></div></main></body></html>`,
      );
  });

  // Erros: detalhes ficam apenas no log interno (sem dados do formulário); o público recebe mensagem genérica.
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const clientError = {
      "entity.too.large": [413, "payload_too_large"],
      "parameters.too.many": [413, "payload_too_large"],
      "entity.parse.failed": [400, "invalid_json"],
      "encoding.unsupported": [415, "unsupported_encoding"],
      "charset.unsupported": [415, "unsupported_charset"],
    }[err.type];
    if (clientError) return res.status(clientError[0]).json({ ok: false, error: clientError[1] });

    log.error("request.failed", { method: req.method, path: req.path, code: err.code || err.name });
    if (req.path === "/api/leads" && req.is("application/x-www-form-urlencoded")) {
      const c = req.body?.lang === "en" ? en : pt;
      return res
        .status(500)
        .type("html")
        .send(renderNoJsErrors(c, [pt, en], config.siteUrl, [c.trial.failure.server.replace("{email}", "contact@bralvex.com")]));
    }
    if (req.path.startsWith("/api/")) return res.status(500).json({ ok: false, error: "server_error" });
    res.status(500).type("text").send("Erro interno. Tente novamente em instantes.");
  });

  return app;
}
