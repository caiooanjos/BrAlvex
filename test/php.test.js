// Testes das funções do back end PHP e paridade da validação com shared/form-schema.js (usado no navegador).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { before, test } from "node:test";
import { build } from "../site/build.mjs";
import { cleanAttribution, validateLead } from "../shared/form-schema.js";
import { findPhp, ROOT } from "../scripts/php.mjs";
import { validLead } from "./helpers.js";

let php;
const env = {
  APP_ENV: "test",
  DB_NAME: "x",
  DB_USER: "x",
  SESSION_SECRET: "a".repeat(40),
  FORM_TOKEN_SECRET: "b".repeat(40),
  FORM_TOKEN_MIN_SECONDS: "3",
  FORM_TOKEN_MAX_HOURS: "48",
};

function run(payload) {
  const r = spawnSync(php, [join(ROOT, "test", "php", "run.php")], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return JSON.parse(r.stdout);
}

before(async () => {
  await build({ quiet: true });
  php = await findPhp();
});

const CASES = [
  validLead(),
  validLead({ email: " Maria@Exemplo.com.br ", website: "https://Exemplo.com.br/sobre?x=1#y" }),
  validLead({ website: "http://user:pw@exemplo.com" }),
  validLead({ website: "exemplo" }),
  validLead({ website: "exemplo.com/caminho com espaço/ç" }),
  validLead({ objective: "other", objective_other: "" }),
  validLead({ objective: "other", objective_other: "  Algo   bem\tespecífico  " }),
  validLead({ sector: "other", sector_other: "x" }),
  validLead({ challenge: "curto" }),
  validLead({ challenge: "a".repeat(1001) }),
  validLead({ challenge: "Linha 1\r\n\r\n\r\n\r\nLinha 2\u0000​ com controle e texto suficiente" }),
  validLead({ email: "nome@empresa" }),
  validLead({ email: "nome@@empresa.com" }),
  validLead({ email: "a\"b@empresa.com" }),
  validLead({ whatsapp: "11 91234-5678" }),
  validLead({ whatsapp: "+55 (11) 9.1234-5678" }),
  validLead({ whatsapp: "+1 234" }),
  validLead({ whatsapp: "+55 11 abc" }),
  validLead({ country: "br" }),
  validLead({ country: "XX" }),
  validLead({ company_size: "huge", timing: "", data_availability: 3 }),
  validLead({ company: ["array"], full_name: { a: 1 }, marketing_opt_in: "on" }),
  validLead({ marketing_opt_in: "false" }),
  validLead({ marketing_opt_in: true }),
  validLead({ full_name: "José Ñandú Çaçapava" }),
  validLead({ full_name: "A" }),
  {},
];

test("validação PHP é idêntica à validação do navegador", () => {
  const php = run({ op: "validate", cases: CASES });
  CASES.forEach((input, i) => {
    const js = validateLead(input);
    assert.deepEqual(php[i].errors.length === 0 ? {} : php[i].errors, js.errors, `caso ${i}: ${JSON.stringify(input)}`);
    assert.equal(php[i].ok, js.ok, `caso ${i}`);
    assert.deepEqual(php[i].value, js.value, `caso ${i}`);
  });
});

test("atribuição PHP é idêntica à do navegador", () => {
  const cases = [
    { utm_source: "newsletter", utm_medium: "<bad>", utm_campaign: "Lançamento 2026", utm_term: "a".repeat(101), referrer_host: "LinkedIn.com" },
    { referrer_host: "https://a.com/?email=x", utm_content: "ok|1" },
    {},
  ];
  const php = run({ op: "attribution", cases });
  cases.forEach((input, i) => assert.deepEqual(php[i], cleanAttribution(input), `caso ${i}`));
});

test("CSV neutraliza fórmulas e escapa aspas", () => {
  const r = run({ op: "csv", cells: ['=HYPERLINK("x")', "+5511912345678", "  @SUM(A1)", "normal", null] });
  assert.deepEqual(r.cells, ["\"'=HYPERLINK(\"\"x\"\")\"", "\"'+5511912345678\"", "\"'  @SUM(A1)\"", '"normal"', ""]);
  assert.equal(r.bom, true);
});

test("HTML escapado em todo valor dinâmico", () => {
  assert.equal(run({ op: "escape", value: '<script>alert("x")</script>\'' }), "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&#039;");
});

test("token do formulário: assinatura, tempo mínimo e expiração", () => {
  assert.deepEqual(run({ op: "token" }), { fresh: "too_fast", expired: "expired", tampered: "invalid", missing: "invalid", garbage: "invalid" });
});
