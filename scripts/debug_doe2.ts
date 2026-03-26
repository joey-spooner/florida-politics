import { chromium } from "playwright";
import { writeFileSync } from "fs";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("https://results.elections.myflorida.com/ElectionRaces.asp?ElectionDate=9/5/2006&DATAMODE=", { waitUntil: "networkidle", timeout: 30000 });
const html = await page.content();
writeFileSync("data/raw/doe_archive/debug_races_2006.html", html);
const links = await page.$$eval("a", els => els.map(a => ({ text: a.textContent?.trim(), href: a.href })));
console.log(`Links: ${links.length}`);
links.forEach(l => console.log(`  ${l.text?.substring(0,80)} -> ${l.href?.substring(0,100)}`));
await browser.close();
