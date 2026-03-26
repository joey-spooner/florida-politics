import type { LegYear, GovYearData } from "../lib/data.js";
import { MAP_YEARS } from "../lib/data.js";
import { formatNum, formatParty } from "../lib/format.js";

export function updateDetails(
  el: HTMLElement,
  legYear: LegYear | null,
  govData: GovYearData | null
): void {
  if (!legYear) {
    el.innerHTML = `<p class="details-empty">Select a year on the chart above.</p>`;
    return;
  }

  const mapYear = legYear.mapYear;
  const hasMap = mapYear != null && MAP_YEARS.has(mapYear);

  // Legislature section
  let html = `<div class="details-section">
    <h3 class="details-heading">Legislature — ${legYear.year}</h3>
    <table class="details-table">
      <thead><tr><th></th><th class="dem">Dem</th><th class="rep">Rep</th></tr></thead>
      <tbody>
        <tr><td>House</td><td class="dem">${legYear.house_dem}</td><td class="rep">${legYear.house_rep}</td></tr>
        <tr><td>Senate</td><td class="dem">${legYear.senate_dem}</td><td class="rep">${legYear.senate_rep}</td></tr>
        <tr class="total-row"><td>Total</td><td class="dem">${legYear.total_dem}</td><td class="rep">${legYear.total_rep}</td></tr>
      </tbody>
    </table>
  </div>`;

  // Map / primary section
  if (!hasMap) {
    html += `<div class="details-section">
      <h3 class="details-heading">Gubernatorial Primary</h3>
      <p class="details-note">`;
    if (mapYear == null) {
      html += "No gubernatorial primary year mapped to this legislative cycle.";
    } else if (mapYear === 1998) {
      html += "1998 excluded: both primaries were uncontested and the available data source contains corrupted entries (shows general election results labeled as primary).";
    } else {
      html += `No county-level data available for ${mapYear}.`;
    }
    html += `</p></div>`;
  } else if (govData) {
    // Statewide totals
    let stateDem = 0, stateRep = 0;
    const candidateDem = new Map<string, number>();
    const candidateRep = new Map<string, number>();
    let demCounties = 0, repCounties = 0;

    for (const c of govData.counties) {
      if (c.demVotes) stateDem += c.demVotes;
      if (c.repVotes) stateRep += c.repVotes;
      if (c.winnerParty === "DEM") demCounties++;
      if (c.winnerParty === "REP") repCounties++;
      if (c.demVotes && c.winnerCandidate && c.winnerParty === "DEM") {
        candidateDem.set(c.winnerCandidate, (candidateDem.get(c.winnerCandidate) ?? 0) + c.demVotes);
      }
      if (c.repVotes && c.winnerCandidate && c.winnerParty === "REP") {
        candidateRep.set(c.winnerCandidate, (candidateRep.get(c.winnerCandidate) ?? 0) + c.repVotes);
      }
    }

    const topDem = [...candidateDem.entries()].sort((a, b) => b[1] - a[1])[0];
    const topRep = [...candidateRep.entries()].sort((a, b) => b[1] - a[1])[0];

    html += `<div class="details-section">
      <h3 class="details-heading">Gubernatorial Primary — ${govData.year}</h3>
      <div class="details-primary-row">
        <div class="primary-block dem">
          <div class="primary-label">Democrat</div>
          ${topDem ? `<div class="primary-winner">${topDem[0]}</div>` : ""}
          ${stateDem > 0 ? `<div class="primary-votes">${formatNum(stateDem)} votes statewide</div>` : ""}
          <div class="primary-counties">${demCounties} of 67 counties</div>
        </div>
        <div class="primary-block rep">
          <div class="primary-label">Republican</div>
          ${topRep ? `<div class="primary-winner">${topRep[0]}</div>` : ""}
          ${stateRep > 0 ? `<div class="primary-votes">${formatNum(stateRep)} votes statewide</div>` : ""}
          <div class="primary-counties">${repCounties} of 67 counties</div>
        </div>
      </div>`;

    if (govData.notes.length > 0) {
      html += `<ul class="details-notes">${govData.notes.map((n) => `<li>${n}</li>`).join("")}</ul>`;
    }

    // County color explanation
    html += `<p class="details-note">Map colors each county by the party that drew more total primary votes in that county. Counties with votes from only one party are colored by that party.</p>`;

    html += `</div>`;
  }

  // Map year note for intermediate legislative years
  if (legYear.year !== mapYear && hasMap) {
    html += `<p class="details-note"><em>Legislative year ${legYear.year} maps to the ${mapYear} gubernatorial primary.</em></p>`;
  }

  el.innerHTML = html;
}

export function updateDetailsLoading(el: HTMLElement, year: number): void {
  el.innerHTML = `<p class="details-empty">Loading ${year} data…</p>`;
}

export function updateDetailsError(el: HTMLElement, msg: string): void {
  el.innerHTML = `<p class="details-error">${msg}</p>`;
}

// Accessibility text summary for screen readers
export function updateSummaryText(
  el: HTMLElement,
  legYear: LegYear | null,
  govData: GovYearData | null
): void {
  if (!legYear) { el.textContent = ""; return; }

  const parts: string[] = [
    `${legYear.year}: Florida legislature — Democrats ${legYear.total_dem} seats, Republicans ${legYear.total_rep} seats.`,
  ];

  if (govData) {
    let dem = 0, rep = 0;
    for (const c of govData.counties) {
      if (c.winnerParty === "DEM") dem++;
      if (c.winnerParty === "REP") rep++;
    }
    parts.push(
      `${govData.year} gubernatorial primary: Democrats carried ${dem} counties, Republicans carried ${rep} counties.`
    );
  }

  el.textContent = parts.join(" ");

  // Also update aria-label on map section
  const mapSect = document.getElementById("map-section");
  if (mapSect && govData) {
    mapSect.setAttribute(
      "aria-label",
      `Florida county map for ${govData.year} gubernatorial primary. ${formatParty("DEM")} = blue, ${formatParty("REP")} = red.`
    );
  }
}
