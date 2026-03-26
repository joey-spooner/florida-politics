import "./styles.css";
import { loadLegislatureData, loadGovYearData, loadGeoJson, MAP_YEARS } from "./lib/data.js";
import type { LegYear, GovYearData } from "./lib/data.js";
import { initChart } from "./components/chart.js";
import { initMap } from "./components/map.js";
import { updateDetails, updateDetailsLoading, updateDetailsError, updateSummaryText } from "./components/details.js";

// --- App state ---
let updateChartSelection: ((mapYear: number | null) => void) | null = null;
let updateMap: ((govData: GovYearData | null) => void) | null = null;

const detailsEl = document.getElementById("details-panel") as HTMLElement;
const summaryEl = document.getElementById("a11y-summary") as HTMLElement;
const buildDateEl = document.getElementById("build-date");

// --- Year selection ---
async function selectYear(legYear: LegYear): Promise<void> {
  const mapYear = legYear.mapYear;

  // Update URL hash
  history.replaceState(null, "", `#${legYear.year}`);

  // Update chart highlight
  updateChartSelection?.(mapYear && MAP_YEARS.has(mapYear) ? mapYear : null);

  // Update map and details
  if (mapYear == null || !MAP_YEARS.has(mapYear)) {
    updateMap?.(null);
    updateDetails(detailsEl, legYear, null);
    updateSummaryText(summaryEl, legYear, null);
    return;
  }

  updateDetailsLoading(detailsEl, mapYear);

  try {
    const govData = await loadGovYearData(mapYear);
    updateMap?.(govData);
    updateDetails(detailsEl, legYear, govData);
    updateSummaryText(summaryEl, legYear, govData);
  } catch (err) {
    console.error(err);
    updateDetailsError(detailsEl, `Failed to load ${mapYear} data. Please refresh.`);
  }
}

// --- Boot ---
async function main(): Promise<void> {
  try {
    const [legData, geoJson] = await Promise.all([loadLegislatureData(), loadGeoJson()]);

    // Determine default selected year from URL hash or use most recent primary year
    let defaultYear = 2022;
    const hashYear = parseInt(window.location.hash.replace("#", ""), 10);
    if (!isNaN(hashYear) && legData.some((d) => d.year === hashYear)) {
      defaultYear = hashYear;
    }

    // Init chart
    const chartContainer = document.getElementById("chart-container") as HTMLElement;
    updateChartSelection = initChart(chartContainer, legData, selectYear);

    // Init map
    const mapContainer = document.getElementById("map-container") as HTMLElement;
    updateMap = initMap(mapContainer, geoJson);

    // Build date
    try {
      const metadata = await fetch("/data/metadata.json").then((r) => r.json());
      if (buildDateEl && metadata.buildDate) {
        buildDateEl.textContent = metadata.buildDate;
      }
    } catch {
      // non-critical
    }

    // Select default year
    const defaultLegYear = legData.find((d) => d.year === defaultYear) ?? legData[legData.length - 1];
    await selectYear(defaultLegYear);
  } catch (err) {
    console.error("Failed to initialize app:", err);
    document.getElementById("app")!.innerHTML =
      `<p style="color:#C53030;padding:2rem;text-align:center">Failed to load application data. Please refresh the page.</p>`;
  }
}

main();
