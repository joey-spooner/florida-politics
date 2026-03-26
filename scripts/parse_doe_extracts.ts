/**
 * parse_doe_extracts.ts
 *
 * Parses FL DoE ResultsExtract files (tab-delimited, header row) for
 * gubernatorial primary years 1994, 2002, 2006, 2010.
 *
 * Columns (0-indexed):
 *   0: ElectionDate
 *   1: PartyCode (DEM/REP)
 *   2: PartyName
 *   3: RaceCode (GOV = Governor)
 *   4: OfficeDesc
 *   5: CountyCode (3-char)
 *   6: CountyName
 *   7: Juris1num
 *   8: Juris2num
 *   9: Precincts
 *  10: PrecinctsReporting
 *  11: CanNameLast
 *  12: CanNameFirst
 *  13: CanNameMiddle
 *  14: CanVotes
 *
 * Outputs: data/interim/counties_{year}.json (same format as ZIP parser output)
 *
 * Run: npx tsx scripts/parse_doe_extracts.ts
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const RAW_DIR = "data/raw/doe_archive";
const INTERIM_DIR = "data/interim";
mkdirSync(INTERIM_DIR, { recursive: true });

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

// County code → canonical name
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

interface CountyEntry {
  county: string;
  fips: string | null;
  demVotes: number;
  repVotes: number;
  demCandidates: Map<string, number>;
  repCandidates: Map<string, number>;
}

const ELECTIONS: Array<{
  year: number;
  date: string;
  primaryDate: string;
  notes: string[];
}> = [
  {
    year: 1994,
    date: "9/8/1994",
    primaryDate: "1994-09-08",
    notes: ["R: Bush plurality; Smith withdrew before runoff, making Bush nominee"],
  },
  {
    year: 2002,
    date: "9/10/2002",
    primaryDate: "2002-09-10",
    notes: ["Republican primary uncontested (Jeb Bush); only Democratic primary has competitive data"],
  },
  {
    year: 2006,
    date: "9/5/2006",
    primaryDate: "2006-09-05",
    notes: [],
  },
  {
    year: 2010,
    date: "8/24/2010",
    primaryDate: "2010-08-24",
    notes: [],
  },
];

function parseExtract(year: number, date: string): Map<string, CountyEntry> {
  const filePath = join(RAW_DIR, `${year}_primary_extract.txt`);
  if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

  const raw = readFileSync(filePath, "latin1");
  // Strip \r from Windows line endings before splitting
  const lines = raw.replace(/\r/g, "").split("\n").filter(Boolean);

  // First line is header
  const header = lines[0].split("\t");
  const electionDateIdx = header.indexOf("ElectionDate");
  const partyCodeIdx = header.indexOf("PartyCode");
  const raceCodeIdx = header.indexOf("RaceCode");
  const countyCodeIdx = header.indexOf("CountyCode");
  const countyNameIdx = header.indexOf("CountyName");
  const lastNameIdx = header.indexOf("CanNameLast");
  const firstNameIdx = header.indexOf("CanNameFirst");
  const votesIdx = header.indexOf("CanVotes");

  console.log(`  Header columns: ${header.join(", ")}`);

  const counties = new Map<string, CountyEntry>();

  for (const line of lines.slice(1)) {
    const cols = line.split("\t");
    if (cols.length < 12) continue;

    const raceCode = cols[raceCodeIdx]?.trim();
    if (raceCode !== "GOV") continue;

    const partyCode = cols[partyCodeIdx]?.trim().toUpperCase();
    if (!["DEM", "REP"].includes(partyCode)) continue;

    const countyCode = cols[countyCodeIdx]?.trim();
    const countyNameRaw = cols[countyNameIdx]?.trim() ?? "";
    // Prefer code-based lookup for accuracy
    const county = COUNTY_CODE_TO_NAME[countyCode] ?? countyNameRaw;

    const lastName = cols[lastNameIdx]?.trim() ?? "";
    const firstName = cols[firstNameIdx]?.trim() ?? "";
    const candidateName = [firstName, lastName].filter(Boolean).join(" ").trim();
    const votes = parseInt(cols[votesIdx]?.trim() ?? "0", 10);

    if (!county || isNaN(votes)) continue;

    if (!counties.has(county)) {
      counties.set(county, {
        county,
        fips: COUNTY_FIPS[county] ?? null,
        demVotes: 0,
        repVotes: 0,
        demCandidates: new Map(),
        repCandidates: new Map(),
      });
    }

    const entry = counties.get(county)!;
    if (partyCode === "DEM") {
      entry.demVotes += votes;
      entry.demCandidates.set(candidateName, (entry.demCandidates.get(candidateName) ?? 0) + votes);
    } else {
      entry.repVotes += votes;
      entry.repCandidates.set(candidateName, (entry.repCandidates.get(candidateName) ?? 0) + votes);
    }
  }

  return counties;
}

function buildOutput(
  year: number,
  primaryDate: string,
  counties: Map<string, CountyEntry>,
  notes: string[]
) {
  const countyList = [];

  for (const [, data] of counties) {
    let winnerParty: "DEM" | "REP" | null = null;
    if (data.demVotes > 0 && data.repVotes > 0) {
      winnerParty = data.demVotes >= data.repVotes ? "DEM" : "REP";
    } else if (data.demVotes > 0) {
      winnerParty = "DEM";
    } else if (data.repVotes > 0) {
      winnerParty = "REP";
    }

    const topDem = [...data.demCandidates.entries()].sort((a, b) => b[1] - a[1])[0];
    const topRep = [...data.repCandidates.entries()].sort((a, b) => b[1] - a[1])[0];
    const winnerCandidate =
      winnerParty === "DEM" ? topDem?.[0] ?? null : topRep?.[0] ?? null;

    countyList.push({
      county: data.county,
      fips: data.fips,
      winnerParty,
      winnerCandidate,
      demVotes: data.demVotes || null,
      repVotes: data.repVotes || null,
      totalVotes: (data.demVotes + data.repVotes) || null,
      source: "Florida Division of Elections (results.elections.myflorida.com ResultsExtract.Asp)",
    });
  }

  countyList.sort((a, b) => a.county.localeCompare(b.county));

  return {
    year,
    primaryDate,
    electionType: "gubernatorial_primary",
    countyCount: countyList.length,
    notes,
    source: `Florida Division of Elections (results.elections.myflorida.com) — downloaded ${new Date().toISOString().split("T")[0]}`,
    parsedAt: new Date().toISOString(),
    counties: countyList,
  };
}

function main() {
  for (const { year, date, primaryDate, notes } of ELECTIONS) {
    const outPath = join(INTERIM_DIR, `counties_${year}.json`);
    console.log(`\nParsing ${year} (${date})...`);

    try {
      const counties = parseExtract(year, date);
      console.log(`  Found ${counties.size} counties with GOV race data`);

      if (counties.size === 0) {
        console.warn(`  WARNING: No GOV race data found in ${year} extract`);
        continue;
      }

      // Quick sanity check
      let demCounties = 0, repCounties = 0;
      for (const c of counties.values()) {
        if (c.demVotes > 0) demCounties++;
        if (c.repVotes > 0) repCounties++;
      }
      console.log(`  DEM data: ${demCounties} counties, REP data: ${repCounties} counties`);

      const output = buildOutput(year, primaryDate, counties, notes);
      writeFileSync(outPath, JSON.stringify(output, null, 2), "utf-8");
      console.log(`  Wrote ${outPath}`);
    } catch (err) {
      console.error(`  FAILED ${year}:`, err);
    }
  }

  console.log("\nDone.");
}

main();
