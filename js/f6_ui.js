/*
===============================================================================
WEBAPP — SPI/SPEI RH2
F6_UI.JS

Autor:
Daniel Rodrigues

Descrição
---------
Estados gerais da interface: overlay de carregamento, banner de erro,
legenda da rampa de cor do raster. Nenhum destes elementos é opcional —
o utilizador deve saber sempre se algo está a carregar, vazio, ou com
erro (ver `web-gis-developer.md`).
===============================================================================
*/

const UIModule = (() => {
  const overlay = document.getElementById("loading-overlay");
  const errorBanner = document.getElementById("error-banner");
  const legendEl = document.getElementById("raster-legend");
  const infoModal = document.getElementById("info-modal");
  const btnInfo = document.getElementById("btn-info");
  const btnInfoClose = document.getElementById("btn-info-close");

  function showLoading() {
    overlay.hidden = false;
  }

  function hideLoading() {
    overlay.hidden = true;
  }

  function showError(message) {
    errorBanner.textContent = `⚠ ${message}`;
    errorBanner.hidden = false;
    setTimeout(() => (errorBanner.hidden = true), 6000);
  }

  function renderLegend(variable = "risco", mode = "monthly") {
    if (variable === "risco") {
      const stops = APP.RISK_COLOR_STOPS;
      const gradient = stops.map((s) => `rgb(${s.color.join(",")}) ${s.at * 100}%`).join(", ");
      legendEl.innerHTML = `
        <div class="legend-bar" style="background: linear-gradient(90deg, ${gradient});"></div>
        <div class="legend-labels"><span>0 (baixo risco)</span><span>1 (alto risco)</span></div>
      `;
      return;
    }

    const label = variable === "spei" ? "SPEI" : "SPI";

    if (mode === "static") {
      // Climatológico de SPI/SPEI — frequência de seca (%), rampa
      // sequencial, não divergente (ver §18 — a média bruta do índice é
      // ~0 por construção, sem sinal espacial).
      const stops = APP.FREQ_COLOR_STOPS;
      const span = APP.FREQ_VALUE_MAX - APP.FREQ_VALUE_MIN;
      const gradient = stops
        .map((s) => `rgb(${s.color.join(",")}) ${((s.at - APP.FREQ_VALUE_MIN) / span) * 100}%`)
        .join(", ");
      legendEl.innerHTML = `
        <div class="legend-bar" style="background: linear-gradient(90deg, ${gradient});"></div>
        <div class="legend-labels"><span>0%</span><span>${label}: % de meses em seca</span><span>${APP.FREQ_VALUE_MAX * 100}%+</span></div>
      `;
      return;
    }

    // SPI/SPEI mensal — rampa divergente, posições normalizadas ao
    // domínio [INDEX_VALUE_MIN, INDEX_VALUE_MAX] (ver f1_config.js).
    const stops = APP.INDEX_COLOR_STOPS;
    const span = APP.INDEX_VALUE_MAX - APP.INDEX_VALUE_MIN;
    const gradient = stops
      .map((s) => `rgb(${s.color.join(",")}) ${((s.at - APP.INDEX_VALUE_MIN) / span) * 100}%`)
      .join(", ");
    legendEl.innerHTML = `
      <div class="legend-bar" style="background: linear-gradient(90deg, ${gradient});"></div>
      <div class="legend-labels"><span>${APP.INDEX_VALUE_MIN} (seca extrema)</span><span>${label}</span><span>+${APP.INDEX_VALUE_MAX} (muito húmido)</span></div>
    `;
  }

  function showInfo() {
    infoModal.hidden = false;
  }

  function hideInfo() {
    infoModal.hidden = true;
  }

  function wireInfoModal() {
    btnInfo.addEventListener("click", showInfo);
    btnInfoClose.addEventListener("click", hideInfo);
    infoModal.addEventListener("click", (e) => {
      if (e.target === infoModal) hideInfo(); // clicar fora do cartão fecha
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !infoModal.hidden) hideInfo();
    });
  }

  wireInfoModal();

  return { showLoading, hideLoading, showError, renderLegend, showInfo, hideInfo };
})();
