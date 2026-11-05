# Atlas de Seca — Região Hidrográfica 2 (Cávado / Ave / Leça)

**[Abrir o atlas →](https://drodrigues704-coder.github.io/spi-spei-rh2-showcase/)**

Atlas histórico da seca na **RH2** (Região Hidrográfica do Cávado, Ave e Leça, noroeste de Portugal Continental), de 1995 a 2025. É um registo de 31 anos, não um serviço em tempo real.

Este repositório é uma **demonstração pública**: contém a app já construída (frontend) e um instantâneo dos resultados já calculados, para correr sem servidor (GitHub Pages). O pipeline de dados, os dados brutos e o histórico de desenvolvimento ficam num repositório privado.

## O que a app mostra

- **SPI**, **SPEI** e **scPDSI** por estação e na média da RH2. SPI e SPEI têm escalas de 1 a 48 meses; o scPDSI é sempre mensal.
- Um **índice de risco de seca** composto (frequência, severidade e recorrência), a partir do SPEI, do SPI ou do scPDSI.
- Mapa interpolado (**IDW** + isobandas) em climatologia e mês a mês.
- **Faixa temporal** com os 31 anos da média das estações, os episódios de seca e a confiança de cada mês.

A seca agrícola e a hidrológica são lidas de forma indireta, pelas escalas mais longas e pelo scPDSI: a app parte de precipitação e temperatura e não usa medições de humidade do solo nem de caudais.

## Metodologia (resumo)

- **Observações**: os valores das estações do SNIRH nunca são alterados. Um mês só conta como observado com pelo menos 80 % dos dias com registo, e passa num controlo de qualidade entre estações vizinhas.
- **Meses em falta** (cerca de 36 % do total): precipitação estimada com a reanálise **CERRA-Land**, ajustada ao nível local de cada estação. Estes meses estão assinalados na faixa.
- **SPI**: distribuição gamma ajustada à precipitação acumulada (por mês do calendário nas escalas 1, 3 e 6), com correção de Thom para a probabilidade de zero.
- **SPEI**: balanço hídrico P−PET, com distribuição Pearson III. A PET parte da fórmula de Hargreaves-Samani, mas usa radiação solar à superfície em vez de radiação extraterrestre; o efeito medido no SPEI é pequeno.
- **Ajuste por período**: as séries das estações mostram uma quebra de nível entre 2001 e 2009, de causa por confirmar. SPI e SPEI são ajustados em separado antes e depois dessa quebra, por isso **mostram secas relativas a cada período, mas não servem para ler tendências de longo prazo**.
- **scPDSI**: balanço de água no solo em duas camadas (Palmer, 1965), recalibrado ao clima de cada estação (Wells et al., 2004), com PET por Thornthwaite. Não tem ajuste por período e continua afetado pela quebra, por isso não tem episódios marcados.
- **Episódios**: calculados da média das estações, em SPI e SPEI nas escalas de 6 e 12 meses, a partir da definição de McKee et al. (1993). Não são ordenados por gravidade, porque essa ordem muda entre produtos de referência.
- **Índice de risco**: construção interna do projeto, com frequência (37,5 %), severidade (37,5 %) e recorrência (25 %). Não tem validação externa.
- **Interpolação espacial**: IDW. Sem autocorrelação espacial significativa detetável (I de Moran), o mapa é uma estimativa aproximada entre estações, não uma medição contínua.
- **Validação**: comparação com SPEIbase, CRU scPDSI, TerraClimate, ERA5-Land e normais climatológicas do IPMA.

## Fontes de dados

- **Precipitação observada**: SNIRH, Sistema Nacional de Informação de Recursos Hídricos.
- **Precipitação de preenchimento**: CERRA-Land (Copernicus Climate Change Service, C3S), licença CC-BY, DOI [10.24381/cds.a7f3cd0b](https://doi.org/10.24381/cds.a7f3cd0b). Valores agregados por mês e corrigidos ao nível local de cada estação. Contém informação modificada do Copernicus Climate Change Service (2026).
- **Temperatura e radiação**: ERA5-Land (Copernicus Climate Change Service, C3S).
- **Normais climatológicas 1991–2020, usadas como controlo**: IPMA, Instituto Português do Mar e da Atmosfera.

## Stack

| Camada | Tecnologia |
|---|---|
| Interpolação e pipeline (privado) | Python · pandas · scipy · geopandas/shapely · rasterio/GDAL · matplotlib · R (scPDSI) |
| Frontend (este repositório) | JavaScript vanilla · Leaflet · Chart.js |
| Dados | GeoJSON (isobandas), JSON (séries temporais) |

## Nota sobre este repositório

Este é um instantâneo estático para demonstração: não corre o pipeline, não recalcula nada e não inclui os dados brutos das estações nem o código de processamento. Todos os direitos reservados; não é software de código aberto. Os dados de terceiros mantêm as licenças indicadas em cima.

---

Daniel Rodrigues
