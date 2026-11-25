import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRadar, MODEL, parseSnapshot } from "./lib/model.ts";
import { buildDossier } from "./vendor/makefun-board.ts";

const root = fileURLToPath(new URL(".", import.meta.url));
const args = process.argv.slice(2);
function option(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const inline = args.find((item) => item.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1]! : fallback;
}

const input = option("input", "/input");
const inputFile = input.endsWith(".json") ? input : join(input, "snapshot.json");
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: snapshot not found: ${inputFile}\n`);
  process.exit(2);
}
const output = resolve(option("output", process.env.MAKEFUN_OUTPUT_DIR ?? "/output"));
const snapshot = parseSnapshot(readFileSync(inputFile, "utf8"));
const { rows, live } = buildRadar(snapshot);
mkdirSync(output, { recursive: true });
writeFileSync(join(output, "board.json"), `${JSON.stringify({ rows }, null, 2)}\n`);
writeFileSync(join(output, "data.js"), `window.RADAR=${JSON.stringify({
  as_of: snapshot.as_of,
  source: snapshot.source,
  floor_usd: snapshot.floor_usd,
  watchlist_size: snapshot.watchlist.length,
  board_size: rows.length,
  early_size: rows.filter((row) => row.below_floor).length,
  other_size: rows.filter((row) => !row.on_watchlist && !row.below_floor).length,
  model: MODEL,
  rows,
  live,
})};\n`);

function copyRegularFiles(from: string, to: string): string[] {
  mkdirSync(to, { recursive: true });
  const names: string[] = [];
  for (const name of readdirSync(from).sort()) {
    if (name.startsWith(".")) continue;
    const source = join(from, name);
    if (!statSync(source).isFile()) continue;
    copyFileSync(source, join(to, name));
    names.push(name);
  }
  return names;
}

copyRegularFiles(join(root, "dashboard"), join(output, "dashboard"));
const screenshots = copyRegularFiles(join(root, "screenshots"), join(output, "screenshots"));
if (screenshots.length < 3 || screenshots.length > 4) {
  throw new Error(`expected 3–4 screenshots, found ${screenshots.length}`);
}
writeFileSync(join(output, "dossier.json"), buildDossier(output, {
  text_max_bytes: 65_536,
  screenshots: { max: 4, max_bytes: 524_288 },
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
}));
process.stdout.write(
  `Token Radar: ${rows.length} ranked protocols; ${snapshot.watchlist.length} / ${snapshot.watchlist.length} watchlist covered; ` +
  `${live.length} live-token references set aside.\n` +
  `Wrote ${output}/board.json, data.js, dashboard/, screenshots/ and dossier.json.\n`,
);
