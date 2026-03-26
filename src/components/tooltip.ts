let tooltipEl: HTMLDivElement | null = null;

function getTooltip(): HTMLDivElement {
  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.id = "tooltip";
    tooltipEl.setAttribute("role", "tooltip");
    tooltipEl.setAttribute("aria-live", "polite");
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

export function showTooltip(html: string, x: number, y: number): void {
  const el = getTooltip();
  el.innerHTML = html;
  el.style.display = "block";
  el.style.opacity = "1";

  // Position: prefer right of cursor, flip left if near edge
  const margin = 12;
  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth;

  let left = x + margin;
  if (left + rect.width > vw - margin) {
    left = x - rect.width - margin;
  }
  const top = Math.max(margin, y - rect.height / 2);

  el.style.left = left + "px";
  el.style.top = top + "px";
}

export function hideTooltip(): void {
  const el = getTooltip();
  el.style.opacity = "0";
  el.style.display = "none";
}
