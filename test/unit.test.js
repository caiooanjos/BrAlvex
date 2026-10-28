import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanAttribution, validateLead } from "../shared/form-schema.js";
import { csvCell, toCsv } from "../server/csv.js";
import { html } from "../server/html.js";
import { createFormTokens } from "../server/security.js";
import { validLead } from "./helpers.js";


test("aceita e normaliza uma solicitação válida", () => {
  const r = validateLead(validLead({ email: " Maria@Exemplo.com.br ", website: "https://Exemplo.com.br/sobre?x=1#y" }));
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.value.email, "maria@exemplo.com.br");
  assert.equal(r.value.website, "https://exemplo.com.br/sobre");
  assert.equal(r.value.whatsapp, "+5511912345678");
  assert.equal(r.value.objective_other, null);
  assert.equal(r.value.marketing_opt_in, false);
});

test("exige campos obrigatórios e valores da lista", () => {
  const r = validateLead({ objective: "hack", company_size: "9999", country: "XX" });
  assert.equal(r.ok, false);
  assert.equal(r.errors.objective, "invalid_option");
  assert.equal(r.errors.company_size, "invalid_option");
  assert.equal(r.errors.country, "invalid_option");
  for (const f of ["company", "sector", "job_role", "challenge", "data_availability", "timing", "full_name", "email"]) {
    assert.equal(r.errors[f], "required", f);
  }
  assert.equal(r.errors.website, undefined, "site é opcional");
  assert.equal(r.errors.whatsapp, undefined, "WhatsApp é opcional");
});

test("campo 'Outro' só é exigido quando a opção é escolhida", () => {
  assert.equal(validateLead(validLead({ objective: "other" })).errors.objective_other, "required");
  assert.equal(validateLead(validLead({ sector: "other" })).errors.sector_other, "required");
  assert.equal(validateLead(validLead({ objective: "other", objective_other: "Planejamento" })).ok, true);
});

test("limites de tamanho e formatos", () => {
  assert.equal(validateLead(validLead({ challenge: "curto" })).errors.challenge, "too_short");
  assert.equal(validateLead(validLead({ challenge: "x".repeat(1001) })).errors.challenge, "too_long");
  assert.equal(validateLead(validLead({ company: "x".repeat(151) })).errors.company, "too_long");
  assert.equal(validateLead(validLead({ email: "sem-arroba" })).errors.email, "invalid_email");
  assert.equal(validateLead(validLead({ whatsapp: "11 91234-5678" })).errors.whatsapp, "invalid_phone");
  assert.equal(validateLead(validLead({ whatsapp: "+1 415 555 0123" })).ok, true, "aceita números não brasileiros");
  assert.equal(validateLead(validLead({ website: "javascript:alert(1)" })).errors.website, "invalid_url");
});

test("tipos inesperados não quebram a validação", () => {
  const r = validateLead(validLead({ company: ["a", "b"], objective: { $ne: 1 }, marketing_opt_in: "true" }));
  assert.equal(r.errors.company, "required");
  assert.equal(r.errors.objective, "required");
  assert.equal(r.value.marketing_opt_in, true);
  assert.equal(validateLead(null).ok, false);
});

test("validação por etapa considera só os campos indicados", () => {
  const r = validateLead({ objective: "improve_forecasts" }, { fields: ["objective", "objective_other"] });
  assert.equal(r.ok, true);
});

test("remove caracteres de controle e preserva quebras de linha no desafio", () => {
  const r = validateLead(validLead({ company: "Emp\u0000resa‮ X", challenge: "Linha 1\r\nLinha 2 com detalhes suficientes" }));
  assert.equal(r.value.company, "Empresa X");
  assert.equal(r.value.challenge, "Linha 1\nLinha 2 com detalhes suficientes");
});

test("atribuição descarta UTMs inválidas e mantém só o domínio de origem", () => {
  const a = cleanAttribution({ utm_source: "google", utm_medium: "<script>", utm_campaign: "x".repeat(101), referrer_host: "Example.COM" });
  assert.deepEqual(
    { s: a.utm_source, m: a.utm_medium, c: a.utm_campaign, r: a.referrer_host },
    { s: "google", m: null, c: null, r: "example.com" },
  );
  assert.equal(cleanAttribution({ referrer_host: "https://a.com/?email=x" }).referrer_host, null);
});

test("CSV neutraliza fórmulas e escapa aspas", () => {
  assert.equal(csvCell("=HYPERLINK(\"x\")"), "\"'=HYPERLINK(\"\"x\"\")\"");
  assert.equal(csvCell("+5511912345678"), "\"'+5511912345678\"");
  assert.equal(csvCell("  @SUM(A1)"), "\"'  @SUM(A1)\"");
  assert.equal(csvCell("normal"), '"normal"');
  assert.equal(csvCell(null), "");
  assert.ok(toCsv(["a"], [["-1"]]).startsWith("﻿"));
});

test("template HTML escapa valores interpolados", () => {
  const out = html`<p>${'<script>alert("x")</script>'}</p>`.toString();
  assert.equal(out, "<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>");
});

test("token do formulário: assinatura, tempo mínimo e expiração", () => {
  const tokens = createFormTokens("s".repeat(40), { minSeconds: 3, maxHours: 1 });
  const now = Date.now();
  const token = tokens.issue(now);
  assert.equal(tokens.verify(token, now + 1000), "too_fast");
  assert.equal(tokens.verify(token, now + 5000), "ok");
  assert.equal(tokens.verify(token, now + 2 * 3600 * 1000), "expired");
  assert.equal(tokens.verify(token.replace(/.$/, (c) => (c === "A" ? "B" : "A")), now + 5000), "invalid");
  assert.equal(tokens.verify(undefined), "invalid");
  const other = createFormTokens("o".repeat(40), { minSeconds: 0, maxHours: 1 });
  assert.equal(other.verify(token, now + 5000), "invalid");
});
