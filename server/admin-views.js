import pt from "../site/content/pt.js";
import { COUNTRIES, OPTIONS } from "../shared/form-schema.js";
import { html } from "./html.js";
import { PAGE_SIZE, STATUSES } from "./leads-repo.js";

export const STATUS_LABELS = {
  new: "Novo",
  contacting: "Em contato",
  evaluating: "Em avaliação",
  approved_for_trial: "Aprovado para teste",
  closed: "Encerrado",
};
const NOTIFICATION_LABELS = {
  pending: "Pendente",
  sent: "Enviado",
  skipped: "Não enviado (envio de e-mail não configurado)",
  failed: "Falhou",
};
const LANG_LABELS = { pt: "Português", en: "Inglês" };
const options = pt.trial.options;
const fields = pt.trial.fields;
const countryNames = new Intl.DisplayNames(["pt-BR"], { type: "region" });

export const optionLabel = (field, value) => (value ? options[field]?.[value] || value : "—");
export const countryLabel = (code) => (code && COUNTRIES.includes(code) ? `${countryNames.of(code)} (${code})` : code || "—");

export function makeFormatter(timeZone) {
  const fmt = new Intl.DateTimeFormat("pt-BR", { timeZone, dateStyle: "short", timeStyle: "short" });
  return {
    zoneLabel: timeZone,
    dateTime: (d) => (d ? fmt.format(new Date(d)) : "—"),
    // Data do último contato é gravada como data (00:00 UTC).
    date: (d) => (d ? new Date(d).toISOString().slice(0, 10).split("-").reverse().join("/") : "—"),
    isoDate: (d) => (d ? new Date(d).toISOString().slice(0, 10) : ""),
  };
}

function layout({ title, admin, csrf, body }) {
  return html`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${title} | Painel BrAlveX</title>
  <link rel="stylesheet" href="/admin/assets/admin.css" />
</head>
<body>
  <header class="adm-header">
    <a class="adm-brand" href="/admin/leads">BrAlve<span>X</span> <small>Painel</small></a>
    ${admin
      ? html`<div class="adm-user"><span>${admin.email}</span>
          <form method="post" action="/admin/logout"><input type="hidden" name="_csrf" value="${csrf}" /><button type="submit" class="adm-link">Sair</button></form></div>`
      : ""}
  </header>
  <main class="adm-main">${body}</main>
</body>
</html>`.toString();
}

export function loginPage({ error, email = "" }) {
  return layout({
    title: "Entrar",
    body: html`<section class="adm-card adm-login">
      <h1>Entrar no painel</h1>
      ${error ? html`<p class="adm-alert" role="alert">${error}</p>` : ""}
      <form method="post" action="/admin/login">
        <label for="email">E-mail</label>
        <input id="email" name="email" type="email" autocomplete="username" required maxlength="254" value="${email}" />
        <label for="password">Senha</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required maxlength="1024" />
        <button type="submit" class="adm-button">Entrar</button>
      </form>
      <p class="adm-muted">Não há cadastro público. Para acesso ou redefinição de senha, siga o procedimento descrito em docs/ADMIN.md.</p>
    </section>`,
  });
}

function select(name, label, values, labels, current, emptyLabel = "Todos") {
  return html`<label>${label}
    <select name="${name}">
      <option value="">${emptyLabel}</option>
      ${values.map((v) => html`<option value="${v}" ${v === current ? "selected" : ""}>${labels(v)}</option>`)}
    </select></label>`;
}

function queryString(f, overrides = {}) {
  const params = new URLSearchParams();
  for (const key of ["q", "status", "lang", "objective", "from", "to"]) if (f[key]) params.set(key, f[key]);
  for (const [k, v] of Object.entries(overrides)) params.set(k, String(v));
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function listPage({ admin, csrf, filters: f, result, fmt, flash }) {
  const { rows, total, pages } = result;
  const first = total ? (f.page - 1) * PAGE_SIZE + 1 : 0;
  const last = Math.min(f.page * PAGE_SIZE, total);
  return layout({
    title: "Solicitações",
    admin,
    csrf,
    body: html`
      <div class="adm-title"><h1>Solicitações de teste</h1>
        <a class="adm-button adm-button--ghost" href="/admin/leads/export.csv${queryString(f)}">Exportar CSV</a></div>
      ${flash ? html`<p class="adm-flash" role="status">${flash}</p>` : ""}
      <form class="adm-filters" method="get" action="/admin/leads" role="search">
        <label class="adm-filters__q">Buscar (nome, empresa ou e-mail)<input type="search" name="q" value="${f.q}" maxlength="100" /></label>
        ${select("status", "Status", STATUSES, (v) => STATUS_LABELS[v], f.status)}
        ${select("lang", "Idioma", ["pt", "en"], (v) => LANG_LABELS[v], f.lang)}
        ${select("objective", "Objetivo", OPTIONS.objective, (v) => optionLabel("objective", v), f.objective)}
        <label>De<input type="date" name="from" value="${f.from}" /></label>
        <label>Até<input type="date" name="to" value="${f.to}" /></label>
        <div class="adm-filters__actions"><button class="adm-button" type="submit">Filtrar</button><a class="adm-link" href="/admin/leads">Limpar</a></div>
      </form>
      <p class="adm-muted">${total ? `${first}–${last} de ${total}` : "Nenhuma solicitação encontrada."} · Datas em ${fmt.zoneLabel}.</p>
      ${rows.length
        ? html`<div class="adm-table-wrap"><table class="adm-table">
          <thead><tr><th scope="col">Recebida em</th><th scope="col">Nome</th><th scope="col">Empresa</th><th scope="col">E-mail</th><th scope="col">Objetivo</th><th scope="col">Idioma</th><th scope="col">Status</th></tr></thead>
          <tbody>${rows.map(
            (r) => html`<tr>
              <td><a href="/admin/leads/${r.public_id}">${fmt.dateTime(r.created_at)}</a></td>
              <td>${r.full_name}</td><td>${r.company}</td><td>${r.email}</td>
              <td>${optionLabel("objective", r.objective)}</td><td>${r.lang.toUpperCase()}</td>
              <td><span class="adm-status adm-status--${r.status}">${STATUS_LABELS[r.status]}</span></td>
            </tr>`,
          )}</tbody></table></div>`
        : ""}
      ${pages > 1
        ? html`<nav class="adm-pager" aria-label="Paginação">
            ${f.page > 1 ? html`<a href="/admin/leads${queryString(f, { page: f.page - 1 })}">← Mais recentes</a>` : html`<span></span>`}
            <span>Página ${f.page} de ${pages}</span>
            ${f.page < pages ? html`<a href="/admin/leads${queryString(f, { page: f.page + 1 })}">Mais antigas →</a>` : html`<span></span>`}
          </nav>`
        : ""}`,
  });
}

function row(label, value, cls = "") {
  return html`<div class="adm-dl__row"><dt>${label}</dt><dd class="${cls}">${value ?? "—"}</dd></div>`;
}

export function detailPage({ admin, csrf, lead: l, fmt, flash, error }) {
  const utm = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]
    .filter((k) => l[k])
    .map((k) => `${k}=${l[k]}`)
    .join(" · ");
  return layout({
    title: "Solicitação",
    admin,
    csrf,
    body: html`
      <p><a class="adm-link" href="/admin/leads">← Voltar à lista</a></p>
      <div class="adm-title"><h1>${l.company}</h1><span class="adm-status adm-status--${l.status}">${STATUS_LABELS[l.status]}</span></div>
      ${flash ? html`<p class="adm-flash" role="status">${flash}</p>` : ""}
      ${error ? html`<p class="adm-alert" role="alert">${error}</p>` : ""}
      <div class="adm-grid">
        <section class="adm-card">
          <h2>Respostas</h2>
          <dl class="adm-dl">
            ${row(fields.objective, optionLabel("objective", l.objective))}
            ${l.objective === "other" ? row(fields.objective_other, l.objective_other) : ""}
            ${row(fields.company, l.company)}
            ${row(fields.sector, optionLabel("sector", l.sector))}
            ${l.sector === "other" ? row(fields.sector_other, l.sector_other) : ""}
            ${row(fields.job_role, l.job_role)}
            ${row(fields.website, l.website)}
            ${row(fields.company_size, optionLabel("company_size", l.company_size))}
            ${row(fields.challenge, l.challenge, "adm-pre")}
            ${row(fields.data_availability, optionLabel("data_availability", l.data_availability))}
            ${row(fields.timing, optionLabel("timing", l.timing))}
            ${row(fields.full_name, l.full_name)}
            ${row(fields.email, html`<a href="mailto:${l.email}">${l.email}</a>`)}
            ${row(fields.country, countryLabel(l.country))}
            ${row(fields.whatsapp, l.whatsapp)}
          </dl>
        </section>
        <div>
          <section class="adm-card">
            <h2>Atendimento</h2>
            <form method="post" action="/admin/leads/${l.public_id}">
              <input type="hidden" name="_csrf" value="${csrf}" />
              <label for="status">Status</label>
              <select id="status" name="status">
                ${STATUSES.map((s) => html`<option value="${s}" ${s === l.status ? "selected" : ""}>${STATUS_LABELS[s]}</option>`)}
              </select>
              <label for="last_contact">Data do último contato</label>
              <input id="last_contact" name="last_contact" type="date" value="${fmt.isoDate(l.last_contact_at)}" />
              <label for="notes">Observações internas</label>
              <textarea id="notes" name="notes" rows="8" maxlength="5000">${l.internal_notes || ""}</textarea>
              <button type="submit" class="adm-button">Salvar</button>
            </form>
          </section>
          <section class="adm-card">
            <h2>Registro</h2>
            <dl class="adm-dl adm-dl--compact">
              ${row("ID", l.public_id)}
              ${row("Recebida em", fmt.dateTime(l.created_at))}
              ${row("Atualizada em", fmt.dateTime(l.updated_at))}
              ${row("Último contato", fmt.date(l.last_contact_at))}
              ${row("Idioma", LANG_LABELS[l.lang])}
              ${row("Versão do formulário", l.form_version)}
              ${row("Aviso de privacidade", `${l.privacy_notice_version} · exibido em ${fmt.dateTime(l.privacy_notice_shown_at)}`)}
              ${row("Novidades por e-mail", l.marketing_opt_in ? `Sim (${fmt.dateTime(l.marketing_opt_in_at)} · ${l.marketing_text_version})` : "Não")}
              ${row("Origem", l.referrer_host || "—")}
              ${row("Campanha (UTM)", utm || "—")}
              ${row("Aviso por e-mail", NOTIFICATION_LABELS[l.notification_status])}
            </dl>
            <p><a class="adm-link adm-link--danger" href="/admin/leads/${l.public_id}/delete">Excluir solicitação…</a></p>
          </section>
        </div>
      </div>`,
  });
}

export function deletePage({ admin, csrf, lead: l, fmt, retentionDays }) {
  return layout({
    title: "Excluir solicitação",
    admin,
    csrf,
    body: html`<section class="adm-card adm-narrow">
      <h1>Excluir solicitação?</h1>
      <p>Você está prestes a excluir permanentemente a solicitação de <strong>${l.company}</strong>, recebida em ${fmt.dateTime(l.created_at)}. Esta ação não pode ser desfeita pelo painel.</p>
      <p class="adm-muted">${retentionDays
        ? `Política de retenção configurada: ${retentionDays} dias.`
        : "A política de retenção ainda não foi definida (pendência registrada em docs/PENDENCIAS.md). Exclua apenas a pedido do titular ou conforme orientação da BrAlveX."}</p>
      <form method="post" action="/admin/leads/${l.public_id}/delete">
        <input type="hidden" name="_csrf" value="${csrf}" />
        <label class="adm-check"><input type="checkbox" name="confirm" value="yes" required /> Confirmo a exclusão desta solicitação.</label>
        <div class="adm-actions"><button type="submit" class="adm-button adm-button--danger">Excluir definitivamente</button>
        <a class="adm-link" href="/admin/leads/${l.public_id}">Cancelar</a></div>
      </form>
    </section>`,
  });
}

export function messagePage({ title, message, admin, csrf }) {
  return layout({ title, admin, csrf, body: html`<section class="adm-card adm-narrow"><h1>${title}</h1><p>${message}</p><p><a class="adm-link" href="/admin/leads">Voltar</a></p></section>` });
}
