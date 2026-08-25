/*
===============================================================================
WEBAPP — SPI/SPEI RH2
F4_RASTER.JS

Autor:
Daniel Rodrigues

Descrição
---------
Carrega e desenha no mapa as **isobandas** de risco (GeoJSON, pré-
-calculadas pelo pipeline — `p6b_isobands.py`) servidas pelo backend em
`/files`. Cada polígono já vem com a cor certa embutida
(`properties.fill`) — este módulo não recalcula rampa de cor nenhuma,
só desenha.

Histórico de decisão — porquê isobandas pré-calculadas, não raster nem
Turf.js no browser
----------------------------------------------------------------------
Pedido do dono do projeto para "melhorar a representação gráfica" (como
noutra app sua, `OndasCalor_Frio_WebApp`, que usa Turf.js no browser
para gerar isobandas a partir do raster). Aqui optou-se por pré-calcular
as isobandas no pipeline (Python, `matplotlib.contourf` + `geojsoncontour`)
em vez de as calcular no browser:
  1. Já tínhamos tido dois bugs reais de bibliotecas de raster no browser
     nesta sessão (`georaster.js` a bloquear indefinidamente com muitas
     bandas — ver `n4_PROJECT_REFERENCE.md` §9). Pré-calcular remove essa
     categoria de risco por completo — `georaster`/
     `georaster-layer-for-leaflet` deixaram de ser dependências do
     frontend.
  2. Um GeoJSON de isobandas é muito mais pequeno e rápido de desenhar
     do que reprocessar um raster no browser a cada mudança de mês no
     slider (~1700 rasters mensais).

Três variáveis mensais desde §17 (antes só risco — ver `p6b_isobands.py`
e `catalog.json`), mais o climatológico de SPI/SPEI desde §18
(frequência de seca — % de meses em seca por escala, não a média bruta
do índice, que é ~0 por construção):
  • estático — `raster_static.isoband_url` (Indice_Risco, sempre risco)
    ou `raster_static_index[spi|spei][escala].isoband_url` (% de meses
    em seca);
  • mensal — `raster_monthly[risco|spi|spei][escala].isoband_dates[i].url`,
    1 ficheiro por data.
===============================================================================
*/

const RasterModule = (() => {
  const cache = new Map(); // url -> GeoJSON já descarregado/parseado
  let currentLayer = null;

  async function fetchMeta(path) {
    // SHOWCASE: cada rota é um ficheiro .json pré-gerado (ver f1_config.js).
    const res = await fetch(`${APP.API_BASE}${path}.json`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || `Erro ${res.status} ao carregar metadados do mapa espacial.`);
    }
    return res.json();
  }

  async function loadGeojson(url) {
    if (cache.has(url)) return cache.get(url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Erro ${res.status} ao descarregar ${url}`);
    const geojson = await res.json();
    cache.set(url, geojson);
    return geojson;
  }

  // Texto do tooltip de cada polígono — depende da variável e de
  // "mode": "risco" fica sempre 0-1; SPI/SPEI mensal ("monthly") mostra
  // o valor do índice (-3..3); SPI/SPEI climatológico ("static") mostra
  // frequência de seca em % (o value_min/value_max do GeoJSON são
  // frações 0-1, multiplicadas por 100 aqui só para o texto).
  function tooltipText(feature, variable, mode) {
    const { value_min, value_max } = feature.properties;
    if (variable === "risco") return `Risco: ${value_min.toFixed(2)} – ${value_max.toFixed(2)}`;
    const label = variable === "spei" ? "SPEI" : "SPI";
    if (mode === "static") return `${label} seca: ${(value_min * 100).toFixed(0)}% – ${(value_max * 100).toFixed(0)}%`;
    return `${label}: ${value_min.toFixed(2)} – ${value_max.toFixed(2)}`;
  }

  function render(geojson, variable = "risco", mode = "monthly") {
    if (currentLayer) {
      MapModule.setRasterLayer(null);
      currentLayer = null;
    }

    currentLayer = L.geoJSON(geojson, {
      pane: APP.PANE_ISOBANDS, // sempre abaixo do contorno/estações — ver f1_config.js
      style: (feature) => ({
        fillColor: feature.properties.fill,
        fillOpacity: 0.8,
        color: feature.properties.fill,
        weight: 0.5,
        opacity: 0.4,
      }),
      onEachFeature: (feature, layer) => {
        layer.bindTooltip(tooltipText(feature, variable, mode), { sticky: true });
      },
    });

    MapModule.setRasterLayer(currentLayer);
  }

  async function loadStaticMeta() {
    return fetchMeta("/raster/static");
  }

  // SPI/SPEI climatológico (frequência de seca — §18); "risco" não passa
  // por aqui, usa sempre loadStaticMeta().
  async function loadStaticIndexMeta(variable, scale) {
    return fetchMeta(`/raster/static/${variable}/${scale}`);
  }

  async function loadMonthlyMeta(variable, scale) {
    return fetchMeta(`/raster/monthly/${variable}/${scale}`);
  }

  // `loadGeojson` (fetch, com cache) e `render` (mutação do mapa) são
  // expostos separadamente — não combinados num único `showX()` — para
  // quem chama poder verificar se o pedido ainda é o mais recente *antes*
  // de mutar o mapa/rótulo. Ver f7_main.js (`rasterRequestId`) — o mesmo
  // padrão já resolveu uma condição de corrida real com a versão anterior
  // (georaster) deste módulo, mantido aqui por segurança.
  return { loadStaticMeta, loadStaticIndexMeta, loadMonthlyMeta, loadGeojson, render };
})();
