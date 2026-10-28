// Ambiente local completo, sem instalar MySQL: banco temporário (apagado ao encerrar), site, formulário e painel.
// Uso: npm run dev  →  http://localhost:3000  (Ctrl+C para encerrar)
import { randomBytes } from "node:crypto";
import { connect } from "node:net";
import mysql from "mysql2/promise";
import { createDB } from "mysql-memory-server";
import { build } from "../site/build.mjs";
import { createApp } from "../server/app.js";
import { createAdmin } from "../server/cli/admin.js";
import { loadConfig } from "../server/config.js";
import { createPool } from "../server/db.js";
import { log } from "../server/log.js";
import { migrate } from "../server/migrate.js";

if (process.env.NODE_ENV === "production") {
  console.error("npm run dev é só para desenvolvimento e não roda com NODE_ENV=production.");
  process.exit(1);
}

const port = Number(process.env.PORT || 3000);
const secret = () => randomBytes(36).toString("base64url");

// Se outro servidor já ocupa a porta, o navegador falaria com ele (e o login impresso aqui não valeria).
const portBusy = await new Promise((resolve) => {
  const socket = connect({ host: "127.0.0.1", port }, () => (socket.destroy(), resolve(true)));
  socket.on("error", () => resolve(false));
});
if (portBusy) {
  console.error(`A porta ${port} já está em uso (provavelmente outro "npm run dev" aberto). Feche-o ou use outra porta: PORT=3001 npm run dev`);
  process.exit(1);
}

await build({ quiet: true });
console.log("Iniciando MySQL temporário (na primeira vez o download leva cerca de 1 minuto)...");
const db = await createDB({ dbName: "bralvex", logLevel: "ERROR" });
const root = { host: "127.0.0.1", port: db.port, user: db.username, password: "", database: "bralvex" };
await migrate(root, { log: () => {} });

const appPassword = secret();
const conn = await mysql.createConnection(root);
await conn.query("CREATE USER 'bralvex_app'@'%' IDENTIFIED BY ?", [appPassword]);
await conn.query("GRANT SELECT, INSERT, UPDATE, DELETE ON bralvex.* TO 'bralvex_app'@'%'");
await conn.end();

const config = loadConfig({
  NODE_ENV: "development",
  SITE_URL: `http://localhost:${port}`,
  PORT: String(port),
  DB_PORT: String(db.port),
  DB_USER: "bralvex_app",
  DB_PASSWORD: appPassword,
  DB_NAME: "bralvex",
  SESSION_SECRET: secret(),
  FORM_TOKEN_SECRET: secret(),
});
const pool = createPool(config.db);
const adminEmail = "admin@localhost.test";
const adminPassword = secret().slice(0, 20);
await createAdmin(pool, adminEmail, adminPassword);

const server = createApp({ config, pool, log }).listen(port, "127.0.0.1", () => {
  console.log(`
Site:   http://localhost:${port}/pt/
Painel: http://localhost:${port}/admin/leads
Login temporário: ${adminEmail} / ${adminPassword}
Os dados somem ao encerrar (Ctrl+C).`);
});
server.on("error", async (err) => {
  console.error(`Não foi possível abrir a porta ${port}: ${err.code || err.message}`);
  await db.stop().catch(() => {});
  process.exit(1);
});

async function stop() {
  server.close();
  await pool.end().catch(() => {});
  await db.stop().catch(() => {});
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
