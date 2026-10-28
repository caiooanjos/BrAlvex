// Ponto de entrada de produção: node --env-file-if-exists=.env server/index.js
import { createApp } from "./app.js";
import { ConfigError, loadConfig } from "./config.js";
import { createPool } from "./db.js";
import { log } from "./log.js";

let config;
try {
  config = loadConfig();
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(`Configuração inválida: ${err.message}`);
    if (process.env.NODE_ENV !== "production") console.error("Para rodar localmente sem configurar banco, use: npm run dev");
    process.exit(1);
  }
  throw err;
}

const pool = createPool(config.db);
const app = createApp({ config, pool, log });

const server = app.listen(config.port, config.host, () => {
  log.info("server.started", { node: process.version, host: config.host, port: config.port, production: config.production });
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.keepAliveTimeout = 5000;

const pruneTimer = setInterval(() => app.locals.sessionStore.prune().catch(() => {}), 60 * 60 * 1000);
pruneTimer.unref();

function shutdown(signal) {
  log.info("server.stopping", { signal });
  server.close(() => pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
