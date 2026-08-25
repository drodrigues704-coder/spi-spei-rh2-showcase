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

    const labels = { spi: "SPI", spei: "SPEI", pdsi: "scPDSI" };
    const label = labels[variable] || variable;

    if (mode === "static") {
      // Climatológico de SPI/SPEI/PDSI — frequência de seca (%), rampa
      // sequencial, não divergente (ver §18 — a média bruta do índice é
      // ~0 por construção, sem sinal espacial). scPDSI usa a sua própria
      // escala (0-80%, não 0-30%): tem memória/autocorrelação (ao
      // contrário do SPI/SPEI, ~independentes mês a mês), por isso fica
      // muito mais tempo consecutivo em seca uma vez que lá entra — ver
      // p1_config.py e n4_PROJECT_REFERENCE.md §21.
      const stops = variable === "pdsi" ? APP.PDSI_FREQ_COLOR_STOPS : APP.FREQ_COLOR_STOPS;
      const freqMax = variable === "pdsi" ? APP.PDSI_FREQ_VALUE_MAX : APP.FREQ_VALUE_MAX;
      const freqMin = variable === "pdsi" ? APP.PDSI_FREQ_VALUE_MIN : APP.FREQ_VALUE_MIN;
      const span = freqMax - freqMin;
      const gradient = stops
        .map((s) => `rgb(${s.color.join(",")}) ${((s.at - freqMin) / span) * 100}%`)
        .join(", ");
      legendEl.innerHTML = `
        <div class="legend-bar" style="background: linear-gradient(90deg, ${gradient});"></div>
        <div class="legend-labels"><span>0%</span><span>${label}: % de meses em seca</span><span>${freqMax * 100}%+</span></div>
      `;
      return;
    }

    // Mensal — rampa divergente, posições normalizadas ao domínio
    // próprio da variável (SPI/SPEI: ±3, McKee; scPDSI: ±4, Palmer —
    // ver f1_config.js, os stops não são intercambiáveis entre os dois).
    const stops = variable === "pdsi" ? APP.PDSI_COLOR_STOPS : APP.INDEX_COLOR_STOPS;
    const valueMin = variable === "pdsi" ? APP.PDSI_VALUE_MIN : APP.INDEX_VALUE_MIN;
    const valueMax = variable === "pdsi" ? APP.PDSI_VALUE_MAX : APP.INDEX_VALUE_MAX;
    const span = valueMax - valueMin;
    const gradient = stops
      .map((s) => `rgb(${s.color.join(",")}) ${((s.at - valueMin) / span) * 100}%`)
      .join(", ");
    legendEl.innerHTML = `
      <div class="legend-bar" style="background: linear-gradient(90deg, ${gradient});"></div>
      <div class="legend-labels"><span>${valueMin} (seca extrema)</span><span>${label}</span><span>+${valueMax} (muito húmido)</span></div>
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
