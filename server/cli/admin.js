// Administração privada de contas do painel (executar apenas no servidor, com acesso ao .env).
//
//   npm run admin:create -- email@dominio.com     cria um administrador
//   npm run admin:reset-password -- email@...     define nova senha e encerra todas as sessões dele
//   npm run admin:deactivate -- email@...         desativa a conta e encerra as sessões
//
// A senha é lida do terminal sem eco ou, em automação, da entrada padrão (nunca de argumentos da linha de comando,
// que ficam no histórico do shell). Não existe senha padrão.
import { hash } from "@node-rs/argon2";
import { createPool, q } from "../db.js";
import { loadConfig } from "../config.js";

const MIN_PASSWORD = 12;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function readPassword(prompt) {
  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8").split(/\r?\n/)[0];
  }
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (char) => {
      if (char === "\r" || char === "\n" || char === "\u0004") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(value);
      } else if (char === "\u0003") {
        process.exit(130);
      } else if (char === "\u007f" || char === "\b") {
        value = value.slice(0, -1);
      } else {
        value += char;
      }
    };
    stdin.on("data", onData);
  });
}

async function askNewPassword() {
  const first = await readPassword(`Nova senha (mínimo ${MIN_PASSWORD} caracteres): `);
  if (first.length < MIN_PASSWORD) throw new Error(`A senha deve ter pelo menos ${MIN_PASSWORD} caracteres.`);
  if (first.length > 1024) throw new Error("Senha longa demais.");
  if (process.stdin.isTTY) {
    const second = await readPassword("Repita a senha: ");
    if (first !== second) throw new Error("As senhas não conferem.");
  }
  return first;
}

export async function createAdmin(pool, email, password) {
  const passwordHash = await hash(password);
  await q(
    pool,
    `INSERT INTO admins (email, password_hash, is_active, password_changed_at, created_at, updated_at)
     VALUES (?, ?, 1, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
    [email, passwordHash],
  );
}

export async function resetPassword(pool, email, password) {
  const passwordHash = await hash(password);
  const result = await q(
    pool,
    "UPDATE admins SET password_hash = ?, password_changed_at = UTC_TIMESTAMP(3), updated_at = UTC_TIMESTAMP(3) WHERE email = ?",
    [passwordHash, email],
  );
  if (!result.affectedRows) return false;
  await q(pool, "DELETE s FROM admin_sessions s JOIN admins a ON a.id = s.admin_id WHERE a.email = ?", [email]);
  return true;
}

async function main() {
  const [command, rawEmail] = process.argv.slice(2);
  const email = String(rawEmail || "").trim().toLowerCase();
  if (!["create", "reset-password", "deactivate"].includes(command) || !EMAIL_RE.test(email)) {
    console.error("Uso: node server/cli/admin.js <create|reset-password|deactivate> <email>");
    process.exit(2);
  }
  const config = loadConfig();
  const pool = createPool({ ...config.db, connectionLimit: 1 });
  try {
    if (command === "create") {
      const exists = await q(pool, "SELECT id FROM admins WHERE email = ?", [email]);
      if (exists.length) throw new Error("Já existe um administrador com esse e-mail. Use reset-password.");
      await createAdmin(pool, email, await askNewPassword());
      await q(pool, "INSERT INTO admin_audit_log (admin_id, action, created_at) SELECT id, 'admin_created_cli', UTC_TIMESTAMP(3) FROM admins WHERE email = ?", [email]);
      console.log("Administrador criado.");
    } else if (command === "reset-password") {
      if (!(await resetPassword(pool, email, await askNewPassword()))) throw new Error("Administrador não encontrado.");
      await q(pool, "INSERT INTO admin_audit_log (admin_id, action, created_at) SELECT id, 'password_reset_cli', UTC_TIMESTAMP(3) FROM admins WHERE email = ?", [email]);
      console.log("Senha redefinida. As sessões abertas desse administrador foram encerradas.");
    } else {
      const result = await q(pool, "UPDATE admins SET is_active = 0, updated_at = UTC_TIMESTAMP(3) WHERE email = ?", [email]);
      if (!result.affectedRows) throw new Error("Administrador não encontrado.");
      await q(pool, "DELETE s FROM admin_sessions s JOIN admins a ON a.id = s.admin_id WHERE a.email = ?", [email]);
      console.log("Administrador desativado e sessões encerradas.");
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("server/cli/admin.js")) {
  main().catch((err) => {
    console.error(`Erro: ${err.message}`);
    process.exit(1);
  });
}
