/*
===============================================================================
WEBAPP — SPI/SPEI RH2
F2_MAP.JS

Autor:
Daniel Rodrigues

Descrição
---------
Mapa principal Leaflet — basemap, contorno oficial da RH2, grupos de
camadas (estações, raster). Não sabe nada sobre a API; só expõe
`MapModule` para os outros módulos adicionarem/removerem camadas.
===============================================================================
*/

// Basemaps disponíveis — "Escuro" (CARTO Dark Matter) é o defeito desde
// sempre (combina com o tema da interface e não compete visualmente com
// a rampa de cor das isobandas; o OpenStreetMap por omissão é colorido
// e satura o mapa). "Claro" e "Satélite" pedidos pelo dono do projeto
// para poder comparar o mapa de risco sobre um fundo com mais contexto
// (relevo/uso do solo) — nenhum precisa de chave de API.
const BASEMAPS = [
  {
    label: "Escuro",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    options: { subdomains: "abcd", maxZoom: 19 },
  },
  {
    label: "Claro",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    options: { subdomains: "abcd", maxZoom: 19 },
  },
  {
    label: "Satélite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
    options: { maxZoom: 19 },
  },
];

const MapModule = (() => {
  let map = null;
  let stationsLayer = null;
  let rasterLayer = null;
  let boundaryLayer = null;
  let basemapLayer = null;
  let basemapIndex = 0;

  function applyBasemap(index) {
    const bm = BASEMAPS[index];
    if (basemapLayer) map.removeLayer(basemapLayer);
    basemapLayer = L.tileLayer(bm.url, { attribution: bm.attribution, ...bm.options }).addTo(map);
    basemapIndex = index;
  }

  function cycleBasemap() {
    applyBasemap((basemapIndex + 1) % BASEMAPS.length);
    return BASEMAPS[basemapIndex].label;
  }

  function init() {
    map = L.map("map", { zoomControl: true }).setView(APP.MAP_CENTER, APP.MAP_ZOOM);

    applyBasemap(0);

    // Panes com z-index explícito — ver a nota em f1_config.js. Ordem
    // (baixo → cima): isobandas < contorno < estações.
    map.createPane(APP.PANE_ISOBANDS);
    map.getPane(APP.PANE_ISOBANDS).style.zIndex = 410;
    map.createPane(APP.PANE_BOUNDARY);
    map.getPane(APP.PANE_BOUNDARY).style.zIndex = 420;
    map.createPane(APP.PANE_STATIONS);
    map.getPane(APP.PANE_STATIONS).style.zIndex = 450;

    rasterLayer = L.layerGroup().addTo(map);
    loadBoundary();
    stationsLayer = L.layerGroup().addTo(map);

    return map;
  }

  async function loadBoundary() {
    try {
      const res = await fetch("data/rh2_boundary.geojson");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const geojson = await res.json();

      boundaryLayer = L.geoJSON(geojson, {
        pane: APP.PANE_BOUNDARY,
        style: { color: "#38bdf8", weight: 2, opacity: 0.9, fill: false },
      }).addTo(map);

      map.fitBounds(boundaryLayer.getBounds(), { padding: [16, 16] });
    } catch (err) {
      console.error("Não foi possível carregar o contorno da RH2:", err);
    }
  }

  function getMap() {
    return map;
  }

  function setRasterLayer(leafletLayer) {
    rasterLayer.clearLayers();
    if (leafletLayer) {
      rasterLayer.addLayer(leafletLayer);
    }
  }

  function getStationsLayer() {
    return stationsLayer;
  }

  return { init, getMap, setRasterLayer, getStationsLayer, cycleBasemap };
})();
