/*
===============================================================================
WEBAPP — SPI/SPEI RH2
F5_CHARTS.JS

Autor:
Daniel Rodrigues

Descrição
---------
Gráfico de evolução temporal (Chart.js) de SPI/SPEI/Risco para a
estação/índice/escala selecionados. SPI/SPEI têm faixas horizontais para
as classes de seca (McKee et al. 1993 / OMM) via
`chartjs-plugin-annotation` e eixo Y -3..3; "Risco" (RISCO_MENSAL, série
`risco_mensal` — ver §17) é uma escala diferente (0-1, sem as mesmas
classes), por isso tem eixo e anotações próprios. Só sabe desenhar — não
sabe nada sobre a API.
===============================================================================
*/

const ChartsModule = (() => {
  const YEAR_TICKS = 5;

  let chart = null;

  // Tom quente neutro (--text-dim aproximado) para os limiares tracejados
  // e para gridlines/ticks abaixo — antes cinzento-azulado "puro", agora
  // consistente com a paleta "terra seca" do redesign (ver CSS/style.css).
  // Chart.js não lê custom properties CSS diretamente nas opções de config
  // (só funcionaria com getComputedStyle em runtime, mais código para um
  // ganho pequeno) — por isso os valores estão duplicados aqui À MÃO.
  // MANTER SINCRONIZADO: --text-dim (#a6957a) e --accent (#cc7a3d) em
  // CSS/style.css — se um mudar lá, atualizar aqui também.
  const WARM_NEUTRAL = "rgba(166,149,122,0.35)";
  const WARM_NEUTRAL_GRID = "rgba(166,149,122,0.15)";
  const WARM_NEUTRAL_TEXT = "#a6957a"; // = --text-dim
  const ACCENT = "#cc7a3d"; // = --accent
  const FONT_MONO = "'IBM Plex Mono', ui-monospace, monospace";

  function buildAnnotations(linhas) {
    const annotations = {};
    linhas.forEach((v, i) => {
      annotations[`linha_${i}`] = {
        type: "line",
        yMin: v,
        yMax: v,
        borderColor: WARM_NEUTRAL,
        borderWidth: 1,
        borderDash: [4, 4],
      };
    });
    return annotations;
  }

  // Configuração que difere por índice: "Risco" (0-1, sem classes) tem
  // eixo/anotações próprios; SPI/SPEI usam as classes McKee (-3..3,
  // ±0.5 nos limiares 1/1.5/2); scPDSI usa as classes de Palmer (-4..4,
  // inteiros — ver docs/ai-team/n4_PROJECT_REFERENCE.md §21).
  function axisConfigFor(index) {
    if (index === "risco_mensal") {
      return { label: "Risco", suggestedMin: 0, suggestedMax: 1, annotations: {} };
    }
    if (index === "pdsi") {
      return { label: "scPDSI", suggestedMin: -4, suggestedMax: 4, annotations: buildAnnotations([-3, -2, -1, 1, 2, 3]) };
    }
    return { label: index.toUpperCase(), suggestedMin: -3, suggestedMax: 3, annotations: buildAnnotations([-2, -1.5, -1, 1, 1.5, 2]) };
  }

  // Mês mostrado no mapa, como linha vertical; clicar no gráfico escolhe um mês.
  let cursorDate = null;
  let onDatePicked = null;
  let canPickDate = () => false;

  function applyCursor() {
    const annotations = chart.options.plugins.annotation.annotations;
    if (cursorDate && chart.data.labels.includes(cursorDate)) {
      annotations.cursor = { type: "line", xMin: cursorDate, xMax: cursorDate, borderColor: "#ede4d3", borderWidth: 1.5 };
    } else {
      delete annotations.cursor;
    }
  }

  function setCursor(date) {
    if (date === cursorDate) return;
    cursorDate = date;
    if (!chart) return;
    applyCursor();
    chart.update("none");
  }

  function setDateHandler(handler, canPick) {
    onDatePicked = handler;
    canPickDate = canPick;
  }

  function render(station, series, index, scale) {
    const entries = (series[index] || [])
      .filter((e) => e.scale === scale)
      .sort((a, b) => (a.date > b.date ? 1 : -1));

    const labels = entries.map((e) => e.date);
    const values = entries.map((e) => e.value);
    const cfg = axisConfigFor(index);
    const label = index === "pdsi" ? `${cfg.label} — ${station}` : `${cfg.label}-${scale} — ${station}`;
    document.getElementById("chart-series").setAttribute("aria-label", `Gráfico da evolução mensal: ${label}`);

    if (chart) {
      chart.data.labels = labels;
      chart.data.datasets[0].data = values;
      chart.data.datasets[0].label = label;
      chart.options.scales.y.suggestedMin = cfg.suggestedMin;
      chart.options.scales.y.suggestedMax = cfg.suggestedMax;
      chart.options.plugins.annotation.annotations = cfg.annotations;
      applyCursor();
      chart.update();
      return;
    }

    const ctx = document.getElementById("chart-series").getContext("2d");
    const firstCursor = cursorDate;
    chart = new Chart(ctx, {
      // onHover não corre fora da área do gráfico e deixaria o cursor preso.
      plugins: [
        {
          id: "pickCursor",
          afterEvent(instance, args) {
            instance.canvas.style.cursor = args.inChartArea && canPickDate() ? "pointer" : "default";
          },
        },
      ],
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label,
            data: values,
            borderColor: ACCENT,
            backgroundColor: "rgba(204,122,61,0.10)",
            borderWidth: 1.5,
            pointRadius: 0,
            fill: true,
            tension: 0.15,
          },
        ],
      },
      options: {
        responsive: true,
        animation: false,
        onClick: (event, _elements, instance) => {
          // Nas bordas da área, o eixo devolve -1 ou n: o clique é o primeiro ou o último mês.
          const last = instance.data.labels.length - 1;
          const position = Math.min(Math.max(instance.scales.x.getValueForPixel(event.x), 0), last);
          const date = instance.data.labels[position];
          if (date && onDatePicked) onDatePicked(date);
        },
        scales: {
          x: {
            type: "category",
            grid: { color: WARM_NEUTRAL_GRID },
            // Marcas espaçadas de ponta a ponta: o eixo mostra sempre o
            // último ano da série, que o autoSkip do Chart.js omitia.
            afterBuildTicks: (axis) => {
              const last = axis.getLabels().length - 1;
              const count = Math.min(YEAR_TICKS, last + 1);
              axis.ticks = Array.from({ length: count }, (_, i) => ({
                value: count > 1 ? Math.round((i * last) / (count - 1)) : 0,
              }));
            },
            ticks: {
              color: WARM_NEUTRAL_TEXT,
              font: { family: FONT_MONO },
              maxRotation: 0,
              autoSkip: false,
              // Datas guardadas como "AAAA-MM-DD" — mostra só o ano no
              // eixo (usa this.getLabelForValue, não o array `labels` do
              // closure, porque este callback também corre depois de um
              // chart.update() com dados novos).
              callback: function (value) {
                const label = this.getLabelForValue(value);
                return label ? label.slice(0, 4) : label;
              },
            },
          },
          y: {
            suggestedMin: cfg.suggestedMin,
            suggestedMax: cfg.suggestedMax,
            grid: { color: WARM_NEUTRAL_GRID },
            ticks: { color: WARM_NEUTRAL_TEXT, font: { family: FONT_MONO } },
          },
        },
        plugins: {
          legend: { display: true, onClick: () => {}, labels: { color: WARM_NEUTRAL_TEXT } },
          annotation: { annotations: cfg.annotations },
        },
      },
    });
    if (firstCursor) {
      applyCursor();
      chart.update("none");
    }
  }

  return { render, setCursor, setDateHandler };
})();
