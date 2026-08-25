# SPI/SPEI RH2 — Monitorização de Seca Meteorológica

**[Ver a demo →](https://drodrigues704-coder.github.io/spi-spei-rh2-showcase/)**

Webapp de monitorização de seca meteorológica na **RH2** (Região Hidrográfica do Cávado, Ave e Leça — noroeste de Portugal Continental), 1995–2025 (31 anos, o mínimo recomendado pela Organização Meteorológica Mundial).

Este repositório é uma **demonstração pública** — contém a app já construída (frontend) e um instantâneo dos resultados já calculados, para correr sem servidor (GitHub Pages). O pipeline de dados, os dados brutos (estações SNIRH, ERA5) e o histórico de desenvolvimento ficam num repositório privado.

## O que a app mostra

- **SPI** (Standardized Precipitation Index) e **SPEI** (Standardized Precipitation-Evapotranspiration Index), por estação e escala temporal (1 a 48 meses)
- Um **índice de risco de seca** composto (frequência, severidade, recorrência e tendência), por estação
- Mapa espacial interpolado (**IDW** + isobandas) para as 3 variáveis — SPI, SPEI e o risco composto — no modo climatológico (média/frequência de longo prazo) e na evolução mês a mês
- 40 estações udométricas/climatológicas da RH2, 1995–2025

## Metodologia (resumo)

- **SPI**: ajuste de distribuição gamma à precipitação acumulada por escala, com correção de Thom para a probabilidade de zero, transformação normal inversa (método da OMM)
- **SPEI**: balanço hídrico P−PET (evapotranspiração por Hargreaves-Samani), ajuste de distribuição Pearson III
- **Índice de risco**: composto ponderado de frequência de seca, severidade, recorrência e tendência (Mann-Kendall), sobre SPEI-48
- **Interpolação espacial**: IDW (Inverse Distance Weighting) — testado e comparado com Kriging/RBF/TPS; sem autocorrelação espacial significativa detetável (Moran's I), IDW oferece o mesmo desempenho com muito menos complexidade
- **Classificação de severidade**: McKee et al. (1993), adotada pela OMM

## Stack

| Camada | Tecnologia |
|---|---|
| Interpolação/pipeline (privado) | Python · pandas · scipy · geopandas/shapely · rasterio/GDAL · matplotlib |
| Frontend (este repositório) | JavaScript vanilla · Leaflet · Chart.js |
| Dados | GeoJSON (isobandas), JSON (séries temporais) |

## Nota sobre este repositório

Este é um instantâneo estático para demonstração — não corre o pipeline, não recalcula nada, e não inclui os dados brutos das estações nem o código de processamento. Todos os direitos reservados; não é software de código aberto.

---

Daniel Rodrigues
