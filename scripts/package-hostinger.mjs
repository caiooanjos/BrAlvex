// Monta os pacotes de publicação para hospedagem PHP + MySQL (Hostinger Premium e similares).
// Uso: npm run hostinger   (faz as perguntas no terminal e gera deploy/public_html.zip e deploy/bralvex-app.zip)
//
// deploy/ contém senhas e fica fora do Git. Apague a pasta depois de enviar os arquivos.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { phpCli, ROOT } from "./php.mjs";
import { zipDirectory } from "./zip.mjs";

const DEPLOY = join(ROOT, "deploy");
const secret = () => randomBytes(48).toString("base64url");

/** Pergunta no terminal; com `hidden`, não mostra o que é digitado. Valores de ambiente (PKG_*) dispensam a pergunta. */
async function ask(rl, label, { envKey, fallback = "", hidden = false, required = true } = {}) {
  if (envKey && process.env[envKey] !== undefined) return process.env[envKey];
  for (;;) {
    let answer;
    if (hidden && process.stdin.isTTY) {
      process.stdout.write(`${label}: `);
      answer = await new Promise((resolve) => {
        let value = "";
        const stdin = process.stdin;
        rl.pause();
        stdin.setRawMode(true);
        stdin.resume();
        const onData = (buf) => {
          for (const char of buf.toString("utf8")) {
            if (char === "\r" || char === "\n") {
              stdin.setRawMode(false);
              stdin.removeListener("data", onData);
              process.stdout.write("\n");
              rl.resume();
              return resolve(value);
            }
            if (char === "\u0003") process.exit(130);
            if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
            else value += char;
          }
        };
        stdin.on("data", onData);
      });
    } else {
      answer = await rl.question(fallback ? `${label} [${fallback}]: ` : `${label}: `);
    }
    answer = answer.trim() || fallback;
    if (answer || !required) return answer;
    console.log("  Campo obrigatório.");
  }
}

function phpString(value) {
  return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
console.log("\nPacote de publicação BrAlveX (hospedagem PHP + MySQL)\n");
console.log("Dados do banco: hPanel → Websites → Gerenciar → Bancos de dados (os nomes têm um prefixo, ex.: u123456789_bralvex).\n");

const siteUrl = (await ask(rl, "Endereço do site", { envKey: "PKG_SITE_URL", fallback: "https://bralvex.com" })).replace(/\/+$/, "");
if (!siteUrl.startsWith("https://")) throw new Error("O endereço precisa começar com https://");
const dbName = await ask(rl, "Nome do banco (com prefixo)", { envKey: "PKG_DB_NAME" });
const dbUser = await ask(rl, "Usuário do banco (com prefixo)", { envKey: "PKG_DB_USER" });
const dbPassword = await ask(rl, "Senha do banco", { envKey: "PKG_DB_PASSWORD", hidden: true });
console.log("\nPrimeiro acesso ao painel (/admin/leads):");
const adminEmail = (await ask(rl, "E-mail do administrador", { envKey: "PKG_ADMIN_EMAIL" })).toLowerCase();
let adminPassword;
for (;;) {
  adminPassword = await ask(rl, "Senha do painel (mínimo 12 caracteres)", { envKey: "PKG_ADMIN_PASSWORD", hidden: true });
  if (adminPassword.length < 12) {
    console.log("  A senha precisa ter pelo menos 12 caracteres.");
    if (process.env.PKG_ADMIN_PASSWORD) process.exit(1);
    continue;
  }
  if (process.env.PKG_ADMIN_PASSWORD || (await ask(rl, "Repita a senha", { hidden: true })) === adminPassword) break;
  console.log("  As senhas não conferem.");
}
console.log("\nAviso de novos leads por e-mail (opcional; deixe em branco para configurar depois):");
const smtpPassword = await ask(rl, "Senha da caixa contact@bralvex.com", { envKey: "PKG_SMTP_PASSWORD", hidden: true, required: false });
rl.close();

console.log("\nGerando o site...");
const built = spawnSync(process.execPath, [join(ROOT, "site", "build.mjs")], { env: { ...process.env, SITE_URL: siteUrl }, stdio: "inherit" });
if (built.status !== 0) process.exit(1);

const hash = await phpCli(["hash-password"], { input: `${adminPassword}\n` });
if (hash.status !== 0) throw new Error(hash.stderr);

await rm(DEPLOY, { recursive: true, force: true });
const publicDir = join(DEPLOY, "public_html");
const appDir = join(DEPLOY, "bralvex-app");
await cp(join(ROOT, "dist"), publicDir, { recursive: true });
await cp(join(ROOT, "php", "public", "app.php"), join(publicDir, "app.php"));

await mkdir(appDir, { recursive: true });
for (const file of await readdir(join(ROOT, "php", "app"))) {
  if (["storage", "config.php"].includes(file)) continue;
  await cp(join(ROOT, "php", "app", file), join(appDir, file), { recursive: true });
}
await cp(join(ROOT, "migrations"), join(appDir, "migrations"), { recursive: true });
await mkdir(join(appDir, "storage"), { recursive: true });
await writeFile(join(appDir, "storage", ".htaccess"), "Require all denied\n");

const config = {
  APP_ENV: "production",
  SITE_URL: siteUrl,
  DB_HOST: "127.0.0.1",
  DB_PORT: "3306",
  DB_NAME: dbName,
  DB_USER: dbUser,
  DB_PASSWORD: dbPassword,
  SESSION_SECRET: secret(),
  FORM_TOKEN_SECRET: secret(),
  ADMIN_SEED_EMAIL: adminEmail,
  ADMIN_SEED_PASSWORD_HASH: hash.stdout.trim(),
  ...(smtpPassword
    ? {
        SMTP_HOST: "smtp.hostinger.com",
        SMTP_PORT: "465",
        SMTP_SECURE: "true",
        SMTP_USER: "contact@bralvex.com",
        SMTP_PASSWORD: smtpPassword,
        NOTIFY_FROM: "BrAlveX <contact@bralvex.com>",
        NOTIFY_TO: "contact@bralvex.com",
      }
    : {}),
};
await writeFile(
  join(appDir, "config.php"),
  `<?php\n// Gerado por "npm run hostinger" em ${new Date().toISOString()}. Contém senhas: não compartilhe nem versione.\n// Opções disponíveis: config.example.php.\nreturn [\n${Object.entries(config)
    .map(([k, v]) => `    '${k}' => ${phpString(v)},`)
    .join("\n")}\n];\n`,
);

await zipDirectory(publicDir, join(DEPLOY, "public_html.zip"));
await zipDirectory(appDir, join(DEPLOY, "bralvex-app.zip"), "bralvex-app/");

console.log(`
Pacotes prontos em deploy/:
  public_html.zip   → extrair dentro de  domains/${new URL(siteUrl).hostname}/public_html/
  bralvex-app.zip   → extrair dentro de  domains/${new URL(siteUrl).hostname}/   (ao lado de public_html, NÃO dentro)

Siga o passo a passo em docs/HOSTINGER.md. Depois de enviar, apague a pasta deploy/ (ela contém senhas).`);
