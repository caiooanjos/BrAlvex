// Delegação de eventos: o cabeçalho pode ser substituído ao trocar de idioma no formulário.
function setMenu(open) {
  const toggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector("#main-nav");
  if (!toggle || !nav) return;
  toggle.setAttribute("aria-expanded", String(open));
  nav.classList.toggle("is-open", open);
  document.body.classList.toggle("menu-open", open);
  const label = toggle.querySelector(".sr-only");
  if (label) label.textContent = open ? toggle.dataset.labelClose : toggle.dataset.labelOpen;
}

document.addEventListener("click", (event) => {
  const toggle = event.target.closest(".menu-toggle");
  if (toggle) setMenu(toggle.getAttribute("aria-expanded") !== "true");
  else if (event.target.closest("#main-nav a")) setMenu(false);
});
document.addEventListener("keydown", (event) => {
  const toggle = document.querySelector(".menu-toggle");
  if (event.key === "Escape" && toggle?.getAttribute("aria-expanded") === "true") {
    setMenu(false);
    toggle.focus();
  }
});

const updateHeader = () => document.querySelector(".header")?.classList.toggle("is-scrolled", scrollY > 24);
window.addEventListener("scroll", updateHeader, { passive: true });
updateHeader();
const header = document.querySelector(".header");

// Ao trocar de idioma na página inicial, abre a mesma seção na outra versão.
// As seções usam os mesmos ids nos dois idiomas.
if (document.documentElement.dataset.page === "home") {
  const sections = [...document.querySelectorAll("main section[id]")];
  document.querySelectorAll("[data-lang-switch]").forEach((link) =>
    link.addEventListener("click", () => {
      // Seção que ocupa o terço superior da tela.
      const line = Math.max((header?.offsetHeight || 0) + 24, innerHeight / 3);
      const current = sections.filter((section) => section.getBoundingClientRect().top <= line).pop();
      const hash = current && current.id !== "inicio" ? `#${current.id}` : location.hash;
      link.href = link.pathname + location.search + hash;
    }),
  );
}

// Repassa parâmetros de campanha (UTM) da visita aos links do formulário de teste.
const utm = new URLSearchParams();
new URLSearchParams(location.search).forEach((value, key) => {
  if (/^utm_(source|medium|campaign|term|content)$/.test(key) && value.length <= 100) utm.set(key, value);
});
if ([...utm.keys()].length) {
  document.querySelectorAll("[data-trial-link], [data-lang-switch]").forEach((link) => {
    const url = new URL(link.href, location.href);
    utm.forEach((value, key) => url.searchParams.set(key, value));
    link.href = url.pathname + url.search + url.hash;
  });
}

// Página de erros do envio sem JavaScript: voltar preserva o que o navegador manteve no formulário.
document.querySelectorAll("[data-history-back]").forEach((link) =>
  link.addEventListener("click", (event) => {
    if (history.length > 1) {
      event.preventDefault();
      history.back();
    }
  }),
);

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    }
  }), { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
}
