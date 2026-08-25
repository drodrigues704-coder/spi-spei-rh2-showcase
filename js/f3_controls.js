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

  function getSelectedIndex() {
    return el.index.value; // "spi" | "spei" | "risco_mensal"
  }

  // O mapa fala de "risco" (a API é /raster/monthly/{risco|spi|spei}/{escala}),
  // o gráfico/séries falam de "risco_mensal" (a mesma chave de
  // data/series/<estação>.json) — única tradução entre os dois vocabulários.
  function getSelectedVariable() {
    const index = getSelectedIndex();
    return index === "risco_mensal" ? "risco" : index;
  }

  function getSelectedScale() {
    return parseInt(el.scale.value, 10);
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
    getSelectedScale,
    getRasterMode,
    updateMonthlyControlsVisibility,
    setBandRange,
    getBandIndex,
    setBandDateLabel,
  };
})();
