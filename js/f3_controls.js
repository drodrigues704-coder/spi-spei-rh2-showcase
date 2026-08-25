/*
===============================================================================
WEBAPP — SPI/SPEI RH2
F3_CONTROLS.JS

Autor:
Daniel Rodrigues

Descrição
---------
Controlos da interface: seletor de estação, índice, escala e modo de
raster (climatológico/mensal) e slider de banda/data. "Índice" e
"Escala" são partilhados pelo gráfico e pelo mapa em modo "Evolução
mensal" (ver docs/ai-team/n4_PROJECT_REFERENCE.md §17 — antes o mapa
tinha o seu próprio seletor de escala, independente). Só lê/escreve o
DOM — não sabe nada sobre a API nem sobre Leaflet/Chart.js.
===============================================================================
*/

const ControlsModule = (() => {
  const el = {
    station: document.getElementById("ctl-station"),
    stationMeta: document.getElementById("station-meta"),
    index: document.getElementById("ctl-index"),
    scale: document.getElementById("ctl-scale"),
    rasterMode: document.getElementsByName("raster-mode"),
    monthlyControls: document.getElementById("monthly-controls"),
    bandSlider: document.getElementById("ctl-band-slider"),
    bandDateLabel: document.getElementById("band-date-label"),
    playButton: document.getElementById("btn-play"),
  };

  function populateStations(stations) {
    const ordenadas = [...stations].sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
    el.station.innerHTML = ordenadas
      .map((s) => `<option value="${s.station}">${s.nome} (${s.station})</option>`)
      .join("");
  }

  function getSelectedStation() {
    return el.station.value;
  }

  function setStationMeta(station) {
    if (!station) {
      el.stationMeta.innerHTML = "";
      return;
    }
    el.stationMeta.innerHTML = `
      <div class="meta-row"><span>Bacia</span><b>${station.bacia || "—"}</b></div>
      <div class="meta-row"><span>Concelho</span><b>${station.concelho || "—"}</b></div>
      <div class="meta-row"><span>Altitude</span><b>${station.altitude ?? "—"} m</b></div>
      <div class="meta-row"><span>Índice de risco (1995–2025)</span><b>${
        station.indice_risco != null ? station.indice_risco.toFixed(2) : "—"
      }</b></div>
    `;
  }

  // "risco_spi"/"risco_pdsi" — Índice de Risco composto por
  // índice/escala (§22), adicional ao "risco_mensal" de sempre. Não há
  // "risco_spei" próprio: seria 100% redundante com "risco_mensal" no
  // modo Climatológico (a mesma fórmula, o mesmo SPEI) — em vez de 2
  // entradas a mostrar exatamente o mesmo quando Escala=48, fundidas
  // numa só (ver getSelectedVariable() e f7_main.js::loadRaster()).
  // "risco_spi"/"risco_pdsi" só existem em modo "static" (climatológico)
  // — não têm evolução mensal própria, ver
  // updateRasterModeAvailability() abaixo.
  const RISCO_COMPOSTO_INDICES = ["risco_spi", "risco_pdsi"];

  function getSelectedIndex() {
    return el.index.value; // "spi" | "spei" | "pdsi" | "risco_mensal" | "risco_spi" | "risco_pdsi"
  }

  // O mapa fala de "risco" (a API é /raster/monthly/{risco|spi|spei|pdsi}/{escala}
  // no modo mensal; no modo climatológico, "risco_mensal" passa antes a
  // "risco_spei" — ver f7_main.js::loadRaster(), § 22), o gráfico/séries
  // falam de "risco_mensal" (a mesma chave de data/series/<estação>.json)
  // — única tradução entre os dois vocabulários. "risco_spi"/
  // "risco_pdsi" não precisam de tradução — já são a própria chave
  // usada em catalog.json → raster_static_index.
  function getSelectedVariable() {
    const index = getSelectedIndex();
    return index === "risco_mensal" ? "risco" : index;
  }

  // O gráfico não tem uma série própria para "risco_spi"/"risco_pdsi"
  // (são um resumo estático, não uma série mensal) — mostra antes a
  // série do índice que alimenta o composto (SPI/scPDSI), que já existe
  // e dá contexto útil sobre o que está a gerar aquele risco.
  // "risco_mensal" continua a mostrar a sua própria série (SPEI).
  function getChartIndex() {
    const index = getSelectedIndex();
    if (index === "risco_spi") return "spi";
    if (index === "risco_pdsi") return "pdsi";
    return index;
  }

  // scPDSI não tem escalas (é inerentemente mensal, sem acumulação —
  // ver p1_config.py::PDSI_SCALES e n4_PROJECT_REFERENCE.md §21) — a
  // API só tem a combinação pdsi/1 (e, pela mesma razão, risco_pdsi/1).
  // Ignora o que estiver selecionado no seletor de Escala e força 1, em
  // vez de deixar pedir uma escala que não existe (404).
  // `updateScaleAvailability()` também desativa visualmente o seletor,
  // para não sugerir uma escolha sem efeito.
  function getSelectedScale() {
    if (getSelectedIndex() === "pdsi" || getSelectedIndex() === "risco_pdsi") return 1;
    return parseInt(el.scale.value, 10);
  }

  function updateScaleAvailability() {
    const index = getSelectedIndex();
    el.scale.disabled = index === "pdsi" || index === "risco_pdsi";
  }

  // "risco_spi"/"risco_pdsi" só existem em modo "static" (climatológico)
  // — não há raster mensal próprio para eles (§22).
  // Desativa visualmente o rádio "Evolução mensal" e força "static" se
  // estava selecionado, em vez de deixar pedir uma combinação que não
  // existe (404) — mesmo espírito de updateScaleAvailability() acima.
  function updateRasterModeAvailability() {
    const isRiscoComposto = RISCO_COMPOSTO_INDICES.includes(getSelectedIndex());
    for (const radio of el.rasterMode) {
      radio.disabled = isRiscoComposto && radio.value === "monthly";
    }
    if (isRiscoComposto && getRasterMode() === "monthly") {
      for (const radio of el.rasterMode) {
        if (radio.value === "static") radio.checked = true;
      }
      updateMonthlyControlsVisibility();
    }
  }

  function getRasterMode() {
    for (const radio of el.rasterMode) {
      if (radio.checked) return radio.value; // "static" | "monthly"
    }
    return "static";
  }

  function updateMonthlyControlsVisibility() {
    el.monthlyControls.hidden = getRasterMode() !== "monthly";
  }

  function setBandRange(count) {
    el.bandSlider.max = String(Math.max(count - 1, 0));
    el.bandSlider.value = "0";
  }

  function getBandIndex() {
    return parseInt(el.bandSlider.value, 10);
  }

  function setBandDateLabel(dateStr) {
    el.bandDateLabel.textContent = dateStr || "—";
  }

  return {
    el,
    populateStations,
    getSelectedStation,
    setStationMeta,
    getSelectedIndex,
    getSelectedVariable,
    getChartIndex,
    getSelectedScale,
    updateScaleAvailability,
    updateRasterModeAvailability,
    getRasterMode,
    updateMonthlyControlsVisibility,
    setBandRange,
    getBandIndex,
    setBandDateLabel,
  };
})();
