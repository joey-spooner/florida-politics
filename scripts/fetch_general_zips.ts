/**
 * fetch_general_zips.ts
 *
 * Uses Playwright to navigate the FL DoE precinct-level results page and
 * auto-discover download URLs for gubernatorial general election ZIPs.
 * Downloads and extracts ZIPs for 2014, 2018, 2022.
 *
 * Source: https://dos.fl.gov/elections/data-statistics/elections-data/precinct-level-election-results/
 *
 * Run: npm run data:fetch-general-zips
 */

import { writeFileSync, mkdirSync, existsSync, createWriteStream } from "fs";
import { join } from "path";
import { pipeline } from "stream/promises";
import { chromium } from "playwright";
import unzipper from "unzipper";

const RAW_ZIPS_DIR = "data/raw/zips";
mkdirSync(RAW_ZIPS_DIR, { recursive: true });

const TARGET_YEARS = [2014, 2018, 2022];

async function downloadFile(url: string, destPath: string): Promise<void> {
  console.log(`  Downloading: ${url}`);
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; FloridaPoliticsBot/1.0; research project)" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  if (!res.body) throw new Error("No response body");
  const fileStream = createWriteStream(destPath);
  await pipeline(res.body as NodeJS.ReadableStream, fileStream);
  console.log(`  Saved: ${destPath}`);
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  mkdirSync(destDir, { recursive: true });
  const directory = await unzipper.Open.file(zipPath);
  for (const file of directory.files) {
    if (file.type === "Directory") continue;
    const destPath = join(destDir, file.path);
    mkdirSync(destPath.substring(0, destPath.lastIndexOf("/")), { recursive: true });
    writeFileSync(destPath, await file.buffer());
    console.log(`    Extracted: ${file.path}`);
  }
}

async function main() {
  console.log("Launching browser to discover general election ZIP URLs...");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  });

  await page.goto(
    "https://dos.fl.gov/elections/data-statistics/elections-data/precinct-level-election-results/",
    { waitUntil: "networkidle", timeout: 30000 }
  );

  // Collect all ZIP links from the page
  const allLinks = await page.$$eval("a[href]", (els) =>
    els.map((a) => ({ text: (a.textContent ?? "").trim(), href: (a as HTMLAnchorElement).href }))
  );

  await browser.close();

  // Find general election links for each target year
  const genLinks = allLinks.filter(
    (l) =>
      l.href.endsWith(".zip") &&
      /_gen/i.test(l.href) &&
      TARGET_YEARS.some((y) => l.href.includes(String(y)) || l.text.includes(String(y)))
  );

  console.log(`\nFound ${genLinks.length} general election ZIP link(s):`);
  genLinks.forEach((l) => console.log(`  ${l.text} → ${l.href}`));

  if (genLinks.length === 0) {
    console.error(
      "\nNo general election ZIPs found. The DoE page structure may have changed.\n" +
      "Visit https://dos.fl.gov/elections/data-statistics/elections-data/precinct-level-election-results/\n" +
      "and manually note the general election ZIP URLs, then add them to this script."
    );
    process.exit(1);
  }

  for (const { href } of genLinks) {
    const year = TARGET_YEARS.find((y) => href.includes(String(y)));
    if (!year) continue;

    const filename = `${year}_general.zip`;
    const zipPath = join(RAW_ZIPS_DIR, filename);
    const extractDir = join(RAW_ZIPS_DIR, `${year}_general`);

    if (existsSync(extractDir)) {
      console.log(`\nSkipping ${year} — already extracted at ${extractDir}`);
      continue;
    }

    console.log(`\nFetching ${year} general election ZIP...`);
    try {
      await downloadFile(href, zipPath);
      console.log(`Extracting ${zipPath}...`);
      await extractZip(zipPath, extractDir);
      console.log(`  Done: ${extractDir}`);
    } catch (err) {
      console.error(`  FAILED ${year}:`, err);
    }
  }

  console.log("\nDone.");
}

main().catch((err) => { console.error(err); process.exit(1); });
