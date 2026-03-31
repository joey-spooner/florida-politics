import "./styles.css";
import { loadLegislatureData, loadGovYearData, loadGovGeneralData, loadGeoJson, MAP_YEARS, GENERAL_MAP_YEARS } from "./lib/data.js";
import type { LegYear, GovYearData } from "./lib/data.js";
import { initChart } from "./components/chart.js";
import { initMap } from "./components/map.js";
import { initPlayback } from "./components/playback.js";
import { updateDetails, updateDetailsLoading, updateDetailsError, updateSummaryText } from "./components/details.js";

// --- App state ---
let updateChartSelection: ((mapYear: number | null) => void) | null = null;
let updateMap: ((govData: GovYearData | null) => void) | null = null;
let playbackController: { setActiveYear: (year: number) => void } | null = null;
let viewMode: "primary" | "general" = "primary";
let currentLegYear: LegYear | null = null;

const detailsEl = document.getElementById("details-panel") as HTMLElement;
const summaryEl = document.getElementById("a11y-summary") as HTMLElement;
const buildDateEl = document.getElementById("build-date");

// --- Year selection ---
async function selectYear(legYear: LegYear): Promise<void> {
  currentLegYear = legYear;
  const mapYear = legYear.mapYear;

  // Update URL hash
  history.replaceState(null, "", `#${legYear.year}`);

  if (viewMode === "primary") {
    // Update chart highlight
    updateChartSelection?.(mapYear && MAP_YEARS.has(mapYear) ? mapYear : null);

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
      playbackController?.setActiveYear(mapYear);
    } catch (err) {
      console.error(err);
      updateDetailsError(detailsEl, `Failed to load ${mapYear} data. Please refresh.`);
    }
  } else {
    // General election mode
    updateChartSelection?.(mapYear && GENERAL_MAP_YEARS.has(mapYear) ? mapYear : null);

    if (mapYear == null || !GENERAL_MAP_YEARS.has(mapYear)) {
      updateMap?.(null);
      updateDetails(detailsEl, legYear, null);
      updateSummaryText(summaryEl, legYear, null);
      return;
    }

    updateDetailsLoading(detailsEl, mapYear);
    try {
      const govData = await loadGovGeneralData(mapYear);
      updateMap?.(govData);
      updateDetails(detailsEl, legYear, govData);
      updateSummaryText(summaryEl, legYear, govData);
      playbackController?.setActiveYear(mapYear);
    } catch (err) {
      console.error(err);
      updateDetailsError(detailsEl, `Failed to load ${mapYear} general data. Please refresh.`);
    }
  }
}

// --- View mode toggle ---
function setViewMode(mode: "primary" | "general"): void {
  viewMode = mode;
  document.querySelectorAll<HTMLButtonElement>(".view-toggle-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.mode === mode);
  });
  const sub = document.getElementById("map-sub");
  if (sub) {
    sub.textContent = mode === "primary"
      ? "Counties colored by which party drew more votes in the gubernatorial primary."
      : "Counties colored by which party won the gubernatorial general election.";
  }
  // Re-render current year in new mode
  if (currentLegYear) selectYear(currentLegYear);
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

    // Init playback
    const playbackContainer = document.getElementById("playback-container") as HTMLElement;
    playbackController = initPlayback(playbackContainer, legData, selectYear);

    // Wire view mode toggle
    document.querySelectorAll<HTMLButtonElement>(".view-toggle-btn").forEach((btn) => {
      btn.addEventListener("click", () => setViewMode(btn.dataset.mode as "primary" | "general"));
    });

    // Build date
    try {
      const metadata = await fetch(`${import.meta.env.BASE_URL}data/metadata.json`).then((r) => r.json());
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
