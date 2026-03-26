/**
 * fetch_elections.ts
 *
 * Uses Playwright to scrape county-level gubernatorial primary results from
 * the Florida Division of Elections archive: https://results.elections.myflorida.com
 *
 * Targets years: 1994, 2002, 2006, 2010
 * (1998 excluded: both primaries uncontested; Atlas data confirmed corrupted)
 *
 * The site is a JavaScript-rendered ASP application that requires a real browser.
 * For each election year and party, we navigate to the race page and extract
 * the county-level results table.
 *
 * Raw HTML saved to data/raw/doe_archive/{year}_{party}.html
 * Parsed data saved to data/interim/doe_{year}_{party}.json
 *
 * Run: npm run data:fetch-elections
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { chromium } from "playwright";

const RAW_DIR = "data/raw/doe_archive";
const INTERIM_DIR = "data/interim";

mkdirSync(RAW_DIR, { recursive: true });
mkdirSync(INTERIM_DIR, { recursive: true });

// FL gubernatorial primary dates and race info
// These are the election dates used in the DoE URL query params
// Race ID 7550000 is the standard code for Governor in FL DoE
const ELECTIONS: Array<{
  year: number;
  date: string; // as used in FL DoE URL
  parties: Array<{ party: "DEM" | "REP"; label: string }>;
  notes: string;
}> = [
  {
    year: 1994,
    date: "9/8/1994",
    parties: [
      { party: "DEM", label: "Democratic" },
      { party: "REP", label: "Republican" },
    ],
    notes: "R: Bush plurality, runoff triggered but Smith withdrew",
  },
  {
    year: 2002,
    date: "9/10/2002",
    parties: [
      { party: "DEM", label: "Democratic" },
      // R primary uncontested (Jeb Bush), skip
    ],
    notes: "R: Jeb Bush uncontested, only D primary has competitive data",
  },
  {
    year: 2006,
    date: "9/5/2006",
    parties: [
      { party: "DEM", label: "Democratic" },
      { party: "REP", label: "Republican" },
    ],
    notes: "",
  },
  {
    year: 2010,
    date: "8/24/2010",
    parties: [
      { party: "DEM", label: "Democratic" },
      { party: "REP", label: "Republican" },
    ],
    notes: "",
  },
];

interface CountyVoteRow {
  county: string;
  candidates: Array<{ name: string; party: string; votes: number; pct: number }>;
  totalVotes: number;
}

async function scrapeRaceCountyResults(
  page: import("playwright").Page,
  year: number,
  electionDate: string,
  partyLabel: string
): Promise<CountyVoteRow[]> {
  const baseUrl = "https://results.elections.myflorida.com";

  // Step 1: Load the election index page
  const indexUrl = `${baseUrl}/Index.asp?ElectionDate=${encodeURIComponent(electionDate)}&DATAMODE=`;
  console.log(`  Loading index: ${indexUrl}`);
  await page.goto(indexUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2000);

  // Step 2: Find the Governor race link
  // The page lists races; we need to find "Governor" in the appropriate party section
  const raceLinks = await page.$$eval("a", (links) =>
    links.map((a) => ({ text: a.textContent?.trim() ?? "", href: a.href }))
  );

  const govLink = raceLinks.find(
    (l) =>
      l.text.toLowerCase().includes("governor") &&
      l.text.toLowerCase().includes(partyLabel.toLowerCase())
  );

  if (!govLink) {
    // Try a broader search
    const govLinks = raceLinks.filter((l) =>
      l.text.toLowerCase().includes("governor")
    );
    console.log(`  Available governor links for ${year}:`, govLinks);
    throw new Error(
      `Could not find ${partyLabel} Governor link for ${year}. Links found: ${JSON.stringify(govLinks)}`
    );
  }

  console.log(`  Found race link: ${govLink.text} -> ${govLink.href}`);

  // Step 3: Navigate to race page
  await page.goto(govLink.href, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2000);

  // Step 4: Find "County" breakdown link or look for county table
  const pageLinks = await page.$$eval("a", (links) =>
    links.map((a) => ({ text: a.textContent?.trim() ?? "", href: a.href }))
  );

  const countyLink = pageLinks.find(
    (l) =>
      l.text.toLowerCase().includes("county") &&
      !l.text.toLowerCase().includes("county name")
  );

  if (countyLink) {
    console.log(`  Found county link: ${countyLink.text} -> ${countyLink.href}`);
    await page.goto(countyLink.href, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);
  }

  // Save raw HTML
  const html = await page.content();
  const rawPath = join(RAW_DIR, `${year}_${partyLabel.toLowerCase()}.html`);
  writeFileSync(rawPath, html, "utf-8");
  console.log(`  Saved raw HTML: ${rawPath}`);

  // Step 5: Parse county results table
  const rows = await parseCountyTable(page, year, partyLabel);
  return rows;
}

async function parseCountyTable(
  page: import("playwright").Page,
  year: number,
  partyLabel: string
): Promise<CountyVoteRow[]> {
  // The FL DoE results pages have an HTML table with county results
  // Structure varies by year but generally:
  //   County | Candidate1 Votes | Candidate1 % | Candidate2 Votes | ... | Total
  const results: CountyVoteRow[] = [];

  try {
    results.push(
      ...(await page.evaluate(() => {
        const tables = Array.from(document.querySelectorAll("table"));
        const countyRows: CountyVoteRow[] = [];

        for (const table of tables) {
          const rows = Array.from(table.querySelectorAll("tr"));
          if (rows.length < 3) continue;

          // Check if this looks like a county results table
          const headerCells = Array.from(rows[0].querySelectorAll("th, td")).map(
            (c) => c.textContent?.trim().toLowerCase() ?? ""
          );

          const hasCounty = headerCells.some((h) => h.includes("county"));
          const hasVotes = headerCells.some(
            (h) => h.includes("vote") || h.includes("total")
          );

          if (!hasCounty || !hasVotes) continue;

          // Parse header row to identify columns
          // Header typically: County | [Candidate names across multiple cols] | Total
          const candidateNames: string[] = [];
          const voteColIndices: number[] = [];
          const pctColIndices: number[] = [];
          let countyColIdx = -1;
          let totalColIdx = -1;

          headerCells.forEach((h, i) => {
            if (h.includes("county")) countyColIdx = i;
            else if (h === "total" || h === "total votes") totalColIdx = i;
          });

          // For multi-row headers, try second header row
          if (rows[1]) {
            const subHeaders = Array.from(
              rows[1].querySelectorAll("th, td")
            ).map((c) => c.textContent?.trim().toLowerCase() ?? "");

            subHeaders.forEach((h, i) => {
              if (h.includes("vote") && !h.includes("total")) {
                voteColIndices.push(i);
              } else if (h.includes("%") || h.includes("pct")) {
                pctColIndices.push(i);
              }
            });
          }

          // Try to extract candidate names from first header row
          headerCells.forEach((h, i) => {
            if (
              !h.includes("county") &&
              !h.includes("total") &&
              !h.includes("vote") &&
              !h.includes("%") &&
              h.length > 2
            ) {
              candidateNames.push(h);
              voteColIndices.push(i);
            }
          });

          if (countyColIdx === -1) continue;

          // Parse data rows
          const startRow = rows[1]?.querySelectorAll("th").length ? 2 : 1;

          for (let i = startRow; i < rows.length; i++) {
            const cells = Array.from(rows[i].querySelectorAll("td")).map((c) =>
              c.textContent?.trim() ?? ""
            );
            if (cells.length < 2) continue;

            const county = cells[countyColIdx];
            if (!county || county.toLowerCase().includes("total")) continue;
            if (county.toLowerCase().includes("state")) continue;

            const totalVotes =
              totalColIdx !== -1
                ? parseInt(cells[totalColIdx]?.replace(/,/g, ""), 10)
                : 0;

            const candidates: CountyVoteRow["candidates"] = [];
            for (let j = 0; j < voteColIndices.length; j++) {
              const colIdx = voteColIndices[j];
              const votes = parseInt(cells[colIdx]?.replace(/,/g, ""), 10);
              const pct =
                pctColIndices[j] !== undefined
                  ? parseFloat(cells[pctColIndices[j]] ?? "0")
                  : 0;
              if (!isNaN(votes)) {
                candidates.push({
                  name: candidateNames[j] ?? `Candidate ${j + 1}`,
                  party: "",
                  votes,
                  pct,
                });
              }
            }

            if (candidates.length > 0 || !isNaN(totalVotes)) {
              countyRows.push({ county, candidates, totalVotes });
            }
          }

          if (countyRows.length > 5) break; // found the right table
        }

        return countyRows;
      }))
    );
  } catch (err) {
    console.error(`  Error parsing table for ${year} ${partyLabel}:`, err);
  }

  return results;
}

async function main() {
  console.log("Launching browser...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  for (const election of ELECTIONS) {
    for (const { party, label } of election.parties) {
      const outPath = join(INTERIM_DIR, `doe_${election.year}_${party.toLowerCase()}.json`);
      if (existsSync(outPath)) {
        console.log(`  Skipping ${election.year} ${party} (already exists: ${outPath})`);
        continue;
      }

      console.log(`\nScraping ${election.year} ${label} gubernatorial primary...`);
      if (election.notes) console.log(`  Note: ${election.notes}`);

      try {
        const rows = await scrapeRaceCountyResults(
          page,
          election.year,
          election.date,
          label
        );

        const output = {
          year: election.year,
          party,
          primaryDate: election.date,
          notes: election.notes,
          scrapedAt: new Date().toISOString(),
          source: `Florida Division of Elections archive: results.elections.myflorida.com (scraped ${new Date().toISOString().split("T")[0]})`,
          countyCount: rows.length,
          counties: rows,
        };

        writeFileSync(outPath, JSON.stringify(output, null, 2), "utf-8");
        console.log(`  Wrote ${rows.length} county rows to ${outPath}`);
      } catch (err) {
        console.error(`  FAILED ${election.year} ${party}:`, err);
        // Write error record so we know what failed
        writeFileSync(
          outPath.replace(".json", ".error.json"),
          JSON.stringify({ year: election.year, party, error: String(err) }, null, 2),
          "utf-8"
        );
      }

      // Be polite
      await page.waitForTimeout(2000);
    }
  }

  await browser.close();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
