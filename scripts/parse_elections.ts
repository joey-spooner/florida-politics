/**
 * parse_elections.ts
 *
 * Parses raw election data from two sources:
 *
 * 1. FL DoE Playwright-scraped JSON (1994, 2002, 2006, 2010) from data/interim/doe_{year}_{party}.json
 * 2. FL DoE precinct-level ZIPs (2014, 2018, 2022) from data/raw/zips/{year}_primary/
 *
 * For each gubernatorial primary year, produces:
 *   data/interim/counties_{year}.json
 *
 * Each output file contains per-county DEM and REP total primary votes,
 * enabling the "which party drew more votes per county" coloring logic.
 *
 * Run: npm run data:parse-elections
 */

import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
} from "fs";
import { join } from "path";
import { parse as csvParse } from "csv-parse/sync";

const INTERIM_DIR = "data/interim";
const RAW_ZIPS_DIR = "data/raw/zips";

mkdirSync(INTERIM_DIR, { recursive: true });

// Governor contest name patterns for FL DoE data
const GOV_CONTEST_PATTERNS = [
  /governor/i,
  /gov\./i,
];

function isGovContest(contestName: string): boolean {
  return GOV_CONTEST_PATTERNS.some((p) => p.test(contestName));
}

interface CountyPartyVotes {
  county: string;
  fips: string | null;
  demVotes: number;
  repVotes: number;
  demCandidates: Array<{ name: string; votes: number }>;
  repCandidates: Array<{ name: string; votes: number }>;
}

// County name → FIPS mapping for Florida
// Source: US Census, modern 67-county list
const COUNTY_FIPS: Record<string, string> = {
  "Alachua": "12001", "Baker": "12003", "Bay": "12005", "Bradford": "12007",
  "Brevard": "12009", "Broward": "12011", "Calhoun": "12013", "Charlotte": "12015",
  "Citrus": "12017", "Clay": "12019", "Collier": "12021", "Columbia": "12023",
  "DeSoto": "12027", "Dixie": "12029", "Duval": "12031", "Escambia": "12033",
  "Flagler": "12035", "Franklin": "12037", "Gadsden": "12039", "Gilchrist": "12041",
  "Glades": "12043", "Gulf": "12045", "Hamilton": "12047", "Hardee": "12049",
  "Hendry": "12051", "Hernando": "12053", "Highlands": "12055", "Hillsborough": "12057",
  "Holmes": "12059", "Indian River": "12061", "Jackson": "12063", "Jefferson": "12065",
  "Lafayette": "12067", "Lake": "12069", "Lee": "12071", "Leon": "12073",
  "Levy": "12075", "Liberty": "12077", "Madison": "12079", "Manatee": "12081",
  "Marion": "12083", "Martin": "12085", "Miami-Dade": "12086", "Monroe": "12087",
  "Nassau": "12089", "Okaloosa": "12091", "Okeechobee": "12093", "Orange": "12095",
  "Osceola": "12097", "Palm Beach": "12099", "Pasco": "12101", "Pinellas": "12103",
  "Polk": "12105", "Putnam": "12107", "St. Johns": "12109", "St. Lucie": "12111",
  "Santa Rosa": "12113", "Sarasota": "12115", "Seminole": "12117", "Sumter": "12119",
  "Suwannee": "12121", "Taylor": "12123", "Union": "12125", "Volusia": "12127",
  "Wakulla": "12129", "Walton": "12131", "Washington": "12133",
};

// Normalize county name to canonical form
function normalizeCounty(raw: string): string {
  // Title-case first, preserving hyphens
  const titleCase = raw.trim().replace(/\b\w/g, (c) => c.toUpperCase());
  return titleCase
    .replace(/\bSaint\b/g, "St.")
    .replace(/\bSt\b(?!\.)/g, "St.")
    .replace(/\bDe\s+Soto\b/g, "DeSoto")
    .replace(/\bDesoto\b/g, "DeSoto")
    .replace(/\bMiami[\s-]Dade\b/g, "Miami-Dade")
    .replace(/^Dade$/g, "Miami-Dade");
}

// Parse FL DoE precinct-level CSV and aggregate to county level for governor race
function parseZipCsv(year: number): Map<string, CountyPartyVotes> {
  const extractDir = join(RAW_ZIPS_DIR, `${year}_primary`);
  if (!existsSync(extractDir)) {
    throw new Error(`Extract directory not found: ${extractDir}. Run fetch-zips first.`);
  }

  // Find the CSV file(s) in the extracted directory
  function findCsvFiles(dir: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...findCsvFiles(fullPath));
      } else if (entry.name.toLowerCase().endsWith(".txt") || entry.name.toLowerCase().endsWith(".csv")) {
        files.push(fullPath);
      }
    }
    return files;
  }

  const csvFiles = findCsvFiles(extractDir);
  if (csvFiles.length === 0) throw new Error(`No CSV/TXT files found in ${extractDir}`);
  console.log(`  Found ${csvFiles.length} data file(s) in ${extractDir}`);

  const countyMap = new Map<string, CountyPartyVotes>();

  for (const csvFile of csvFiles) {
    console.log(`  Parsing: ${csvFile}`);
    const raw = readFileSync(csvFile, "latin1"); // FL DoE files sometimes use latin1

    // FL DoE files are tab-delimited with no header row
    let records: string[][];
    try {
      records = csvParse(raw, {
        delimiter: "\t",
        skip_empty_lines: true,
        relax_column_count: true,
        relax_quotes: true,
      }) as string[][];
    } catch (err) {
      console.warn(`    Could not parse as TSV, splitting manually: ${err}`);
      records = raw.split("\n").filter(Boolean).map((l) => l.split("\t"));
    }

    for (const row of records) {
      // No header row in FL DoE files. Skip if too short.
      if (row.length < 19) continue;
      // Skip if first column looks like a header (just in case)
      if (row[0]?.toLowerCase() === "county code") continue;

      // Columns (0-indexed per official schema, 1-indexed in docs):
      // Col 0 (doc:1): County Code
      // Col 1 (doc:2): County Name
      // Col 11 (doc:12): Contest Name
      // Col 14 (doc:15): Candidate Name
      // Col 15 (doc:16): Candidate Party
      // Col 17 (doc:18): DOE Candidate Number (900=WriteIn, 901=OverVotes, 902=UnderVotes)
      // Col 18 (doc:19): Vote Total
      const countyName = normalizeCounty(row[1] ?? "");
      const contestName = row[11] ?? "";
      const candidateParty = (row[15] ?? "").trim().toUpperCase();
      const candidateName = (row[14] ?? "").trim();
      const voteTotal = parseInt((row[18] ?? "0").replace(/,/g, ""), 10);

      if (!isGovContest(contestName)) continue;
      if (!["DEM", "REP"].includes(candidateParty)) continue;
      if (isNaN(voteTotal) || voteTotal < 0) continue;
      // Skip over/under votes and write-ins for candidate totals
      const candidateNum = (row[17] ?? "").trim();
      if (["900", "901", "902"].includes(candidateNum)) continue;
      if (!countyName) continue;

      if (!countyMap.has(countyName)) {
        countyMap.set(countyName, {
          county: countyName,
          fips: COUNTY_FIPS[countyName] ?? null,
          demVotes: 0,
          repVotes: 0,
          demCandidates: [],
          repCandidates: [],
        });
      }

      const entry = countyMap.get(countyName)!;

      if (candidateParty === "DEM") {
        entry.demVotes += voteTotal;
        const existing = entry.demCandidates.find((c) => c.name === candidateName);
        if (existing) existing.votes += voteTotal;
        else entry.demCandidates.push({ name: candidateName, votes: voteTotal });
      } else if (candidateParty === "REP") {
        entry.repVotes += voteTotal;
        const existing = entry.repCandidates.find((c) => c.name === candidateName);
        if (existing) existing.votes += voteTotal;
        else entry.repCandidates.push({ name: candidateName, votes: voteTotal });
      }
    }
  }

  return countyMap;
}

// Parse Playwright-scraped DoE HTML results (JSON intermediates from fetch_elections.ts)
function parseDoeJson(
  year: number,
  party: "DEM" | "REP"
): Map<string, { candidates: Array<{ name: string; votes: number }>; totalVotes: number }> {
  const path = join(INTERIM_DIR, `doe_${year}_${party.toLowerCase()}.json`);
  if (!existsSync(path)) return new Map();

  const data = JSON.parse(readFileSync(path, "utf-8"));
  const result = new Map<string, { candidates: Array<{ name: string; votes: number }>; totalVotes: number }>();

  for (const county of data.counties ?? []) {
    const normalized = normalizeCounty(county.county ?? "");
    if (!normalized) continue;
    result.set(normalized, {
      candidates: county.candidates ?? [],
      totalVotes: county.totalVotes ?? 0,
    });
  }

  return result;
}

function buildCountyOutput(
  year: number,
  primaryDate: string,
  countyMap: Map<string, CountyPartyVotes>,
  notes: string[]
) {
  const counties = [];

  for (const [county, data] of countyMap.entries()) {
    const fips = data.fips ?? COUNTY_FIPS[county] ?? null;

    let winnerParty: "DEM" | "REP" | null = null;
    if (data.demVotes > 0 && data.repVotes > 0) {
      winnerParty = data.demVotes >= data.repVotes ? "DEM" : "REP";
    } else if (data.demVotes > 0) {
      winnerParty = "DEM";
    } else if (data.repVotes > 0) {
      winnerParty = "REP";
    }

    // Top candidate per party
    const topDem = data.demCandidates.sort((a, b) => b.votes - a.votes)[0];
    const topRep = data.repCandidates.sort((a, b) => b.votes - a.votes)[0];
    const winnerCandidate =
      winnerParty === "DEM" ? topDem?.name ?? null : topRep?.name ?? null;

    counties.push({
      county,
      fips,
      winnerParty,
      winnerCandidate,
      demVotes: data.demVotes || null,
      repVotes: data.repVotes || null,
      totalVotes: (data.demVotes || 0) + (data.repVotes || 0) || null,
      source: `Florida Division of Elections`,
    });
  }

  // Sort by county name
  counties.sort((a, b) => a.county.localeCompare(b.county));

  return {
    year,
    primaryDate,
    electionType: "gubernatorial_primary",
    countyCount: counties.length,
    notes,
    source: `Florida Division of Elections (dos.fl.gov / results.elections.myflorida.com)`,
    parsedAt: new Date().toISOString(),
    counties,
  };
}

async function main() {
  // Years with FL DoE ZIP data (precinct-level CSV)
  const zipYears: Array<{ year: number; date: string; notes: string[] }> = [
    { year: 2022, date: "2022-08-23", notes: ["Republican primary canceled — DeSantis uncontested; only Democratic primary votes available"] },
    { year: 2018, date: "2018-08-28", notes: [] },
    { year: 2014, date: "2014-08-26", notes: [] },
  ];

  for (const { year, date, notes } of zipYears) {
    const outPath = join(INTERIM_DIR, `counties_${year}.json`);
    console.log(`\nParsing ${year} ZIP data...`);

    try {
      const countyMap = parseZipCsv(year);
      console.log(`  Aggregated ${countyMap.size} counties`);

      if (countyMap.size === 0) {
        console.warn(`  WARNING: No governor race data found in ${year} ZIP. Check contest name filter.`);
      }

      const output = buildCountyOutput(year, date, countyMap, notes);
      writeFileSync(outPath, JSON.stringify(output, null, 2), "utf-8");
      console.log(`  Wrote ${outPath}`);
    } catch (err) {
      console.error(`  FAILED ${year}:`, err);
    }
  }

  // Years with Playwright-scraped DoE data
  const doeYears: Array<{
    year: number;
    date: string;
    parties: Array<"DEM" | "REP">;
    notes: string[];
  }> = [
    { year: 1994, date: "1994-09-08", parties: ["DEM", "REP"], notes: ["R: Bush plurality; Smith withdrew before runoff"] },
    { year: 2002, date: "2002-09-10", parties: ["DEM"], notes: ["Republican primary uncontested (Jeb Bush); only Democratic primary has competitive data"] },
    { year: 2006, date: "2006-09-05", parties: ["DEM", "REP"], notes: [] },
    { year: 2010, date: "2010-08-24", parties: ["DEM", "REP"], notes: [] },
  ];

  for (const { year, date, parties, notes } of doeYears) {
    const outPath = join(INTERIM_DIR, `counties_${year}.json`);
    console.log(`\nParsing ${year} Playwright-scraped data...`);

    const countyMap = new Map<string, CountyPartyVotes>();

    for (const party of parties) {
      const partyData = parseDoeJson(year, party);
      if (partyData.size === 0) {
        console.warn(`  WARNING: No data found for ${year} ${party} (${join(INTERIM_DIR, `doe_${year}_${party.toLowerCase()}.json`)})`);
        continue;
      }
      console.log(`  ${party}: ${partyData.size} counties`);

      for (const [county, data] of partyData.entries()) {
        if (!countyMap.has(county)) {
          countyMap.set(county, {
            county,
            fips: COUNTY_FIPS[county] ?? null,
            demVotes: 0,
            repVotes: 0,
            demCandidates: [],
            repCandidates: [],
          });
        }
        const entry = countyMap.get(county)!;
        if (party === "DEM") {
          entry.demVotes = data.totalVotes;
          entry.demCandidates = data.candidates;
        } else {
          entry.repVotes = data.totalVotes;
          entry.repCandidates = data.candidates;
        }
      }
    }

    if (countyMap.size === 0) {
      console.warn(`  Skipping ${year} — no data parsed yet. Run fetch-elections first.`);
      continue;
    }

    const output = buildCountyOutput(year, date, countyMap, notes);
    writeFileSync(outPath, JSON.stringify(output, null, 2), "utf-8");
    console.log(`  Wrote ${outPath} (${countyMap.size} counties)`);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
