import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { before, test } from "node:test";
import { build } from "../site/build.mjs";

const read = (path) => readFile(new URL(`../dist/${path}`, import.meta.url), "utf8");
const pages = {
  ptHome: "pt/index.html",
  enHome: "en/index.html",
  ptTrial: "pt/solicitar-teste/index.html",
  enTrial: "en/request-trial/index.html",
  ptPrivacy: "pt/privacidade/index.html",
  enPrivacy: "en/privacy/index.html",
};
const html = {};

before(async () => {
  await build({ quiet: true });
  for (const [key, path] of Object.entries(pages)) html[key] = await read(path);
});

test("idioma declarado em cada página", () => {
  for (const key of ["ptHome", "ptTrial", "ptPrivacy"]) assert.match(html[key], /<html lang="pt-BR"/, key);
  for (const key of ["enHome", "enTrial", "enPrivacy"]) assert.match(html[key], /<html lang="en"/, key);
});

test("canonical e hreflang recíprocos", () => {
  assert.match(html.ptHome, /<link rel="canonical" href="https:\/\/bralvex\.com\/pt\/"/);
  assert.match(html.enHome, /<link rel="canonical" href="https:\/\/bralvex\.com\/en\/"/);
  for (const key of ["ptHome", "enHome"]) {
    assert.match(html[key], /hreflang="pt-BR" href="https:\/\/bralvex\.com\/pt\/"/);
    assert.match(html[key], /hreflang="en" href="https:\/\/bralvex\.com\/en\/"/);
    assert.match(html[key], /hreflang="x-default" href="https:\/\/bralvex\.com\/pt\/"/);
  }
  assert.match(html.enTrial, /hreflang="pt-BR" href="https:\/\/bralvex\.com\/pt\/solicitar-teste\/"/);
});

test("seletor de idioma com texto, apontando para a página equivalente", () => {
  assert.match(html.ptHome, /href="\/en\/"[^>]*data-lang-switch="en"[^>]*>.*English/);
  assert.match(html.enTrial, /href="\/pt\/solicitar-teste\/"[^>]*data-lang-switch="pt"[^>]*>.*Português/);
});

test("CTA de teste no cabeçalho nos dois idiomas", () => {
  assert.match(html.ptHome, /class="header__trial" href="\/pt\/solicitar-teste\/"[^>]*>Solicitar teste</);
  assert.match(html.enHome, /class="header__trial" href="\/en\/request-trial\/"[^>]*>Request a trial</);
});

test("e-mail público e WhatsApp com mensagem no idioma da página", () => {
  for (const key of Object.keys(pages)) assert.match(html[key], /mailto:contact@bralvex\.com/, key);
  assert.match(html.ptHome, /wa\.me\/5511934436441\?text=Ol%C3%A1!%20Conheci%20a%20BrAlveX/);
  assert.match(html.enHome, /wa\.me\/5511934436441\?text=Hello!%20I%20found%20BrAlveX/);
  assert.match(html.enHome, /sponsor%20the%20technology/);
  assert.doesNotMatch(html.enHome, /text=Ol%C3%A1/);
});

test("sem 'clube', sem scripts inline executáveis e sem formulário externo", () => {
  for (const [key, page] of Object.entries(html)) {
    assert.doesNotMatch(page.replace(/class="[^"]*"/g, ""), /clube|membros|member club/i, key);
    const inline = [...page.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)].filter((m) => !/application\/(ld\+)?json/.test(m[1]));
    assert.equal(inline.length, 0, `${key} contém script inline`);
    assert.doesNotMatch(page, /docs\.google\.com\/forms/, key);
  }
});

test("formulário traz as 8 etapas, armadilha e aviso de privacidade", () => {
  for (const key of ["ptTrial", "enTrial"]) {
    for (let i = 1; i <= 8; i++) assert.match(html[key], new RegExp(`data-step="${i}"`), `${key} etapa ${i}`);
    assert.match(html[key], /name="fax_number"/);
    assert.match(html[key], /name="form_token" value="__FORM_TOKEN__"/);
    assert.doesNotMatch(html[key], /type="file"/);
    assert.doesNotMatch(html[key], /name="marketing_opt_in"[^>]*checked/);
  }
  assert.match(html.ptTrial, /href="\/pt\/privacidade\/"/);
  assert.match(html.enTrial, /href="\/en\/privacy\/"/);
  assert.match(html.ptTrial, /não libera acesso automático/);
  assert.match(html.enTrial, /does not grant automatic access/);
});

test("sitemap lista as rotas públicas e não o painel", async () => {
  const sitemap = await read("sitemap.xml");
  for (const path of ["/pt/", "/en/", "/pt/solicitar-teste/", "/en/request-trial/", "/pt/privacidade/", "/en/privacy/"]) {
    assert.ok(sitemap.includes(`<loc>https://bralvex.com${path}</loc>`), path);
  }
  assert.doesNotMatch(sitemap, /admin|api|recebido|received/);
});

test("raiz antiga redireciona preservando a âncora", async () => {
  const root = await read("index.html");
  assert.match(root, /http-equiv="refresh" content="0; url=\/pt\/"/);
  const script = await read("src/root-redirect.js");
  assert.match(script, /location\.hash/);
});

test(".htaccess: sem listagem, HTTPS, bloqueios e rotas dinâmicas para app.php", async () => {
  const htaccess = await read(".htaccess");
  assert.match(htaccess, /Options -Indexes/);
  assert.match(htaccess, /Require all denied/);
  for (const rule of [
    "RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]",
    "RewriteRule (^|/)\\.(?!well-known(/|$)) - [R=404,L]",
    "RewriteRule ^api/ app.php [L]",
    "RewriteRule ^admin(/.*)?$ app.php [L]",
    "RewriteRule ^(pt/solicitar-teste|en/request-trial)/$ app.php [L]",
  ]) {
    assert.ok(htaccess.includes(rule), rule);
  }
  assert.match(await read("404.html"), /Página não encontrada/);
});

test("dados gerados para o PHP vêm da mesma fonte do site", async () => {
  const gen = (name) => readFile(new URL(`../php/app/generated/${name}`, import.meta.url), "utf8");
  const schema = JSON.parse(await gen("schema.json"));
  const { FORM_VERSION, OPTIONS } = await import("../shared/form-schema.js");
  assert.equal(schema.FORM_VERSION, FORM_VERSION);
  assert.deepEqual(schema.OPTIONS, OPTIONS);
  const content = JSON.parse(await gen("content.json"));
  assert.equal(content.countries_pt.BR, "Brasil");
  assert.equal(content.en.routes.trialReceived, "/en/request-trial/received/");
  for (const lang of ["pt", "en"]) assert.match(await gen(`nojs-${lang}.html`), /<li>@@MESSAGES@@<\/li>/);
});
