const numFmt = new Intl.NumberFormat("en-US");

export function formatNum(n: number | null | undefined): string {
  if (n == null) return "—";
  return numFmt.format(n);
}

export function formatPct(n: number | null | undefined, total: number | null | undefined): string {
  if (n == null || total == null || total === 0) return "—";
  return ((n / total) * 100).toFixed(1) + "%";
}

export function formatParty(p: string | null): string {
  if (p === "DEM") return "Democrat";
  if (p === "REP") return "Republican";
  return "No data";
}
