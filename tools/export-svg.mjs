// 点にしたアイコンを、1 個 1 ファイルの SVG に書き出す。
//
// 使い方:
//   1. リポジトリの直下でサーバーを立てる:  python3 -m http.server 8931 --bind 127.0.0.1
//   2. Playwright の入っているフォルダを指定して実行する:
//        PLAYWRIGHT_FROM=/path/to/project node tools/export-svg.mjs
//      （PLAYWRIGHT_FROM は @playwright/test を解決できるフォルダ。省くとこのリポジトリから探す）
//
// 出力: icons/<名前>.svg と icons/manifest.json
// 各 SVG の先頭には、元のアイコンとライセンスを書いたコメントが入る（ページの exportSvg が作る）。
// 書き出す前に icons/ の中の .svg を消すこと（Lucide から消えたアイコンが残らないようにする）。このスクリプトが行う。
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const from = process.env.PLAYWRIGHT_FROM ?? root;
const { chromium } = createRequire(path.join(from, "package.json"))("@playwright/test");
const url = process.env.DOT_LUCIDE_URL ?? "http://127.0.0.1:8931/index.html";
const outDir = path.join(root, "icons");

// ページの既定値のまま書き出す。値を変えて書き出すときは、ここと README の「書き出したときの設定」を一緒に直すこと
const EXPECTED = { pitch: 1.5, weight: 1.6, threshold: 0.4, shape: "circle", fit: true, square: true, cavity: true };

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
await page.goto(url);
await page.waitForFunction(() => typeof ICONS === "object" && Object.keys(ICONS).length > 0);

const settings = await page.evaluate(() => {
  const { pitch, weight, threshold, shape, fit, square, cavity } = state;
  return { pitch, weight, threshold, shape, fit, square, cavity };
});
for (const [key, value] of Object.entries(EXPECTED)) {
  if (settings[key] !== value) throw new Error(`設定が想定と違います: ${key} = ${settings[key]}（想定 ${value}）`);
}

const icons = await page.evaluate(() =>
  Object.keys(ICONS)
    .sort()
    .map((name) => {
      const { on, count } = dotData(name);
      return { name, count, d: on, license: LICENSES[name], svg: exportSvg(name) };
    }),
);
await browser.close();
if (errors.length > 0) throw new Error(`ページでエラーが出ました: ${errors.join(" / ")}`);

const empty = icons.filter((icon) => icon.count === 0 || icon.d === "");
if (empty.length > 0) throw new Error(`点が 1 つも無いアイコンがあります: ${empty.map((icon) => icon.name).join(", ")}`);

fs.mkdirSync(outDir, { recursive: true });
for (const file of fs.readdirSync(outDir)) {
  if (file.endsWith(".svg")) fs.rmSync(path.join(outDir, file));
}
const unlicensed = icons.filter((icon) => icon.license !== "ISC" && icon.license !== "MIT");
if (unlicensed.length > 0) throw new Error(`ライセンスが分からないアイコンがあります: ${unlicensed.map((icon) => icon.name).join(", ")}`);
for (const { name, svg } of icons) fs.writeFileSync(path.join(outDir, `${name}.svg`), `${svg}\n`);
const manifest = {
  source: "lucide-react 1.49.0",
  grid: "15 x 15",
  viewBox: "0 0 24 24",
  settings,
  count: icons.length,
  licenses: {
    ISC: { name: "ISC License", copyright: "Copyright (c) 2026 Lucide Icons and Contributors", icons: icons.filter((icon) => icon.license === "ISC").length },
    MIT: { name: "MIT License", copyright: "Copyright (c) 2013-present Cole Bemis", icons: icons.filter((icon) => icon.license === "MIT").length },
    fullText: "LICENSE-lucide.txt",
  },
  icons: icons.map(({ name, count, license }) => ({ name, dots: count, license })),
};
fs.writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${icons.length} 個を ${outDir} に書き出しました`);
