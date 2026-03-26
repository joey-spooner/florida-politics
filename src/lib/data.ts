export interface LegYear {
  year: number;
  house_dem: number;
  house_rep: number;
  senate_dem: number;
  senate_rep: number;
  total_dem: number;
  total_rep: number;
  source: string;
  mapYear: number | null;
}

export interface CountyResult {
  county: string;
  fips: string | null;
  winnerParty: "DEM" | "REP" | null;
  winnerCandidate: string | null;
  demVotes: number | null;
  repVotes: number | null;
  totalVotes: number | null;
  source: string;
}

export interface GovYearData {
  year: number;
  primaryDate: string;
  electionType: string;
  countyCount: number;
  notes: string[];
  source: string;
  parsedAt: string;
  counties: CountyResult[];
}

export interface Metadata {
  siteTitle: string;
  coverage: {
    legislatureFrom: number;
    legislatureTo: number;
    governorPrimaryFrom: number;
    governorPrimaryTo: number;
  };
  buildDate: string;
  notes: string[];
  excludedYears: Array<{ year: number; reason: string }>;
}

// Map years with actual county data files
export const MAP_YEARS = new Set([1994, 2002, 2006, 2010, 2014, 2018, 2022]);

export async function loadLegislatureData(): Promise<LegYear[]> {
  const res = await fetch("/data/legislature_by_year.json");
  if (!res.ok) throw new Error(`Failed to load legislature data: ${res.status}`);
  return res.json();
}

export async function loadGovYearData(year: number): Promise<GovYearData> {
  const res = await fetch(`/data/gov_primary_counties/${year}.json`);
  if (!res.ok) throw new Error(`Failed to load ${year} county data: ${res.status}`);
  return res.json();
}

export async function loadGeoJson(): Promise<GeoJSON.FeatureCollection> {
  const res = await fetch("/data/florida_counties.geo.json");
  if (!res.ok) throw new Error(`Failed to load GeoJSON: ${res.status}`);
  return res.json();
}

export async function loadMetadata(): Promise<Metadata> {
  const res = await fetch("/data/metadata.json");
  if (!res.ok) throw new Error(`Failed to load metadata: ${res.status}`);
  return res.json();
}
