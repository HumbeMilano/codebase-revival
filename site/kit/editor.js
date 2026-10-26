(() => {
  const data = window.SKENDAL_CAMPAIGNS,
    params = new URLSearchParams(location.search);
  const pieces = ["launch", "lists", "tablet"],
    languages = ["en", "es"],
    formats = ["post", "story", "share"];
  const select = (id, allowed, fallback) => {
    const el = document.getElementById(id),
      v = params.get(id);
    el.value = allowed.includes(v) ? v : fallback;
    return el;
  };
  const language = select("language", languages, "es"),
    piece = select("piece", pieces, "launch"),
    format = select("format", formats, "post");
  if (params.get("export") === "1") document.documentElement.classList.add("export");
  const art = document.getElementById("artboard"),
    headline = document.getElementById("headline"),
    body = document.getElementById("body-copy"),
    caption = document.getElementById("caption");
  const key = () => `skendal-marketing:${piece.value}:${language.value}`;
  const check = () => {
    const box = document.querySelector(".poster-copy").getBoundingClientRect(),
      foot = art.querySelector("footer").getBoundingClientRect();
    document.getElementById("overflow-status").textContent =
      box.bottom > foot.top - 12
        ? "El texto es largo: acorta el titular o el texto breve antes de exportar."
        : "";
  };
  const update = () => {
    document.getElementById("poster-headline").textContent = headline.value;
    document.getElementById("poster-text").textContent = body.value;
    requestAnimationFrame(check);
  };
  const render = () => {
    const c = data[piece.value][language.value];
    art.className = `piece-${piece.value} format-${format.value}`;
    art.lang = language.value;
    document.querySelector(".preview-frame").className =
      `preview-frame format-${format.value}-frame`;
    headline.value = c.headline;
    body.value = c.text;
    caption.value = c.caption;
    if (params.get("export") !== "1")
      try {
        const draft = JSON.parse(localStorage.getItem(key()) || "null");
        if (draft && typeof draft.headline === "string" && typeof draft.text === "string") {
          headline.value = draft.headline.slice(0, 120);
          body.value = draft.text.slice(0, 220);
          if (typeof draft.caption === "string") caption.value = draft.caption;
        }
      } catch {
        /* Local drafts are optional. */
      }
    document.getElementById("poster-eyebrow").textContent = c.eyebrow;
    document.getElementById("poster-detail").textContent = c.detail;
    document.getElementById("poster-availability").textContent =
      language.value === "en" ? "App currently in Spanish" : "Registro sin tarjeta";
    document.getElementById("list-label-one").textContent =
      language.value === "en" ? "Groceries" : "Supermercado";
    document.getElementById("list-label-two").textContent =
      language.value === "en" ? "School" : "Colegio";
    art.setAttribute("aria-label", c.alt);
    const link = document.getElementById("original");
    link.href = `../assets/generated/${piece.value}-${language.value}-${format.value}.png`;
    link.download = `skendal-${piece.value}-${language.value}-${format.value}.png`;
    document.getElementById("copy-status").textContent = "";
    update();
  };
  for (const el of [language, piece, format]) el.addEventListener("change", render);
  for (const el of [headline, body, caption])
    el.addEventListener("input", () => {
      update();
      try {
        localStorage.setItem(
          key(),
          JSON.stringify({ headline: headline.value, text: body.value, caption: caption.value }),
        );
      } catch {
        /* Optional local draft. */
      }
    });
  document.getElementById("reset").addEventListener("click", () => {
    try {
      localStorage.removeItem(key());
    } catch {
      /* Optional local draft. */
    }
    render();
  });
  document.getElementById("save-pdf").addEventListener("click", () => {
    update();
    window.print();
  });
  document.getElementById("copy-caption").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(caption.value);
      document.getElementById("copy-status").textContent = "Texto copiado.";
    } catch {
      caption.focus();
      caption.select();
      document.getElementById("copy-status").textContent =
        "Texto seleccionado. Utiliza Copiar en tu dispositivo.";
    }
  });
  render();
  document.fonts.ready.then(check);
})();
