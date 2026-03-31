import * as d3 from "d3";
import type { LegYear } from "../lib/data.js";
import { MAP_YEARS } from "../lib/data.js";
import { formatNum } from "../lib/format.js";
import { showTooltip, hideTooltip } from "./tooltip.js";

const MARGIN = { top: 20, right: 24, bottom: 40, left: 52 };
const DEM_COLOR = "#2B6CB0";
const REP_COLOR = "#C53030";

export function initChart(
  container: HTMLElement,
  data: LegYear[],
  onSelect: (legYear: LegYear) => void
): (selectedMapYear: number | null) => void {
  const totalW = container.clientWidth || 800;
  const totalH = 280;
  const W = totalW - MARGIN.left - MARGIN.right;
  const H = totalH - MARGIN.top - MARGIN.bottom;

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", totalW)
    .attr("height", totalH)
    .attr("aria-label", "Florida legislature party balance 1992–2024")
    .attr("role", "img");

  const g = svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

  const years = data.map((d) => d.year);
  const xScale = d3
    .scaleLinear()
    .domain([d3.min(years)!, d3.max(years)!])
    .range([0, W]);

  const yMax = d3.max(data, (d) => Math.max(d.total_dem, d.total_rep)) ?? 160;
  const yScale = d3.scaleLinear().domain([0, Math.ceil(yMax / 20) * 20]).range([H, 0]);

  // Gridlines
  g.append("g")
    .attr("class", "grid")
    .call(
      d3
        .axisLeft(yScale)
        .tickSize(-W)
        .tickFormat(() => "")
        .ticks(6)
    )
    .call((g) => g.select(".domain").remove())
    .call((g) => g.selectAll("line").attr("stroke", "#E2E8F0").attr("stroke-dasharray", "3,3"));

  // X axis
  g.append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0,${H})`)
    .call(
      d3
        .axisBottom(xScale)
        .tickValues(years)
        .tickFormat((d) => String(d))
        .tickSize(4)
    )
    .call((g) => g.select(".domain").attr("stroke", "#CBD5E0"))
    .call((g) => g.selectAll("text").attr("font-size", "11").attr("fill", "#4A5568"))
    .call((g) => g.selectAll("line").attr("stroke", "#CBD5E0"));

  // Y axis
  g.append("g")
    .attr("class", "y-axis")
    .call(d3.axisLeft(yScale).ticks(6).tickSize(4))
    .call((g) => g.select(".domain").attr("stroke", "#CBD5E0"))
    .call((g) => g.selectAll("text").attr("font-size", "11").attr("fill", "#4A5568"))
    .call((g) => g.selectAll("line").attr("stroke", "#CBD5E0"));

  g.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -H / 2)
    .attr("y", -40)
    .attr("text-anchor", "middle")
    .attr("font-size", "11")
    .attr("fill", "#718096")
    .text("Combined seats (House + Senate)");

  // Line generators
  const lineGen = (accessor: (d: LegYear) => number) =>
    d3
      .line<LegYear>()
      .x((d) => xScale(d.year))
      .y((d) => yScale(accessor(d)))
      .curve(d3.curveMonotoneX);

  g.append("path")
    .datum(data)
    .attr("fill", "none")
    .attr("stroke", REP_COLOR)
    .attr("stroke-width", 2)
    .attr("d", lineGen((d) => d.total_rep));

  g.append("path")
    .datum(data)
    .attr("fill", "none")
    .attr("stroke", DEM_COLOR)
    .attr("stroke-width", 2)
    .attr("d", lineGen((d) => d.total_dem));

  // Hover crosshair line
  const crosshair = g
    .append("line")
    .attr("class", "crosshair")
    .attr("y1", 0)
    .attr("y2", H)
    .attr("stroke", "#A0AEC0")
    .attr("stroke-width", 1)
    .attr("stroke-dasharray", "4,3")
    .style("display", "none");

  // Dots — REP
  g.selectAll<SVGCircleElement, LegYear>(".dot-rep")
    .data(data)
    .join("circle")
    .attr("class", "dot-rep dot")
    .attr("cx", (d) => xScale(d.year))
    .attr("cy", (d) => yScale(d.total_rep))
    .attr("r", (d) => (MAP_YEARS.has(d.mapYear ?? -1) ? 5 : 3.5))
    .attr("fill", REP_COLOR)
    .attr("stroke", "#fff")
    .attr("stroke-width", 1.5)
    .style("cursor", "pointer");

  // Dots — DEM
  g.selectAll<SVGCircleElement, LegYear>(".dot-dem")
    .data(data)
    .join("circle")
    .attr("class", "dot-dem dot")
    .attr("cx", (d) => xScale(d.year))
    .attr("cy", (d) => yScale(d.total_dem))
    .attr("r", (d) => (MAP_YEARS.has(d.mapYear ?? -1) ? 5 : 3.5))
    .attr("fill", DEM_COLOR)
    .attr("stroke", "#fff")
    .attr("stroke-width", 1.5)
    .style("cursor", "pointer");

  // Selected year indicator ring (behind dots)
  const selRingDem = g.append("circle").attr("class", "sel-ring sel-ring-dem").attr("r", 0).attr("fill", "none").attr("stroke", DEM_COLOR).attr("stroke-width", 2.5).attr("opacity", 0.5);
  const selRingRep = g.append("circle").attr("class", "sel-ring sel-ring-rep").attr("r", 0).attr("fill", "none").attr("stroke", REP_COLOR).attr("stroke-width", 2.5).attr("opacity", 0.5);

  // Invisible overlay rects for hover interaction (one per year)
  const colW = W / (data.length - 1);
  g.selectAll<SVGRectElement, LegYear>(".hit-rect")
    .data(data)
    .join("rect")
    .attr("class", "hit-rect")
    .attr("x", (d, i) => xScale(d.year) - (i === 0 ? 0 : colW / 2))
    .attr("y", 0)
    .attr("width", colW)
    .attr("height", H)
    .attr("fill", "transparent")
    .style("cursor", "pointer")
    .on("mouseenter", (event: MouseEvent, d: LegYear) => {
      crosshair
        .attr("x1", xScale(d.year))
        .attr("x2", xScale(d.year))
        .style("display", null);

      const mapYearNote = d.mapYear
        ? MAP_YEARS.has(d.mapYear)
          ? d.mapYear === d.year
            ? ""
            : ` <span class="tooltip-note">→ map: ${d.mapYear}</span>`
          : ` <span class="tooltip-note">no map data</span>`
        : ` <span class="tooltip-note">no map data</span>`;

      showTooltip(
        `<div class="tt-year">${d.year}</div>
         <div class="tt-row dem">Democrats: <strong>${formatNum(d.total_dem)}</strong> seats</div>
         <div class="tt-row rep">Republicans: <strong>${formatNum(d.total_rep)}</strong> seats</div>
         <div class="tt-row sub">(House ${d.house_dem}D / ${d.house_rep}R · Senate ${d.senate_dem}D / ${d.senate_rep}R)</div>
         ${mapYearNote ? `<div class="tt-row note">${mapYearNote}</div>` : ""}`,
        event.clientX,
        event.clientY
      );
    })
    .on("mousemove", (event: MouseEvent) => {
      showTooltip(
        (document.getElementById("tooltip") as HTMLDivElement).innerHTML,
        event.clientX,
        event.clientY
      );
    })
    .on("mouseleave", () => {
      crosshair.style("display", "none");
      hideTooltip();
    })
    .on("click", (_event: MouseEvent, d: LegYear) => {
      onSelect(d);
    });

  // Update function: highlight selected map year
  function updateSelection(selectedMapYear: number | null): void {
    if (selectedMapYear == null) {
      selRingDem.attr("r", 0);
      selRingRep.attr("r", 0);
      return;
    }
    // Find the leg year that is the primary year itself (exact match)
    const match = data.find((d) => d.year === selectedMapYear);
    if (match) {
      selRingDem.attr("cx", xScale(match.year)).attr("cy", yScale(match.total_dem)).attr("r", 9);
      selRingRep.attr("cx", xScale(match.year)).attr("cy", yScale(match.total_rep)).attr("r", 9);
    } else {
      selRingDem.attr("r", 0);
      selRingRep.attr("r", 0);
    }
  }

  return updateSelection;
}
