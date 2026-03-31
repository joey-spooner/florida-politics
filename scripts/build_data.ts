/**
 * build_data.ts
 *
 * Final build step. Copies normalized county data from data/interim/counties_{year}.json
 * to public/data/gov_primary_counties/{year}.json and generates metadata.json.
 *
 * Also validates data quality before writing.
 *
 * Run: npm run data:build
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
} from "fs";
import { join } from "path";

const INTERIM_DIR = "data/interim";
const PUBLIC_DATA_DIR = "public/data";
const PUBLIC_COUNTIES_DIR = join(PUBLIC_DATA_DIR, "gov_primary_counties");
const PUBLIC_GENERAL_DIR  = join(PUBLIC_DATA_DIR, "gov_general_counties");

mkdirSync(PUBLIC_COUNTIES_DIR, { recursive: true });
mkdirSync(PUBLIC_GENERAL_DIR,  { recursive: true });

// Target years (1998 excluded: uncontested both sides, Atlas data corrupted)
const TARGET_YEARS = [1994, 2002, 2006, 2010, 2014, 2018, 2022];

const ALL_FL_COUNTIES = [
  "Alachua", "Baker", "Bay", "Bradford", "Brevard", "Broward", "Calhoun",
  "Charlotte", "Citrus", "Clay", "Collier", "Columbia", "DeSoto", "Dixie",
  "Duval", "Escambia", "Flagler", "Franklin", "Gadsden", "Gilchrist", "Glades",
  "Gulf", "Hamilton", "Hardee", "Hendry", "Hernando", "Highlands", "Hillsborough",
  "Holmes", "Indian River", "Jackson", "Jefferson", "Lafayette", "Lake", "Lee",
  "Leon", "Levy", "Liberty", "Madison", "Manatee", "Marion", "Martin",
  "Miami-Dade", "Monroe", "Nassau", "Okaloosa", "Okeechobee", "Orange", "Osceola",
  "Palm Beach", "Pasco", "Pinellas", "Polk", "Putnam", "St. Johns", "St. Lucie",
  "Santa Rosa", "Sarasota", "Seminole", "Sumter", "Suwannee", "Taylor", "Union",
  "Volusia", "Wakulla", "Walton", "Washington",
];

interface ValidationResult {
  year: number;
  ok: boolean;
  countyCount: number;
  missingCounties: string[];
  warnings: string[];
}

function validate(data: Record<string, unknown>): ValidationResult {
  const year = data.year as number;
  const counties = (data.counties as Array<Record<string, unknown>>) ?? [];
  const warnings: string[] = [];

  const presentCounties = new Set(counties.map((c) => c.county as string));
  const missingCounties = ALL_FL_COUNTIES.filter((c) => !presentCounties.has(c));

  if (missingCounties.length > 0) {
    warnings.push(`Missing ${missingCounties.length} counties: ${missingCounties.join(", ")}`);
  }

  // Check for counties with null winner (should be documented)
  const nullWinners = counties.filter((c) => c.winnerParty === null);
  if (nullWinners.length > 0) {
    warnings.push(`${nullWinners.length} counties have null winnerParty`);
  }

  // Check for unexpected county names
  const unknownCounties = [...presentCounties].filter(
    (c) => !ALL_FL_COUNTIES.includes(c)
  );
  if (unknownCounties.length > 0) {
    warnings.push(`Unrecognized county names: ${unknownCounties.join(", ")}`);
  }

  return {
    year,
    ok: missingCounties.length < 10 && unknownCounties.length === 0,
    countyCount: counties.length,
    missingCounties,
    warnings,
  };
}

function main() {
  const includedYears: number[] = [];
  const excludedYears: Array<{ year: number; reason: string }> = [
    {
      year: 1998,
      reason:
        "Both gubernatorial primaries were uncontested (MacKay D, Bush R). US Election Atlas data for this year is corrupted — it shows the 1998 general election mislabeled as primary data.",
    },
  ];

  const validationResults: ValidationResult[] = [];

  for (const year of TARGET_YEARS) {
    const interimPath = join(INTERIM_DIR, `counties_${year}.json`);

    if (!existsSync(interimPath)) {
      console.warn(`SKIP ${year}: ${interimPath} not found. Run parse-elections first.`);
      excludedYears.push({ year, reason: "Data not yet parsed (run parse-elections)" });
      continue;
    }

    const data = JSON.parse(readFileSync(interimPath, "utf-8"));
    const validation = validate(data);
    validationResults.push(validation);

    if (!validation.ok) {
      console.warn(`WARN ${year}: validation issues`);
    }

    for (const w of validation.warnings) {
      console.log(`  [${year}] ${w}`);
    }

    // Write to public dir
    const outPath = join(PUBLIC_COUNTIES_DIR, `${year}.json`);
    writeFileSync(outPath, JSON.stringify(data, null, 2), "utf-8");
    includedYears.push(year);
    console.log(`✓ ${year}: ${validation.countyCount} counties → ${outPath}`);
  }

  // Build general election files
  const GENERAL_YEARS = [1994, 1998, 2002, 2006, 2010, 2014, 2018, 2022];
  const includedGeneralYears: number[] = [];
  for (const year of GENERAL_YEARS) {
    const interimPath = join(INTERIM_DIR, `general_${year}.json`);
    if (!existsSync(interimPath)) {
      console.warn(`SKIP general ${year}: not found (run parse-general first)`);
      continue;
    }
    const data = JSON.parse(readFileSync(interimPath, "utf-8"));
    const outPath = join(PUBLIC_GENERAL_DIR, `${year}.json`);
    writeFileSync(outPath, JSON.stringify(data, null, 2), "utf-8");
    includedGeneralYears.push(year);
    console.log(`✓ general ${year}: ${(data.counties as unknown[]).length} counties → ${outPath}`);
  }

  // Read legislature data to get coverage range
  const legPath = join(PUBLIC_DATA_DIR, "legislature_by_year.json");
  let legFrom = 1992;
  let legTo = 2024;
  if (existsSync(legPath)) {
    const legData = JSON.parse(readFileSync(legPath, "utf-8")) as Array<{ year: number }>;
    if (legData.length > 0) {
      legFrom = Math.min(...legData.map((d) => d.year));
      legTo = Math.max(...legData.map((d) => d.year));
    }
  }

  // Write metadata
  const metadata = {
    siteTitle: "Florida Politics",
    coverage: {
      legislatureFrom: legFrom,
      legislatureTo: legTo,
      governorPrimaryYears: includedYears,
      governorPrimaryExcluded: excludedYears,
    },
    coloringMethod:
      "Counties colored by which major party drew the higher total votes in its gubernatorial primary in that county. When only one party held a contested primary (e.g. 2002, 2022), only that party's votes are available and the county is colored by that party.",
    dataGaps: [
      "1998: Both primaries uncontested. Excluded from map.",
      "2002: Republican primary uncontested (Jeb Bush). Only Democratic primary data used for county coloring.",
      "2022: Republican primary canceled (DeSantis incumbent). Only Democratic primary data used for county coloring.",
    ],
    sources: [
      "Florida Division of Elections (dos.fl.gov) — precinct-level election results 2014–2022",
      "Florida Division of Elections archive (results.elections.myflorida.com) — county-level results 1994–2010",
      "Ballotpedia Florida House of Representatives — partisan history 1992–2024",
      "Ballotpedia Florida Senate — partisan history 1992–2024",
      "US Atlas TopoJSON (github.com/topojson/us-atlas) — Florida county geometry",
    ],
    buildDate: new Date().toISOString().split("T")[0],
    validation: validationResults,
  };

  const metaPath = join(PUBLIC_DATA_DIR, "metadata.json");
  writeFileSync(metaPath, JSON.stringify(metadata, null, 2), "utf-8");
  console.log(`\nWrote metadata: ${metaPath}`);
  console.log(`Included years: ${includedYears.join(", ")}`);
  console.log(`Excluded years: ${excludedYears.map((e) => e.year).join(", ")}`);
}

main();
