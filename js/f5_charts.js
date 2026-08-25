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

  function buildIndexAnnotations() {
    // Faixas de referência do SPI/SPEI: seca (linhas a -1/-1.5/-2) e húmido (1/1.5/2).
    const linhas = [-2, -1.5, -1, 1, 1.5, 2];
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

  // Configuração que difere entre "Risco" (0-1, sem classes McKee) e
  // SPI/SPEI (-3..3, com as faixas de referência).
  function axisConfigFor(index) {
    if (index === "risco_mensal") {
      return { label: "Risco", suggestedMin: 0, suggestedMax: 1, annotations: {} };
    }
    return { label: index.toUpperCase(), suggestedMin: -3, suggestedMax: 3, annotations: buildIndexAnnotations() };
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
