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
  // Base da API (mesma origem que serve este index.html, via b1_app.py).
  API_BASE: "./api",
  FILES_BASE: "./files",

  // Classes de seca (McKee et al. 1993 / OMM) — usadas no gráfico e na legenda.
  DROUGHT_CLASSES: [
    { max: -2.0, label: "Extrema", level: "extremo", color: "#7f1d1d" },
    { max: -1.5, label: "Severa", level: "severo", color: "#b91c1c" },
    { max: -1.0, label: "Moderada", level: "moderado", color: "#f59e0b" },
    { max: 1.0, label: "Quase normal", level: "quase normal", color: "#a3a3a3" },
    { max: 1.5, label: "Moderadamente húmido", level: "moderadamente húmido", color: "#60a5fa" },
    { max: 2.0, label: "Muito húmido", level: "muito húmido", color: "#2563eb" },
    { max: Infinity, label: "Extremamente húmido", level: "extremamente húmido", color: "#1e3a8a" },
  ],

  // Classes de Palmer do scPDSI (faixa temporal e título do mapa). Não
  // usar DROUGHT_CLASSES aqui: os limiares são outros. `max` é limite
  // incluído (v <= max); `maxExclusive` é excluído (v < maxExclusive),
  // porque o lado húmido inclui o limite inferior de cada classe.
  PDSI_CLASSES: [
    { max: -4, label: "Extrema", level: "extremo", color: "#7f1d1d" },
    { max: -3, label: "Severa", level: "severo", color: "#b91c1c" },
    { max: -2, label: "Moderada", level: "moderado", color: "#f59e0b" },
    { max: -1, label: "Ligeira", level: "ligeiro", color: "#cca057" },
    { maxExclusive: 1, label: "Quase normal", level: "quase normal", color: "#a3a3a3" },
    { maxExclusive: 2, label: "Ligeiramente húmido", level: "ligeiramente húmido", color: "#82a4cf" },
    { maxExclusive: 3, label: "Moderadamente húmido", level: "moderadamente húmido", color: "#60a5fa" },
    { maxExclusive: 4, label: "Muito húmido", level: "muito húmido", color: "#2563eb" },
    { max: Infinity, label: "Extremamente húmido", level: "extremamente húmido", color: "#1e3a8a" },
  ],

  // Margem à volta da RH2 até onde o mapa se pode mover (fração da extensão).
  MAP_BOUNDS_PAD: 0.1,

  // Índice-base de cada risco composto (faixa, título e período).
  RISK_BASE_INDEX: { risco_mensal: "spei", risco_spi: "spi", risco_pdsi: "pdsi" },

  // Calendário fixo da faixa temporal: um mês por posição do slider
  // (0 = 1995-01, 371 = 2025-12). A disponibilidade de cada mês vem
  // sempre dos dados (isoband_dates e série), nunca de datas escritas aqui.
  CALENDAR_START_YEAR: 1995,
  CALENDAR_END_YEAR: 2025,

  // month_info (opcional, ver scripts/frontend/README.md): frac_preenchida,
  // fração da janela de cálculo preenchida. Abaixo de MEDIUM a confiança é
  // alta e não há padrão; de MEDIUM a RECONSTRUCTED é média; daí para cima o
  // valor é tratado como reconstruído pela fonte de preenchimento.
  MONTH_INFO_MEDIUM: 0.3,
  MONTH_INFO_RECONSTRUCTED: 0.75,
  FILL_SOURCE_NAME: "CERRA-Land",

  // Texto permanente junto à faixa, mostrado quando há month_info e dados de
  // episódios para o índice. String vazia: não mostra nada.
  OBSERVATION_NOTE: "Em períodos sem observações, a ausência de episódio não significa ausência de seca.",

  // Aviso permanente junto à faixa; o texto completo está no Sobre.
  SHOW_SERIES_BREAK_NOTE: true,
  SERIES_BREAK_NOTE:
    "Comparação por período, antes e depois da quebra nos registos (2001–2009): os índices mostram secas, não tendências de longo prazo.",

  // Limiar do contador "N de M estações" do título do mapa, por índice.
  STATION_DROUGHT_LIMIT: { spi: -1, spei: -1, pdsi: -2 },

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

  // Mesma rampa "% de meses em seca" acima, mas só para o scPDSI — não
  // dá para partilhar FREQ_VALUE_MAX=0.3 com o SPI/SPEI (memória/
  // autocorrelação do scPDSI, gama observada até 73% — ver p1_config.py
  // e n4_PROJECT_REFERENCE.md §21). Espelha p1_config.py →
  // PDSI_FREQ_COLOR_STOPS.
  PDSI_FREQ_COLOR_STOPS: [
    { at: 0.0, color: [255, 255, 229] },
    { at: 0.2667, color: [254, 217, 118] },
    { at: 0.5333, color: [240, 59, 32] },
    { at: 0.8, color: [127, 29, 29] },
  ],
  PDSI_FREQ_VALUE_MIN: 0.0,
  PDSI_FREQ_VALUE_MAX: 0.8,

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
