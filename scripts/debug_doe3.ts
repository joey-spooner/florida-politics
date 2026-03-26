import { chromium } from "playwright";
import { writeFileSync } from "fs";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Test 1: Check downloadresults.asp for 2006
console.log("=== Download Results page ===");
await page.goto("https://results.elections.myflorida.com/downloadresults.asp?ElectionDate=9/5/2006&DATAMODE=", { waitUntil: "networkidle", timeout: 30000 });
const dlHtml = await page.content();
writeFileSync("data/raw/doe_archive/debug_download_2006.html", dlHtml);
const dlLinks = await page.$$eval("a", els => els.map(a => ({ text: a.textContent?.trim(), href: a.href })));
console.log(`Links: ${dlLinks.length}`);
dlLinks.forEach(l => console.log(`  ${l.text} -> ${l.href}`));
const dlText = await page.evaluate(() => document.body.innerText);
console.log("Body text (first 1000):", dlText.substring(0, 1000));

// Test 2: SummaryRpt for Governor/Cabinet - 2006 DEM - all counties (no county filter = statewide)
console.log("\n=== SummaryRpt Governor DEM 2006 ===");
await page.goto("https://results.elections.myflorida.com/SummaryRpt.asp?ElectionDate=9/5/2006&Race=CAB&Party=DEM&DATAMODE=", { waitUntil: "networkidle", timeout: 30000 });
const rptHtml = await page.content();
writeFileSync("data/raw/doe_archive/debug_summary_2006_dem_cab.html", rptHtml);
const rptText = await page.evaluate(() => document.body.innerText);
console.log("Summary report text (first 2000):", rptText.substring(0, 2000));

await browser.close();
