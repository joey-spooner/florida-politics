/**
 * debug_doe.ts — Diagnose what the FL DoE archive renders with Playwright.
 */
import { chromium } from "playwright";
import { writeFileSync } from "fs";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on("console", msg => console.log("BROWSER:", msg.text()));

  const url = "https://results.elections.myflorida.com/Index.asp?ElectionDate=9%2F5%2F2006&DATAMODE=";
  console.log(`Loading: ${url}`);

  // Try with networkidle wait
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

  const html = await page.content();
  writeFileSync("data/raw/doe_archive/debug_2006_networkidle.html", html, "utf-8");
  console.log(`Saved HTML (${html.length} chars)`);

  // Check for frames/iframes
  const frames = page.frames();
  console.log(`Frames: ${frames.length}`);
  for (const frame of frames) {
    console.log(`  Frame URL: ${frame.url()}`);
  }

  // Get all links
  const links = await page.$$eval("a", els => els.map(a => ({ text: a.textContent?.trim(), href: a.href })));
  console.log(`Links found: ${links.length}`);
  links.slice(0, 30).forEach(l => console.log(`  ${l.href} -> ${l.text}`));

  // Get all select elements (dropdowns)
  const selects = await page.$$eval("select", els => els.map(s => ({
    name: s.name,
    id: s.id,
    options: Array.from(s.options).map(o => ({ value: o.value, text: o.text })).slice(0, 10)
  })));
  console.log(`Selects found: ${selects.length}`);
  selects.forEach(s => console.log(`  Select: ${s.name}/${s.id}`, s.options));

  // Look for any text mentioning "governor"
  const bodyText = await page.evaluate(() => document.body.innerText);
  const govIdx = bodyText.toLowerCase().indexOf("governor");
  if (govIdx !== -1) {
    console.log(`\nFound "governor" at index ${govIdx}:`);
    console.log(bodyText.substring(Math.max(0, govIdx - 100), govIdx + 200));
  } else {
    console.log('\nNo "governor" text found on page');
    console.log('\nFirst 2000 chars of body text:');
    console.log(bodyText.substring(0, 2000));
  }

  await browser.close();
}

main().catch(console.error);
