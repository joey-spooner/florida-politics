/**
 * parse_legislature.ts
 *
 * Reads data/interim/legislature_by_year.csv (produced by fetch_legislature.ts)
 * and outputs public/data/legislature_by_year.json.
 *
 * Applies the mapYear logic: each legislative year maps to the nearest
 * prior gubernatorial primary year so the chart can link to the correct map.
 *
 * Run: npm run data:parse-legislature
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { mapLegYearToGovYear } from "./types.js";

const INTERIM_DIR = "data/interim";
const PUBLIC_DATA_DIR = "public/data";

mkdirSync(PUBLIC_DATA_DIR, { recursive: true });

function main() {
  const csvPath = join(INTERIM_DIR, "legislature_by_year.csv");
  const raw = readFileSync(csvPath, "utf-8");
  const lines = raw.trim().split("\n");

  if (lines.length < 2) throw new Error("CSV is empty or missing header");

  const header = lines[0].split(",");
  const yearIdx = header.indexOf("year");
  const houseDemIdx = header.indexOf("house_dem");
  const houseRepIdx = header.indexOf("house_rep");
  const senateDemIdx = header.indexOf("senate_dem");
  const senateRepIdx = header.indexOf("senate_rep");

  if ([yearIdx, houseDemIdx, houseRepIdx, senateDemIdx, senateRepIdx].includes(-1)) {
    throw new Error(`Missing expected columns in CSV. Found: ${header.join(", ")}`);
  }

  const results = [];

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cols = line.split(",");

    const year = parseInt(cols[yearIdx], 10);
    const houseDem = parseInt(cols[houseDemIdx], 10);
    const houseRep = parseInt(cols[houseRepIdx], 10);
    const senateDem = parseInt(cols[senateDemIdx], 10);
    const senateRep = parseInt(cols[senateRepIdx], 10);

    if (isNaN(year)) continue;

    // Validate
    if (!isNaN(houseDem) && !isNaN(houseRep) && houseDem + houseRep > 125) {
      console.warn(`WARN: ${year} House total ${houseDem + houseRep} > 120`);
    }
    if (!isNaN(senateDem) && !isNaN(senateRep) && senateDem + senateRep > 45) {
      console.warn(`WARN: ${year} Senate total ${senateDem + senateRep} > 40`);
    }

    const totalDem =
      (isNaN(houseDem) ? 0 : houseDem) + (isNaN(senateDem) ? 0 : senateDem);
    const totalRep =
      (isNaN(houseRep) ? 0 : houseRep) + (isNaN(senateRep) ? 0 : senateRep);

    results.push({
      year,
      house_dem: isNaN(houseDem) ? null : houseDem,
      house_rep: isNaN(houseRep) ? null : houseRep,
      senate_dem: isNaN(senateDem) ? null : senateDem,
      senate_rep: isNaN(senateRep) ? null : senateRep,
      total_dem: totalDem,
      total_rep: totalRep,
      source: "Ballotpedia Florida House/Senate partisan history tables (1992-2024). Pre-2006 data sourced from Michael Dubin.",
      mapYear: mapLegYearToGovYear(year),
    });
  }

  results.sort((a, b) => a.year - b.year);

  const outPath = join(PUBLIC_DATA_DIR, "legislature_by_year.json");
  writeFileSync(outPath, JSON.stringify(results, null, 2), "utf-8");
  console.log(`Wrote ${results.length} years to ${outPath}`);
}

main();
