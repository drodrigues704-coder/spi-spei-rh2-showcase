/*
===============================================================================
WEBAPP — SPI/SPEI RH2
F1_CONFIG.JS

Autor:
Daniel Rodrigues

Descrição
---------
Configuração central do frontend. Todos os outros módulos leem daqui —
nenhum módulo deve escrever URLs ou constantes diretamente.
===============================================================================
*/

const APP = {
  // SHOWCASE: sem backend FastAPI (GitHub Pages só serve ficheiros
  // estáticos) — API_BASE aponta para um snapshot pré-gerado
  // (scripts/export_showcase.py no repo privado), 1 ficheiro .json por
  // rota (ex.: /raster/monthly/spi/12 -> ./api/raster/monthly/spi/12.json).
  // Ver apiGet() em f7_main.js e fetchMeta() em f4_raster.js.
  API_BASE: "./api",
  FILES_BASE: "./files",

  // Classes de seca (McKee et al. 1993 / OMM) — usadas no gráfico e na legenda.
  DROUGHT_CLASSES: [
    { max: -2.0, label: "Extrema", color: "#7f1d1d" },
    { max: -1.5, label: "Severa", color: "#b91c1c" },
    { max: -1.0, label: "Moderada", color: "#f59e0b" },
    { max: 1.0, label: "Quase normal", color: "#a3a3a3" },
    { max: 1.5, label: "Moderadamente húmido", color: "#60a5fa" },
    { max: 2.0, label: "Muito húmido", color: "#2563eb" },
    { max: Infinity, label: "Extremamente húmido", color: "#1e3a8a" },
  ],

  // Rampa de cor do raster de risco (0 = baixo risco, 1 = alto risco).
  RISK_COLOR_STOPS: [
    { at: 0.0, color: [26, 152, 80] },   // verde — baixo risco
    { at: 0.35, color: [217, 239, 139] },
    { at: 0.5, color: [255, 255, 191] }, // amarelo — moderado
    { at: 0.65, color: [252, 141, 89] },
    { at: 1.0, color: [215, 48, 39] },   // vermelho — alto risco
  ],

  // Rampa divergente do SPI/SPEI espacializados (-3 a 3) — mesmas cores
  // de DROUGHT_CLASSES acima; tem de espelhar
  // scripts/pipeline/p1_config.py → INDEX_COLOR_STOPS (a cor de cada
  // isobanda já vem embutida do pipeline, isto é só para a legenda no
  // frontend — ver f6_ui.js).
  INDEX_COLOR_STOPS: [
    { at: -3.0, color: [127, 29, 29] },
    { at: -2.0, color: [185, 28, 28] },
    { at: -1.5, color: [245, 158, 11] },
    { at: -1.0, color: [163, 163, 163] },
    { at: 1.0, color: [163, 163, 163] },
    { at: 1.5, color: [96, 165, 250] },
    { at: 2.0, color: [37, 99, 235] },
    { at: 3.0, color: [30, 58, 138] },
  ],
  INDEX_VALUE_MIN: -3.0,
  INDEX_VALUE_MAX: 3.0,

  // Rampa divergente do scPDSI (§21) — mesma família de cores do
  // SPI/SPEI, mas com os limiares do Palmer (inteiros até ±4, não os
  // ±0.5 do McKee) — espelha p1_config.py → PDSI_COLOR_STOPS.
  PDSI_COLOR_STOPS: [
    { at: -4.0, color: [127, 29, 29] },
    { at: -3.0, color: [185, 28, 28] },
    { at: -2.0, color: [245, 158, 11] },
    { at: -1.0, color: [163, 163, 163] },
    { at: 1.0, color: [163, 163, 163] },
    { at: 2.0, color: [96, 165, 250] },
    { at: 3.0, color: [37, 99, 235] },
    { at: 4.0, color: [30, 58, 138] },
  ],
  PDSI_VALUE_MIN: -4.0,
  PDSI_VALUE_MAX: 4.0,

  // Rampa sequencial da frequência de seca (mapa "Climatológico" de
  // SPI/SPEI — % de meses em seca, não a média bruta, ver §18) — espelha
  // p1_config.py → FREQ_COLOR_STOPS.
  FREQ_COLOR_STOPS: [
    { at: 0.0, color: [255, 255, 229] },
    { at: 0.1, color: [254, 217, 118] },
    { at: 0.2, color: [240, 59, 32] },
    { at: 0.3, color: [127, 29, 29] },
  ],
  FREQ_VALUE_MIN: 0.0,
  FREQ_VALUE_MAX: 0.3,

  // Centro/zoom inicial do mapa — ajustado automaticamente ao contorno da
  // RH2 quando este carrega (ver f2_map.js); isto é só o estado inicial.
  MAP_CENTER: [41.55, -8.42],
  MAP_ZOOM: 10,

  // Intervalo (ms) entre bandas na reprodução automática do slider
  // temporal. 900ms dá tempo de ver cada mês antes de avançar — 250ms
  // (valor original) foi reportado como "demasiado rápido".
  PLAYBACK_INTERVAL_MS: 900,

  // Panes Leaflet dedicados (z-index explícito) para as isobandas, o
  // contorno da RH2 e os marcadores das estações nunca disputarem
  // ordem de desenho por acidente. Sem isto, todos os L.Path (isobandas
  // E marcadores) caem no 'overlayPane' por omissão e a ordem visual
  // passa a depender de qual foi adicionado ao mapa por último — bug
  // real encontrado: as isobandas, carregadas depois dos marcadores,
  // ficavam por cima e bloqueavam os cliques nas estações.
  PANE_ISOBANDS: "isobandPane",
  PANE_BOUNDARY: "boundaryPane",
  PANE_STATIONS: "stationPane",
};
