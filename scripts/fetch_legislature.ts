/**
 * fetch_legislature.ts
 *
 * Scrapes Ballotpedia partisan composition tables for Florida House and Senate.
 * Sources:
 *   https://ballotpedia.org/Florida_House_of_Representatives
 *   https://ballotpedia.org/Florida_Senate
 *
 * Saves raw HTML snapshots to data/raw/ and structured CSV to data/interim/.
 *
 * Run: npm run data:fetch-legislature
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import * as cheerio from "cheerio";

const RAW_DIR = "data/raw";
const INTERIM_DIR = "data/interim";

mkdirSync(RAW_DIR, { recursive: true });
mkdirSync(INTERIM_DIR, { recursive: true });

interface ChamberRow {
  year: number;
  dem: number;
  rep: number;
  other: number;
  total: number;
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; FloridaPoliticsBot/1.0; research project)",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

function parsePartisanTable(html: string, chamber: string): ChamberRow[] {
  const $ = cheerio.load(html);
  const rows: ChamberRow[] = [];

  // Ballotpedia's historical partisan table is TRANSPOSED:
  //   Row 0 (header): "Year" | '92 | '94 | '96 | ... (years as columns)
  //   Row 1: "Democrats" | 71 | 63 | 59 | ...
  //   Row 2: "Republicans" | 49 | 57 | 61 | ...
  //
  // We find the wikitable with style="width:90%" and parse accordingly.

  $("table.wikitable").each((_i, table) => {
    const tableRows = $(table).find("tr").toArray();
    if (tableRows.length < 3) return;

    // First row: year headers
    const headerCells = $(tableRows[0])
      .find("th, td")
      .map((_j, cell) => $(cell).text().trim())
      .get();

    // Check that first cell is "Year" and others look like years ('92, '94...)
    if (!headerCells[0]?.toLowerCase().includes("year")) return;

    // Parse years from header row (format: '92, '94 → 1992, 1994)
    const yearCols: Array<{ colIdx: number; year: number }> = [];
    headerCells.forEach((h, i) => {
      if (i === 0) return;
      const match = h.match(/'(\d{2})/);
      if (match) {
        const twoDigit = parseInt(match[1], 10);
        const fullYear = twoDigit >= 90 ? 1900 + twoDigit : 2000 + twoDigit;
        yearCols.push({ colIdx: i, year: fullYear });
      }
    });

    if (yearCols.length === 0) return;

    // Find Dem and Rep rows by their first cell label
    let demValues: Map<number, number> | null = null;
    let repValues: Map<number, number> | null = null;

    for (let r = 1; r < tableRows.length; r++) {
      const cells = $(tableRows[r])
        .find("th, td")
        .map((_j, cell) => $(cell).text().trim())
        .get();
      if (cells.length < 2) continue;

      const label = cells[0].toLowerCase();
      if (label.includes("democrat")) {
        demValues = new Map();
        for (const { colIdx, year } of yearCols) {
          const val = parseInt(cells[colIdx]?.replace(/[^0-9]/g, ""), 10);
          if (!isNaN(val)) demValues.set(year, val);
        }
      } else if (label.includes("republican")) {
        repValues = new Map();
        for (const { colIdx, year } of yearCols) {
          const val = parseInt(cells[colIdx]?.replace(/[^0-9]/g, ""), 10);
          if (!isNaN(val)) repValues.set(year, val);
        }
      }
    }

    if (!demValues || !repValues || demValues.size === 0) return;

    for (const { year } of yearCols) {
      const dem = demValues.get(year) ?? NaN;
      const rep = repValues.get(year) ?? NaN;
      if (isNaN(dem) || isNaN(rep)) continue;
      rows.push({ year, dem, rep, other: 0, total: dem + rep });
    }

    console.log(`  [${chamber}] Parsed transposed wikitable: ${rows.length} years`);
  });

  return rows;
}

async function main() {
  const sources = [
    {
      chamber: "house",
      url: "https://ballotpedia.org/Florida_House_of_Representatives",
      expectedTotal: 120,
    },
    {
      chamber: "senate",
      url: "https://ballotpedia.org/Florida_Senate",
      expectedTotal: 40,
    },
  ];

  const results: Record<string, ChamberRow[]> = {};

  for (const { chamber, url, expectedTotal } of sources) {
    console.log(`Fetching ${chamber}: ${url}`);
    const html = await fetchPage(url);

    // Save raw HTML snapshot
    const rawPath = join(RAW_DIR, `ballotpedia_fl_${chamber}_${Date.now()}.html`);
    writeFileSync(rawPath, html, "utf-8");
    console.log(`  Saved raw HTML: ${rawPath}`);

    const rows = parsePartisanTable(html, chamber);

    if (rows.length === 0) {
      console.error(`  ERROR: No rows parsed for ${chamber}. Check table format.`);
      process.exit(1);
    }

    // Validate
    for (const row of rows) {
      if (row.total !== expectedTotal) {
        console.warn(
          `  WARN [${chamber} ${row.year}]: total=${row.total}, expected ${expectedTotal}`
        );
      }
    }

    results[chamber] = rows.sort((a, b) => a.year - b.year);
    console.log(`  Parsed ${rows.length} years for ${chamber}`);
  }

  // Write interim CSV
  const houseRows = results["house"] ?? [];
  const senateRows = results["senate"] ?? [];

  // Merge by year
  const allYears = new Set([
    ...houseRows.map((r) => r.year),
    ...senateRows.map((r) => r.year),
  ]);

  const houseMap = new Map(houseRows.map((r) => [r.year, r]));
  const senateMap = new Map(senateRows.map((r) => [r.year, r]));

  const lines = ["year,house_dem,house_rep,senate_dem,senate_rep"];
  for (const year of [...allYears].sort()) {
    const h = houseMap.get(year);
    const s = senateMap.get(year);
    lines.push(
      `${year},${h?.dem ?? ""},${h?.rep ?? ""},${s?.dem ?? ""},${s?.rep ?? ""}`
    );
  }

  const csvPath = join(INTERIM_DIR, "legislature_by_year.csv");
  writeFileSync(csvPath, lines.join("\n"), "utf-8");
  console.log(`\nWrote ${csvPath}`);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
