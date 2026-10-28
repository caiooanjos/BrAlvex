// Testes de ponta a ponta do back end PHP contra um MySQL real (mysql-memory-server baixa e executa o binário oficial).
// O servidor embutido do PHP roda com php/dev-router.php, que reproduz as regras do .htaccess de produção.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { createDB } from "mysql-memory-server";
import mysql from "mysql2/promise";
import { build } from "../site/build.mjs";
import { FORM_VERSION, PRIVACY_NOTICE_VERSION } from "../shared/form-schema.js";
import { freePort, phpCli, startPhpServer } from "../scripts/php.mjs";
import { validLead } from "./helpers.js";

const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "senha-de-teste-bem-longa";
const APP_PASSWORD = "app-user-password-for-tests";

let mysqlServer;
let rootConn;
const servers = [];

function baseEnv(overrides = {}) {
  return {
    APP_ENV: "test",
    SITE_URL: "http://127.0.0.1",
    DB_HOST: "127.0.0.1",
    DB_PORT: String(mysqlServer.port),
    DB_USER: "bralvex_app",
    DB_PASSWORD: APP_PASSWORD,
    DB_NAME: mysqlServer.dbName,
    SESSION_SECRET: "a".repeat(40),
    FORM_TOKEN_SECRET: "b".repeat(40),
    FORM_TOKEN_MIN_SECONDS: "0",
    LEAD_RATE_MAX: "1000",
    LOGIN_RATE_MAX: "1000",
    AUTO_MIGRATE: "false",
    STORAGE_DIR: mkdtempSync(join(tmpdir(), "bralvex-storage-")),
    ...overrides,
  };
}

async function start(envOverrides = {}) {
  const server = await startPhpServer(baseEnv(envOverrides));
  servers.push(server);
  return server;
}

/** Cliente HTTP mínimo com cookie de sessão. */
function client(base) {
  let cookie = "";
  return {
    async request(path, { method = "GET", headers = {}, body } = {}) {
      const res = await fetch(base + path, {
        method,
        redirect: "manual",
        headers: { ...(cookie ? { cookie } : {}), ...headers },
        body,
      });
      const set = res.headers.getSetCookie().at(-1);
      if (set) cookie = set.split(";")[0];
      return res;
    },
    form(path, data) {
      return this.request(path, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(data).toString(),
      });
    },
  };
}

async function formToken(base) {
  const res = await fetch(`${base}/api/form-token`);
  return (await res.json()).token;
}

async function postLead(base, payload, headers = {}) {
  return fetch(`${base}/api/leads`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
}

async function fullPayload(base, overrides = {}) {
  return {
    ...validLead(),
    lang: "pt",
    form_version: FORM_VERSION,
    privacy_notice_version: PRIVACY_NOTICE_VERSION,
    form_token: await formToken(base),
    submission_key: crypto.randomUUID(),
    fax_number: "",
    ...overrides,
  };
}

async function login(base, email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  const c = client(base);
  const res = await c.form("/admin/login", { email, password });
  return { c, res };
}

async function csrfFrom(c, path) {
  const page = await (await c.request(path)).text();
  return page.match(/name="_csrf" value="([^"]+)"/)[1];
}

/** O aviso por e-mail roda depois da resposta ao visitante; aguarda o status final. */
async function notificationStatus(submissionKey) {
  for (let i = 0; i < 50; i++) {
    const { notification_status: status } = await leadRow(submissionKey);
    if (status !== "pending") return status;
    await new Promise((r) => setTimeout(r, 100));
  }
  return "pending";
}

async function leadRow(submissionKey) {
  const [rows] = await rootConn.query("SELECT * FROM leads WHERE submission_key = ?", [submissionKey]);
  return rows[0];
}

/** Servidor SMTP mínimo, só para os testes, que guarda as mensagens recebidas. */
async function fakeSmtp() {
  const messages = [];
  const server = createServer((socket) => {
    let data = null;
    socket.on("error", () => {});
    socket.write("220 fake ESMTP\r\n");
    socket.on("data", (chunk) => {
      for (const line of chunk.toString().split("\r\n")) {
        if (data !== null) {
          if (line === ".") {
            messages.push(data.join("\n"));
            data = null;
            socket.write("250 queued\r\n");
          } else data.push(line);
        } else if (/^EHLO/i.test(line)) socket.write("250-fake\r\n250 AUTH LOGIN\r\n");
        else if (/^AUTH LOGIN/i.test(line)) socket.write("334 VXNlcm5hbWU6\r\n");
        else if (/^[A-Za-z0-9+/=]{4,}$/.test(line) && !/^(MAIL|RCPT|DATA|QUIT)/i.test(line)) socket.write(messages.authStep++ ? "235 ok\r\n" : "334 UGFzc3dvcmQ6\r\n");
        else if (/^(MAIL|RCPT)/i.test(line)) socket.write("250 ok\r\n");
        else if (/^DATA/i.test(line)) {
          data = [];
          socket.write("354 go\r\n");
        } else if (/^QUIT/i.test(line)) socket.end("221 bye\r\n");
      }
    });
  });
  messages.authStep = 0;
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { port: server.address().port, messages, close: () => server.close() };
}

before(async () => {
  await build({ quiet: true });
  mysqlServer = await createDB({ dbName: "bralvex_test", logLevel: "ERROR" });
  const rootEnv = { DB_MIGRATION_USER: mysqlServer.username, DB_MIGRATION_PASSWORD: "" };
  const migrated = await phpCli(["migrate"], { env: baseEnv(rootEnv) });
  assert.equal(migrated.status, 0, migrated.stderr);
  // Usuário da aplicação com privilégios mínimos (sem DDL).
  rootConn = await mysql.createConnection({
    host: "127.0.0.1",
    port: mysqlServer.port,
    user: mysqlServer.username,
    database: mysqlServer.dbName,
    timezone: "Z",
  });
  await rootConn.query("CREATE USER 'bralvex_app'@'%' IDENTIFIED BY ?", [APP_PASSWORD]);
  await rootConn.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON \`${mysqlServer.dbName}\`.* TO 'bralvex_app'@'%'`);
  const created = await phpCli(["admin:create", ADMIN_EMAIL], { env: baseEnv(), input: `${ADMIN_PASSWORD}\n` });
  assert.equal(created.status, 0, created.stderr);
});

after(async () => {
  for (const s of servers) s.stop();
  await rootConn?.end();
  await mysqlServer?.stop();
});

describe("migrations e banco", () => {
  test("migrations são idempotentes", async () => {
    const again = await phpCli(["migrate"], { env: baseEnv({ DB_MIGRATION_USER: mysqlServer.username }) });
    assert.equal(again.status, 0, again.stderr);
    assert.match(again.stdout, /Nenhuma migration pendente/);
  });

  test("usuário da aplicação não tem privilégio de DDL", async () => {
    const app = await mysql.createConnection({ host: "127.0.0.1", port: mysqlServer.port, user: "bralvex_app", password: APP_PASSWORD, database: mysqlServer.dbName });
    await assert.rejects(app.query("DROP TABLE leads"), /denied/i);
    await app.end();
  });

  test("instalação nova: cria as tabelas no primeiro acesso e aplica o administrador inicial uma vez", async () => {
    await rootConn.query("CREATE DATABASE bralvex_fresh");
    const hash = (await phpCli(["hash-password"], { input: "senha-inicial-segura\n" })).stdout.trim();
    assert.match(hash, /^\$2y\$12\$/);
    const env = { DB_NAME: "bralvex_fresh", DB_USER: mysqlServer.username, DB_PASSWORD: "", AUTO_MIGRATE: "true", ADMIN_SEED_EMAIL: "Dona@BrAlveX.com", ADMIN_SEED_PASSWORD_HASH: hash };
    const { base } = await start(env);
    assert.equal((await fetch(`${base}/admin/login`)).status, 200);
    const [tables] = await rootConn.query("SELECT version FROM bralvex_fresh.schema_migrations ORDER BY version");
    assert.deepEqual(tables.map((t) => t.version), ["001_initial.sql", "002_rate_limits_app_state.sql"]);
    assert.equal((await login(base, "dona@bralvex.com", "senha-inicial-segura")).res.status, 303);
    // Upgrade transparente do hash para argon2id no primeiro login.
    const [[admin]] = await rootConn.query("SELECT password_hash FROM bralvex_fresh.admins WHERE email = 'dona@bralvex.com'");
    assert.match(admin.password_hash, /^\$argon2id\$/);

    // Reiniciar com o mesmo administrador inicial não redefine a senha nem duplica a conta.
    const again = await start(env);
    assert.equal((await login(again.base, "dona@bralvex.com", "senha-inicial-segura")).res.status, 303);
    const [[{ n }]] = await rootConn.query("SELECT COUNT(*) AS n FROM bralvex_fresh.admins");
    assert.equal(n, 1);

    // Um hash novo no config.php funciona como redefinição de senha.
    const newHash = (await phpCli(["hash-password"], { input: "outra-senha-bem-segura\n" })).stdout.trim();
    const reset = await start({ ...env, ADMIN_SEED_PASSWORD_HASH: newHash });
    assert.equal((await login(reset.base, "dona@bralvex.com", "senha-inicial-segura")).res.status, 401);
    assert.equal((await login(reset.base, "dona@bralvex.com", "outra-senha-bem-segura")).res.status, 303);
    await rootConn.query("DROP DATABASE bralvex_fresh");
  });
});

describe("site público", () => {
  test("raiz e atalhos redirecionam com 301 para as rotas por idioma", async () => {
    const { base } = await start();
    for (const [from, to] of [
      ["/", "/pt/"],
      ["/index.html", "/pt/"],
      ["/solicitar-teste", "/pt/solicitar-teste/"],
      ["/request-trial", "/en/request-trial/"],
      ["/en", "/en/"],
      ["/privacy", "/en/privacy/"],
    ]) {
      const res = await fetch(base + from, { redirect: "manual" });
      assert.equal(res.status, 301, from);
      assert.equal(res.headers.get("location"), to, from);
    }
  });

  test("páginas nos dois idiomas, com CSP e token novo no formulário", async () => {
    const { base } = await start();
    const pt = await fetch(`${base}/pt/`);
    assert.equal(pt.status, 200);
    assert.match(pt.headers.get("content-security-policy"), /script-src 'self'/);
    assert.match(await pt.text(), /Transforme complexidade/);
    assert.match(await (await fetch(`${base}/en/`)).text(), /Turn complexity into decisions/);
    const trial = await fetch(`${base}/en/request-trial/`);
    assert.equal(trial.headers.get("cache-control"), "no-store");
    assert.match(trial.headers.get("content-security-policy"), /frame-ancestors 'none'/);
    const body = await trial.text();
    assert.doesNotMatch(body, /__FORM_TOKEN__/);
    assert.match(body, /name="form_token" value="\d+\.[\w-]+\.[\w-]+"/);
    assert.equal((await fetch(`${base}/shared/form-schema.js`)).status, 200);
  });

  test("não lista pastas nem expõe código, configuração ou banco", async () => {
    const { base } = await start();
    const paths = [
      "/assets/", "/src/", "/shared/", "/server/", "/app.php", "/bralvex-app/config.php", "/php/app/cli.php",
      "/migrations/001_initial.sql", "/.env", "/.htaccess", "/package.json", "/node_modules/", "/dist/", "/docs/", "/.git/config",
      "/admin/../php/app/config.php", "/api/../package.json",
    ];
    for (const path of paths) {
      const res = await fetch(base + path, { redirect: "manual" });
      const body = await res.text();
      assert.ok(res.status >= 300, `${path} → ${res.status}`);
      assert.doesNotMatch(body, /Index of|DB_PASSWORD|CREATE TABLE|<\?php/i, path);
    }
  });
});

describe("envio do formulário", () => {
  test("grava no banco e só então responde com sucesso", async () => {
    const { base } = await start();
    const payload = await fullPayload(base, {
      lang: "en",
      marketing_opt_in: true,
      utm_source: "newsletter",
      utm_medium: "<bad>",
      referrer_host: "linkedin.com",
    });
    const res = await postLead(base, payload);
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { ok: true });
    const lead = await leadRow(payload.submission_key);
    assert.equal(lead.lang, "en");
    assert.equal(lead.status, "new");
    assert.equal(lead.email, "maria@exemplo.com.br");
    assert.equal(lead.website, "https://exemplo.com.br");
    assert.equal(lead.whatsapp, "+5511912345678");
    assert.equal(lead.marketing_opt_in, 1);
    assert.ok(lead.marketing_opt_in_at);
    assert.equal(lead.privacy_notice_version, PRIVACY_NOTICE_VERSION);
    assert.equal(lead.utm_source, "newsletter");
    assert.equal(lead.utm_medium, null);
    assert.equal(lead.referrer_host, "linkedin.com");
    assert.ok(Math.abs(new Date(lead.created_at).getTime() - Date.now()) < 60000, "created_at em UTC");
    // Sem SMTP configurado: nada é simulado, o lead fica marcado como "não enviado".
    assert.equal(await notificationStatus(payload.submission_key), "skipped");
  });

  test("reenvio com a mesma chave não duplica o registro", async () => {
    const { base } = await start();
    const payload = await fullPayload(base);
    assert.equal((await postLead(base, payload)).status, 201);
    const again = await postLead(base, payload);
    assert.equal(again.status, 200);
    assert.deepEqual(await again.json(), { ok: true });
    const [[{ n }]] = await rootConn.query("SELECT COUNT(*) AS n FROM leads WHERE submission_key = ?", [payload.submission_key]);
    assert.equal(n, 1);
  });

  test("rejeita payload inválido com erros por campo", async () => {
    const { base } = await start();
    const res = await postLead(base, await fullPayload(base, { email: "x", company_size: "huge", challenge: "" }));
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.deepEqual(body.errors, { company_size: "invalid_option", challenge: "required", email: "invalid_email" });
  });

  test("tentativa de injeção é gravada como texto, sem efeito no banco", async () => {
    const { base } = await start();
    const evil = "Robert'); DROP TABLE leads;-- <script>alert(1)</script>";
    const payload = await fullPayload(base, { company: evil });
    assert.equal((await postLead(base, payload)).status, 201);
    assert.equal((await leadRow(payload.submission_key)).company, evil);
  });

  test("armadilha, token ausente/expirado e versão desatualizada são recusados", async () => {
    const { base } = await start();
    assert.equal((await postLead(base, await fullPayload(base, { fax_number: "123" }))).status, 400);
    const noToken = await postLead(base, await fullPayload(base, { form_token: undefined }));
    assert.equal(noToken.status, 400);
    assert.equal((await noToken.json()).error, "rejected");
    const old = `${Date.now() - 3 * 24 * 3600 * 1000}.abc.def`;
    assert.equal((await postLead(base, await fullPayload(base, { form_token: old }))).status, 400);
    const outdated = await postLead(base, await fullPayload(base, { privacy_notice_version: "old" }));
    assert.equal((await outdated.json()).error, "outdated");
  });

  test("token emitido há menos do tempo mínimo é recusado (armadilha de tempo)", async () => {
    const { base } = await start({ FORM_TOKEN_MIN_SECONDS: "5" });
    const res = await postLead(base, await fullPayload(base));
    assert.equal(res.status, 400);
  });

  test("limita tamanho do payload e tipo de conteúdo", async () => {
    const { base } = await start();
    const big = await postLead(base, await fullPayload(base, { challenge: "x".repeat(20000) }));
    assert.equal(big.status, 413);
    const text = await fetch(`${base}/api/leads`, { method: "POST", headers: { "content-type": "text/plain" }, body: "oi" });
    assert.equal(text.status, 415);
    const broken = await fetch(`${base}/api/leads`, { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
    assert.equal(broken.status, 400);
  });

  test("recusa envio de outra origem", async () => {
    const { base } = await start();
    const res = await postLead(base, await fullPayload(base), { origin: "https://evil.example" });
    assert.equal(res.status, 403);
  });

  test("limita excesso de requisições", async () => {
    await rootConn.query("DELETE FROM rate_limits");
    const { base } = await start({ LEAD_RATE_MAX: "2" });
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await postLead(base, await fullPayload(base))).status);
    assert.deepEqual(statuses, [201, 201, 429, 429]);
    const [[row]] = await rootConn.query("SELECT bucket FROM rate_limits LIMIT 1");
    assert.match(row.bucket, /^[0-9a-f]{64}$/, "o IP não é guardado, só um HMAC");
    await rootConn.query("DELETE FROM rate_limits");
  });

  test("envio sem JavaScript: sucesso redireciona e erro mostra página no idioma", async () => {
    const { base } = await start();
    const data = await fullPayload(base, { lang: "en" });
    delete data.submission_key;
    const ok = await fetch(`${base}/api/leads`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(data).toString(),
    });
    assert.equal(ok.status, 303);
    assert.equal(ok.headers.get("location"), "/en/request-trial/received/");
    const bad = await fetch(`${base}/api/leads`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...data, email: "nope" }).toString(),
    });
    assert.equal(bad.status, 422);
    const html = await bad.text();
    assert.match(html, /Enter a valid email address/);
    assert.match(html, /<html lang="en"/);
  });

  test("falha no banco retorna erro genérico, sem detalhes internos", async () => {
    const { base } = await start({ DB_PORT: String(await freePort()) });
    const res = await postLead(base, await fullPayload(base));
    assert.equal(res.status, 500);
    assert.equal(await res.text(), JSON.stringify({ ok: false, error: "server_error" }));
  });

  test("aviso por e-mail: envia só o mínimo e marca como enviado", async () => {
    const smtp = await fakeSmtp();
    after(() => smtp.close());
    const { base } = await start({ SMTP_HOST: "127.0.0.1", SMTP_PORT: String(smtp.port), SMTP_SECURE: "false", SMTP_USER: "contact@bralvex.com", SMTP_PASSWORD: "x", NOTIFY_FROM: "contact@bralvex.com" });
    const payload = await fullPayload(base);
    assert.equal((await postLead(base, payload)).status, 201);
    assert.equal(await notificationStatus(payload.submission_key), "sent");
    const lead = await leadRow(payload.submission_key);
    assert.equal(smtp.messages.length, 1);
    const message = smtp.messages[0];
    const body = Buffer.from(message.split("\n\n")[1].replace(/\n/g, ""), "base64").toString("utf8");
    assert.match(body, new RegExp(`/admin/leads/${lead.public_id}`));
    for (const secret of [lead.email, lead.full_name, lead.company, lead.challenge]) assert.ok(!message.includes(secret) && !body.includes(secret));
  });

  test("falha no aviso por e-mail não invalida o lead", async () => {
    const { base } = await start({ SMTP_HOST: "127.0.0.1", SMTP_PORT: String(await freePort()), SMTP_SECURE: "false", NOTIFY_FROM: "contact@bralvex.com" });
    const payload = await fullPayload(base);
    assert.equal((await postLead(base, payload)).status, 201);
    assert.equal(await notificationStatus(payload.submission_key), "failed");
  });
});

describe("painel administrativo", () => {
  test("páginas e endpoints bloqueados sem sessão", async () => {
    const { base } = await start();
    for (const path of ["/admin/leads", "/admin/leads/export.csv", `/admin/leads/${crypto.randomUUID()}`]) {
      const res = await fetch(base + path, { redirect: "manual" });
      assert.equal(res.status, 302, path);
      assert.equal(res.headers.get("location"), "/admin/login");
      assert.equal(res.headers.get("x-robots-tag"), "noindex, nofollow");
    }
    const post = await fetch(`${base}/admin/leads/${crypto.randomUUID()}/delete`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "confirm=yes",
    });
    assert.equal(post.status, 401);
  });

  test("login com mensagem genérica, cookie seguro e sem cadastro público", async () => {
    const { base } = await start();
    const wrong = await login(base, ADMIN_EMAIL, "senha-errada-123");
    const unknown = await login(base, "ninguem@example.com", "senha-errada-123");
    assert.equal(wrong.res.status, 401);
    assert.equal(unknown.res.status, 401);
    const msg = (t) => t.match(/role="alert">([^<]+)</)[1];
    assert.equal(msg(await wrong.res.text()), msg(await unknown.res.text()));
    assert.equal((await fetch(`${base}/admin/register`)).status, 404);

    const { res } = await login(base);
    assert.equal(res.status, 303);
    const setCookie = res.headers.getSetCookie().at(-1);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Strict/i);
    assert.match(setCookie, /Path=\/admin/);
  });

  test("cookie Secure e com prefixo __Secure- em produção", async () => {
    const { base } = await start({ APP_ENV: "production", SITE_URL: "https://bralvex.test" });
    const { res } = await login(base);
    assert.equal(res.status, 303);
    assert.match(res.headers.getSetCookie().at(-1), /^__Secure-bralvex_admin=.*; Secure/);
    assert.match(res.headers.get("strict-transport-security"), /max-age=31536000/);
  });

  test("bloqueia após tentativas repetidas", async () => {
    const { base } = await start();
    const statuses = [];
    for (let i = 0; i < 7; i++) statuses.push((await login(base, "bruteforce@example.com", `x${i}-wrong-pass`)).res.status);
    assert.equal(statuses.at(-1), 429);
  });

  test("lista, busca, filtros, detalhe com escape, status, notas e CSV", async () => {
    const { base } = await start();
    const payload = await fullPayload(base, {
      company: "=cmd|' /C calc'!A0",
      full_name: "Ana <b>Teste</b>",
      email: "ana.filtro@example.org",
      objective: "api_integration",
      lang: "en",
    });
    await postLead(base, payload);
    const lead = await leadRow(payload.submission_key);
    const { c } = await login(base);

    const list = await (await c.request("/admin/leads?q=ana.filtro&lang=en&objective=api_integration&status=new")).text();
    assert.match(list, /ana\.filtro@example\.org/);
    assert.match(list, /Ana &lt;b&gt;Teste&lt;\/b&gt;/);
    const none = await (await c.request("/admin/leads?q=ana.filtro&lang=pt")).text();
    assert.doesNotMatch(none, /ana\.filtro@example\.org/);
    const today = new Date().toISOString().slice(0, 10);
    const byDate = await (await c.request(`/admin/leads?q=ana.filtro&from=${today}&to=${today}`)).text();
    assert.match(byDate, /ana\.filtro@example\.org/);
    const past = await (await c.request("/admin/leads?q=ana.filtro&to=2000-01-01")).text();
    assert.doesNotMatch(past, /ana\.filtro@example\.org/);

    const detailPath = `/admin/leads/${lead.public_id}`;
    const csrf = await csrfFrom(c, detailPath);
    const noCsrf = await c.form(detailPath, { status: "contacting", notes: "x" });
    assert.equal(noCsrf.status, 403);
    const saved = await c.form(detailPath, {
      _csrf: csrf,
      status: "approved_for_trial",
      notes: "<img src=x onerror=alert(1)> ligar amanhã",
      last_contact: today,
    });
    assert.equal(saved.status, 303);
    const detail = await (await c.request(detailPath)).text();
    assert.match(detail, /&lt;img src=x onerror=alert\(1\)&gt; ligar amanhã/);
    assert.doesNotMatch(detail, /<img src=x/);
    assert.match(detail, /Aprovado para teste/);
    assert.match(detail, /Brasil \(BR\)/);

    const invalid = await c.form(detailPath, { _csrf: csrf, status: "hacked", notes: "" });
    assert.equal(invalid.status, 422);

    const csv = await c.request("/admin/leads/export.csv?q=ana.filtro");
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get("content-type"), /text\/csv/);
    const body = await csv.text();
    assert.match(body, /"'=cmd\|' \/C calc'!A0"/);
    assert.match(body, /Aprovado para teste/);

    const [audit] = await rootConn.query("SELECT action, meta FROM admin_audit_log WHERE lead_public_id = ? OR action = 'export_csv'", [lead.public_id]);
    const actions = audit.map((a) => a.action);
    assert.ok(actions.includes("update_lead") && actions.includes("export_csv") && actions.includes("view_lead"));
    assert.ok(audit.every((a) => !String(a.meta || "").includes("ligar amanhã")), "observações não vão para o log");
  });

  test("exclusão exige confirmação e CSRF", async () => {
    const { base } = await start();
    const payload = await fullPayload(base);
    await postLead(base, payload);
    const lead = await leadRow(payload.submission_key);
    const { c } = await login(base);
    const path = `/admin/leads/${lead.public_id}/delete`;
    const csrf = await csrfFrom(c, path);
    assert.equal((await c.form(path, { _csrf: csrf })).status, 422);
    const del = await c.form(path, { _csrf: csrf, confirm: "yes" });
    assert.equal(del.status, 303);
    assert.equal(await leadRow(payload.submission_key), undefined);
  });

  test("logout encerra a sessão", async () => {
    const { base } = await start();
    const { c } = await login(base);
    const csrf = await csrfFrom(c, "/admin/leads");
    const out = await c.form("/admin/logout", { _csrf: csrf });
    assert.equal(out.status, 303);
    assert.equal((await c.request("/admin/leads")).status, 302);
  });

  test("sessão expira por inatividade e pelo limite absoluto", async () => {
    const { base } = await start();
    const idle = await login(base);
    await rootConn.query("UPDATE admin_sessions SET expires_at = UTC_TIMESTAMP(3) - INTERVAL 1 MINUTE");
    assert.equal((await idle.c.request("/admin/leads")).status, 302);

    const abs = await login(base);
    const [rows] = await rootConn.query("SELECT sid_hash, data FROM admin_sessions WHERE admin_id IS NOT NULL AND expires_at > UTC_TIMESTAMP(3)");
    for (const row of rows) {
      const data = JSON.parse(row.data);
      data.authAt = Date.now() - 9 * 3600 * 1000;
      await rootConn.query("UPDATE admin_sessions SET data = ? WHERE sid_hash = ?", [JSON.stringify(data), row.sid_hash]);
    }
    assert.equal((await abs.c.request("/admin/leads")).status, 302);
  });

  test("redefinição de senha pela linha de comando encerra sessões abertas", async () => {
    const { base } = await start();
    const { c } = await login(base);
    assert.equal((await c.request("/admin/leads")).status, 200);
    const reset = await phpCli(["admin:reset-password", ADMIN_EMAIL], { env: baseEnv(), input: `${ADMIN_PASSWORD}\n` });
    assert.equal(reset.status, 0, reset.stderr);
    assert.equal((await c.request("/admin/leads")).status, 302);
    assert.equal((await login(base)).res.status, 303);
  });

  test("senhas guardadas com hash argon2id", async () => {
    const [[row]] = await rootConn.query("SELECT password_hash FROM admins WHERE email = ?", [ADMIN_EMAIL]);
    assert.match(row.password_hash, /^\$argon2id\$/);
    assert.ok(!row.password_hash.includes(ADMIN_PASSWORD));
  });
});
