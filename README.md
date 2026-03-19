# 🌿 Nabolagsguiden

> Analyser kvaliteten i ditt nabolag basert på dagligvare, transport, skoler, helse, parker og matplasser.

**[Live Demo →](https://nabolagsguiden.netlify.app)**

---

## What it does

Nabolagsguiden lets you type in any Norwegian address and instantly get a neighborhood quality score (0–100) across 6 categories, all powered by real live map data.

- Enter an address → get a full analysis in seconds
- See all nearby points of interest plotted on an interactive map
- Compare two neighborhoods side by side
- Adjust the search radius (500m, 1km, 2km, 3km)

---

## Screenshots

![image alt](https://github.com/abdikarimAK/Nabolagsguiden/blob/bd6c15ee1de3efc74407284fccbe16635f885831/og-image.png)

---

## Categories scored

| Category | What it looks for |
|---|---|
| Dagligvare | Supermarkets, convenience stores, grocery shops |
| Kollektivtransport | Bus stops, tram stops, train stations |
| Skoler & barnehager | Schools, kindergartens, colleges |
| Helse & apotek | Pharmacies, hospitals, clinics, doctors, dentists |
| Parker & friluft | Parks, playgrounds, sports centres, pitches |
| Mat & kafé | Restaurants, cafes, fast food, bars |

Scores are **distance-weighted** — a grocery store 100m away counts more than one 900m away. Targets are also **auto-calibrated** for urban vs rural areas so smaller towns aren't unfairly penalised.

---

## Tech stack

This is a fully **vanilla HTML/CSS/JavaScript** project — no frameworks, no build tools, no dependencies to install.

| Tool | Purpose |
|---|---|
| [Leaflet.js](https://leafletjs.com/) | Interactive map |
| [OpenStreetMap / Nominatim](https://nominatim.org/) | Address geocoding |
| [Overpass API](https://overpass-api.de/) | POI data fetching |
| [CartoDB Voyager](https://carto.com/) | Map tile layer |
| [Google Fonts](https://fonts.google.com/) | DM Sans + Playfair Display |

No API keys required. All data sources are free and open.


## How scoring works

1. **Geocode** the address using Nominatim (OSM)
2. **Fetch POIs** within the selected radius via the Overpass API
3. **Weight each place** by distance — full score within the inner 20% of radius, decreasing to 15% weight at the edge
4. **Calibrate targets** based on urban density — rural areas get lower targets so they aren't unfairly compared to cities
5. **Calculate** each category score as `min(100, weightedCount / target * 100)`
6. **Average** all 6 categories for the total score


### Verdicts

| Score | Verdict |
|---|---|
| 80–100 | Utmerket nabolag |
| 65–79 | Meget godt nabolag |
| 50–64 | Godt nabolag |
| 35–49 | Gjennomsnittlig nabolag |
| 0–34 | Begrenset nabolag |


## Features

- **Distance-weighted scoring** — proximity matters
- **Urban/rural auto-calibration** — fair scores everywhere in Norway
- **Compare mode** — analyze two addresses side by side
- **Category map toggles** — isolate one category on the map at a time
- **Search history** — last 5 searches stored locally with scores
- **30-minute result caching** — repeated searches load instantly
- **Dual Overpass mirrors** — automatic fallback if primary API is slow
- **PWA-ready** — installable as a home screen app on mobile


## Data sources & attribution

- Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)
- Geocoding by [Nominatim](https://nominatim.org/) — used in compliance with the [usage policy](https://operations.osmfoundation.org/policies/nominatim/)
- POI data via [Overpass API](https://overpass-api.de/)
- Map tiles © [CARTO](https://carto.com/attributions)


## Author

**Abdikarim Hashim** — IT & Information Systems graduate, University of South-Eastern Norway



