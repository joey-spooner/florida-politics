# Florida Politics

A static data visualization exploring Florida political change over time — built for [Spooner Labs](https://spoonerlabs.com).

**Live:** [spoonerlabs.com/florida-politics](https://spoonerlabs.com/florida-politics)

---

## What it shows

- **Line chart** — combined Florida House + Senate seat counts by party, 1992–2024
- **County map** — 67-county choropleth colored by Democratic vs Republican winner in each year's gubernatorial primary
- Click any year on the chart to update the map

---

## Stack

- [Vite](https://vitejs.dev) + TypeScript
- [D3.js](https://d3js.org) for chart and map rendering
- [us-atlas](https://github.com/topojson/us-atlas) for Florida county geometry
- No server runtime — fully static, deployed to [spoonerlabs.com](https://spoonerlabs.com)

---

## Data sources

| Data | Source |
|------|--------|
| Legislature party totals (1992–2024) | Ballotpedia Florida House/Senate partisan history tables |
| Gubernatorial primary county results (2014, 2018, 2022) | Florida Division of Elections precinct-level ZIP files |
| Gubernatorial primary county results (1994, 2002, 2006, 2010) | Florida DoE results archive (`ResultsExtract.Asp` bulk TSV) |
| County geometry | [us-atlas](https://github.com/topojson/us-atlas) `counties-10m.json`, filtered to FIPS 12xxx |

**Excluded years:**
- **1998** — both primaries uncontested; available data source contains corrupted entries (shows general election results mislabeled as primary)
- **1992** — no gubernatorial primary held that cycle

---

## Local development

```bash
npm install
npm run dev        # dev server at localhost:5173
npm run build      # production build → dist/
npm run preview    # preview production build locally
```

---

## Data pipeline

Raw data is not committed to the repo. To regenerate from source:

```bash
npm run data:all
```

Individual steps:
```bash
npm run data:fetch-legislature    # scrape Ballotpedia
npm run data:fetch-zips           # download FL DoE precinct ZIPs (2014/2018/2022)
npm run data:fetch-elections      # download FL DoE ResultsExtract (1994/2002/2006/2010)
npm run data:parse-legislature    # CSV → public/data/legislature_by_year.json
npm run data:parse-elections      # ZIP TXTs → data/interim/counties_{year}.json
npm run data:normalize            # DoE extracts → data/interim/counties_{year}.json
npm run data:build                # validate + copy → public/data/gov_primary_counties/
```

---

## Deploy

Syncs the production build to the parent site repo:

```bash
npm run deploy
```

Builds `dist/` and rsyncs it to `../spoonerlabs-site/florida-politics/`. Then commit and push from the spoonerlabs-site repo.

---

## County coloring logic

Each county is colored by whichever major party drew more total votes in its gubernatorial primary contest that year. When only one party held a contested primary (e.g., 2002 and 2022 Republican primaries were uncontested), the county is colored by the party with available data.
