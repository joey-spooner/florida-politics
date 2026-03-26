/**
 * fetch_topojson.ts
 *
 * Downloads us-atlas counties-10m.json, extracts Florida county features
 * (FIPS 12xxx), and saves as a GeoJSON FeatureCollection to
 * public/data/florida_counties.geo.json.
 *
 * Run: npx tsx scripts/fetch_topojson.ts
 */

import { writeFileSync, mkdirSync } from "fs";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";

mkdirSync("public/data", { recursive: true });

async function main() {
  const url = "https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json";
  console.log(`Fetching ${url}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const topo = (await res.json()) as Topology;

  const counties = topo.objects["counties"] as GeometryCollection;
  const allFeatures = feature(topo, counties);

  // Filter to Florida FIPS 12000–12999
  const floridaFeatures = allFeatures.features.filter((f) => {
    const id = String(f.id ?? "");
    return id.startsWith("12") && id.length === 5;
  });

  console.log(`Florida counties found: ${floridaFeatures.length}`);
  if (floridaFeatures.length !== 67) {
    console.warn(`Expected 67, got ${floridaFeatures.length}`);
  }

  const geoJson = {
    type: "FeatureCollection" as const,
    features: floridaFeatures,
  };

  const outPath = "public/data/florida_counties.geo.json";
  writeFileSync(outPath, JSON.stringify(geoJson), "utf-8");
  console.log(`Saved ${outPath} (${JSON.stringify(geoJson).length} bytes)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
