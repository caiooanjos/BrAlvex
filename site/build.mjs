// Gera o site estático bilíngue em dist/.
// Uso: node site/build.mjs   (SITE_URL define a base absoluta para canonical, hreflang e sitemap)
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pt from "./content/pt.js";
import en from "./content/en.js";
import { renderHome, renderNoJsErrors, renderNotFound, renderPrivacy, renderTrial, renderTrialReceived, rootRedirect } from "./templates.js";
import * as schema from "../shared/form-schema.js";

const PRIVACY_UPDATED = { pt: "28/10/2026", en: "October 28, 2026" };

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
// Dados gerados para o back end PHP (mesma fonte dos textos e da validação do site).
const generated = join(root, "php", "app", "generated");
export const NOJS_MESSAGES_PLACEHOLDER = "@@MESSAGES@@";
const siteUrl = (process.env.SITE_URL || "https://bralvex.com").replace(/\/+$/, "");
const langs = [pt, en];

async function write(route, html) {
  const file = join(dist, route, route.endsWith("/") ? "index.html" : "");
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, html, "utf8");
}

export async function build({ quiet = false } = {}) {
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });
  for (const dir of ["original-assets", "assets", "public", "shared"]) {
    await cp(join(root, dir), join(dist, dir), { recursive: true });
  }
  await mkdir(join(dist, "src"), { recursive: true });
  for (const file of ["fonts.css", "fixes.css", "site.css", "main.js", "trial-form.js", "js-flag.js", "root-redirect.js"]) {
    await cp(join(root, "src", file), join(dist, "src", file));
  }
  // Bloqueia listagem de pastas se dist/ for servido direto por Apache/LiteSpeed.
  await cp(join(root, "site", "htaccess"), join(dist, ".htaccess"));

  for (const c of langs) {
    await write(c.routes.home, renderHome(c, langs, siteUrl));
    await write(c.routes.trial, renderTrial(c, langs, siteUrl));
    await write(c.routes.trialReceived, renderTrialReceived(c, langs, siteUrl));
    await write(c.routes.privacy, renderPrivacy(c, langs, siteUrl, PRIVACY_UPDATED[c.lang]));
  }
  await write("/", rootRedirect(pt.routes.home));
  await writeFile(join(dist, "404.html"), renderNotFound(), "utf8");
  await writeGenerated();

  const urls = ["home", "trial", "privacy"].flatMap((key) =>
    langs.map((c) => {
      const links = langs
        .map((o) => `    <xhtml:link rel="alternate" hreflang="${o.hreflang}" href="${siteUrl}${o.routes[key]}" />`)
        .concat(`    <xhtml:link rel="alternate" hreflang="x-default" href="${siteUrl}${pt.routes[key]}" />`)
        .join("\n");
      return `  <url>\n    <loc>${siteUrl}${c.routes[key]}</loc>\n${links}\n  </url>`;
    }),
  );
  await writeFile(
    join(dist, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join("\n")}\n</urlset>\n`,
  );
  // Endereços provisórios (ex.: domínio temporário da hospedagem) não devem ser indexados.
  const official = ["bralvex.com", "www.bralvex.com"].includes(new URL(siteUrl).hostname);
  await writeFile(
    join(dist, "robots.txt"),
    official ? `User-agent: *\nDisallow: /api/\n\nSitemap: ${siteUrl}/sitemap.xml\n` : "User-agent: *\nDisallow: /\n",
  );

  if (!quiet) console.log(`Site gerado em dist/ (base ${siteUrl}).`);
}

async function writeGenerated() {
  await rm(generated, { recursive: true, force: true });
  await mkdir(generated, { recursive: true });
  const { FORM_VERSION, PRIVACY_NOTICE_VERSION, MARKETING_TEXT_VERSION, OPTIONS, COUNTRIES, LIMITS, UTM_FIELDS } = schema;
  const json = (name, data) => writeFile(join(generated, name), JSON.stringify(data, null, 1), "utf8");
  await json("schema.json", { FORM_VERSION, PRIVACY_NOTICE_VERSION, MARKETING_TEXT_VERSION, OPTIONS, COUNTRIES, LIMITS, UTM_FIELDS });
  const countryNames = new Intl.DisplayNames(["pt-BR"], { type: "region" });
  await json("content.json", {
    countries_pt: Object.fromEntries(COUNTRIES.map((code) => [code, countryNames.of(code)])),
    ...Object.fromEntries(
      langs.map((c) => [
        c.lang,
        {
          routes: c.routes,
          fields: c.trial.fields,
          errors: c.trial.errors,
          failure: c.trial.failure,
          options: c.trial.options,
        },
      ]),
    ),
  });
  for (const c of langs) {
    await writeFile(join(generated, `nojs-${c.lang}.html`), renderNoJsErrors(c, langs, siteUrl, [NOJS_MESSAGES_PLACEHOLDER]), "utf8");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await build();
}
