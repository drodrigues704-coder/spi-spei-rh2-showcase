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
  let chart = null;

  function buildAnnotations(linhas) {
    const annotations = {};
    linhas.forEach((v, i) => {
      annotations[`linha_${i}`] = {
        type: "line",
        yMin: v,
        yMax: v,
        borderColor: "rgba(120,120,120,0.35)",
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

  function render(station, series, index, scale) {
    const entries = (series[index] || [])
      .filter((e) => e.scale === scale)
      .sort((a, b) => (a.date > b.date ? 1 : -1));

    const labels = entries.map((e) => e.date);
    const values = entries.map((e) => e.value);
    const cfg = axisConfigFor(index);
    const label = `${cfg.label}-${scale} — ${station}`;

    if (chart) {
      chart.data.labels = labels;
      chart.data.datasets[0].data = values;
      chart.data.datasets[0].label = label;
      chart.options.scales.y.suggestedMin = cfg.suggestedMin;
      chart.options.scales.y.suggestedMax = cfg.suggestedMax;
      chart.options.plugins.annotation.annotations = cfg.annotations;
      chart.update();
      return;
    }

    const ctx = document.getElementById("chart-series").getContext("2d");
    chart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label,
            data: values,
            borderColor: "#1d4ed8",
            backgroundColor: "rgba(29,78,216,0.08)",
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
        scales: {
          x: {
            type: "category",
            ticks: {
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 10,
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
          y: { suggestedMin: cfg.suggestedMin, suggestedMax: cfg.suggestedMax },
        },
        plugins: {
          legend: { display: true },
          annotation: { annotations: cfg.annotations },
        },
      },
    });
  }

  return { render };
})();
