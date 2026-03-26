// Shared types for data pipeline scripts

export interface LegislatureYear {
  year: number;
  house_dem: number;
  house_rep: number;
  senate_dem: number;
  senate_rep: number;
  total_dem: number;
  total_rep: number;
  source: string;
  mapYear: number | null; // nearest gubernatorial primary year
}

export interface CountyResult {
  county: string;
  fips: string;
  winnerParty: "DEM" | "REP" | null;
  winnerCandidate: string | null;
  demVotes: number | null;
  repVotes: number | null;
  totalVotes: number | null;
  source: string;
}

export interface GovPrimaryYear {
  year: number;
  primaryDate: string;
  electionType: "gubernatorial_primary";
  demContested: boolean;
  repContested: boolean;
  counties: CountyResult[];
  notes: string[];
  source: string;
}

export interface RawCountyPct {
  county: string;
  year: number;
  party: "DEM" | "REP";
  candidates: { name: string; pct: number }[];
  source: string;
}

// FL DoE precinct-level CSV row (19 columns)
export interface DoePrecintRow {
  countyCode: string;
  countyName: string;
  electionNumber: string;
  electionDate: string;
  electionName: string;
  precinctId: string;
  pollingLocation: string;
  totalRegistered: number;
  totalRegisteredRep: number;
  totalRegisteredDem: number;
  totalRegisteredOther: number;
  contestName: string;
  district: string;
  contestCode: string;
  candidateName: string;
  candidateParty: string;
  candidateFvrsId: string;
  candidateNumber: string;
  voteTotal: number;
}

export const FLORIDA_GOV_PRIMARY_YEARS = [1994, 1998, 2002, 2006, 2010, 2014, 2018, 2022] as const;
export type GovPrimaryYearNum = typeof FLORIDA_GOV_PRIMARY_YEARS[number];

// Map legislative years to nearest gubernatorial primary year
// Legislative composition changes after elections in even years
// Gubernatorial primaries: 1994, 1998, 2002, 2006, 2010, 2014, 2018, 2022
export function mapLegYearToGovYear(legYear: number): number | null {
  const govYears = [1994, 1998, 2002, 2006, 2010, 2014, 2018, 2022];
  // If exact match exists, use it
  if (govYears.includes(legYear)) return legYear;
  // Otherwise snap to nearest prior gov year
  const prior = govYears.filter((y) => y <= legYear);
  if (prior.length === 0) return null;
  return prior[prior.length - 1];
}
