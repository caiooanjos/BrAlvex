// Formulário multietapas de solicitação de teste.
// As respostas ficam apenas na memória da página: nada é gravado em localStorage/sessionStorage
// e nada é enviado ao servidor antes do envio final.
import { STEPS, UTM_FIELDS, isFreeEmail, validateLead } from "/shared/form-schema.js";

const TOTAL = STEPS.length + 1; // etapas de perguntas + revisão
const CHOICE_FIELDS = ["objective", "sector", "company_size", "data_availability", "timing", "country"];

const state = {
  step: 1,
  submitting: false,
  done: false,
  token: null,
  submissionKey: crypto.randomUUID ? crypto.randomUUID() : fallbackUuid(),
  attribution: readAttribution(),
};

let els;
let t;

function fallbackUuid() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function fill(text, vars) {
  return String(text).replace(/\{(\w+)\}/g, (m, key) => (key in vars ? vars[key] : m));
}

function readAttribution() {
  const params = new URLSearchParams(location.search);
  const out = {};
  for (const key of UTM_FIELDS) {
    const value = params.get(key);
    if (value && value.length <= 100) out[key] = value;
  }
  // Apenas o domínio de origem; a URL completa pode conter dados pessoais.
  try {
    const ref = document.referrer ? new URL(document.referrer) : null;
    if (ref && ref.host !== location.host) out.referrer_host = ref.hostname;
  } catch {
    /* referrer inválido: ignorado */
  }
  return out;
}

function collect() {
  const data = {};
  for (const fields of STEPS) {
    for (const name of fields) {
      const inputs = els.form.elements[name];
      if (!inputs) continue;
      if (inputs instanceof RadioNodeList) data[name] = inputs.value;
      else if (inputs.type === "checkbox") data[name] = inputs.checked;
      else data[name] = inputs.value;
    }
  }
  return data;
}

function restore(data) {
  for (const [name, value] of Object.entries(data)) {
    const inputs = els.form.elements[name];
    if (!inputs) continue;
    if (inputs instanceof RadioNodeList) {
      for (const radio of inputs) radio.checked = radio.value === value;
    } else if (inputs.type === "checkbox") inputs.checked = Boolean(value);
    else inputs.value = value ?? "";
  }
}

function errorMessage(field, code) {
  if (code === "required" && CHOICE_FIELDS.includes(field)) return t.errors.requiredChoice;
  if (code === "too_short" && field === "challenge") return fill(t.errors.challengeShort, { min: t.limits.challenge_min });
  return t.errors[code] || t.errors.invalid_option;
}

function fieldControls(name) {
  const control = els.form.elements[name];
  if (!control) return [];
  return control instanceof RadioNodeList ? [...control] : [control];
}

function clearErrors() {
  els.form.querySelectorAll(".field-error").forEach((p) => {
    p.hidden = true;
    p.textContent = "";
  });
  els.form.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
  els.errors.hidden = true;
  els.errors.replaceChildren();
}

function showErrors(errors) {
  clearErrors();
  const entries = Object.entries(errors);
  if (!entries.length) return;
  const list = document.createElement("ul");
  for (const [field, code] of entries) {
    const message = errorMessage(field, code);
    const target = document.getElementById(`${field}-error`);
    if (target) {
      target.textContent = message;
      target.hidden = false;
    }
    fieldControls(field).forEach((control) => control.setAttribute("aria-invalid", "true"));
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = `#f-${field}`;
    link.textContent = `${t.fields[field]}: ${message}`;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      fieldControls(field)[0]?.focus();
    });
    item.append(link);
    list.append(item);
  }
  const title = document.createElement("p");
  title.textContent = t.errorSummary;
  els.errors.append(title, list);
  els.errors.hidden = false;
  fieldControls(entries[0][0])[0]?.focus();
}

function updateConditionals() {
  els.form.querySelectorAll("[data-conditional]").forEach((wrapper) => {
    const [field, expected] = wrapper.dataset.conditional.split(":");
    const control = els.form.elements[field];
    const active = (control instanceof RadioNodeList ? control.value : control?.value) === expected;
    wrapper.hidden = !active;
    wrapper.querySelectorAll("input, textarea, select").forEach((input) => {
      input.disabled = !active;
      input.required = active;
    });
  });
}

function updateCounter() {
  const textarea = els.form.elements.challenge;
  const counter = document.getElementById("challenge-counter");
  if (textarea && counter) counter.textContent = fill(t.hints.counter, { n: textarea.value.length, max: t.limits.challenge });
}

function updateEmailHint() {
  const hint = document.getElementById("email-free");
  const email = els.form.elements.email?.value || "";
  if (hint) hint.hidden = !isFreeEmail(email.trim());
}

function displayValue(name, value) {
  if (name === "marketing_opt_in") return value ? t.yes : t.no;
  if (value === "" || value == null) return t.notInformed;
  if (name === "country") {
    try {
      return new Intl.DisplayNames([t.locale], { type: "region" }).of(value) || value;
    } catch {
      return value;
    }
  }
  if (t.options[name]) return t.options[name][value] || value;
  return value;
}

function renderReview() {
  const data = collect();
  const review = document.getElementById("trial-review");
  review.replaceChildren();
  STEPS.forEach((fields, index) => {
    const group = document.createElement("div");
    group.className = "trial-review__group";
    const heading = document.createElement("h3");
    heading.textContent = t.steps[index];
    group.append(heading);
    for (const name of fields) {
      if (name === "objective_other" && data.objective !== "other") continue;
      if (name === "sector_other" && data.sector !== "other") continue;
      const row = document.createElement("div");
      row.className = "trial-review__row";
      const dt = document.createElement("dt");
      dt.textContent = t.fields[name];
      const dd = document.createElement("dd");
      dd.textContent = displayValue(name, typeof data[name] === "string" ? data[name].trim() : data[name]);
      row.append(dt, dd);
      group.append(row);
    }
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "trial-review__edit";
    edit.textContent = t.edit;
    edit.setAttribute("aria-label", `${t.edit}: ${t.steps[index]}`);
    edit.addEventListener("click", () => showStep(index + 1));
    group.append(edit);
    review.append(group);
  });
}

function showStep(n, { focus = true } = {}) {
  state.step = n;
  els.steps.forEach((section) => {
    section.hidden = Number(section.dataset.step) !== n;
  });
  els.back.hidden = n === 1;
  els.next.hidden = n === TOTAL;
  els.submit.hidden = n !== TOTAL;
  els.privacy.hidden = n < TOTAL - 1;
  els.bar.style.width = `${(n / TOTAL) * 100}%`;
  els.progressLabel.textContent = `${fill(t.progress, { x: n, y: TOTAL })}: ${t.steps[n - 1]}`;
  updateConditionals();
  if (n === TOTAL) renderReview();
  if (focus) document.getElementById(`step-${n}-title`)?.focus();
}

function validateStep(n) {
  const result = validateLead(collect(), { fields: STEPS[n - 1] });
  if (!result.ok) showErrors(result.errors);
  else clearErrors();
  return result.ok;
}

function goNext() {
  if (state.step < TOTAL && validateStep(state.step)) {
    hideStatus();
    showStep(state.step + 1);
  }
}

function goBack() {
  if (state.step > 1) {
    clearErrors();
    hideStatus();
    showStep(state.step - 1);
  }
}

function hideStatus() {
  els.status.hidden = true;
  els.status.replaceChildren();
}

function showStatus(message, { retry = false } = {}) {
  els.status.replaceChildren();
  const title = document.createElement("strong");
  title.textContent = t.failure.title;
  const text = document.createElement("p");
  text.textContent = fill(message, { email: t.email });
  els.status.append(title, text);
  if (retry) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button button--secondary";
    button.textContent = t.failure.retry;
    button.addEventListener("click", () => els.form.requestSubmit(els.submit));
    els.status.append(button);
  }
  els.status.hidden = false;
  els.status.focus();
}

function firstStepWithError(errors) {
  const index = STEPS.findIndex((fields) => fields.some((f) => f in errors));
  return index === -1 ? TOTAL : index + 1;
}

async function refreshToken() {
  try {
    const res = await fetch("/api/form-token", { headers: { Accept: "application/json" }, credentials: "same-origin" });
    if (res.ok) {
      const data = await res.json();
      if (typeof data.token === "string") state.token = data.token;
    }
  } catch {
    /* mantém o token atual */
  }
}

function setSubmitting(on) {
  state.submitting = on;
  els.submit.disabled = on;
  els.submit.textContent = on ? t.sending : t.submit;
  els.form.setAttribute("aria-busy", String(on));
}

async function submit(event) {
  event.preventDefault();
  if (state.submitting || state.done) return;
  if (state.step !== TOTAL) {
    goNext();
    return;
  }
  const answers = collect();
  const check = validateLead(answers);
  if (!check.ok) {
    showStep(firstStepWithError(check.errors), { focus: false });
    showErrors(check.errors);
    return;
  }

  const form = els.form.elements;
  const payload = {
    ...answers,
    ...state.attribution,
    lang: form.lang.value,
    form_version: form.form_version.value,
    privacy_notice_version: form.privacy_notice_version.value,
    marketing_text_version: form.marketing_text_version.value,
    form_token: state.token,
    submission_key: state.submissionKey,
    fax_number: form.fax_number.value,
  };

  setSubmitting(true);
  hideStatus();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      credentials: "same-origin",
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if ((res.status === 201 || res.status === 200) && data.ok) {
      // Sucesso apenas após o servidor confirmar a gravação no banco.
      state.done = true;
      els.form.reset();
      els.form.hidden = true;
      els.progress.hidden = true;
      els.success.hidden = false;
      els.success.focus();
      return;
    }
    if (res.status === 422 && data.errors) {
      showStep(firstStepWithError(data.errors), { focus: false });
      showErrors(data.errors);
      return;
    }
    if (res.status === 429) return showStatus(t.failure.rate, { retry: true });
    if (res.status === 400 && data.error === "token_expired") {
      await refreshToken();
      return showStatus(t.failure.expired, { retry: true });
    }
    if (res.status === 400 && data.error === "rejected") return showStatus(t.failure.rejected);
    showStatus(t.failure.server, { retry: true });
  } catch {
    showStatus(t.failure.network, { retry: true });
  } finally {
    clearTimeout(timer);
    setSubmitting(false);
  }
}

// Troca de idioma sem recarregar: substitui apenas a interface e reaplica as respostas mantidas em memória.
async function switchLanguage(link) {
  const answers = collect();
  let doc;
  try {
    const res = await fetch(link.href, { headers: { Accept: "text/html" }, credentials: "same-origin" });
    if (!res.ok) throw new Error(String(res.status));
    doc = new DOMParser().parseFromString(await res.text(), "text/html");
  } catch {
    location.href = link.href;
    return;
  }
  for (const selector of ["header.header", "main", "footer", ".floating-whatsapp"]) {
    const next = doc.querySelector(selector);
    const current = document.querySelector(selector);
    if (next && current) current.replaceWith(document.importNode(next, true));
  }
  document.documentElement.lang = doc.documentElement.lang;
  document.title = doc.title;
  for (const selector of ['meta[name="description"]', 'link[rel="canonical"]']) {
    const next = doc.querySelector(selector);
    const current = document.querySelector(selector);
    if (next && current) current.replaceWith(next.cloneNode(true));
  }
  history.replaceState(history.state, "", new URL(link.href).pathname + location.search);

  setup();
  restore(answers);
  if (state.done) {
    els.form.hidden = true;
    els.progress.hidden = true;
    els.success.hidden = false;
  } else {
    showStep(state.step, { focus: false });
    updateCounter();
    updateEmailHint();
  }
  document.querySelector('.lang-switch [aria-current="true"]')?.focus();
}

function setup() {
  const form = document.getElementById("trial-form");
  if (!form) return false;
  t = JSON.parse(document.getElementById("trial-i18n").textContent);
  els = {
    form,
    steps: [...form.querySelectorAll(".trial-step")],
    back: form.querySelector('[data-action="back"]'),
    next: form.querySelector('[data-action="next"]'),
    submit: form.querySelector('[data-action="submit"]'),
    privacy: form.querySelector(".trial-privacy"),
    errors: document.getElementById("trial-errors"),
    status: document.getElementById("trial-status"),
    success: document.getElementById("trial-success"),
    progress: document.querySelector(".trial-progress"),
    bar: document.querySelector(".trial-progress__bar"),
    progressLabel: document.getElementById("trial-progress-label"),
  };
  // O token do primeiro carregamento é mantido ao trocar de idioma (marca o início do preenchimento).
  if (!state.token) state.token = form.elements.form_token.value;
  form.elements.form_token.value = state.token;
  form.elements.submission_key.value = state.submissionKey;
  form.noValidate = true;
  form.classList.add("is-enhanced");

  els.back.addEventListener("click", goBack);
  els.next.addEventListener("click", goNext);
  form.addEventListener("submit", submit);
  form.addEventListener("change", (event) => {
    if (["objective", "sector"].includes(event.target.name)) updateConditionals();
  });
  form.addEventListener("input", (event) => {
    if (event.target.name === "challenge") updateCounter();
    if (event.target.name === "email") updateEmailHint();
  });
  form.addEventListener("keydown", (event) => {
    const target = event.target;
    if (event.key === "Enter" && target.tagName === "INPUT" && target.type !== "checkbox" && state.step < TOTAL) {
      event.preventDefault();
      goNext();
    }
  });
  document.querySelectorAll("[data-lang-switch]").forEach((link) =>
    link.addEventListener("click", (event) => {
      if (link.getAttribute("aria-current") === "true" || event.ctrlKey || event.metaKey || event.shiftKey) return;
      event.preventDefault();
      switchLanguage(link);
    }),
  );
  return true;
}

if (setup()) {
  els.progress.hidden = false;
  showStep(1, { focus: false });
  updateCounter();
}
