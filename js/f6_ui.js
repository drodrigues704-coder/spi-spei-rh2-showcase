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
  const sidebar = document.getElementById("sidebar");
  const sidebarBackdrop = document.getElementById("sidebar-backdrop");

  // "Índice e escala" fica no painel direito só com largura para três colunas.
  // A legenda do mapa acompanha o painel de baixo em mobile, onde a gaveta
  // está quase sempre fechada. Mover os nós mantém os ids e os eventos.
  const stackedPanels = window.matchMedia("(max-width: 1180px)");
  const mobileLayout = window.matchMedia("(max-width: 768px)");

  function placePanels() {
    const indexPanel = document.getElementById("panel-index");
    if (stackedPanels.matches) sidebar.insertBefore(indexPanel, document.getElementById("panel-map"));
    else document.getElementById("sidebar-right").append(indexPanel);
    const slot = document.getElementById(mobileLayout.matches ? "tl-map-legend" : "map-legend-slot");
    slot.append(document.getElementById("raster-legend"));
  }
  placePanels();
  stackedPanels.addEventListener("change", placePanels);
  mobileLayout.addEventListener("change", placePanels);
  const btnMenu = document.getElementById("btn-menu");

  // Cor de um valor numa rampa contínua (APP.*_COLOR_STOPS), limitada aos
  // extremos da rampa. Sem valor, cinzento neutro.
  function rampColor(stops, value) {
    if (value == null) return "#9ca3af";
    const v = Math.max(stops[0].at, Math.min(stops[stops.length - 1].at, value));
    let i = 0;
    while (i < stops.length - 2 && v > stops[i + 1].at) i++;
    const a = stops[i], b = stops[i + 1];
    const t = (v - a.at) / (b.at - a.at || 1);
    const r = Math.round(a.color[0] + t * (b.color[0] - a.color[0]));
    const g = Math.round(a.color[1] + t * (b.color[1] - a.color[1]));
    const bl = Math.round(a.color[2] + t * (b.color[2] - a.color[2]));
    return `rgb(${r},${g},${bl})`;
  }

  function showLoading() {
    overlay.hidden = false;
  }

  function hideLoading() {
    overlay.hidden = true;
  }

  let errorTimer = null;

  function showError(message) {
    errorBanner.textContent = message;
    errorBanner.hidden = false;
    clearTimeout(errorTimer);
    errorTimer = setTimeout(() => (errorBanner.hidden = true), 6000);
  }

  // "risco" é o "Risco (composto)" de sempre — marcadores das estações
  // sempre SPEI-48, mas o mapa Climatológico já respeita a Escala desde
  // §22 (mesmos números que SPEI-48 quando Escala=48). "risco_spi"/
  // "risco_pdsi" são o mesmo composto (frequência+severidade+
  // recorrência), por SPI/scPDSI em vez de SPEI — mesma rampa
  // 0-1, só muda o rótulo. Só têm climatologia: não têm evolução mensal
  // própria (ver f3_controls.js → hasMonthlyView()).
  const RISCO_COMPOSTO_LABELS = { risco_spi: "Risco (SPI)", risco_pdsi: "Risco (scPDSI)" };

  function renderLegend(variable = "risco", mode = "monthly") {
    if (variable === "risco" || variable in RISCO_COMPOSTO_LABELS) {
      const stops = APP.RISK_COLOR_STOPS;
      const gradient = stops.map((s) => `rgb(${s.color.join(",")}) ${s.at * 100}%`).join(", ");
      const rotulo = variable === "risco" ? "" : ` — ${RISCO_COMPOSTO_LABELS[variable]}`;
      legendEl.innerHTML = `
        <div class="legend-bar" style="background: linear-gradient(90deg, ${gradient});"></div>
        <div class="legend-labels"><span>0 (baixo risco)${rotulo}</span><span>1 (alto risco)</span></div>
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
      <div class="legend-labels"><span>${valueMin} (seca extrema)</span><span>${label}</span><span>+${valueMax} (extr. húmido)</span></div>
    `;
  }

  let focusBeforeInfo = null;

  function showInfo() {
    focusBeforeInfo = document.activeElement;
    infoModal.hidden = false;
    btnInfoClose.focus();
  }
  function hideInfo() {
    if (infoModal.hidden) return;
    infoModal.hidden = true;
    focusBeforeInfo?.focus();
  }
  // O Tab fica dentro do modal enquanto está aberto.
  // Fica no documento porque um clique no texto deixa o foco fora do modal.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Tab" || infoModal.hidden) return;
    const stops = [...infoModal.querySelectorAll("button, a[href]")];
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (!infoModal.contains(document.activeElement)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    } else if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  function wireInfoModal() {
    btnInfo.addEventListener("click", showInfo);
    btnInfoClose.addEventListener("click", hideInfo);
    infoModal.addEventListener("click", (e) => {
      if (e.target === infoModal) hideInfo(); // clicar fora do cartão fecha
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || infoModal.hidden) return;
      e.stopImmediatePropagation(); // um Escape fecha só o modal, não a gaveta por baixo
      hideInfo();
    });
  }

  wireInfoModal();

  // Gaveta da sidebar em mobile (≤768px, ver style.css) — só existe
  // #btn-menu nesse breakpoint (escondido em desktop por CSS), mas o
  // listener não faz mal ficar sempre montado. Mesmo padrão do modal
  // "Sobre" acima: alterna uma classe, fecha ao tocar fora ou Escape.
  function openSidebar() {
    sidebar.classList.add("open");
    sidebarBackdrop.hidden = false;
    btnMenu.setAttribute("aria-expanded", "true");
    syncDrawerFocus();
    document.getElementById("ctl-station").focus();
  }

  function closeSidebar() {
    const wasOpen = sidebar.classList.contains("open");
    sidebar.classList.remove("open");
    sidebarBackdrop.hidden = true;
    btnMenu.setAttribute("aria-expanded", "false");
    syncDrawerFocus();
    if (wasOpen) btnMenu.focus();
  }

  // Gaveta fechada em mobile: os controlos fora do ecrã saem da ordem de Tab.
  function syncDrawerFocus() {
    sidebar.inert = mobileLayout.matches && !sidebar.classList.contains("open");
  }

  function wireSidebarDrawer() {
    btnMenu.addEventListener("click", () => {
      if (sidebar.classList.contains("open")) closeSidebar();
      else openSidebar();
    });
    sidebarBackdrop.addEventListener("click", closeSidebar);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && sidebar.classList.contains("open")) closeSidebar();
    });

    // Sem isto: abrir a gaveta em mobile, rodar o ecrã (ou redimensionar
    // a janela) para desktop e voltar a estreitar deixava a classe
    // "open"/o ícone de fechar pendurados de uma sessão anterior, sem o
    // utilizador ter clicado em nada (achado no code review, não
    // hipotético) — sair do breakpoint mobile fecha sempre a gaveta.
    mobileLayout.addEventListener("change", (e) => {
      if (!e.matches) closeSidebar();
      syncDrawerFocus();
    });
    syncDrawerFocus();
  }

  wireSidebarDrawer();

  return { rampColor, showLoading, hideLoading, showError, renderLegend, showInfo, hideInfo };
})();
