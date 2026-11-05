/*
===============================================================================
WEBAPP — SPI/SPEI RH2
F7_MAIN.JS

Autor:
Daniel Rodrigues

Descrição
---------
Bootstrap da aplicação: inicializa mapa e gráfico, carrega estações,
liga os controlos aos módulos de mapa/gráfico/raster/faixa, e mantém o
pequeno estado de sessão necessário (estação, série e `view`: modo e
data do mapa) — nenhum outro módulo guarda estado partilhado.
===============================================================================
*/

(function main() {
  let currentSeries = null;
  let rh2Series = null; // série global (RH2_MEDIA.json, §23) — carregada 1x, independente da estação selecionada
  let rh2State = "loading"; // "loading" | "ok" | "failed"
  let stationCount = null;
  let playTimer = null;
  let rasterRequestId = 0; // evita que um pedido de raster antigo (lento) sobreponha um mais recente

  // A data é o estado; a posição do slider é só uma leitura dela. Junção
  // sempre por data, nunca por índice de lista: as combinações têm
  // calendários diferentes (SPI-48 começa em 1998-12, SPI-48 não tem mapa
  // em 2006-01) e isso vem dos dados, não deste código.
  const view = { mode: "climatology", date: null }; // mode: "climatology" | "month"
  let urlReady = false; // o URL só se escreve depois de se ler o que trazia
  let viewError = ""; // última falha ao desenhar uma vista; limpa-se no pedido seguinte
  let rendered = null; // o que está de facto desenhado no mapa — única fonte do título
  let monthly = { key: null, state: "none", dates: [], urlByDate: new Map() };
  const monthlyMetaCache = new Map(); // "variável/escala" -> Promise dos metadados
  const seriesMapCache = new Map(); // "índice/escala" -> Map(date -> value)

  async function apiGet(path) {
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
        ...MARKER_STYLE,
        className: "station-marker", // distingue dos polígonos de isobandas (ambos SVG <path>)
      });
      markers.set(s.station, marker);

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

      const choose = () => {
        ControlsModule.el.station.value = s.station;
        onStationChange();
      };
      marker.on("mouseover", () => marker.setStyle({ radius: MARKER_SELECTED.radius }));
      marker.on("mouseout", () => marker.setStyle(markerStyleFor(s.station)));
      marker.on("click", choose);
      layer.addLayer(marker);
      const element = marker.getElement();
      if (element) {
        element.setAttribute("role", "button");
        element.setAttribute("tabindex", "0");
        element.setAttribute("aria-label", `Estação ${s.nome}, ${s.concelho || s.bacia || "RH2"}. Selecionar.`);
        element.addEventListener("keydown", (event) => {
          if (event.key === "Escape") marker.closePopup();
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.stopPropagation();
          choose();
          marker.openPopup();
        });
      }
    });
    highlightStation();
  }

  // Marcadores neutros: as cores do mapa pertencem ao índice escolhido. Só se
  // distingue a estação selecionada, a que o painel e o gráfico estão a mostrar.
  const MARKER_STYLE = { radius: 6, color: "#f8fafc", weight: 1.5, fillColor: "#221b14", fillOpacity: 0.9 };
  const MARKER_SELECTED = { radius: 9, color: "#221b14", weight: 2.5, fillColor: "#f8fafc", fillOpacity: 1 };
  const markers = new Map();
  const markerStyleFor = (station) => (station === ControlsModule.getSelectedStation() ? MARKER_SELECTED : MARKER_STYLE);

  function highlightStation() {
    const selected = ControlsModule.getSelectedStation();
    markers.forEach((marker, station) => marker.setStyle(markerStyleFor(station)));
    // bringToFront volta a inserir o elemento no SVG: com foco de teclado, isso
    // tirava-lhe o foco e baralhava a ordem de Tab entre as estações.
    const marker = markers.get(selected);
    if (!marker?.getElement()?.matches(":focus-visible")) marker?.bringToFront();
  }

  // Uma resposta atrasada de outra estação não pode ficar com o nome desta.
  let stationRequestId = 0;

  async function onStationChange() {
    const station = ControlsModule.getSelectedStation();
    if (!station) return;
    const myId = ++stationRequestId;
    highlightStation();
    syncUrl();
    try {
      UIModule.showLoading();
      const series = await apiGet(`/series/${station}`);
      const stations = await apiGet("/stations");
      if (myId !== stationRequestId) return;
      currentSeries = series;
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

  // Estado no URL, para partilhar uma vista exata. Lê-se uma vez, no arranque.
  function readUrlState() {
    const params = new URLSearchParams(location.search);
    const has = (select, value) => value != null && [...select.options].some((o) => o.value === value);
    if (has(ControlsModule.el.index, params.get("indice"))) ControlsModule.el.index.value = params.get("indice");
    if (has(ControlsModule.el.scale, params.get("escala"))) ControlsModule.el.scale.value = params.get("escala");
    ControlsModule.updateScaleAvailability();
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(params.get("mes") || "")) {
      view.mode = "month";
      view.date = `${params.get("mes")}-01`;
    }
    if (params.get("grafico") === "rh2") document.querySelector('input[name="chart-source"][value="rh2"]').checked = true;
    return { station: params.get("estacao") };
  }

  // Agrupado porque o Safari recusa mais de 100 replaceState em 10 s, e arrastar
  // o slider chega lá. O URL é uma conveniência: nunca pode travar o desenho.
  let urlTimer = null;

  function syncUrl() {
    if (!urlReady) return;
    clearTimeout(urlTimer);
    urlTimer = setTimeout(writeUrl, 200);
  }

  function writeUrl() {
    const sel = readSelection();
    const params = new URLSearchParams({ indice: sel.index });
    if (sel.index !== "pdsi" && sel.index !== "risco_pdsi") params.set("escala", sel.scale);
    if (view.mode === "month" && view.date) params.set("mes", view.date.slice(0, 7));
    const station = ControlsModule.getSelectedStation();
    if (station) params.set("estacao", station);
    if (ControlsModule.getChartSource() === "rh2") params.set("grafico", "rh2");
    try {
      history.replaceState(null, "", `${location.pathname}?${params}`);
    } catch (err) {
      console.warn("URL não atualizado:", err);
    }
  }

  function readSelection() {
    return {
      index: ControlsModule.getSelectedIndex(),
      variable: ControlsModule.getSelectedVariable(),
      scale: ControlsModule.getSelectedScale(),
    };
  }

  function seriesMap(key, scale) {
    if (!rh2Series || !Array.isArray(rh2Series[key])) return null;
    const cacheKey = `${key}/${scale}`;
    if (!seriesMapCache.has(cacheKey)) {
      const map = new Map();
      rh2Series[key].forEach((e) => {
        if (e.scale === scale) map.set(e.date, e.value);
      });
      seriesMapCache.set(cacheKey, map);
    }
    return seriesMapCache.get(cacheKey);
  }

  function periodFor(sel) {
    const base = APP.RISK_BASE_INDEX[sel.index] || sel.index;
    const fromSeries = seriesMap(base, sel.scale);
    const dates = fromSeries && fromSeries.size ? [...fromSeries.keys()].sort() : monthly.dates;
    if (!dates || !dates.length) return null;
    return `${dates[0].slice(0, 4)}–${dates[dates.length - 1].slice(0, 4)}`;
  }

  // O título só muda depois do render e descreve sempre `rendered`.
  function updateTitle() {
    if (!rendered) return;
    const values = seriesMap(rendered.index, rendered.scale);
    TimelineModule.setTitle(
      TimelineModule.buildTitle(rendered, {
        period: periodFor(rendered),
        value: rendered.date && values ? values.get(rendered.date) : null,
        nStations: stationCount,
        info: rendered.date ? monthInfoFor(rendered.index, rendered.scale)?.[rendered.date] : null,
      })
    );
  }

  // month_info é opcional: enquanto o pipeline não o produzir, é sempre null.
  function monthInfoFor(index, scale) {
    const key = APP.RISK_BASE_INDEX[index] || index;
    return rh2Series?.month_info?.[key]?.[scale] ?? null;
  }

  // A faixa mostra o índice da seleção; "risco_mensal" mostra o risco do mês
  // na rampa do mapa, com a confiança do SPEI de que deriva. Os compostos sem
  // mensal substituem a faixa.
  function refreshTimeline() {
    const sel = readSelection();
    ChartsModule.setCursor(view.mode === "month" ? view.date : null);
    syncUrl();
    if (!ControlsModule.hasMonthlyView()) {
      TimelineModule.update({
        mode: "climatology",
        date: null,
        composite: {
          name: ControlsModule.getSelectedIndexLabel(),
          period: periodFor(sel) || `${APP.CALENDAR_START_YEAR}–${APP.CALENDAR_END_YEAR}`,
          target: APP.RISK_BASE_INDEX[sel.index],
        },
        warning: viewError,
      });
      return;
    }
    const isRisk = sel.index === "risco_mensal";
    const key = isRisk ? "spei" : sel.index;
    const label = TimelineModule.indexLabel(key, sel.scale);
    let warning = "";
    if (viewError) {
      warning = viewError;
    } else if (monthly.state === "failed") {
      warning = "Não foi possível carregar os meses deste índice: a climatologia continua disponível. Recarrega a página para tentar de novo.";
    } else if (rh2State === "failed") {
      warning = "Não foi possível carregar a série RH2: a faixa mostra só o calendário dos mapas, sem cores. Recarrega a página para tentar de novo.";
    }
    TimelineModule.update({
      mode: view.mode,
      date: view.date,
      composite: null,
      key,
      scale: sel.scale,
      indexLabel: isRisk ? `Risco (${label})` : label,
      stripLabel: isRisk ? `Risco do mês (${label})` : label,
      classes: key === "pdsi" ? APP.PDSI_CLASSES : APP.DROUGHT_CLASSES,
      ramp: isRisk ? APP.RISK_COLOR_STOPS : null,
      values: seriesMap(isRisk ? "risco_mensal" : key, sel.scale),
      available: monthly.dates,
      monthsState: monthly.state,
      seriesState: rh2State,
      monthInfo: monthInfoFor(sel.index, sel.scale),
      episodes: isRisk ? null : rh2Series?.episodes,
      nStations: stationCount,
      warning,
    });
  }

  // Metadados mensais: carregam também na climatologia (o slider precisa
  // do calendário), mas nunca para os compostos, que não têm vista mensal.
  // Nunca rejeita — uma falha aqui não pode derrubar o mapa estático.
  // Guardados por seleção: não mutam o mapa, por isso não precisam do
  // rasterRequestId, só de não sobrepor uma seleção mais recente.
  async function loadMonthly(sel) {
    const key = `${sel.variable}/${sel.scale}`;
    if (monthly.key === key && monthly.state === "ok") return true;
    monthly = { key, state: "loading", dates: [], urlByDate: new Map() };
    refreshTimeline();
    try {
      if (!monthlyMetaCache.has(key)) {
        monthlyMetaCache.set(key, RasterModule.loadMonthlyMeta(sel.variable, sel.scale));
      }
      const meta = await monthlyMetaCache.get(key);
      if (monthly.key !== key) return false;
      const entries = meta.isoband_dates || [];
      monthly = {
        key,
        state: "ok",
        dates: entries.map((e) => e.date).sort(),
        urlByDate: new Map(entries.map((e) => [e.date, e.url])),
      };
      refreshTimeline();
      updateTitle();
      return true;
    } catch (err) {
      monthlyMetaCache.delete(key);
      if (monthly.key === key) {
        monthly = { key, state: "failed", dates: [], urlByDate: new Map() };
        refreshTimeline();
      }
      console.warn("Falha ao carregar os meses do mapa:", err.message);
      return false;
    }
  }

  async function showClimatology(sel, myId) {
    // "Risco composto — SPEI" no Climatológico usa o composto por escala
    // (raster_static_index → "risco_spei", §22). SPI/SPEI/scPDSI mostram a
    // frequência de seca por escala (§18); os outros 2 "Risco composto"
    // já são a chave certa tal como está.
    const staticVariable = sel.index === "risco_mensal" ? "risco_spei" : sel.variable;
    const meta = await RasterModule.loadStaticIndexMeta(staticVariable, sel.scale);
    const geojson = await RasterModule.loadGeojson(meta.isoband_url);
    if (myId !== rasterRequestId) return false; // superseded por um pedido mais recente
    RasterModule.render(geojson, sel.variable, "static");
    UIModule.renderLegend(sel.variable, "static");
    rendered = { ...sel, mode: "climatology", date: null };
    updateTitle();
    return true;
  }

  async function showMonth(sel, date, myId) {
    const geojson = await RasterModule.loadGeojson(monthly.urlByDate.get(date));
    if (myId !== rasterRequestId) return false; // um pedido mais recente já venceu — descartar este
    RasterModule.render(geojson, sel.variable, "monthly");
    UIModule.renderLegend(sel.variable, "monthly");
    rendered = { ...sel, mode: "month", date };
    updateTitle();
    return true;
  }

  // Mudança de seleção ou de vista: tudo passa por aqui e pela guarda.
  async function loadView() {
    stopPlayback();
    const myId = ++rasterRequestId;
    viewError = "";
    const sel = readSelection();
    let leftMonth = false;
    try {
      UIModule.showLoading();
      const hasMonthly = ControlsModule.hasMonthlyView();
      if (!hasMonthly) {
        monthly = { key: null, state: "none", dates: [], urlByDate: new Map() };
        if (view.mode === "month") {
          setClimatologyView();
          leftMonth = true;
        }
      }
      refreshTimeline();
      const metaReady = hasMonthly ? loadMonthly(sel) : Promise.resolve(false);

      if (view.mode === "month") {
        const ok = await metaReady;
        if (myId !== rasterRequestId) return;
        if (ok && monthly.dates.length) {
          const wanted = view.date || monthly.dates[monthly.dates.length - 1];
          const resolved = TimelineModule.resolveDate(wanted, monthly.dates, 0);
          if (view.date && resolved !== view.date) announceJump(sel, view.date, resolved);
          view.date = resolved;
          refreshTimeline();
          await showMonth(sel, resolved, myId);
          return;
        }
        setClimatologyView();
        TimelineModule.announce("Não foi possível carregar os meses deste índice. A mostrar a climatologia.");
        refreshTimeline();
      }
      await showClimatology(sel, myId);
      if (leftMonth && myId === rasterRequestId) {
        TimelineModule.announce(`O ${ControlsModule.getSelectedIndexLabel()} não tem valor mês a mês. A mostrar a climatologia.`);
      }
    } catch (err) {
      if (myId === rasterRequestId) {
        UIModule.showError(err.message);
        // O mapa continua o anterior: o estado volta a descrevê-lo, e pedir
        // de novo a mesma vista volta a fazer o pedido.
        if (rendered) {
          view.mode = rendered.mode;
          view.date = rendered.date;
        }
        if (rendered) {
          viewError = "Não foi possível carregar este mapa: continua a ver o que está indicado no título. Escolhe outra opção ou outro mês para tentar de novo.";
        } else {
          viewError = "Não foi possível carregar o mapa. Recarrega a página para tentar de novo.";
          TimelineModule.setTitle("Mapa indisponível");
          UIModule.renderLegend(sel.variable, "static");
        }
        refreshTimeline();
      }
    } finally {
      if (myId === rasterRequestId) UIModule.hideLoading();
    }
  }

  function setClimatologyView() {
    view.mode = "climatology";
    view.date = null;
  }

  function announceJump(sel, wanted, resolved) {
    const label =
      sel.index === "risco_mensal"
        ? `O Risco do ${TimelineModule.indexLabel("spei", sel.scale)}`
        : TimelineModule.indexLabel(sel.index, sel.scale);
    const first = monthly.dates[0];
    const last = monthly.dates[monthly.dates.length - 1];
    const shown = TimelineModule.monthText(resolved);
    if (wanted < first) TimelineModule.announce(`${label} só começa em ${TimelineModule.monthText(first)}. A mostrar ${shown}.`);
    else if (wanted > last) TimelineModule.announce(`${label} só vai até ${TimelineModule.monthText(last)}. A mostrar ${shown}.`);
    else TimelineModule.announce(`${label} não tem mapa em ${TimelineModule.monthText(wanted)}. A mostrar ${shown}.`);
  }

  // Um mês escolhido na faixa, nos botões, num episódio ou pela reprodução.
  async function selectMonth(date, { fromPlayback = false, keepAnnouncement = false } = {}) {
    if (!fromPlayback) stopPlayback();
    const myId = ++rasterRequestId;
    viewError = "";
    view.mode = "month";
    view.date = date;
    if (!fromPlayback && !keepAnnouncement) TimelineModule.announce("");
    refreshTimeline();
    try {
      return await showMonth(readSelection(), date, myId);
    } catch (err) {
      if (myId !== rasterRequestId) return false;
      UIModule.showError(err.message);
      stopPlayback();
      // O mapa não mudou: o slider volta ao que está desenhado.
      if (rendered) {
        view.mode = rendered.mode;
        view.date = rendered.date;
        refreshTimeline();
      }
      return false;
    } finally {
      if (myId === rasterRequestId) UIModule.hideLoading();
    }
  }

  function stopPlayback() {
    playTimer = null;
    TimelineModule.setPlaying(false);
  }

  async function playLoop(token) {
    // Auto-agendamento (não setInterval): espera cada ficheiro terminar de
    // carregar antes de avançar, para não acumular pedidos em atraso. Só
    // itera meses com mapa.
    while (playTimer === token) {
      const dates = monthly.dates;
      if (!dates.length) break;
      const position = view.date ? dates.indexOf(view.date) : -1;
      const next = dates[(position + 1) % dates.length];
      await selectMonth(next, { fromPlayback: true });
      await new Promise((r) => setTimeout(r, APP.PLAYBACK_INTERVAL_MS));
    }
  }

  function togglePlayback() {
    if (playTimer) {
      stopPlayback();
      return;
    }
    TimelineModule.setPlaying(true);
    TimelineModule.announce("");
    const token = {};
    playTimer = token;
    playLoop(token);
  }

  function goToEpisode(date) {
    const resolved = TimelineModule.resolveDate(date, monthly.dates, 0);
    if (!resolved) return;
    const moved = resolved !== date;
    if (moved) announceJump(readSelection(), date, resolved);
    selectMonth(resolved, { keepAnnouncement: moved });
  }

  function wireEvents() {
    ControlsModule.el.station.addEventListener("change", onStationChange);

    // Índice/Escala são partilhados pelo gráfico, pelo mapa e pela faixa,
    // nas duas vistas — ver f3_controls.js e n4_PROJECT_REFERENCE.md §17/§18.
    // A data mantém-se ao mudar: ver loadView().
    function onIndexOrScaleChange() {
      ControlsModule.updateScaleAvailability(); // scPDSI não tem escala — ver f3_controls.js
      TimelineModule.announce("");
      renderChart();
      loadView();
    }
    ControlsModule.el.index.addEventListener("change", onIndexOrScaleChange);
    ControlsModule.el.scale.addEventListener("change", onIndexOrScaleChange);

    TimelineModule.init({
      onSelect: (date) => selectMonth(date),
      onEpisode: goToEpisode,
      onPointerStart: stopPlayback,
      onPlayToggle: togglePlayback,
      onClimatology: () => {
        if (view.mode === "climatology") return;
        setClimatologyView();
        TimelineModule.announce("");
        loadView();
      },
      onCompositeTarget: (index) => {
        // O botão promete "mês a mês": abre no mês mais recente desse índice.
        ControlsModule.el.index.value = index;
        view.mode = "month";
        view.date = null;
        TimelineModule.requestSliderFocus();
        onIndexOrScaleChange();
      },
    });

    // "Esta estação" / "RH2 (média)" (§23) — só afeta o gráfico, o mapa
    // continua a seguir sempre a estação selecionada em "Estação".
    for (const radio of ControlsModule.el.chartSource) {
      radio.addEventListener("change", () => {
        renderChart();
        syncUrl();
      });
    }

    document.getElementById("btn-basemap").addEventListener("click", () => {
      const label = MapModule.cycleBasemap();
      document.getElementById("btn-basemap").textContent = `Mapa: ${label}`;
    });

    // Leaflet guarda o tamanho do contentor no momento em que o mapa é
    // criado. O contentor agora também muda quando o título ou a faixa mudam
    // de altura, não só com a janela — daí observar o próprio #map. Debounce
    // simples (150ms) para não chamar em cada pixel.
    let resizeTimer = null;
    new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => MapModule.refreshSize(), 150);
    }).observe(document.getElementById("map"));
  }

  async function init() {
    MapModule.init();
    UIModule.renderLegend();
    wireEvents();

    // Série global (§23): arranca em paralelo com o resto, sem bloquear o
    // arranque nem mostrar o overlay. Uma falha aqui não impede a app de
    // funcionar — a faixa fica sem cores e o título sem valores.
    apiGet("/series/RH2_MEDIA")
      .then((series) => {
        rh2Series = series;
        rh2State = "ok";
        seriesMapCache.clear();
        if (ControlsModule.getChartSource() === "rh2") renderChart();
      })
      .catch((err) => {
        rh2State = "failed";
        console.warn("Falha ao carregar a série global RH2 (média):", err.message);
      })
      .finally(() => {
        refreshTimeline();
        updateTitle();
      });

    const urlState = readUrlState();
    ChartsModule.setDateHandler((date) => {
      if (!ControlsModule.hasMonthlyView() || !monthly.dates.length) return;
      goToEpisode(date);
    }, () => ControlsModule.hasMonthlyView());

    try {
      UIModule.showLoading();
      const stations = await apiGet("/stations");
      stationCount = stations.length;
      refreshTimeline();
      ControlsModule.populateStations(stations);
      addStationMarkers(stations);
      if (stations.length) {
        const fromUrl = stations.some((s) => s.station === urlState.station);
        ControlsModule.el.station.value = fromUrl ? urlState.station : stations[0].station;
        urlReady = true;
        await onStationChange();
      }
      await loadView();
    } catch (err) {
      UIModule.showError(`Falha ao iniciar a aplicação: ${err.message}`);
      TimelineModule.setTitle("Não foi possível carregar o mapa. Recarrega a página para tentar de novo.");
    } finally {
      UIModule.hideLoading();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
