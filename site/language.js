// Language links work without JavaScript; preferences never gate the content.
(() => {
  try {
    const explicit = new URLSearchParams(location.search).get("lang");
    const stored = localStorage.getItem("skendal-site-language");
    if (explicit === "en" || explicit === "es")
      localStorage.setItem("skendal-site-language", explicit);
    if (location.pathname === "/" && explicit === "es") {
      location.replace("/es/");
      return;
    }
    if (location.pathname === "/" && explicit !== "en" && explicit !== "es") {
      const preferred = stored || (navigator.language.toLowerCase().startsWith("es") ? "es" : "en");
      if (preferred === "es") {
        location.replace("/es/");
        return;
      }
    }
  } catch {
    /* Content is available even when storage is blocked. */
  }
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-language]").forEach((link) =>
      link.addEventListener("click", () => {
        try {
          localStorage.setItem("skendal-site-language", link.dataset.language);
        } catch {
          /* Optional preference. */
        }
      }),
    );
  });
})();
