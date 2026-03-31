/**
 * fetch_general_extracts.ts
 *
 * Downloads tab-delimited result extract files from the FL DoE archive
 * for gubernatorial GENERAL election years 1994, 1998, 2002, 2006, 2010.
 *
 * Uses the same ResultsExtract.Asp POST endpoint as fetch_doe_downloads.ts.
 *
 * Saves to data/raw/doe_archive/{year}_general_extract.txt
 *
 * Run: npm run data:fetch-general-extracts
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const RAW_DIR = "data/raw/doe_archive";
mkdirSync(RAW_DIR, { recursive: true });

const ELECTIONS = [
  { year: 1994, date: "11/8/1994"  },
  { year: 1998, date: "11/3/1998"  },
  { year: 2002, date: "11/5/2002"  },
  { year: 2006, date: "11/7/2006"  },
  { year: 2010, date: "11/2/2010"  },
  { year: 2014, date: "11/4/2014"  },
  { year: 2018, date: "11/6/2018"  },
  { year: 2022, date: "11/8/2022"  },
];

async function downloadExtract(date: string): Promise<string> {
  const body = new URLSearchParams({
    ElectionDate:    date,
    OfficialResults: "Y",
    PartyRaces:      "N",   // N = general election races (not primary party races)
    DataMode:        "",
    FormsButton2:    "Download",
  });

  const res = await fetch("https://results.elections.myflorida.com/ResultsExtract.Asp", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      "Referer": `https://results.elections.myflorida.com/downloadresults.asp?ElectionDate=${encodeURIComponent(date)}&DATAMODE=`,
      "Origin":  "https://results.elections.myflorida.com",
    },
    body: body.toString(),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} for ${date}`);

  const text = await res.text();
  console.log(`  Content-Type: ${res.headers.get("content-type")}`);
  console.log(`  Size: ${text.length} chars`);
  console.log(`  First 200 chars: ${text.substring(0, 200)}`);
  return text;
}

async function main() {
  for (const { year, date } of ELECTIONS) {
    const outPath = join(RAW_DIR, `${year}_general_extract.txt`);

    if (existsSync(outPath)) {
      console.log(`Skipping ${year} — already downloaded: ${outPath}`);
      continue;
    }

    console.log(`\nDownloading ${year} general election extract (${date})...`);
    try {
      const text = await downloadExtract(date);

      if (!text.includes("ElectionDate") && !text.includes("GOV") && !text.includes("Governor")) {
        console.warn(`  WARNING: Response may not contain election data. First 500 chars:\n${text.substring(0, 500)}`);
      }

      writeFileSync(outPath, text, "latin1");
      console.log(`  Saved: ${outPath}`);

      // Quick count of GOV rows
      const govRows = text.split("\n").filter((l) => l.includes("\tGOV\t") || /\tgovernor\t/i.test(l));
      console.log(`  GOV rows found: ${govRows.length}`);
    } catch (err) {
      console.error(`  FAILED ${year}:`, err);
    }

    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log("\nDone.");
}

main().catch((err) => { console.error(err); process.exit(1); });
