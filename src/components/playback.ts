import type { LegYear } from "../lib/data.js";
import { MAP_YEARS } from "../lib/data.js";

const SPEEDS = {
  slow:   { dwell: 3200, label: "Slow" },
  normal: { dwell: 1800, label: "Normal" },
  fast:   { dwell: 900,  label: "Fast" },
} as const;

type Speed = keyof typeof SPEEDS;

export interface PlaybackController {
  /** Call when the user manually selects a year (syncs track + display). */
  setActiveYear: (year: number) => void;
}

export function initPlayback(
  container: HTMLElement,
  legData: LegYear[],
  onSelect: (legYear: LegYear) => Promise<void>
): PlaybackController {
  // Only cycle through years that have actual county map data
  const playable = legData.filter(
    (d) => d.mapYear != null && MAP_YEARS.has(d.mapYear) && d.year === d.mapYear
  );

  let playing = false;
  let currentIdx = -1;
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let speed: Speed = "normal";

  // --- Build UI ---
  container.innerHTML = `
    <div class="playback-panel">
      <button class="playback-play-btn" aria-label="Play animation through years">
        <span class="play-icon" aria-hidden="true">▶</span>
        <span class="play-label">Play</span>
      </button>

      <div class="playback-track" id="playback-track" role="list" aria-label="Select a year"></div>

      <div class="playback-speed-wrap">
        <span class="playback-speed-label">Speed</span>
        <div class="playback-speed-btns" role="group" aria-label="Playback speed">
          ${(Object.entries(SPEEDS) as [Speed, typeof SPEEDS[Speed]][])
            .map(([key, { label }]) =>
              `<button class="speed-btn${key === "normal" ? " is-active" : ""}" data-speed="${key}">${label}</button>`
            ).join("")}
        </div>
      </div>
    </div>
  `;

  const playBtn = container.querySelector<HTMLButtonElement>(".playback-play-btn")!;
  const track   = container.querySelector<HTMLElement>("#playback-track")!;

  // Build year track buttons
  playable.forEach((d, i) => {
    const btn = document.createElement("button");
    btn.className = "playback-dot";
    btn.setAttribute("data-idx", String(i));
    btn.setAttribute("role", "listitem");
    btn.setAttribute("aria-label", `Jump to ${d.year}`);
    btn.textContent = String(d.year);
    btn.addEventListener("click", () => {
      stop();
      jumpTo(i);
    });
    track.appendChild(btn);
  });

  function syncTrack(idx: number) {
    track.querySelectorAll<HTMLElement>(".playback-dot").forEach((dot, i) => {
      dot.classList.toggle("is-active", i === idx);
      dot.classList.toggle("is-past",   i < idx);
    });
  }

  function updatePlayBtn() {
    playBtn.querySelector<HTMLElement>(".play-icon")!.textContent  = playing ? "⏸" : "▶";
    playBtn.querySelector<HTMLElement>(".play-label")!.textContent = playing ? "Pause" : "Play";
    playBtn.setAttribute("aria-label", playing ? "Pause animation" : "Play animation through years");
    playBtn.classList.toggle("is-playing", playing);
  }

  async function jumpTo(idx: number) {
    currentIdx = idx;
    const legYear = playable[idx];
    syncTrack(idx);
    await onSelect(legYear);
  }

  function scheduleNext() {
    const dwell = SPEEDS[speed].dwell;
    timerId = setTimeout(async () => {
      if (!playing) return;
      const nextIdx = (currentIdx + 1) % playable.length;
      await jumpTo(nextIdx);
      if (playing) scheduleNext();
    }, dwell);
  }

  function play() {
    if (playing) return;
    playing = true;
    // If nothing selected yet, start from the first year
    if (currentIdx < 0) jumpTo(0);
    updatePlayBtn();
    scheduleNext();
  }

  function stop() {
    playing = false;
    if (timerId != null) { clearTimeout(timerId); timerId = null; }
    updatePlayBtn();
  }

  playBtn.addEventListener("click", () => (playing ? stop() : play()));

  container.querySelectorAll<HTMLButtonElement>(".speed-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      speed = (btn.dataset.speed as Speed) ?? "normal";
      container.querySelectorAll<HTMLButtonElement>(".speed-btn").forEach((b) => {
        b.classList.toggle("is-active", b === btn);
      });
    });
  });

  return {
    setActiveYear(year: number) {
      const idx = playable.findIndex((d) => d.year === year);
      if (idx !== -1) {
        currentIdx = idx;
        syncTrack(idx);
      }
    },
  };
}
