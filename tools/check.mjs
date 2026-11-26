// 全アイコンを変換して、崩れの数を数える。
//
// 使い方:
//   1. リポジトリの直下でサーバーを立てる:  python3 -m http.server 8931 --bind 127.0.0.1
//   2. Playwright の入っているフォルダを指定して実行する:
//        PLAYWRIGHT_FROM=/path/to/project node tools/check.mjs
//
// 変換できないアイコンか、左右対称の崩れが 1 個でもあると、終了コード 1 で終わる。
// それ以外の数は、直す前と比べて悪くなっていないかを見るためのもの（0 にはなっていない）。
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const from = process.env.PLAYWRIGHT_FROM ?? root;
const { chromium } = createRequire(path.join(from, "package.json"))("@playwright/test");
const url = process.env.DOT_LUCIDE_URL ?? "http://127.0.0.1:8931/index.html";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
await page.goto(url);
await page.waitForFunction(() => typeof ICONS === "object" && Object.keys(ICONS).length > 0);

const report = await page.evaluate(() => {
  const names = Object.keys(ICONS);
  const failed = [];
  const asymmetric = [];
  const offCenterIcons = [];
  const sizeMismatchIcons = [];
  const outOfFrame = [];
  let symmetricOriginals = 0;
  const { pitch } = state;
  for (const name of names) {
    try {
      if (dotData(name).count === 0) failed.push(name);
      const symmetry = symmetryCheck(name);
      if (symmetry.original) {
        symmetricOriginals += 1;
        if (!symmetry.dots) asymmetric.push(name);
      }
      if (offCenter(name) > 0) offCenterIcons.push(name);
      if (sizeMismatch(name) > 0) sizeMismatchIcons.push(name);
      const over = fitPlan(name).plan.some((axes) => axes.some((entry) => entry.min < pitch - 0.01 || entry.min + entry.size > 24 - pitch + 0.01));
      if (over) outOfFrame.push(name);
    } catch (error) {
      failed.push(`${name}: ${error.message}`);
    }
  }
  return { total: names.length, symmetricOriginals, failed, asymmetric, offCenterIcons, sizeMismatchIcons, outOfFrame };
});
await browser.close();

const show = (label, list, limit = 12) => {
  const names = list.length > limit ? `${list.slice(0, limit).join(", ")} ほか` : list.join(", ");
  console.log(`${label}: ${list.length} 個${list.length > 0 ? `（${names}）` : ""}`);
};
console.log(`アイコン: ${report.total} 個（うち元の形が左右対称: ${report.symmetricOriginals} 個）`);
show("変換できない", report.failed);
show("左右対称の崩れ", report.asymmetric);
show("囲みの中のずれ", report.offCenterIcons);
show("大きさの食い違い", report.sizeMismatchIcons);
show("枠からのはみ出し", report.outOfFrame);
if (errors.length > 0) console.log(`ページのエラー: ${errors.join(" / ")}`);

if (errors.length > 0 || report.failed.length > 0 || report.asymmetric.length > 0) process.exit(1);
