/*
===============================================================================
WEBAPP — SPI/SPEI RH2
F8_TIMELINE.JS

Autor:
Daniel Rodrigues

Descrição
---------
Faixa temporal do atlas: canvas com a série RH2_MEDIA (um mês por célula,
cor por classe discreta), slider nativo transparente por cima, botões,
marcas de episódio, legenda da faixa e título do mapa.

Regras deste módulo:
  • nunca faz fetch — a app só comunica com a API em f4_raster.js e
    f7_main.js, os dois pontos que o showcase adapta para ficheiros
    estáticos (ver scripts/export_showcase.py);
  • não guarda estado partilhado — `props` é só a última leitura recebida
    de f7_main.js, para redesenhar e para o hover; a data e o modo vivem
    em f7_main.js, e daqui só saem callbacks;
  • não usa Leaflet.
===============================================================================
*/

const TimelineModule = (() => {
  const START_YEAR = APP.CALENDAR_START_YEAR;
  const MONTHS = (APP.CALENDAR_END_YEAR - START_YEAR + 1) * 12;

  // =========================================================================
  // CALENDÁRIO E DATAS
  // =========================================================================

  const dateAt = (i) => {
    const year = START_YEAR + Math.floor(i / 12);
    return `${year}-${String((i % 12) + 1).padStart(2, "0")}-01`;
  };

  const indexOf = (date) =>
    (parseInt(date.slice(0, 4), 10) - START_YEAR) * 12 + parseInt(date.slice(5, 7), 10) - 1;

  // Mês disponível para uma data pedida. `direction` > 0 ou < 0: o seguinte
  // ou o anterior, no sentido do movimento (se não houver nesse sentido,
  // o mais próximo). `direction` = 0: o mais próximo e, em empate, o
  // anterior. `available` vem sempre ordenado e sempre dos dados.
  function resolveDate(date, available, direction = 0) {
    if (!available.length) return null;
    if (available.includes(date)) return date;
    const firstAfter = available.findIndex((d) => d > date);
    const next = firstAfter === -1 ? null : available[firstAfter];
    const prev = firstAfter === 0 ? null : available[firstAfter === -1 ? available.length - 1 : firstAfter - 1];
    if (direction > 0) return next || prev;
    if (direction < 0) return prev || next;
    if (!prev) return next;
    if (!next) return prev;
    const distance = (d) => Math.abs(indexOf(d) - indexOf(date));
    return distance(next) < distance(prev) ? next : prev;
  }

  // =========================================================================
  // FORMATAÇÃO (pt-PT)
  // =========================================================================

  // timeZone UTC: new Date("2019-09-01") é meia-noite UTC e, sem isto,
  // cairia em agosto nos Açores.
  const MONTH_FORMAT = new Intl.DateTimeFormat("pt-PT", { timeZone: "UTC", month: "long", year: "numeric" });
  const VALUE_FORMAT = new Intl.NumberFormat("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const WHOLE_FORMAT = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0 });

  const monthText = (date) => MONTH_FORMAT.format(new Date(date));
  const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
  // "+ 0" transforma -0 em 0, para um valor arredondado a zero não sair "−0,00".
  const valueText = (value) => VALUE_FORMAT.format(Math.round(value * 100) / 100 + 0).replace("-", "−");
  const percentText = (fraction) => `${WHOLE_FORMAT.format(fraction * 100)} %`;
  const indexName = (key) => (key === "pdsi" ? "scPDSI" : key.toUpperCase());
  const indexLabel = (key, scale) => (key === "pdsi" ? "scPDSI" : `${key.toUpperCase()}-${scale}`);

  const classesFor = (key) => (key === "pdsi" ? APP.PDSI_CLASSES : APP.DROUGHT_CLASSES);

  function classify(value, classes) {
    return classes.find((c) => (c.maxExclusive != null ? value < c.maxExclusive : value <= c.max));
  }

  // null (sem dado ou confiança alta, sem padrão) | "medium" | "reconstructed"
  function confidenceLevel(info) {
    if (info == null || info.frac_preenchida == null) return null;
    if (info.frac_preenchida >= APP.MONTH_INFO_RECONSTRUCTED) return "reconstructed";
    return info.frac_preenchida >= APP.MONTH_INFO_MEDIUM ? "medium" : null;
  }

  // `confianca` dos episódios e de month_info: "alta" | "media" | "reconstruido".
  const EPISODE_CONFIDENCE = { media: "medium", reconstruido: "reconstructed" };
  // `nivel_pior` vem no feminino da classe; o resto da interface diz "nível severo".
  const EPISODE_LEVEL = { Moderada: "moderado", Severa: "severo", Extrema: "extremo" };

  const confidenceText = (level) => (level === "reconstructed" ? `reconstruído com ${APP.FILL_SOURCE_NAME}` : "confiança média");

  // Descreve sempre o que está no mapa. `view` = { mode, date, index, scale }
  // (o que foi desenhado, não o que foi pedido); `data` = { period, value,
  // nStations, info }, cada campo opcional — o que faltar não é dito.
  function buildTitle(view, data) {
    const base = APP.RISK_BASE_INDEX[view.index];
    if (view.mode === "climatology") {
      const parts = base
        ? [`Risco composto — ${indexLabel(base, view.scale)}`, "composto de 3 componentes"]
        : ["Frequência de meses em seca", indexLabel(view.index, view.scale)];
      if (data.period) parts.push(data.period);
      return parts.join(" · ");
    }

    const parts = [capitalize(monthText(view.date))];
    parts.push(
      base ? `Risco do mês (${indexLabel(base, view.scale)})` : indexLabel(view.index, view.scale)
    );
    if (data.value != null) {
      const count = data.info?.n_estacoes ?? data.nStations;
      const stations = count ? `média de ${count} estações` : "média das estações";
      if (base) {
        parts.push(`${stations} ${valueText(data.value)}`);
      } else {
        const palmer = view.index === "pdsi" ? ", escala de Palmer" : "";
        const severity = classify(data.value, classesFor(view.index)).level;
        parts.push(`${stations} ${valueText(data.value)} (nível ${severity}${palmer})`);
      }
    }
    const limit = APP.STATION_DROUGHT_LIMIT[view.index];
    const stationTotal = data.info?.n_estacoes ?? data.nStations;
    if (limit != null && stationTotal && data.info && data.info.n_estacoes_seca != null) {
      parts.push(`${data.info.n_estacoes_seca} de ${stationTotal} estações ≤ ${valueTextShort(limit)}`);
    }
    const level = confidenceLevel(data.info);
    if (level) parts.push(`${confidenceText(level)} (${percentText(data.info.frac_preenchida)} da janela preenchida)`);
    return parts.join(" · ");
  }

  const valueTextShort = (value) => WHOLE_FORMAT.format(value).replace("-", "−");

  // =========================================================================
  // ELEMENTOS
  // =========================================================================

  const el = {
    title: document.getElementById("map-title"),
    timeline: document.getElementById("timeline"),
    label: document.getElementById("tl-label"),
    status: document.getElementById("tl-status"),
    canvas: document.getElementById("tl-canvas"),
    slider: document.getElementById("ctl-band-slider"),
    hover: document.getElementById("tl-hover"),
    years: document.getElementById("tl-years"),
    marks: document.getElementById("tl-marks"),
    legendWrap: document.getElementById("tl-legend-wrap"),
    legend: document.getElementById("tl-legend"),
    note: document.getElementById("tl-note"),
    observationNote: document.getElementById("tl-observation-note"),
    breakNote: document.getElementById("tl-break-note"),
    warning: document.getElementById("tl-warning"),
    composite: document.getElementById("tl-composite"),
    compositeText: document.getElementById("tl-composite-text"),
    compositeButton: document.getElementById("btn-composite-monthly"),
    climatology: document.getElementById("btn-climatology"),
    play: document.getElementById("btn-play"),
    playIcon: document.getElementById("btn-play-icon"),
    playText: document.getElementById("btn-play-text"),
    prev: document.getElementById("btn-prev-month"),
    next: document.getElementById("btn-next-month"),
  };

  let props = null; // última leitura recebida de f7_main.js — ver o cabeçalho
  let callbacks = {};

  const hasMap = (date) => props.available.includes(date);
  const monthsKnown = () => props.monthsState === "ok";

  // =========================================================================
  // CANVAS
  // =========================================================================

  const NEUTRAL_CELL = "#6b5a43"; // mês com mapa, sem série para o colorir
  const GAP_BASE = "#15110c";

  function makeTile(paint, dpr = 1) {
    const size = 6;
    const tile = document.createElement("canvas");
    tile.width = tile.height = Math.round(size * dpr);
    const ctx = tile.getContext("2d");
    ctx.scale(dpr, dpr);
    paint(ctx, size);
    return tile;
  }

  const stripes = (color, width) => (ctx, size) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    // Três segmentos para a diagonal continuar sem costura entre mosaicos.
    [[-size, size, 0, 0], [0, size, size, 0], [size, size, size * 2, 0]].forEach(([x0, y0, x1, y1]) => {
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
    });
    ctx.stroke();
  };

  // "Sem mapa": riscas claras sobre fundo escuro, longe do cinzento médio de
  // "quase normal". Os níveis de confiança mantêm a cor da classe, porque o
  // valor existe: "média" atravessa-a com riscas escuras, "reconstruído" com
  // uma quadrícula, sem depender só da cor.
  const PATTERN_PAINTERS = {
    gap: (ctx, size) => {
      ctx.fillStyle = GAP_BASE;
      ctx.fillRect(0, 0, size, size);
      stripes("rgba(237,228,211,0.6)", 1)(ctx, size);
    },
    medium: stripes("rgba(21,17,12,0.7)", 1),
    reconstructed: (ctx, size) => {
      stripes("rgba(21,17,12,0.8)", 1.2)(ctx, size);
      ctx.save();
      ctx.translate(size, 0);
      ctx.scale(-1, 1);
      stripes("rgba(21,17,12,0.8)", 1.2)(ctx, size);
      ctx.restore();
    },
  };

  // Índices: classes discretas. Risco: a rampa contínua do mapa, sem classes.
  const cellColor = (value) => (props.ramp ? UIModule.rampColor(props.ramp, value) : classify(value, props.classes).color);

  function draw() {
    if (!props || props.composite) return;
    const rect = el.canvas.getBoundingClientRect();
    if (!rect.width) return;
    const dpr = window.devicePixelRatio || 1;
    const width = Math.round(rect.width * dpr);
    const height = Math.round(rect.height * dpr);
    if (el.canvas.width !== width) el.canvas.width = width;
    if (el.canvas.height !== height) el.canvas.height = height;
    const ctx = el.canvas.getContext("2d");
    ctx.clearRect(0, 0, width, height);
    el.canvas.dataset.painted = "false";

    const seriesOk = props.seriesState === "ok" && props.values != null;
    if (!seriesOk && !monthsKnown()) return; // nada para desenhar ainda: o rótulo diz "A carregar…"

    const patterns = {};
    Object.entries(PATTERN_PAINTERS).forEach(([name, paint]) => {
      patterns[name] = ctx.createPattern(makeTile(paint, dpr), "repeat");
    });

    const cellWidth = width / MONTHS;
    for (let i = 0; i < MONTHS; i++) {
      const x0 = Math.round(i * cellWidth);
      // Com menos de 1 px por mês (mobile), cada mês ainda ocupa um px físico.
      const w = Math.max(1, Math.round((i + 1) * cellWidth) - x0);
      const date = dateAt(i);
      const value = seriesOk ? props.values.get(date) : null;
      const info = props.monthInfo ? props.monthInfo[date] : null;
      const noMap = monthsKnown() ? !hasMap(date) : value == null;

      if (noMap) {
        ctx.fillStyle = patterns.gap;
        ctx.fillRect(x0, 0, w, height);
      } else {
        ctx.fillStyle = value != null ? cellColor(value) : NEUTRAL_CELL;
        ctx.fillRect(x0, 0, w, height);
        const level = confidenceLevel(info);
        if (level) {
          ctx.fillStyle = patterns[level];
          ctx.fillRect(x0, 0, w, height);
        }
      }
    }
    el.canvas.dataset.painted = "true";
  }

  // =========================================================================
  // LEGENDA, ANOS, TEXTOS
  // =========================================================================

  function swatch(style) {
    const span = document.createElement("span");
    span.className = "tl-swatch";
    Object.assign(span.style, style);
    return span;
  }

  const patternSwatch = (name, base) =>
    swatch({ backgroundColor: base || "transparent", backgroundImage: `url(${makeTile(PATTERN_PAINTERS[name], 2).toDataURL()})`, backgroundSize: "6px 6px" });

  function renderLegend() {
    const items = [];
    if (props.ramp) {
      const gradient = props.ramp.map((s) => `rgb(${s.color.join(",")}) ${s.at * 100}%`).join(", ");
      items.push([swatch({ width: "96px", background: `linear-gradient(90deg, ${gradient})` }), "Risco do mês, de 0 (baixo) a 1 (alto)"]);
    } else if (props.seriesState === "ok" && props.values) {
      props.classes.forEach((c) => items.push([swatch({ backgroundColor: c.color }), c.label]));
    } else if (monthsKnown() && !props.ramp) {
      items.push([swatch({ backgroundColor: NEUTRAL_CELL }), "Mês com mapa"]);
    }
    items.push([patternSwatch("gap"), "Sem mapa neste mês"]);
    if (props.monthInfo) {
      items.push([patternSwatch("medium", "#a3a3a3"), `Confiança média (${percentText(APP.MONTH_INFO_MEDIUM)} a ${percentText(APP.MONTH_INFO_RECONSTRUCTED)} preenchido)`]);
      items.push([patternSwatch("reconstructed", "#a3a3a3"), `Reconstruído com ${APP.FILL_SOURCE_NAME} (≥ ${percentText(APP.MONTH_INFO_RECONSTRUCTED)} preenchido)`]);
    }
    el.legend.replaceChildren(
      ...items.map(([mark, text]) => {
        const li = document.createElement("li");
        li.append(mark, document.createTextNode(text));
        return li;
      })
    );
  }

  function renderYears() {
    const spans = [];
    for (let year = START_YEAR; year <= APP.CALENDAR_END_YEAR; year += 5) {
      const span = document.createElement("span");
      span.textContent = String(year);
      span.style.left = `${(((year - START_YEAR) * 12) / MONTHS) * 100}%`;
      if (year === START_YEAR) span.classList.add("tl-year-first");
      if ((year - START_YEAR) % 10 !== 0) span.classList.add("tl-year-minor");
      spans.push(span);
    }
    el.years.replaceChildren(...spans);
  }

  function setText(element, text) {
    element.textContent = text || "";
    element.hidden = !text;
  }

  // =========================================================================
  // EPISÓDIOS
  // =========================================================================

  // Chave ausente = indisponível (não se diz nada); [] = nenhum (diz-se por
  // extenso). Confundir os dois faria a app afirmar algo falso.
  function episodeView(episodes, key, scale) {
    if (!episodes || !key) return { items: null, note: "" };
    const list = episodes[key] ? episodes[key][scale] : undefined;
    if (Array.isArray(list)) {
      return list.length ? { items: list, note: "" } : { items: null, note: "Sem episódios detetados nesta combinação." };
    }
    if (key === "pdsi") return { items: null, note: "" }; // sem escalas: as notas abaixo não se lhe aplicam
    if (scale === 1 || scale === 3) {
      return {
        items: null,
        note: "Nesta escala a seca varia quase mês a mês. Os episódios só se marcam nas escalas de 6 e 12 meses.",
      };
    }
    if (scale === 24 || scale === 48) {
      return {
        items: null,
        note: "Cada mês acumula 2 ou 4 anos, por isso uma seca parece longa e surge atrasada. Os episódios só se marcam nas escalas de 6 e 12 meses.",
      };
    }
    return { items: null, note: "" };
  }

  function episodeDescription(ep, label) {
    const parts = [`Episódio de ${monthText(ep.inicio)} a ${monthText(ep.fim)}`];
    if (ep.duracao_meses != null) parts.push(`${ep.duracao_meses} meses`);
    const level = EPISODE_LEVEL[ep.nivel_pior] || (ep.pior_valor != null ? classify(ep.pior_valor, classesFor(props.key)).level : null);
    const worst = [`pior mês ${monthText(ep.pior_mes)}`];
    if (ep.pior_valor != null) worst.push(`${label} ${valueText(ep.pior_valor)}`);
    if (level) worst.push(`nível ${level}`);
    parts.push(worst.join(", "));
    if (ep.n_estacoes_seca_pior != null && ep.n_estacoes != null) {
      parts.push(`${ep.n_estacoes_seca_pior} de ${ep.n_estacoes} estações em seca nesse mês`);
    }
    const confidence = EPISODE_CONFIDENCE[ep.confianca];
    if (confidence) parts.push(confidenceText(confidence));
    if (ep.censurado_inicio) parts.push("pode ter começado antes do início da série");
    if (ep.censurado_fim) parts.push("pode continuar depois do fim da série");
    return parts.join("; ");
  }

  function renderMarks(items) {
    if (!items) {
      el.marks.replaceChildren();
      el.marks.hidden = true;
      return;
    }
    // Ordem cronológica, sempre: o atlas nunca ordena por gravidade.
    const chronological = [...items].sort((a, b) => (a.inicio < b.inicio ? -1 : 1));
    el.marks.replaceChildren(
      ...chronological.map((ep) => {
        const button = document.createElement("button");
        button.type = "button";
        const confidence = EPISODE_CONFIDENCE[ep.confianca];
        button.className = confidence ? "tl-mark tl-mark-reduced" : "tl-mark";
        const start = indexOf(ep.inicio);
        const span = indexOf(ep.fim) - start + 1;
        button.style.setProperty("--mark-left", `${(start / MONTHS) * 100}%`);
        button.style.setProperty("--mark-width", `${(span / MONTHS) * 100}%`);
        const description = episodeDescription(ep, props.indexLabel);
        button.title = description;
        button.setAttribute("aria-label", `${description}. Mostrar esse mês.`);
        button.dataset.inicio = ep.inicio;
        button.dataset.fim = ep.fim;
        button.dataset.piorMes = ep.pior_mes;
        const y0 = ep.inicio.slice(0, 4);
        const y1 = ep.fim.slice(0, 4);
        const chip = document.createElement("span");
        chip.className = "tl-mark-label";
        chip.textContent = `${y0 === y1 ? y0 : `${y0}–${y1}`}${confidence === "medium" ? ", confiança média" : confidence ? ", reconstruído" : ""}`;
        button.append(chip);
        button.addEventListener("click", () => callbacks.onEpisode(ep.pior_mes));
        return button;
      })
    );
    el.marks.hidden = false;
  }

  function highlightCurrentMark() {
    const date = props.mode === "month" ? props.date : null;
    el.marks.querySelectorAll(".tl-mark").forEach((button) => {
      const current = date != null && date >= button.dataset.inicio && date <= button.dataset.fim;
      if (current) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    });
  }

  // =========================================================================
  // SLIDER
  // =========================================================================

  function describeMonth(date) {
    const value = props.values ? props.values.get(date) : null;
    const info = props.monthInfo ? props.monthInfo[date] : null;
    const parts = [`${monthText(date)}, ${props.indexLabel}`];
    if (value != null) {
      parts[0] += ` ${valueText(value)}`;
      if (!props.ramp) parts.push(`nível ${classify(value, props.classes).level}`);
    }
    const level = confidenceLevel(info);
    if (level) parts.push(confidenceText(level));
    return parts.join(", ");
  }

  // Direção do salto durante o arrasto: vem do movimento do ponteiro, não
  // da posição já corrigida. Se viesse desta, ao arrastar para a direita
  // dentro de uma lacuna o valor bruto seguinte ficava "antes" do mês para
  // onde se saltou e o slider oscilava entre os dois lados da lacuna.
  let lastRaw = MONTHS - 1;
  let lastDirection = 0;
  let dragging = false;

  function onSliderInput() {
    const raw = Number(el.slider.value);
    const direction = Math.sign(raw - lastRaw) || lastDirection;
    lastDirection = direction;
    if (dragging) lastRaw = raw;
    const resolved = resolveDate(dateAt(raw), props.available, direction);
    if (!resolved) return;
    el.slider.value = String(indexOf(resolved));
    if (!dragging) lastRaw = indexOf(resolved);
    if (resolved !== props.date || props.mode !== "month") callbacks.onSelect(resolved);
  }

  function step(direction) {
    const list = props.available;
    if (!list.length) return;
    let target;
    if (props.mode !== "month" || !props.date) {
      // Da climatologia: "anterior" é o mês mais recente, "seguinte" o primeiro.
      target = direction < 0 ? list[list.length - 1] : list[0];
    } else {
      target = list[list.indexOf(props.date) + direction];
    }
    if (target) callbacks.onSelect(target);
  }

  function onSliderKeydown(event) {
    if (props.mode === "month") return;
    // Na climatologia não há mês atual de onde partir: o teclado entra na
    // vista mensal em vez de deslocar uma posição que não está à vista.
    const list = props.available;
    if (!list.length) return;
    const keys = {
      ArrowLeft: list[list.length - 1],
      ArrowDown: list[list.length - 1],
      PageDown: list[list.length - 1],
      End: list[list.length - 1],
      ArrowRight: list[0],
      ArrowUp: list[0],
      PageUp: list[0],
      Home: list[0],
    };
    if (keys[event.key]) {
      event.preventDefault();
      callbacks.onSelect(keys[event.key]);
    }
  }

  function pointerIndex(event) {
    const rect = el.slider.getBoundingClientRect();
    const thumb = thumbWidth();
    const ratio = (event.clientX - rect.left - thumb / 2) / (rect.width - thumb);
    return Math.max(0, Math.min(MONTHS - 1, Math.round(ratio * (MONTHS - 1))));
  }

  const thumbWidth = () => parseFloat(getComputedStyle(el.timeline).getPropertyValue("--tl-thumb")) || 0;

  function onSliderHover(event) {
    if (event.pointerType === "touch" || !props || !(monthsKnown() || props.values)) return;
    const i = pointerIndex(event);
    const date = dateAt(i);
    const value = props.values ? props.values.get(date) : null;
    const info = props.monthInfo ? props.monthInfo[date] : null;
    const parts = [capitalize(monthText(date))];
    if (monthsKnown() && !hasMap(date)) {
      if (value != null) parts.push(valueText(value));
      parts.push("sem mapa");
    } else {
      if (value != null) parts.push(valueText(value));
      if (value != null && !props.ramp) parts.push(classify(value, props.classes).label);
      const level = confidenceLevel(info);
      if (level) parts.push(confidenceText(level));
    }
    el.hover.textContent = parts.join(" · ");
    el.hover.hidden = false;
    const rect = el.slider.getBoundingClientRect();
    const half = el.hover.offsetWidth / 2;
    const center = event.clientX - rect.left;
    el.hover.style.left = `${Math.max(half, Math.min(rect.width - half, center))}px`;
  }

  // =========================================================================
  // API PÚBLICA
  // =========================================================================

  function update(next) {
    const prev = props;
    props = next;

    el.timeline.dataset.mode = next.mode;
    el.timeline.classList.toggle("is-composite", !!next.composite);
    el.climatology.setAttribute("aria-pressed", String(next.mode === "climatology"));

    if (next.composite) {
      el.compositeText.textContent = `O ${next.composite.name} resume ${next.composite.period} e não tem valor mês a mês.`;
      el.compositeButton.textContent = `Ver ${indexName(next.composite.target)} mês a mês`;
      el.compositeButton.dataset.target = next.composite.target;
      el.composite.hidden = false;
      el.slider.disabled = true;
      el.hover.hidden = true;
      el.label.textContent = "";
      renderMarks(null);
      setText(el.note, "");
      setText(el.observationNote, "");
      setText(el.breakNote, "");
      setText(el.warning, next.warning || "");
      return;
    }
    el.composite.hidden = true;

    const loading = next.monthsState === "loading" || next.seriesState === "loading";
    el.label.textContent = loading ? "A carregar…" : `${next.stripLabel} · média das estações`;

    const hasMonths = next.available.length > 0;
    el.slider.disabled = !hasMonths;
    el.play.disabled = !hasMonths;
    const position = next.available.indexOf(next.date);
    el.prev.disabled = !hasMonths || (next.mode === "month" && position <= 0);
    el.next.disabled = !hasMonths || (next.mode === "month" && position === next.available.length - 1);

    const reference = next.mode === "month" ? next.date : next.available[next.available.length - 1];
    if (reference) el.slider.value = String(indexOf(reference));
    if (!dragging) lastRaw = Number(el.slider.value);
    el.slider.setAttribute(
      "aria-valuetext",
      next.mode === "month" && next.date ? describeMonth(next.date) : "Climatologia, sem mês selecionado"
    );

    const dataChanged =
      !prev ||
      prev.composite ||
      prev.values !== next.values ||
      prev.available !== next.available ||
      prev.monthInfo !== next.monthInfo ||
      prev.seriesState !== next.seriesState ||
      prev.monthsState !== next.monthsState;
    if (dataChanged) {
      draw();
      renderLegend();
    }

    const episodes = episodeView(next.episodes, next.key, next.scale);
    // Só há marcas clicáveis quando se conhecem os meses com mapa.
    const items = hasMonths ? episodes.items : null;
    if (!prev || prev.composite || el.marks.dataset.source !== `${next.key}/${next.scale}/${!!items}`) {
      renderMarks(items);
      el.marks.dataset.source = `${next.key}/${next.scale}/${!!items}`;
    }
    highlightCurrentMark();
    setText(el.note, episodes.note);
    // Fala de episódios: onde são indisponíveis (scPDSI, por agora; Risco), não
    // se diz nada sobre eles.
    const episodesKnown = next.episodes != null && next.episodes[next.key] != null;
    setText(el.observationNote, next.monthInfo && episodesKnown ? APP.OBSERVATION_NOTE : "");
    setText(el.breakNote, APP.SHOW_SERIES_BREAK_NOTE ? APP.SERIES_BREAK_NOTE : "");
    setText(el.warning, next.warning);

    if (focusSliderWhenReady && hasMonths) {
      focusSliderWhenReady = false;
      el.slider.focus();
    }
  }

  let focusSliderWhenReady = false;

  function requestSliderFocus() {
    focusSliderWhenReady = true;
  }

  function setTitle(text) {
    el.title.textContent = text;
  }

  // Só mudanças de estado (saltos, modo forçado): #tl-status é aria-live, e
  // nunca recebe cada mês da reprodução automática.
  function announce(message) {
    el.status.textContent = message || "";
  }

  function setPlaying(playing) {
    el.playText.textContent = playing ? "Pausar" : "Reproduzir";
    el.playIcon.setAttribute("d", playing ? "M3.5 2h3v10h-3zM8.5 2h3v10h-3z" : "M3.5 1.5l9 5.5-9 5.5z");
  }

  function init(handlers) {
    callbacks = handlers;
    renderYears();

    el.slider.addEventListener("input", onSliderInput);
    el.slider.addEventListener("keydown", onSliderKeydown);
    el.slider.addEventListener("pointerdown", (event) => {
      dragging = true;
      callbacks.onPointerStart();
      // O clique por pixel é resolvido aqui, não pelo browser: um clique sobre
      // o polegar (que tapa os meses vizinhos) não o desloca, e clicar na
      // posição guardada, na climatologia, não gera "input".
      const raw = pointerIndex(event);
      if (props.mode !== "month" || raw !== Number(el.slider.value)) {
        el.slider.value = String(raw);
        onSliderInput();
      }
    });
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      lastRaw = Number(el.slider.value);
    };
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    el.slider.addEventListener("pointermove", onSliderHover);
    el.slider.addEventListener("pointerleave", () => {
      el.hover.hidden = true;
    });

    el.play.addEventListener("click", () => callbacks.onPlayToggle());
    el.climatology.addEventListener("click", () => callbacks.onClimatology());
    el.prev.addEventListener("click", () => step(-1));
    el.next.addEventListener("click", () => step(1));
    el.compositeButton.addEventListener("click", () => callbacks.onCompositeTarget(el.compositeButton.dataset.target));

    new ResizeObserver(draw).observe(el.canvas);

    // Legenda aberta em desktop, recolhida no painel móvel (falta-lhe altura).
    const mobile = window.matchMedia("(max-width: 768px)");
    const syncLegend = () => {
      el.legendWrap.open = !mobile.matches;
    };
    mobile.addEventListener("change", syncLegend);
    syncLegend();
  }

  return {
    init,
    update,
    setTitle,
    announce,
    setPlaying,
    requestSliderFocus,
    resolveDate,
    buildTitle,
    classify,
    indexLabel,
    monthText,
  };
})();
