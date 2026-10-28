import { COUNTRIES, FORM_VERSION, LIMITS, MARKETING_TEXT_VERSION, OPTIONS, PRIVACY_NOTICE_VERSION } from "../shared/form-schema.js";

export const CONTACT_EMAIL = "contact@bralvex.com";
export const WHATSAPP_NUMBER = "5511934436441";
export const WHATSAPP_DISPLAY = "+55 11 93443-6441";
export const FORM_TOKEN_PLACEHOLDER = "__FORM_TOKEN__";

const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const fill = (text, vars) => String(text).replace(/\{(\w+)\}/g, (m, key) => (key in vars ? vars[key] : m));

const whatsappHref = (message) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

const emailLink = `<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>`;

const ICON_WHATSAPP = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 11.6a8.5 8.5 0 0 1-12.6 7.5L3.5 20.5l1.4-4.2a8.5 8.5 0 1 1 15.6-4.7Z"></path><path d="M8.2 7.7c.3-.6.7-.6 1-.6h.4c.2 0 .4.1.5.4l.8 1.9c.1.3.1.5-.1.7l-.6.8c-.2.2-.1.5 0 .7.7 1.2 1.7 2.2 3 2.8.3.2.5.1.7-.1l.8-1c.2-.2.4-.3.7-.2l1.8.9c.3.1.4.3.4.6 0 .5-.2 1.4-.7 1.8-.5.5-1.4.8-2.3.6-1.2-.2-2.7-.8-4.4-2.3-1.4-1.2-2.5-2.8-3-4.1-.5-1.1 0-2.3.2-2.7Z"></path></svg>`;
const ICON_ARROW = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>`;

function external(c, href, content, attrs = "") {
  return `<a ${attrs} href="${esc(href)}" target="_blank" rel="noopener noreferrer">${content}<span class="sr-only"> ${esc(c.ui.newTab)}</span></a>`;
}

function langSwitch(c, langs, pageKey) {
  const items = langs.map((other) => {
    const current = other.lang === c.lang;
    const short = other.lang.toUpperCase();
    const name = other.lang === "pt" ? "Português" : "English";
    return `<a href="${other.routes[pageKey]}" lang="${other.htmlLang}" hreflang="${other.hreflang}" data-lang-switch="${other.lang}"${
      current ? ' aria-current="true"' : ""
    }><span class="lang-switch__full">${name}</span><span class="lang-switch__short" aria-hidden="true">${short}</span><span class="sr-only lang-switch__sr">${name}</span></a>`;
  });
  return `<div class="lang-switch" role="group" aria-label="${esc(c.ui.langLabel)}">${items.join('<span class="lang-switch__sep" aria-hidden="true">|</span>')}</div>`;
}

function header(c, langs, pageKey) {
  const onHome = pageKey === "home";
  const anchor = (id) => (onHome ? `#${id}` : `${c.routes.home}#${id}`);
  const nav = c.nav.map(([id, label]) => `<a href="${anchor(id)}">${esc(label)}</a>`).join("");
  return `<a class="skip-link" href="#conteudo">${esc(c.ui.skip)}</a>
    <header class="header">
      <div class="container header__inner">
        <a class="brand" href="${anchor("inicio")}" aria-label="${esc(c.ui.homeLabel)}"><span class="brand__mark" aria-hidden="true"></span><span class="brand__name">BrAlve<span>X</span></span></a>
        <div class="header__panel" id="main-nav">
          <nav aria-label="${esc(c.ui.navLabel)}">${nav}</nav>
          ${external(c, whatsappHref(c.whatsapp.general), esc(c.ui.specialistCta), 'class="header__cta"')}
        </div>
        ${langSwitch(c, langs, pageKey)}
        <a class="header__trial" href="${c.routes.trial}" data-trial-link${pageKey === "trial" ? ' aria-current="page"' : ""}>${esc(c.ui.trialCta)}</a>
        <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="main-nav" data-label-open="${esc(c.ui.menuOpen)}" data-label-close="${esc(c.ui.menuClose)}"><span class="sr-only">${esc(c.ui.menuOpen)}</span><span class="menu-toggle__bars" aria-hidden="true"></span></button>
      </div>
    </header>`;
}

function footer(c, pageKey) {
  const home = pageKey === "home" ? "#inicio" : `${c.routes.home}#inicio`;
  return `<footer>
      <div class="container footer">
        <a class="brand brand--compact" href="${home}" aria-label="${esc(c.ui.homeLabel)}"><span class="brand__mark" aria-hidden="true"></span><span class="brand__name">BrAlve<span>X</span></span></a>
        <p>${esc(c.footer.text)}</p>
        <div class="footer__links">
          ${external(c, whatsappHref(c.whatsapp.general), esc(c.footer.whatsapp))}
          <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>
          <a href="${c.routes.trial}" data-trial-link>${esc(c.ui.trialCta)}</a>
          <a href="${c.routes.privacy}">${esc(c.footer.privacy)}</a>
        </div>
      </div>
    </footer>
    ${external(c, whatsappHref(c.whatsapp.general), `${ICON_WHATSAPP}<span>${esc(c.ui.floating)}</span>`, `class="floating-whatsapp" aria-label="${esc(c.ui.floatingLabel)}"`)}`;
}

function head(c, langs, pageKey, { title, description, siteUrl, indexable = true }) {
  const alternates = langs
    .map((other) => `<link rel="alternate" hreflang="${other.hreflang}" href="${siteUrl}${other.routes[pageKey]}" />`)
    .join("\n  ");
  const xDefault = langs.find((other) => other.lang === "pt");
  const ogLocale = c.lang === "pt" ? "pt_BR" : "en_US";
  const ogAlt = c.lang === "pt" ? "en_US" : "pt_BR";
  const org = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "BrAlveX",
    url: `${siteUrl}${c.routes.home}`,
    logo: `${siteUrl}/public/bralvex-logo.jpg`,
    email: CONTACT_EMAIL,
    contactPoint: [{ "@type": "ContactPoint", contactType: "sales", email: CONTACT_EMAIL, telephone: `+${WHATSAPP_NUMBER}`, availableLanguage: ["Portuguese", "English"] }],
  };
  return `<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  ${indexable ? "" : '<meta name="robots" content="noindex" />'}
  <link rel="canonical" href="${siteUrl}${c.routes[pageKey]}" />
  ${indexable ? `${alternates}\n  <link rel="alternate" hreflang="x-default" href="${siteUrl}${xDefault.routes[pageKey]}" />` : ""}
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="BrAlveX" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${siteUrl}${c.routes[pageKey]}" />
  <meta property="og:locale" content="${ogLocale}" />
  <meta property="og:locale:alternate" content="${ogAlt}" />
  <meta property="og:image" content="${siteUrl}/public/bralvex-logo.jpg" />
  <link rel="icon" href="/assets/Logo%20BrAlveX.jpg.jpeg" />
  <link rel="stylesheet" href="/src/fonts.css" />
  <link rel="stylesheet" href="/original-assets/index-BwCoKsv6.css" />
  <link rel="stylesheet" href="/src/fixes.css" />
  <link rel="stylesheet" href="/src/site.css" />
  <script src="/src/js-flag.js"></script>
  <script type="application/ld+json">${JSON.stringify(org).replace(/</g, "\\u003c")}</script>
</head>`;
}

function page(c, langs, pageKey, meta, main) {
  return `<!DOCTYPE html>
<html lang="${c.htmlLang}" data-page="${pageKey}">
${head(c, langs, pageKey, meta)}
<body class="__variable_geist_02gp7id __variable_geist_mono_021reof antialiased">
  <div class="site">
    ${header(c, langs, pageKey)}
    <main id="conteudo" tabindex="-1">
${main}
    </main>
    ${footer(c, pageKey)}
  </div>
  <script defer src="/src/main.js"></script>
  ${pageKey === "trial" ? '<script type="module" src="/src/trial-form.js"></script>' : ""}
</body>
</html>
`;
}

export function renderHome(c, langs, siteUrl) {
  const h = c.home;
  const wa = whatsappHref(c.whatsapp.general);
  const rows = (labels) =>
    labels.map((label, i) => `<div class="signal__row"><i></i><span>${esc(label)}</span><b>0${i + 1}</b></div>`).join("");
  const numbered = (items, wrap) => items.map(([title, text], i) => wrap(String(i + 1).padStart(2, "0"), esc(title), esc(text))).join("");
  const faqEmail = (text) => fill(esc(text), { email: emailLink });

  const main = `
      <section class="hero" id="inicio"><span class="hero__grid" aria-hidden="true"></span>
        <div class="container hero__content">
          <div class="hero__copy">
            <p class="eyebrow"><span></span>${esc(h.hero.eyebrow)}</p>
            <h1>${esc(h.hero.title)} <em>${esc(h.hero.titleEm)}</em></h1>
            <p class="hero__lead">${esc(h.hero.lead)}</p>
            <div class="actions">
              ${external(c, wa, `${ICON_WHATSAPP}${esc(h.hero.primary)}`, 'class="button button--primary"')}
              <a class="button button--secondary" href="#tecnologia">${esc(h.hero.secondary)}${ICON_ARROW}</a>
            </div>
            <p class="microcopy">${esc(h.hero.microcopy)} · <a class="text-link text-link--inline" href="${c.routes.trial}" data-trial-link>${esc(h.hero.trial)}</a></p>
          </div>
          <div class="blackbox-visual" role="img" aria-label="${esc(h.hero.visualLabel)}">
            <div class="signal signal--input"><span class="tech-label">INPUT</span><div class="signal__panel">${rows(h.hero.inputs)}</div></div>
            <div class="data-lines data-lines--in" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
            <div class="blackbox"><span class="tech-label">BLACK BOX</span>
              <div class="blackbox__frame"><span class="blackbox__grid" aria-hidden="true"></span><span class="blackbox__logo" aria-hidden="true"></span><span class="blackbox__api">API</span></div>
            </div>
            <div class="data-lines data-lines--out" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
            <div class="signal signal--output"><span class="tech-label">OUTPUT</span><div class="signal__panel">${rows(h.hero.outputs)}</div></div>
          </div>
        </div>
        <div class="container proof">
          ${h.proof
            .map(
              ([big, title, text], i) =>
                `<article${i === 3 ? ' class="proof__highlight"' : ""}><strong>${esc(big)}</strong><div><h2>${esc(title)}</h2><p>${esc(text)}</p></div></article>`,
            )
            .join("\n          ")}
        </div>
        <p class="container claim-note">${esc(h.claimNote)}</p>
      </section>
      <section class="section section--intro" id="tecnologia">
        <div class="container split-heading">
          <div><p class="eyebrow"><span></span>${esc(h.intro.eyebrow)}</p><h2>${esc(h.intro.title)}</h2></div>
          <p>${esc(h.intro.text)}</p>
        </div>
      </section>
      <section class="section" id="beneficios">
        <div class="container">
          <div class="section-heading section-heading--center">
            <p class="eyebrow"><span></span>${esc(h.benefits.eyebrow)}</p>
            <h2>${esc(h.benefits.title)}</h2>
            <p>${esc(h.benefits.text)}</p>
          </div>
          <div class="benefits">${numbered(h.benefits.items, (n, t, p) => `<article><span>${n}</span><h3>${t}</h3><p>${p}</p></article>`)}</div>
        </div>
      </section>
      <section class="section section--risk" id="risco">
        <div class="container risk">
          <div class="risk__copy">
            <p class="eyebrow eyebrow--risk"><span></span>${esc(h.risk.eyebrow)}</p>
            <h2>${esc(h.risk.title)}</h2>
            <p>${esc(h.risk.text)}</p>
            ${external(c, wa, `${esc(h.risk.link)} ${ICON_ARROW}`, 'class="text-link"')}
          </div>
          <div class="risk__list">${numbered(h.risk.items, (n, t, p) => `<article><span>${n}</span><div><h3>${t}</h3><p>${p}</p></div></article>`)}</div>
        </div>
      </section>
      <section class="section section--model" id="modelo">
        <div class="container">
          <div class="split-heading">
            <div><p class="eyebrow"><span></span>${esc(h.model.eyebrow)}</p><h2>${esc(h.model.title)}</h2></div>
            <p>${esc(h.model.text)}</p>
          </div>
          <div class="steps">${numbered(h.model.steps, (n, t, p) => `<article><span>${n}</span><h3>${t}</h3><p>${p}</p></article>`)}</div>
        </div>
      </section>
      <section class="section section--profile" id="perfil">
        <div class="container profile">
          <article class="profile__card profile__card--yes">
            <p class="eyebrow"><span></span>${esc(h.profile.yesEyebrow)}</p>
            <h2>${esc(h.profile.yesTitle)}</h2>
            <ul>${h.profile.yes.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
          </article>
          <article class="profile__card profile__card--no">
            <p class="eyebrow eyebrow--muted"><span></span>${esc(h.profile.noEyebrow)}</p>
            <h2>${esc(h.profile.noTitle)}</h2>
            <ul>${h.profile.no.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
          </article>
        </div>
      </section>
      <section class="section section--club" id="patrocinar">
        <div class="container club">
          <div class="club__visual" aria-hidden="true"><i></i><i></i><i></i><span class="club__logo"></span></div>
          <div class="club__copy">
            <p class="eyebrow"><span></span>${esc(h.sponsor.eyebrow)}</p>
            <h2>${esc(h.sponsor.title)}</h2>
            <p>${esc(h.sponsor.text)}</p>
            ${external(c, whatsappHref(c.whatsapp.sponsor), `${ICON_WHATSAPP}${esc(h.sponsor.button)}`, 'class="button button--primary"')}
          </div>
        </div>
      </section>
      <section class="section section--faq" id="faq">
        <div class="container faq">
          <div class="section-heading">
            <p class="eyebrow"><span></span>${esc(h.faq.eyebrow)}</p>
            <h2>${esc(h.faq.title)}</h2>
            <p>${esc(h.faq.text)}</p>
          </div>
          <div class="faq__list">
            ${h.faq.items
              .map(([q, a], i) => `<details${i === 0 ? " open" : ""}><summary>${esc(q)}<span aria-hidden="true">+</span></summary><p>${faqEmail(a)}</p></details>`)
              .join("\n            ")}
          </div>
        </div>
      </section>
      <section class="final-cta" id="contato">
        <div class="container">
          <p class="eyebrow"><span></span>${esc(h.final.eyebrow)}</p>
          <h2>${esc(h.final.title)}</h2>
          <p>${esc(h.final.text)}</p>
          ${external(c, wa, `${ICON_WHATSAPP}${esc(h.final.whatsapp)}`, 'class="button button--primary"')}<a class="button button--secondary" href="${c.routes.trial}" data-trial-link>${esc(h.final.trial)}</a>
        </div>
      </section>`;
  return page(c, langs, "home", { title: h.title, description: h.description, siteUrl }, main);
}

function countryOptions(c) {
  const names = new Intl.DisplayNames([c.locale], { type: "region" });
  return COUNTRIES.map((code) => [code, names.of(code)])
    .sort((a, b) => a[1].localeCompare(b[1], c.locale))
    .map(([code, name]) => `<option value="${code}">${esc(name)}</option>`)
    .join("");
}

function radios(t, name, describedBy = "") {
  return OPTIONS[name]
    .map(
      (value) =>
        `<label class="choice"><input type="radio" name="${name}" value="${value}" required${describedBy ? ` aria-describedby="${describedBy}"` : ""} /><span>${esc(t.options[name][value])}</span></label>`,
    )
    .join("");
}

function fieldError(name) {
  return `<p class="field-error" id="${name}-error" hidden></p>`;
}

function textField(t, name, { required = true, type = "text", autocomplete, hint, max, extra = "", conditional } = {}) {
  const describedBy = [hint ? `${name}-hint` : "", `${name}-error`].filter(Boolean).join(" ");
  return `<div class="field"${conditional ? ` data-conditional="${conditional}"` : ""}>
            <label for="f-${name}">${esc(t.fields[name])} <span class="field__tag">(${esc(required ? t.required : t.optional)})</span></label>
            ${hint ? `<p class="field__hint" id="${name}-hint">${esc(hint)}</p>` : ""}
            <input id="f-${name}" name="${name}" type="${type}"${required && !conditional ? " required" : ""}${max ? ` maxlength="${max}"` : ""}${
              autocomplete ? ` autocomplete="${autocomplete}"` : ""
            } aria-describedby="${describedBy}" ${extra}/>
            ${fieldError(name)}
          </div>`;
}

function choiceStep(t, name, conditionalField) {
  return `<fieldset class="choice-group" aria-describedby="${name}-error">
            <legend class="sr-only">${esc(t.fields[name])}</legend>
            <div class="choices">${radios(t, name)}</div>
            ${fieldError(name)}
          </fieldset>
          ${conditionalField || ""}`;
}

function step(t, index, body) {
  return `<section class="trial-step" data-step="${index}" aria-labelledby="step-${index}-title">
          <p class="trial-step__count">${esc(fill(t.progress, { x: index, y: t.steps.length }))}</p>
          <h2 id="step-${index}-title" tabindex="-1">${esc(t.steps[index - 1])}</h2>
          ${body}
        </section>`;
}

export function renderTrial(c, langs, siteUrl) {
  const t = c.trial;
  const clientStrings = {
    lang: c.lang,
    locale: c.locale,
    email: CONTACT_EMAIL,
    routes: c.routes,
    progress: t.progress,
    back: t.back,
    next: t.next,
    submit: t.submit,
    sending: t.sending,
    edit: t.edit,
    steps: t.steps,
    fields: t.fields,
    options: t.options,
    yes: t.yes,
    no: t.no,
    notInformed: t.notInformed,
    errorSummary: t.errorSummary,
    errors: t.errors,
    failure: t.failure,
    hints: t.hints,
    limits: LIMITS,
  };

  const steps = [
    step(t, 1, choiceStep(t, "objective", textField(t, "objective_other", { max: LIMITS.objective_other, conditional: "objective:other" }))),
    step(
      t,
      2,
      `${textField(t, "company", { autocomplete: "organization", max: LIMITS.company })}
          <div class="field">
            <label for="f-sector">${esc(t.fields.sector)} <span class="field__tag">(${esc(t.required)})</span></label>
            <select id="f-sector" name="sector" required aria-describedby="sector-error">
              <option value="">${esc(t.select)}</option>
              ${OPTIONS.sector.map((value) => `<option value="${value}">${esc(t.options.sector[value])}</option>`).join("")}
            </select>
            ${fieldError("sector")}
          </div>
          ${textField(t, "sector_other", { max: LIMITS.sector_other, conditional: "sector:other" })}
          ${textField(t, "job_role", { autocomplete: "organization-title", max: LIMITS.job_role })}
          ${textField(t, "website", { required: false, type: "text", autocomplete: "url", hint: t.hints.website, max: LIMITS.website, extra: 'inputmode="url" spellcheck="false" ' })}`,
    ),
    step(t, 3, choiceStep(t, "company_size")),
    step(
      t,
      4,
      `<div class="field">
            <label for="f-challenge">${esc(t.fields.challenge)} <span class="field__tag">(${esc(t.required)})</span></label>
            <p class="field__hint" id="challenge-hint">${esc(t.hints.challenge)}</p>
            <textarea id="f-challenge" name="challenge" rows="7" required minlength="${LIMITS.challenge_min}" maxlength="${LIMITS.challenge}" aria-describedby="challenge-hint challenge-counter challenge-error"></textarea>
            <p class="field__counter" id="challenge-counter" aria-live="polite">${esc(fill(t.hints.counter, { n: 0, max: LIMITS.challenge }))}</p>
            ${fieldError("challenge")}
          </div>`,
    ),
    step(t, 5, choiceStep(t, "data_availability")),
    step(t, 6, choiceStep(t, "timing")),
    step(
      t,
      7,
      `${textField(t, "full_name", { autocomplete: "name", max: LIMITS.full_name })}
          ${textField(t, "email", { type: "email", autocomplete: "email", hint: t.hints.email, max: LIMITS.email, extra: 'spellcheck="false" ' })}
          <p class="field__hint field__hint--warn" id="email-free" hidden>${esc(t.hints.emailFree)}</p>
          <div class="field">
            <label for="f-country">${esc(t.fields.country)} <span class="field__tag">(${esc(t.required)})</span></label>
            <select id="f-country" name="country" required autocomplete="country" aria-describedby="country-error">
              <option value="">${esc(t.select)}</option>
              ${countryOptions(c)}
            </select>
            ${fieldError("country")}
          </div>
          ${textField(t, "whatsapp", { required: false, type: "tel", autocomplete: "tel", hint: t.hints.whatsapp, max: 25, extra: 'inputmode="tel" ' })}
          <label class="consent"><input type="checkbox" name="marketing_opt_in" value="1" /><span>${esc(t.marketing)}</span></label>`,
    ),
    step(
      t,
      8,
      `<p class="trial-review__intro">${esc(t.reviewIntro)}</p>
          <dl class="trial-review" id="trial-review"></dl>`,
    ),
  ];

  const main = `
      <section class="section trial" id="inicio">
        <div class="container trial__layout">
          <div class="trial__intro">
            <p class="eyebrow"><span></span>${esc(t.eyebrow)}</p>
            <h1>${esc(t.heading)}</h1>
            <p>${esc(t.intro)}</p>
            <noscript><p class="trial__noscript">${esc(t.noscript)}</p></noscript>
          </div>
          <div class="trial__card">
            <div class="trial-progress" aria-hidden="true"><span class="trial-progress__bar"></span></div>
            <p class="trial-progress__label sr-only" id="trial-progress-label" aria-live="polite"></p>
            <div class="trial-status" id="trial-status" role="alert" tabindex="-1" hidden></div>
            <form class="trial-form" id="trial-form" action="/api/leads" method="post" aria-describedby="trial-progress-label">
              <input type="hidden" name="lang" value="${c.lang}" />
              <input type="hidden" name="form_version" value="${FORM_VERSION}" />
              <input type="hidden" name="privacy_notice_version" value="${PRIVACY_NOTICE_VERSION}" />
              <input type="hidden" name="marketing_text_version" value="${MARKETING_TEXT_VERSION}" />
              <input type="hidden" name="form_token" value="${FORM_TOKEN_PLACEHOLDER}" />
              <input type="hidden" name="submission_key" value="" />
              <div class="hp-field" aria-hidden="true">
                <label for="f-fax">${esc(t.honeypot)}</label>
                <input id="f-fax" name="fax_number" type="text" tabindex="-1" autocomplete="off" />
              </div>
              <div class="trial-errors" id="trial-errors" role="alert" tabindex="-1" hidden></div>
              ${steps.join("\n              ")}
              <div class="trial-privacy">
                <p>${esc(t.privacy)} <a href="${c.routes.privacy}" target="_blank" rel="noopener">${esc(t.privacyLink)}<span class="sr-only"> ${esc(c.ui.newTab)}</span></a></p>
              </div>
              <div class="trial-nav">
                <button type="button" class="button button--secondary" data-action="back" hidden>${esc(t.back)}</button>
                <button type="button" class="button button--primary" data-action="next" hidden>${esc(t.next)}</button>
                <button type="submit" class="button button--primary" data-action="submit">${esc(t.submit)}</button>
              </div>
            </form>
            <section class="trial-success" id="trial-success" tabindex="-1" hidden aria-labelledby="trial-success-title">
              <h2 id="trial-success-title">${esc(t.success.title)}</h2>
              <p>${esc(t.success.text)}</p>
              <p>${esc(t.success.note)}</p>
              <a class="button button--secondary" href="${c.routes.home}">${esc(t.success.back)}</a>
            </section>
          </div>
        </div>
        <script type="application/json" id="trial-i18n">${JSON.stringify(clientStrings).replace(/</g, "\\u003c")}</script>
      </section>`;
  return page(c, langs, "trial", { title: t.title, description: t.description, siteUrl }, main);
}

export function renderTrialReceived(c, langs, siteUrl) {
  const t = c.trial;
  const main = `
      <section class="section trial" id="inicio">
        <div class="container trial__layout trial__layout--single">
          <div class="trial__card trial-success">
            <h1>${esc(t.success.title)}</h1>
            <p>${esc(t.success.text)}</p>
            <p>${esc(t.success.note)}</p>
            <a class="button button--secondary" href="${c.routes.home}">${esc(t.success.back)}</a>
          </div>
        </div>
      </section>`;
  return page(c, langs, "trialReceived", { title: `${t.success.title} | BrAlveX`, description: t.description, siteUrl, indexable: false }, main);
}

export function renderPrivacy(c, langs, siteUrl, date) {
  const p = c.privacy;
  const main = `
      <section class="section legal" id="inicio">
        <div class="container legal__body">
          <h1>${esc(p.heading)}</h1>
          ${p.draft ? `<p class="legal__draft" role="note">${esc(p.draft)}</p>` : ""}
          ${p.sections
            // Os textos das seções vêm do repositório (não de usuários); permitem HTML simples.
            .map(([title, body]) => `<h2>${esc(title)}</h2><p>${fill(body, { email: emailLink, whatsapp: external(c, whatsappHref(c.whatsapp.general), WHATSAPP_DISPLAY) })}</p>`)
            .join("\n          ")}
          <p class="legal__updated">${esc(fill(p.updated, { date }))}</p>
        </div>
      </section>`;
  return page(c, langs, "privacy", { title: p.title, description: p.description, siteUrl }, main);
}

/** Página simples renderizada pelo servidor quando o envio sem JavaScript tem erros. */
export function renderNoJsErrors(c, langs, siteUrl, messages) {
  const t = c.trial;
  const main = `
      <section class="section trial" id="inicio">
        <div class="container trial__layout trial__layout--single">
          <div class="trial__card">
            <h1>${esc(t.noJsErrorTitle)}</h1>
            <p>${esc(t.noJsErrorText)}</p>
            <ul class="trial-errors__list">${messages.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>
            <a class="button button--secondary" href="${c.routes.trial}" data-history-back>${esc(t.noJsBack)}</a>
          </div>
        </div>
      </section>`;
  return page(c, langs, "trial", { title: t.title, description: t.description, siteUrl, indexable: false }, main);
}

export function rootRedirect(target) {
  // Fallback para hospedagem estática sem redirecionamento no servidor: preserva o #âncora dos links antigos.
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="robots" content="noindex" />
  <meta http-equiv="refresh" content="0; url=${target}" />
  <link rel="canonical" href="${target}" />
  <title>BrAlveX</title>
  <script src="/src/root-redirect.js"></script>
</head>
<body><p><a href="${target}">BrAlveX</a></p></body>
</html>
`;
}
