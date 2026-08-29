/*
===============================================================================
WEBAPP — SPI/SPEI RH2
F7_MAIN.JS

Autor:
Daniel Rodrigues

Descrição
---------
Bootstrap da aplicação: inicializa mapa e gráfico, carrega estações,
liga os controlos aos módulos de mapa/gráfico/raster, e mantém o
pequeno estado de sessão necessário (estação e série atualmente
selecionadas) — nenhum outro módulo guarda estado partilhado.
===============================================================================
*/

(function main() {
  let currentSeries = null;
  let rh2Series = null; // série global (RH2_MEDIA.json, §23) — carregada 1x, independente da estação selecionada
  let playTimer = null;
  let currentMonthlyDates = []; // [{date, url}, ...] da variável/escala mensal atualmente carregada
  let currentVariable = "risco"; // "risco" | "spi" | "spei" — o que o raster atual representa (legenda + tooltip)
  let rasterRequestId = 0; // evita que um pedido de raster antigo (lento) sobreponha um mais recente

  async function apiGet(path) {
    // SHOWCASE: cada rota é um ficheiro .json pré-gerado (ver f1_config.js).
    const res = await fetch(`${APP.API_BASE}${path}.json`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || `Erro ${res.status} em ${path}`);
    }
    return res.json();
  }

  function addStationMarkers(stations) {
    const layer = MapModule.getStationsLayer();
    layer.clearLayers();
    stations.forEach((s) => {
      if (s.latitude == null || s.longitude == null) return;
      const marker = L.circleMarker([s.latitude, s.longitude], {
        pane: APP.PANE_STATIONS, // sempre acima das isobandas/contorno — ver f1_config.js
        radius: 7,
        color: "#f8fafc",
        weight: 1.5,
        fillColor: RasterFillColor(s.indice_risco),
        fillOpacity: 0.95,
        className: "station-marker", // distingue dos polígonos de isobandas (ambos SVG <path>)
      });

      marker.bindTooltip(s.nome, { direction: "top", offset: [0, -6] });
      marker.bindPopup(`
        <div class="marker-popup">
          <b>${s.nome}</b> <span class="muted">(${s.station})</span>
          <table>
            <tr><td>Bacia</td><td>${s.bacia || "—"}</td></tr>
            <tr><td>Concelho</td><td>${s.concelho || "—"}</td></tr>
            <tr><td>Altitude</td><td>${s.altitude ?? "—"} m</td></tr>
            <tr><td>Índice de risco</td><td><b>${s.indice_risco != null ? s.indice_risco.toFixed(2) : "—"}</b> (1995–2025)</td></tr>
          </table>
        </div>
      `);

      marker.on("mouseover", () => marker.setStyle({ radius: 9, weight: 2 }));
      marker.on("mouseout", () => marker.setStyle({ radius: 7, weight: 1.5 }));
      marker.on("click", () => {
        ControlsModule.el.station.value = s.station;
        onStationChange();
      });
      layer.addLayer(marker);
    });
  }

  function RasterFillColor(indiceRisco) {
    if (indiceRisco == null) return "#9ca3af";
    const stops = APP.RISK_COLOR_STOPS;
    const v = Math.max(0, Math.min(1, indiceRisco));
    let i = 0;
    while (i < stops.length - 2 && v > stops[i + 1].at) i++;
    const a = stops[i], b = stops[i + 1];
    const t = (v - a.at) / (b.at - a.at || 1);
    const r = Math.round(a.color[0] + t * (b.color[0] - a.color[0]));
    const g = Math.round(a.color[1] + t * (b.color[1] - a.color[1]));
    const bl = Math.round(a.color[2] + t * (b.color[2] - a.color[2]));
    return `rgb(${r},${g},${bl})`;
  }

  async function onStationChange() {
    const station = ControlsModule.getSelectedStation();
    if (!station) return;
    try {
      UIModule.showLoading();
      currentSeries = await apiGet(`/series/${station}`);
      const stations = await apiGet("/stations");
      const meta = stations.find((s) => s.station === station);
      ControlsModule.setStationMeta(meta);
      renderChart();
    } catch (err) {
      UIModule.showError(err.message);
    } finally {
      UIModule.hideLoading();
    }
  }

  function renderChart() {
    // "RH2 (média)" (§23) — série global pré-calculada, independente da
    // estação selecionada (essa continua a controlar só o mapa). Se
    // ainda não chegou (pedido em paralelo no init(), pode não estar
    // pronta mesmo assim), não desenha nada em vez de mostrar dados de
    // outra série por engano.
    const source = ControlsModule.getChartSource();
    const series = source === "rh2" ? rh2Series : currentSeries;
    if (!series) return;
    const station = source === "rh2" ? "RH2 (média)" : ControlsModule.getSelectedStation();
    // "risco_spi"/"risco_pdsi" não têm série própria (são um resumo
    // estático, §22) — getChartIndex() mostra antes a série do índice
    // que alimenta o composto (ver f3_controls.js).
    const index = ControlsModule.getChartIndex();
    const scale = ControlsModule.getSelectedScale();
    ChartsModule.render(station, series, index, scale);
  }

  async function loadRaster() {
    stopPlayback();
    const myId = ++rasterRequestId;
    try {
      UIModule.showLoading();
      const mode = ControlsModule.getRasterMode();
      const variable = ControlsModule.getSelectedVariable(); // "risco" | "spi" | "spei"
      const scale = ControlsModule.getSelectedScale();
      currentVariable = variable;

      if (mode === "static") {
        currentMonthlyDates = [];
        // "Risco (composto)" no Climatológico usa o composto por escala
        // (raster_static_index → "risco_spei", §22), não o antigo
        // raster fixo em SPEI-48 (raster_static) — eram exatamente os
        // mesmos números quando Escala=48 (o "Risco composto — SPEI"
        // que existia antes disto era por isso 100% redundante com este
        // no caso Escala=48; removido, fundido aqui). SPI/SPEI/scPDSI
        // mostram a frequência de seca por escala (§18); os outros 2
        // "Risco composto" (SPI/scPDSI) já são a chave certa tal como
        // está (`variable` já é "risco_spi"/"risco_pdsi" nesses casos).
        const staticVariable = ControlsModule.getSelectedIndex() === "risco_mensal" ? "risco_spei" : variable;
        const meta = await RasterModule.loadStaticIndexMeta(staticVariable, scale);
        const geojson = await RasterModule.loadGeojson(meta.isoband_url);
        if (myId !== rasterRequestId) return; // superseded por um pedido mais recente
        RasterModule.render(geojson, variable, "static");
        UIModule.renderLegend(variable, "static");
      } else {
        const meta = await RasterModule.loadMonthlyMeta(variable, scale);
        if (myId !== rasterRequestId) return;
        currentMonthlyDates = meta.isoband_dates; // [{date, url}, ...]
        ControlsModule.setBandRange(currentMonthlyDates.length);
        UIModule.renderLegend(variable, "monthly");
        if (currentMonthlyDates.length) {
          await applyDate(currentMonthlyDates[0], myId);
        }
      }
    } catch (err) {
      UIModule.showError(err.message);
    } finally {
      if (myId === rasterRequestId) UIModule.hideLoading();
    }
  }

  async function applyDate(entry, myId) {
    const geojson = await RasterModule.loadGeojson(entry.url);
    if (myId !== rasterRequestId) return; // um pedido mais recente já venceu — descartar este
    RasterModule.render(geojson, currentVariable, "monthly"); // applyDate só é chamado pelo slider mensal
    ControlsModule.setBandDateLabel(entry.date);
  }

  async function onBandSliderInput() {
    const idx = ControlsModule.getBandIndex();
    const entry = currentMonthlyDates[idx];
    if (!entry) return;
    const myId = ++rasterRequestId;
    try {
      await applyDate(entry, myId);
    } catch (err) {
      if (myId === rasterRequestId) UIModule.showError(err.message);
    }
  }

  function stopPlayback() {
    playTimer = null;
    ControlsModule.el.playButton.textContent = "▶ Reproduzir";
  }

  async function playLoop(token) {
    // Auto-agendamento (não setInterval): espera cada ficheiro terminar de
    // carregar antes de avançar, para não acumular pedidos em atraso.
    while (playTimer === token) {
      const slider = ControlsModule.el.bandSlider;
      const next = (parseInt(slider.value, 10) + 1) % (parseInt(slider.max, 10) + 1);
      slider.value = String(next);
      await onBandSliderInput();
      await new Promise((r) => setTimeout(r, APP.PLAYBACK_INTERVAL_MS));
    }
  }

  function togglePlayback() {
    if (playTimer) {
      stopPlayback();
      return;
    }
    ControlsModule.el.playButton.textContent = "⏸ Pausar";
    const token = {};
    playTimer = token;
    playLoop(token);
  }

  function wireEvents() {
    ControlsModule.el.station.addEventListener("change", onStationChange);

    // Índice/Escala são partilhados pelo gráfico e pelo mapa, nos dois
    // modos — ver f3_controls.js e n4_PROJECT_REFERENCE.md §17/§18.
    // Mudar qualquer um dos dois atualiza sempre o gráfico E o raster:
    // "Evolução mensal" depende de Índice+Escala; "Climatológico"
    // também passou a depender do Índice desde §18 (risco continua
    // sempre risco, mas SPI/SPEI mostram a frequência de seca da escala
    // selecionada — loadRaster() já sabe resolver os dois casos).
    function onIndexOrScaleChange() {
      ControlsModule.updateScaleAvailability(); // scPDSI não tem escala — ver f3_controls.js
      ControlsModule.updateRasterModeAvailability(); // Risco composto (§22) só tem "Climatológico"
      renderChart();
      loadRaster();
    }
    ControlsModule.el.index.addEventListener("change", onIndexOrScaleChange);
    ControlsModule.el.scale.addEventListener("change", onIndexOrScaleChange);

    for (const radio of ControlsModule.el.rasterMode) {
      radio.addEventListener("change", () => {
        ControlsModule.updateMonthlyControlsVisibility();
        loadRaster();
      });
    }
    ControlsModule.el.bandSlider.addEventListener("input", onBandSliderInput);
    ControlsModule.el.playButton.addEventListener("click", togglePlayback);

    // "Esta estação" / "RH2 (média)" (§23) — só afeta o gráfico, o mapa
    // continua a seguir sempre a estação selecionada em "Estação".
    for (const radio of ControlsModule.el.chartSource) {
      radio.addEventListener("change", renderChart);
    }

    document.getElementById("btn-basemap").addEventListener("click", () => {
      const label = MapModule.cycleBasemap();
      document.getElementById("btn-basemap").textContent = `🗺 Mapa: ${label}`;
    });

    // Leaflet guarda o tamanho do contentor no momento em que o mapa é
    // criado — sem isto, rodar o telemóvel ou redimensionar a janela
    // (incluindo passar o breakpoint mobile de f6_ui.js) deixava as
    // tiles desalinhadas ou com uma faixa cinzenta. Debounce simples
    // (150ms) para não chamar em cada pixel do resize.
    let resizeTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => MapModule.getMap().invalidateSize(), 150);
    });
  }

  async function init() {
    MapModule.init();
    UIModule.renderLegend();
    wireEvents();

    try {
      UIModule.showLoading();
      const stations = await apiGet("/stations");
      ControlsModule.populateStations(stations);
      addStationMarkers(stations);
      if (stations.length) {
        ControlsModule.el.station.value = stations[0].station;
        await onStationChange();
      }
      await loadRaster();
    } catch (err) {
      UIModule.showError(`Falha ao iniciar a aplicação: ${err.message}`);
    } finally {
      UIModule.hideLoading();
    }

    // Série global (§23) — carregada à parte, sem bloquear o arranque
    // nem mostrar o overlay de "a carregar": só é preciso se/quando o
    // utilizador ligar "RH2 (média)"; uma falha aqui não deve impedir o
    // resto da app de funcionar.
    try {
      rh2Series = await apiGet("/series/RH2_MEDIA");
      if (ControlsModule.getChartSource() === "rh2") renderChart();
    } catch (err) {
      console.error("Falha ao carregar a série global RH2 (média):", err.message);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
