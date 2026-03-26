/**
 * fetch_doe_downloads.ts
 *
 * Downloads tab-delimited result extract files from the FL DoE archive
 * for gubernatorial primary years 1994, 2002, 2006, 2010.
 *
 * Uses the ResultsExtract.Asp endpoint (form POST), which returns a full
 * tab-delimited file of all county-level results for the entire election.
 *
 * Saves to data/raw/doe_archive/{year}_primary_extract.txt
 *
 * Run: npx tsx scripts/fetch_doe_downloads.ts
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const RAW_DIR = "data/raw/doe_archive";
mkdirSync(RAW_DIR, { recursive: true });

const ELECTIONS = [
  { year: 1994, date: "9/8/1994" },
  { year: 2002, date: "9/10/2002" },
  { year: 2006, date: "9/5/2006" },
  { year: 2010, date: "8/24/2010" },
];

async function downloadExtract(date: string): Promise<string> {
  const body = new URLSearchParams({
    ElectionDate: date,
    OfficialResults: "Y",
    PartyRaces: "Y",
    DataMode: "",
    FormsButton2: "Download",
  });

  const res = await fetch(
    "https://results.elections.myflorida.com/ResultsExtract.Asp",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: `https://results.elections.myflorida.com/downloadresults.asp?ElectionDate=${encodeURIComponent(date)}&DATAMODE=`,
        Origin: "https://results.elections.myflorida.com",
      },
      body: body.toString(),
    }
  );

  if (!res.ok) throw new Error(`HTTP ${res.status} for ${date}`);

  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text();

  console.log(`  Content-Type: ${contentType}`);
  console.log(`  Size: ${text.length} chars`);
  console.log(`  First 300 chars: ${text.substring(0, 300)}`);

  return text;
}

async function main() {
  for (const { year, date } of ELECTIONS) {
    const outPath = join(RAW_DIR, `${year}_primary_extract.txt`);
    if (existsSync(outPath)) {
      console.log(`Skipping ${year} — already exists`);
      continue;
    }

    console.log(`\nDownloading ${year} (${date})...`);
    try {
      const data = await downloadExtract(date);

      if (data.length < 100) {
        throw new Error(`Response too short (${data.length} chars) — likely not a data file`);
      }

      writeFileSync(outPath, data, "utf-8");
      console.log(`  Saved to ${outPath}`);

      // Count lines
      const lines = data.split("\n").filter(Boolean);
      console.log(`  Lines: ${lines.length}`);

      // Show first data line
      if (lines.length > 1) {
        console.log(`  First data line: ${lines[1]?.substring(0, 120)}`);
      }
    } catch (err) {
      console.error(`  FAILED ${year}:`, err);
    }

    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log("\nDone.");
}

main().catch(console.error);
