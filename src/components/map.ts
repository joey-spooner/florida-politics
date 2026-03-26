import * as d3 from "d3";
import type { GovYearData, CountyResult } from "../lib/data.js";
import { showTooltip, hideTooltip } from "./tooltip.js";
import { formatNum, formatPct, formatParty } from "../lib/format.js";

const DEM_COLOR = "#2B6CB0";
const REP_COLOR = "#C53030";
const NULL_COLOR = "#CBD5E0";
const HOVER_OPACITY = 0.75;

interface MapState {
  countyData: Map<string, CountyResult>;
  selectedYear: number | null;
}

export function initMap(
  container: HTMLElement,
  geoJson: GeoJSON.FeatureCollection
): (govData: GovYearData | null) => void {
  const state: MapState = { countyData: new Map(), selectedYear: null };

  const totalW = container.clientWidth || 520;

  // Florida aspect ratio from us-atlas: width roughly 2× height for FL bounding box
  const totalH = Math.round(totalW * 0.7);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", totalW)
    .attr("height", totalH)
    .attr("aria-label", "Florida county map colored by gubernatorial primary winner")
    .attr("role", "img");

  // Project using geoIdentity + reflectY (us-atlas coordinates are pre-projected, y flipped)
  const projection = d3
    .geoIdentity()
    .reflectY(true)
    .fitSize([totalW, totalH], geoJson);

  const pathGen = d3.geoPath().projection(projection);

  function countyColor(fips: string | null): string {
    if (!fips) return NULL_COLOR;
    const result = state.countyData.get(fips);
    if (!result) return NULL_COLOR;
    if (result.winnerParty === "DEM") return DEM_COLOR;
    if (result.winnerParty === "REP") return REP_COLOR;
    return NULL_COLOR;
  }

  const paths = svg
    .selectAll<SVGPathElement, GeoJSON.Feature>("path.county")
    .data(geoJson.features)
    .join("path")
    .attr("class", "county")
    .attr("d", (d) => pathGen(d) ?? "")
    .attr("fill", (d) => countyColor(String(d.id ?? "")))
    .attr("stroke", "#fff")
    .attr("stroke-width", 0.5)
    .style("cursor", "default");

  // Hover interaction
  paths
    .on("mouseenter", function (event: MouseEvent, d: GeoJSON.Feature) {
      d3.select(this).attr("opacity", HOVER_OPACITY);

      const fips = String(d.id ?? "");
      const result = state.countyData.get(fips);
      const countyName = result?.county ?? fips;

      let html = `<div class="tt-year">${countyName} County</div>`;
      if (state.selectedYear) {
        html += `<div class="tt-row sub">${state.selectedYear} Gubernatorial Primary</div>`;
      }

      if (result) {
        html += `<div class="tt-row ${result.winnerParty === "DEM" ? "dem" : result.winnerParty === "REP" ? "rep" : ""}">${formatParty(result.winnerParty)} won</div>`;
        if (result.winnerCandidate) {
          html += `<div class="tt-row">${result.winnerCandidate}</div>`;
        }
        if (result.demVotes != null) {
          html += `<div class="tt-row dem">Dem: ${formatNum(result.demVotes)}`;
          if (result.totalVotes) html += ` (${formatPct(result.demVotes, result.totalVotes)})`;
          html += `</div>`;
        }
        if (result.repVotes != null) {
          html += `<div class="tt-row rep">Rep: ${formatNum(result.repVotes)}`;
          if (result.totalVotes) html += ` (${formatPct(result.repVotes, result.totalVotes)})`;
          html += `</div>`;
        }
      } else {
        html += `<div class="tt-row sub">No data</div>`;
      }

      showTooltip(html, event.clientX, event.clientY);
    })
    .on("mousemove", (event: MouseEvent) => {
      showTooltip(
        (document.getElementById("tooltip") as HTMLDivElement).innerHTML,
        event.clientX,
        event.clientY
      );
    })
    .on("mouseleave", function () {
      d3.select(this).attr("opacity", 1);
      hideTooltip();
    });

  // Map legend
  const legend = svg.append("g").attr("transform", `translate(12,${totalH - 60})`);
  const legendItems = [
    { label: "Democrat won", color: DEM_COLOR },
    { label: "Republican won", color: REP_COLOR },
    { label: "No data", color: NULL_COLOR },
  ];
  legendItems.forEach(({ label, color }, i) => {
    const lg = legend.append("g").attr("transform", `translate(0,${i * 18})`);
    lg.append("rect").attr("width", 12).attr("height", 12).attr("rx", 2).attr("fill", color);
    lg.append("text").attr("x", 18).attr("y", 10).attr("font-size", "11").attr("fill", "#4A5568").text(label);
  });

  // Update function
  function update(govData: GovYearData | null): void {
    state.countyData.clear();
    state.selectedYear = govData?.year ?? null;

    if (govData) {
      for (const county of govData.counties) {
        if (county.fips) state.countyData.set(county.fips, county);
      }
    }

    paths.attr("fill", (d) => countyColor(String(d.id ?? "")));
  }

  return update;
}
