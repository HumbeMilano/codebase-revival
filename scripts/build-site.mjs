import { mkdir, writeFile, readFile, readdir, stat } from "node:fs/promises";
import { content } from "../branding/content.mjs";
import { campaigns } from "../branding/content.mjs";
import { format, resolveConfig } from "prettier";
const formatting = await resolveConfig("package.json");
const esc = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const lines = (s) => esc(s).replaceAll("\n", "<br />");
const signup = "https://app.skendal.com/?registro=1",
  arrow = '<span aria-hidden="true">→</span>';
const brand = (home) =>
  `<a class="brand" href="${home}" aria-label="Skendal"><img src="/assets/skendal-symbol.png" width="52" height="52" alt="" /><span>skendal</span></a>`;
function page(lang) {
  const t = content[lang],
    es = lang === "es",
    home = es ? "/es/" : "/?lang=en",
    url = es ? "https://skendal.com/es/" : "https://skendal.com/";
  const languages = `<nav class="language" aria-label="${t.language}"><a href="/?lang=en" lang="en" hreflang="en" data-language="en" ${!es ? 'aria-current="page"' : ""}>EN</a><span aria-hidden="true">/</span><a href="/es/" lang="es" hreflang="es" data-language="es" ${es ? 'aria-current="page"' : ""}>ES</a></nav>`;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><meta name="theme-color" content="#344ED8" /><title>${esc(t.title)}</title><meta name="description" content="${esc(t.description)}" /><link rel="canonical" href="${url}" /><link rel="alternate" hreflang="en-US" href="https://skendal.com/" /><link rel="alternate" hreflang="es-US" href="https://skendal.com/es/" /><link rel="alternate" hreflang="x-default" href="https://skendal.com/" /><meta property="og:title" content="${esc(t.title)}" /><meta property="og:description" content="${esc(t.description)}" /><meta property="og:type" content="website" /><meta property="og:url" content="${url}" /><meta property="og:locale" content="${es ? "es_US" : "en_US"}" /><meta property="og:image" content="https://skendal.com/assets/share-${lang}.png" /><meta property="og:image:width" content="1200" /><meta property="og:image:height" content="630" /><meta property="og:image:alt" content="${esc(t.title)}" /><meta name="twitter:card" content="summary_large_image" /><link rel="icon" href="/assets/skendal-symbol.png" type="image/png" /><link rel="apple-touch-icon" href="/assets/skendal-symbol.png" /><link rel="preload" href="/assets/fonts/manrope-variable.ttf" as="font" type="font/ttf" crossorigin /><link rel="stylesheet" href="/styles.css" /><script src="/language.js"></script></head><body>
<a class="skip" href="#content">${t.skip}</a><header class="site-header wrap">${brand(home)}<nav class="main-nav" aria-label="${t.navigation}"><a href="#everyday">${t.nav[0]}</a><a href="#tablet">${t.nav[1]}</a><a href="#questions">${t.nav[2]}</a></nav><div class="header-actions">${languages}<a class="button button-small button-outline" href="https://app.skendal.com">${t.login} ${arrow}</a></div></header><main id="content">
<section class="hero wrap"><div class="hero-copy"><p class="eyebrow"><span class="dot"></span>${t.eyebrow}</p><h1>${t.hero[0]}<br />${t.hero[1]}<br /><em>${t.hero[2]}</em></h1><p class="intro">${t.intro}</p><div class="hero-actions"><a class="button" href="${signup}">${t.cta} ${arrow}</a><a class="text-link" href="#everyday">${t.explore} <span aria-hidden="true">↓</span></a></div><p class="availability">${t.availability}</p></div><figure class="product-scene" aria-label="${t.example}"><div class="scene-orbit orbit-coral"></div><div class="scene-orbit orbit-lilac"></div><div class="home-preview"><div class="preview-top"><div class="mini-brand"><img src="/assets/skendal-symbol.png" width="30" height="30" alt="" /><strong>skendal</strong></div><span class="preview-avatar" aria-hidden="true">A</span></div><p class="preview-greeting">${t.greeting}</p><h2>${t.overview}</h2><div class="preview-grid"><div class="preview-widget widget-tasks"><span class="widget-symbol" aria-hidden="true">✓</span><h3>${t.tasks}</h3><p class="mock-task"><span class="mock-check checked" aria-hidden="true">✓</span><s>${t.task1}</s></p><p class="mock-task"><span class="mock-check" aria-hidden="true"></span>${t.task2}</p></div><div class="preview-widget widget-shopping"><span class="widget-symbol" aria-hidden="true">＋</span><h3>${t.list}</h3><p class="list-name">${t.listName}</p>${t.products.map((p) => `<p class="mock-task"><span class="mock-check" aria-hidden="true"></span>${p}</p>`).join("")}</div><div class="preview-widget widget-calendar"><span class="widget-symbol" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 10h18"/></svg></span><h3>${t.calendar}</h3><strong>${t.event}</strong><p>${t.when}</p></div><div class="preview-widget widget-note"><h3>${t.note}</h3><p>${t.noteText}</p></div></div><div class="preview-bottom"><span class="avatar-stack" aria-hidden="true"><i>A</i><i>J</i><i>L</i></span><span>${t.family}</span></div></div><figcaption>${t.example}</figcaption></figure></section>
<div class="feature-ribbon"><div class="wrap">${t.ribbon.map((x) => `<span>${x}</span>`).join('<span class="ribbon-star" aria-hidden="true">*</span>')}</div></div>
<section id="everyday" class="section wrap"><div class="section-heading"><p class="eyebrow">${t.featureEyebrow}</p><h2>${lines(t.featureTitle)}</h2><p>${t.featureIntro}</p></div><div class="features-grid">${t.features.map((f, i) => `<article class="feature feature-${i}"><p class="eyebrow">0${i + 1} / ${f[0]}</p><div class="feature-art" aria-hidden="true">${i === 0 ? '<div class="art-widgets"><i></i><i></i><i></i><i></i></div>' : i === 1 ? `<div class="art-lists">${t.chips.map((c) => `<span>${c}<b>✓</b></span>`).join("")}</div>` : '<div class="art-note"><span>♡</span><i></i><i></i><i></i></div>'}</div><h3>${f[1]}</h3><p>${f[2]}</p></article>`).join("")}</div><div class="finance-strip"><div><p class="eyebrow">${t.financeLabel}</p><h3>${t.financeTitle}</h3></div><p>${t.financeText}</p></div></section>
<section id="tablet" class="tablet-section"><div class="wrap tablet-grid"><div class="tablet-illustration"><div class="tablet-device" aria-label="${t.example}"><div class="tablet-screen"><div class="photo-shapes" aria-hidden="true"><i></i><i></i><i></i></div><p>${t.tabletPhotos}</p><strong>${t.tabletGreeting}</strong><span class="pin-pill">•••• &nbsp; ${t.tabletPin}</span></div></div><span class="tablet-sticker">${lines(t.tabletSticker)}</span></div><div class="tablet-copy"><p class="eyebrow">${t.tabletEyebrow}</p><h2>${lines(t.tabletTitle)}</h2><p>${t.tabletText}</p><ol class="steps">${t.steps.map((s, i) => `<li><span>${i + 1}</span><div><strong>${s[0]}</strong><p>${s[1]}</p></div></li>`).join("")}</ol><a class="text-link" href="https://app.skendal.com/vincular">${t.tabletLink} ${arrow}</a></div></div></section>
<section id="plans" class="section wrap pricing-section"><div class="section-heading"><p class="eyebrow">${t.pricingEyebrow}</p><h2>${t.pricingTitle}</h2><p>${t.pricingIntro}</p></div><div class="pricing-cards" id="pricing-cards" hidden><article><span class="eyebrow">${t.monthly}</span><p class="price"><span id="monthly-price"></span><small>${t.perMonth}</small></p><p>${t.monthlyNote}</p><a class="button button-outline" href="${signup}">${t.ctaShort}</a></article><article><span class="eyebrow">${t.annual}</span><p class="price"><span id="annual-price"></span><small>${t.perYear}</small></p><p>${t.annualNote}</p><a class="button" href="${signup}">${t.ctaShort}</a></article></div><p class="caption" id="pricing-status" role="status">${t.priceFallback}</p></section>
<section id="questions" class="section wrap faq-grid"><div><p class="eyebrow">${t.faqEyebrow}</p><h2>${lines(t.faqTitle)}</h2></div><div class="faq-list">${t.faqs.map((f, i) => `<details ${i === t.faqs.length - 1 ? 'id="data"' : ""}><summary>${f[0]}</summary><p>${f[1]}</p></details>`).join("")}</div></section>
<section class="closing wrap"><img src="/assets/skendal-symbol.png" alt="" width="88" height="88" /><p class="eyebrow">${t.closingEyebrow}</p><h2>${lines(t.closingTitle)}</h2><a class="button" href="${signup}">${t.cta} ${arrow}</a><p class="availability">${t.availability}</p></section></main>
<footer class="wrap"><div>${brand(home)}<p>${t.footer}</p></div><div class="footer-links"><a href="#data">${t.data}</a><a href="https://app.skendal.com">${t.login}</a>${languages}</div><span>© ${new Date().getUTCFullYear()} Skendal</span></footer><script src="/pricing.js" defer></script></body></html>`;
}
for (const lang of ["en", "es"]) {
  const dir = lang === "en" ? "site" : "site/es";
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/index.html`, await format(page(lang), { ...formatting, parser: "html" }));
}
await writeFile(
  "site/kit/data.js",
  await format(`window.SKENDAL_CAMPAIGNS = ${JSON.stringify(campaigns)};`, {
    ...formatting,
    parser: "babel",
  }),
);
await writeFile(
  "site/sitemap.xml",
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://skendal.com/</loc></url><url><loc>https://skendal.com/es/</loc></url></urlset>\n',
);
async function inspect(dir) {
  for (const name of await readdir(dir)) {
    const p = `${dir}/${name}`,
      s = await stat(p);
    if (s.isDirectory()) await inspect(p);
    else if (s.size > 25 * 1024 * 1024) throw new Error(`Asset exceeds Free limit: ${p}`);
  }
}
await inspect("site");
for (const p of ["site/index.html", "site/es/index.html"])
  if ((await readFile(p, "utf8")).includes("undefined"))
    throw new Error(`Missing translation: ${p}`);
console.log("Built Skendal website in English and Spanish.");
