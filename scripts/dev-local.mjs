// Ambiente local completo, sem instalar nada além do Node: banco MySQL temporário (apagado ao encerrar),
// PHP portátil (baixado na primeira vez, no Windows) e o mesmo back end que roda na Hostinger.
// Uso: npm run dev  →  http://localhost:3000  (Ctrl+C para encerrar)
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";
import mysql from "mysql2/promise";
import { createDB } from "mysql-memory-server";
import { build } from "../site/build.mjs";
import { phpCli, ROOT, startPhpServer } from "./php.mjs";

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

const appPassword = secret();
const storage = join(ROOT, ".cache", "dev-storage");
mkdirSync(storage, { recursive: true });
const env = {
  APP_ENV: "development",
  SITE_URL: `http://localhost:${port}`,
  DB_HOST: "127.0.0.1",
  DB_PORT: String(db.port),
  DB_NAME: "bralvex",
  DB_USER: "bralvex_app",
  DB_PASSWORD: appPassword,
  SESSION_SECRET: secret(),
  FORM_TOKEN_SECRET: secret(),
  AUTO_MIGRATE: "false",
  STORAGE_DIR: storage,
};

async function stop(code = 0) {
  server?.stop();
  await db.stop().catch(() => {});
  process.exit(code);
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());

let server;
try {
  const migrated = await phpCli(["migrate"], { env: { ...env, DB_MIGRATION_USER: db.username, DB_MIGRATION_PASSWORD: "" } });
  if (migrated.status !== 0) throw new Error(migrated.stderr || migrated.stdout);
  const conn = await mysql.createConnection({ host: "127.0.0.1", port: db.port, user: db.username, database: "bralvex" });
  await conn.query("CREATE USER 'bralvex_app'@'%' IDENTIFIED BY ?", [appPassword]);
  await conn.query("GRANT SELECT, INSERT, UPDATE, DELETE ON bralvex.* TO 'bralvex_app'@'%'");
  await conn.end();

  const adminEmail = "admin@localhost.test";
  const adminPassword = secret().slice(0, 20);
  const created = await phpCli(["admin:create", adminEmail], { env, input: `${adminPassword}\n` });
  if (created.status !== 0) throw new Error(created.stderr || created.stdout);

  server = await startPhpServer(env, { port, inherit: false });
  server.child.on("exit", () => stop(1));
  console.log(`
Site:   http://localhost:${port}/pt/
Painel: http://localhost:${port}/admin/leads
Login temporário: ${adminEmail} / ${adminPassword}
Os dados somem ao encerrar (Ctrl+C).`);
} catch (err) {
  console.error(`Não foi possível iniciar o ambiente local: ${err.message}`);
  await stop(1);
}
