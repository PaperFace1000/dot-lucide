// lucide-react から、アイコンの形のデータ（icons.json）を作り直す。
//
// 使い方:
//   node tools/extract-icons.mjs /path/to/node_modules/lucide-react icons.json
//
// icons.json は 1 行に 1 個で、[名前, 形, ライセンス] の並び。
// ライセンスは、lucide-react の LICENSE に「Feather 由来」として名前が載っているアイコンが "MIT"、それ以外が "ISC"。
// LICENSE には昔の名前（alert-circle など）で載っているものがあるので、別名のファイルをたどって今の名前に直す。
// たどれない名前が 1 つでもあれば、エラーで止まる（ライセンスの表記を間違えたまま書き出さないため）。
import fs from "node:fs";
import path from "node:path";

const [packageDir, outFile] = process.argv.slice(2);
if (!packageDir || !outFile) throw new Error("使い方: node tools/extract-icons.mjs <lucide-react のフォルダ> <出力先>");
const iconsDir = path.join(packageDir, "dist/esm/icons");

const license = fs.readFileSync(path.join(packageDir, "LICENSE"), "utf8");
const listed = /derived from the Feather project:\s*([\s\S]*?)\n\s*\nThe MIT License/.exec(license);
if (!listed) throw new Error("LICENSE から Feather 由来のアイコンの一覧を読み取れませんでした");
const featherNames = listed[1].split(",").map((name) => name.trim()).filter(Boolean);

const load = async (name) => {
  const file = path.join(iconsDir, `${name}.mjs`);
  return fs.existsSync(file) ? { file, module: await import(file) } : null;
};
// 別名のファイルは、元のアイコンのファイルから default を読み直して書き出しているだけなので、その読み込み先をたどる
const canonical = async (name, depth = 0) => {
  const loaded = await load(name);
  if (!loaded || depth > 5) return null;
  if (loaded.module.__iconData) return loaded.module.__iconData.name;
  const target = /from ['"]\.\/([a-z0-9-]+)\.mjs['"]/.exec(fs.readFileSync(loaded.file, "utf8"));
  return target ? canonical(target[1], depth + 1) : null;
};

const feather = new Set();
const unresolved = [];
for (const name of featherNames) {
  const resolved = await canonical(name);
  if (resolved) feather.add(resolved);
  else unresolved.push(name);
}
if (unresolved.length > 0) throw new Error(`今の名前にたどれない Feather 由来のアイコンがあります: ${unresolved.join(", ")}`);

const lines = [];
for (const file of fs.readdirSync(iconsDir).filter((entry) => entry.endsWith(".mjs")).sort()) {
  const module = await import(path.join(iconsDir, file));
  if (!module.__iconData) continue;
  const name = file.replace(/\.mjs$/, "");
  const nodes = module.__iconData.node.map(([tag, attrs]) => {
    const { key, ...rest } = attrs;
    return [tag, rest];
  });
  lines.push(JSON.stringify([name, nodes, feather.has(name) ? "MIT" : "ISC"]));
}
fs.writeFileSync(outFile, `[\n${lines.join(",\n")}\n]\n`);
console.log(`${lines.length} 個を書き出しました（Feather 由来で MIT: ${feather.size} 個、LICENSE に載っている名前: ${featherNames.length} 個）`);
