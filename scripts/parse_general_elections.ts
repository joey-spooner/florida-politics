/**
 * parse_general_elections.ts
 *
 * Parses raw gubernatorial general election data from two sources:
 *   1. FL DoE archive JSON (1994, 1998, 2002, 2006, 2010) from data/interim/doe_general_{year}.json
 *   2. FL DoE precinct-level ZIPs (2014, 2018, 2022) from data/raw/zips/{year}_general/
 *
 * Outputs: data/interim/general_{year}.json  (same schema as counties_{year}.json)
 *
 * Run: npm run data:parse-general
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { parse as csvParse } from "csv-parse/sync";

const INTERIM_DIR = "data/interim";
const RAW_ZIPS_DIR = "data/raw/zips";
mkdirSync(INTERIM_DIR, { recursive: true });

const GOV_CONTEST_PATTERNS = [/governor/i, /gov\./i];
function isGovContest(name: string): boolean {
  return GOV_CONTEST_PATTERNS.some((p) => p.test(name));
}

// Same FIPS map as parse_elections.ts
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

function normalizeCounty(raw: string): string {
  return raw.trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bSaint\b/g, "St.")
    .replace(/\bSt\b(?!\.)/g, "St.")
    .replace(/\bDe\s+Soto\b/g, "DeSoto")
    .replace(/\bDesoto\b/g, "DeSoto")
    .replace(/\bMiami[\s-]Dade\b/g, "Miami-Dade")
    .replace(/^Dade$/g, "Miami-Dade");
}

interface CountyPartyVotes {
  county: string;
  fips: string | null;
  demVotes: number;
  repVotes: number;
  demCandidate: string | null;
  repCandidate: string | null;
}

function findCsvFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...findCsvFiles(full));
    else if (/\.(txt|csv)$/i.test(entry.name)) files.push(full);
  }
  return files;
}

// Parse general election from precinct-level ZIP CSV (2014, 2018, 2022)
function parseGeneralZipCsv(year: number, demCandidate: string, repCandidate: string): Map<string, CountyPartyVotes> {
  const extractDir = join(RAW_ZIPS_DIR, `${year}_general`);
  if (!existsSync(extractDir)) {
    throw new Error(`Not found: ${extractDir}. Run data:fetch-general-zips first.`);
  }

  const csvFiles = findCsvFiles(extractDir);
  if (csvFiles.length === 0) throw new Error(`No data files in ${extractDir}`);
  console.log(`  Found ${csvFiles.length} file(s) in ${extractDir}`);

  const countyMap = new Map<string, CountyPartyVotes>();

  for (const csvFile of csvFiles) {
    console.log(`  Parsing: ${csvFile}`);
    const raw = readFileSync(csvFile, "latin1");

    let records: string[][];
    try {
      records = csvParse(raw, { delimiter: "\t", skip_empty_lines: true, relax_column_count: true, relax_quotes: true }) as string[][];
    } catch {
      records = raw.split("\n").filter(Boolean).map((l) => l.split("\t"));
    }

    for (const row of records) {
      if (row.length < 19) continue;
      if ((row[0] ?? "").toLowerCase() === "county code") continue;

      const countyName     = normalizeCounty(row[1] ?? "");
      const contestName    = row[11] ?? "";
      const candidateParty = (row[15] ?? "").trim().toUpperCase();
      const candidateName  = (row[14] ?? "").trim();
      const voteTotal      = parseInt((row[18] ?? "0").replace(/,/g, ""), 10);
      const candidateNum   = (row[17] ?? "").trim();

      if (!isGovContest(contestName)) continue;
      if (!["DEM", "REP"].includes(candidateParty)) continue;
      if (isNaN(voteTotal) || voteTotal < 0) continue;
      if (["900", "901", "902"].includes(candidateNum)) continue;
      if (!countyName) continue;

      if (!countyMap.has(countyName)) {
        countyMap.set(countyName, {
          county: countyName,
          fips: COUNTY_FIPS[countyName] ?? null,
          demVotes: 0, repVotes: 0,
          demCandidate, repCandidate,
        });
      }

      const entry = countyMap.get(countyName)!;
      if (candidateParty === "DEM") entry.demVotes += voteTotal;
      else entry.repVotes += voteTotal;
    }
  }

  return countyMap;
}

// County code → canonical name (same mapping as parse_doe_extracts.ts)
const COUNTY_CODE_TO_NAME: Record<string, string> = {
  ALA: "Alachua", BAK: "Baker", BAY: "Bay", BRA: "Bradford", BRE: "Brevard",
  BRO: "Broward", CAL: "Calhoun", CHA: "Charlotte", CIT: "Citrus", CLA: "Clay",
  CLL: "Collier", CLM: "Columbia", DES: "DeSoto", DIX: "Dixie", DUV: "Duval",
  ESC: "Escambia", FLA: "Flagler", FRA: "Franklin", GAD: "Gadsden", GIL: "Gilchrist",
  GLA: "Glades", GUL: "Gulf", HAM: "Hamilton", HAR: "Hardee", HEN: "Hendry",
  HER: "Hernando", HIG: "Highlands", HIL: "Hillsborough", HOL: "Holmes",
  IND: "Indian River", JAC: "Jackson", JEF: "Jefferson", LAF: "Lafayette",
  LAK: "Lake", LEE: "Lee", LEO: "Leon", LEV: "Levy", LIB: "Liberty",
  MAD: "Madison", MAN: "Manatee", MRN: "Marion", MRT: "Martin", DAD: "Miami-Dade",
  MON: "Monroe", NAS: "Nassau", OKA: "Okaloosa", OKE: "Okeechobee", ORA: "Orange",
  OSC: "Osceola", PAL: "Palm Beach", PAS: "Pasco", PIN: "Pinellas", POL: "Polk",
  PUT: "Putnam", SAN: "Santa Rosa", SAR: "Sarasota", SEM: "Seminole",
  STJ: "St. Johns", STL: "St. Lucie", SUM: "Sumter", SUW: "Suwannee",
  TAY: "Taylor", UNI: "Union", VOL: "Volusia", WAK: "Wakulla", WAL: "Walton",
  WAS: "Washington",
};

// Parse general election from FL DoE ResultsExtract TSV (1994-2010)
function parseGeneralExtract(
  year: number,
  demCandidate: string,
  repCandidate: string
): Map<string, CountyPartyVotes> {
  const filePath = join("data/raw/doe_archive", `${year}_general_extract.txt`);
  if (!existsSync(filePath)) {
    throw new Error(`Not found: ${filePath}. Run data:fetch-general-extracts first.`);
  }

  const raw = readFileSync(filePath, "latin1");
  const lines = raw.replace(/\r/g, "").split("\n").filter(Boolean);
  const header = lines[0].split("\t");

  const partyCodeIdx   = header.indexOf("PartyCode");
  const raceCodeIdx    = header.indexOf("RaceCode");
  const countyCodeIdx  = header.indexOf("CountyCode");
  const countyNameIdx  = header.indexOf("CountyName");
  const lastNameIdx    = header.indexOf("CanNameLast");
  const firstNameIdx   = header.indexOf("CanNameFirst");
  const votesIdx       = header.indexOf("CanVotes");

  console.log(`  Columns: ${header.join(", ")}`);

  const countyMap = new Map<string, CountyPartyVotes>();

  for (const line of lines.slice(1)) {
    const cols = line.split("\t");
    if (cols.length < 10) continue;

    const raceCode  = cols[raceCodeIdx]?.trim();
    if (raceCode !== "GOV") continue;

    const partyCode = cols[partyCodeIdx]?.trim().toUpperCase();
    if (!["DEM", "REP"].includes(partyCode)) continue;

    const countyCode    = cols[countyCodeIdx]?.trim();
    const countyNameRaw = cols[countyNameIdx]?.trim() ?? "";
    const county        = COUNTY_CODE_TO_NAME[countyCode] ?? normalizeCounty(countyNameRaw);
    const lastName      = cols[lastNameIdx]?.trim() ?? "";
    const firstName     = cols[firstNameIdx]?.trim() ?? "";
    const votes         = parseInt(cols[votesIdx]?.trim() ?? "0", 10);

    if (!county || isNaN(votes)) continue;

    if (!countyMap.has(county)) {
      countyMap.set(county, {
        county,
        fips: COUNTY_FIPS[county] ?? null,
        demVotes: 0, repVotes: 0,
        demCandidate, repCandidate,
      });
    }

    const entry = countyMap.get(county)!;
    if (partyCode === "DEM") entry.demVotes += votes;
    else entry.repVotes += votes;

    // Log first row to verify candidate names
    if (countyMap.size === 1 && entry.demVotes + entry.repVotes <= votes) {
      console.log(`  Sample: ${partyCode} / ${firstName} ${lastName} / ${county} / ${votes} votes`);
    }
  }

  return countyMap;
}

function buildOutput(
  year: number,
  electionDate: string,
  demCandidate: string,
  repCandidate: string,
  countyMap: Map<string, CountyPartyVotes>,
  notes: string[]
) {
  const counties = [...countyMap.values()].map((d) => {
    let winnerParty: "DEM" | "REP" | null = null;
    if (d.demVotes > 0 && d.repVotes > 0) {
      winnerParty = d.demVotes > d.repVotes ? "DEM" : "REP";
    } else if (d.demVotes > 0) winnerParty = "DEM";
    else if (d.repVotes > 0)   winnerParty = "REP";

    return {
      county: d.county,
      fips: d.fips,
      winnerParty,
      winnerCandidate: winnerParty === "DEM" ? d.demCandidate : winnerParty === "REP" ? d.repCandidate : null,
      demVotes: d.demVotes || null,
      repVotes: d.repVotes || null,
      totalVotes: (d.demVotes + d.repVotes) || null,
      source: "Florida Division of Elections",
    };
  }).sort((a, b) => a.county.localeCompare(b.county));

  return {
    year,
    electionDate,
    electionType: "gubernatorial_general",
    demCandidate,
    repCandidate,
    countyCount: counties.length,
    notes,
    source: "Florida Division of Elections (dos.fl.gov / results.elections.myflorida.com)",
    parsedAt: new Date().toISOString(),
    counties,
  };
}

async function main() {
  const elections = [
    { year: 2022, date: "2022-11-08", demCandidate: "Charlie Crist",  repCandidate: "Ron DeSantis", notes: [] },
    { year: 2018, date: "2018-11-06", demCandidate: "Andrew Gillum",  repCandidate: "Ron DeSantis", notes: [] },
    { year: 2014, date: "2014-11-04", demCandidate: "Charlie Crist",  repCandidate: "Rick Scott",   notes: [] },
    { year: 2010, date: "2010-11-02", demCandidate: "Alex Sink",      repCandidate: "Rick Scott",   notes: [] },
    { year: 2006, date: "2006-11-07", demCandidate: "Jim Davis",      repCandidate: "Charlie Crist",notes: [] },
    { year: 2002, date: "2002-11-05", demCandidate: "Bill McBride",   repCandidate: "Jeb Bush",     notes: [] },
    { year: 1998, date: "1998-11-03", demCandidate: "Buddy MacKay",   repCandidate: "Jeb Bush",     notes: [] },
    { year: 1994, date: "1994-11-08", demCandidate: "Lawton Chiles",  repCandidate: "Jeb Bush",     notes: [] },
  ];

  for (const el of elections) {
    const outPath = join(INTERIM_DIR, `general_${el.year}.json`);
    console.log(`\nParsing ${el.year} general election...`);

    try {
      const countyMap = parseGeneralExtract(el.year, el.demCandidate, el.repCandidate);

      if (countyMap.size === 0) {
        console.warn(`  WARNING: No data for ${el.year}`);
        continue;
      }

      const output = buildOutput(el.year, el.date, el.demCandidate, el.repCandidate, countyMap, el.notes);
      writeFileSync(outPath, JSON.stringify(output, null, 2), "utf-8");
      console.log(`  Wrote ${countyMap.size} counties → ${outPath}`);
    } catch (err) {
      console.error(`  FAILED ${el.year}:`, err);
    }
  }

  console.log("\nDone.");
}

main().catch((err) => { console.error(err); process.exit(1); });
