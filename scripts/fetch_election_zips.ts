/**
 * fetch_election_zips.ts
 *
 * Downloads precinct-level election result ZIPs from Florida Division of Elections
 * for gubernatorial primary years: 2014, 2018, 2022.
 *
 * Source: https://dos.fl.gov/elections/data-statistics/elections-data/precinct-level-election-results/
 *
 * Saves ZIPs to data/raw/zips/ and extracts CSVs to data/raw/zips/{year}_primary/
 *
 * Run: npm run data:fetch-zips
 */

import { writeFileSync, mkdirSync, existsSync, createWriteStream, createReadStream } from "fs";
import { join } from "path";
import { pipeline } from "stream/promises";
import unzipper from "unzipper";

const RAW_ZIPS_DIR = "data/raw/zips";
mkdirSync(RAW_ZIPS_DIR, { recursive: true });

// Direct download URLs confirmed from dos.fl.gov
const ZIP_SOURCES = [
  {
    year: 2022,
    url: "https://dos.fl.gov/media/707057/enightprecinctfiles2022_pri.zip",
    filename: "2022_primary.zip",
  },
  {
    year: 2018,
    url: "https://dos.fl.gov/media/700241/precinctlevelelectionresults2018pri.zip",
    filename: "2018_primary.zip",
  },
  {
    year: 2014,
    url: "https://dos.fl.gov/media/697200/precinctlevelelectionresults2014pri.zip",
    filename: "2014_primary.zip",
  },
];

async function downloadFile(url: string, destPath: string): Promise<void> {
  console.log(`  Downloading: ${url}`);
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; FloridaPoliticsBot/1.0; research project)",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  if (!res.body) throw new Error("No response body");

  const fileStream = createWriteStream(destPath);
  await pipeline(res.body as NodeJS.ReadableStream, fileStream);
  console.log(`  Saved: ${destPath}`);
}

async function extractZip(zipPath: string, destDir: string): Promise<string[]> {
  mkdirSync(destDir, { recursive: true });
  const extracted: string[] = [];

  const directory = await unzipper.Open.file(zipPath);
  for (const file of directory.files) {
    if (file.type === "Directory") continue;
    const destPath = join(destDir, file.path);
    mkdirSync(destPath.substring(0, destPath.lastIndexOf("/")), { recursive: true });
    const content = await file.buffer();
    writeFileSync(destPath, content);
    extracted.push(destPath);
    console.log(`    Extracted: ${file.path}`);
  }

  return extracted;
}

async function main() {
  for (const { year, url, filename } of ZIP_SOURCES) {
    const zipPath = join(RAW_ZIPS_DIR, filename);
    const extractDir = join(RAW_ZIPS_DIR, `${year}_primary`);

    if (existsSync(extractDir)) {
      console.log(`Skipping ${year} — already extracted at ${extractDir}`);
      continue;
    }

    console.log(`\nFetching ${year} primary ZIP...`);

    try {
      await downloadFile(url, zipPath);
      console.log(`Extracting ${zipPath}...`);
      const files = await extractZip(zipPath, extractDir);
      console.log(`  Extracted ${files.length} files to ${extractDir}`);
    } catch (err) {
      console.error(`  FAILED ${year}:`, err);
    }
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
