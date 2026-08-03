const message = encodeURIComponent("Olá! Conheci a BrAlveX pelo site e quero entender como a tecnologia pode ser aplicada à minha operação.");
const sponsor = encodeURIComponent("Olá! Conheci a BrAlveX pelo site e quero entender como posso patrocinar o desenvolvimento da tecnologia.");
document.querySelectorAll("[data-whatsapp]").forEach((link) => link.href = `https://wa.me/5511934436441?text=${message}`);
document.querySelectorAll("[data-sponsor]").forEach((link) => link.href = `https://wa.me/5511934436441?text=${sponsor}`);

const toggle = document.querySelector(".menu-toggle");
const nav = document.querySelector("#main-nav");
if (toggle && nav) {
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!open));
    nav.classList.toggle("is-open", !open);
  });
  nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
    toggle.setAttribute("aria-expanded", "false");
    nav.classList.remove("is-open");
  }));
}

const header = document.querySelector(".header");
if (header) {
  window.addEventListener("scroll", () => header.classList.toggle("is-scrolled", scrollY > 24), { passive: true });
}

const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
  if (entry.isIntersecting) {
    entry.target.classList.add("is-visible");
    observer.unobserve(entry.target);
  }
}), { threshold: 0.12 });
document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
