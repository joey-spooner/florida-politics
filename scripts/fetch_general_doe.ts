/**
 * fetch_general_doe.ts
 *
 * Scrapes county-level gubernatorial GENERAL election results from the FL DoE archive
 * for years 1994, 1998, 2002, 2006, 2010.
 *
 * General elections differ from primaries: both DEM and REP candidates appear on the
 * same race page. We scrape the single "Governor" race and capture all major-party votes.
 *
 * Source: https://results.elections.myflorida.com
 *
 * Raw HTML → data/raw/doe_archive/{year}_general.html
 * Parsed data → data/interim/doe_general_{year}.json
 *
 * Run: npm run data:fetch-general-doe
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { chromium } from "playwright";

const RAW_DIR = "data/raw/doe_archive";
const INTERIM_DIR = "data/interim";
mkdirSync(RAW_DIR, { recursive: true });
mkdirSync(INTERIM_DIR, { recursive: true });

const GENERAL_ELECTIONS: Array<{
  year: number;
  date: string;
  demCandidate: string;
  repCandidate: string;
  winner: "DEM" | "REP";
}> = [
  { year: 1994, date: "11/8/1994",  demCandidate: "Lawton Chiles",  repCandidate: "Jeb Bush",       winner: "DEM" },
  { year: 1998, date: "11/3/1998",  demCandidate: "Buddy MacKay",   repCandidate: "Jeb Bush",       winner: "REP" },
  { year: 2002, date: "11/5/2002",  demCandidate: "Bill McBride",   repCandidate: "Jeb Bush",       winner: "REP" },
  { year: 2006, date: "11/7/2006",  demCandidate: "Jim Davis",      repCandidate: "Charlie Crist",  winner: "REP" },
  { year: 2010, date: "11/2/2010",  demCandidate: "Alex Sink",      repCandidate: "Rick Scott",     winner: "REP" },
];

interface CountyVoteRow {
  county: string;
  candidates: Array<{ name: string; party: string; votes: number; pct: number }>;
  totalVotes: number;
}

async function scrapeGeneralResults(
  page: import("playwright").Page,
  year: number,
  electionDate: string
): Promise<CountyVoteRow[]> {
  const baseUrl = "https://results.elections.myflorida.com";
  const indexUrl = `${baseUrl}/Index.asp?ElectionDate=${encodeURIComponent(electionDate)}&DATAMODE=`;

  console.log(`  Loading: ${indexUrl}`);
  await page.goto(indexUrl, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(3000);

  const raceLinks = await page.$$eval("a", (els) =>
    els.map((a) => ({ text: (a.textContent ?? "").trim(), href: (a as HTMLAnchorElement).href }))
  );

  // For general elections, the governor link won't have a party qualifier
  const govLink = raceLinks.find(
    (l) =>
      /governor/i.test(l.text) &&
      !/primary/i.test(l.text) &&
      !/dem|rep|republican|democrat/i.test(l.text)
  ) ?? raceLinks.find((l) => /governor/i.test(l.text));

  if (!govLink) {
    console.log("  Available links:", raceLinks.filter((l) => l.text.length > 2).slice(0, 20));
    throw new Error(`Could not find Governor link for ${year} general election`);
  }

  console.log(`  Found: ${govLink.text} → ${govLink.href}`);
  await page.goto(govLink.href, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(3000);

  // Navigate to county breakdown if available
  const pageLinks = await page.$$eval("a", (els) =>
    els.map((a) => ({ text: (a.textContent ?? "").trim(), href: (a as HTMLAnchorElement).href }))
  );
  const countyLink = pageLinks.find(
    (l) => /county/i.test(l.text) && !/county name/i.test(l.text)
  );
  if (countyLink) {
    await page.goto(countyLink.href, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForTimeout(3000);
  }

  // Save raw HTML
  const html = await page.content();
  writeFileSync(join(RAW_DIR, `${year}_general.html`), html, "utf-8");

  // Parse the county results table
  const rows = await page.evaluate(() => {
    const results: CountyVoteRow[] = [];
    const tables = Array.from(document.querySelectorAll("table"));

    for (const table of tables) {
      const rows = Array.from(table.querySelectorAll("tr"));
      if (rows.length < 3) continue;

      const headerCells = Array.from(rows[0].querySelectorAll("th, td")).map(
        (c) => (c.textContent ?? "").trim()
      );

      const hasCounty = headerCells.some((h) => /county/i.test(h));
      if (!hasCounty) continue;

      let countyColIdx = headerCells.findIndex((h) => /county/i.test(h));
      let totalColIdx  = headerCells.findIndex((h) => /^total/i.test(h));

      // Candidate columns — everything that isn't county/total/pct
      const candidateCols: Array<{ name: string; idx: number }> = [];
      headerCells.forEach((h, i) => {
        if (i === countyColIdx || i === totalColIdx) return;
        if (/%/.test(h) || /pct/i.test(h)) return;
        if (h.length > 2) candidateCols.push({ name: h, idx: i });
      });

      const startRow = rows[1]?.querySelectorAll("th").length ? 2 : 1;
      for (let i = startRow; i < rows.length; i++) {
        const cells = Array.from(rows[i].querySelectorAll("td")).map(
          (c) => (c.textContent ?? "").trim()
        );
        if (cells.length < 2) continue;

        const county = cells[countyColIdx];
        if (!county || /total|state/i.test(county)) continue;

        const totalVotes = totalColIdx !== -1
          ? parseInt((cells[totalColIdx] ?? "0").replace(/,/g, ""), 10)
          : 0;

        const candidates = candidateCols
          .map(({ name, idx }) => ({
            name,
            party: "",
            votes: parseInt((cells[idx] ?? "0").replace(/,/g, ""), 10),
            pct: 0,
          }))
          .filter((c) => !isNaN(c.votes));

        if (candidates.length > 0) results.push({ county, candidates, totalVotes });
      }

      if (results.length > 5) break;
    }
    return results;
  }) as CountyVoteRow[];

  return rows;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  for (const election of GENERAL_ELECTIONS) {
    const outPath = join(INTERIM_DIR, `doe_general_${election.year}.json`);
    if (existsSync(outPath)) {
      console.log(`Skipping ${election.year} general (already exists)`);
      continue;
    }

    console.log(`\nScraping ${election.year} gubernatorial general election...`);
    try {
      const rows = await scrapeGeneralResults(page, election.year, election.date);
      const output = {
        year: election.year,
        electionDate: election.date,
        demCandidate: election.demCandidate,
        repCandidate: election.repCandidate,
        expectedWinner: election.winner,
        scrapedAt: new Date().toISOString(),
        source: `Florida Division of Elections archive (results.elections.myflorida.com)`,
        countyCount: rows.length,
        counties: rows,
      };
      writeFileSync(outPath, JSON.stringify(output, null, 2), "utf-8");
      console.log(`  Wrote ${rows.length} counties → ${outPath}`);
    } catch (err) {
      console.error(`  FAILED ${election.year}:`, err);
    }
    await page.waitForTimeout(2000);
  }

  await browser.close();
  console.log("\nDone.");
}

main().catch((err) => { console.error(err); process.exit(1); });
