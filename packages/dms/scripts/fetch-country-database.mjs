import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const target = join(packageRoot, "data", "dbip-country-lite.mmdb");
const editionUrl = (month) =>
  `https://download.db-ip.com/free/dbip-country-lite-${month}.mmdb.gz`;

function editionMonth(monthsBack) {
  const date = new Date();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - monthsBack);
  return date.toISOString().slice(0, 7);
}

async function download(month) {
  const response = await fetch(editionUrl(month));
  if (!response.ok) return undefined;
  return gunzipSync(Buffer.from(await response.arrayBuffer()));
}

for (const monthsBack of [0, 1]) {
  const month = editionMonth(monthsBack);
  const database = await download(month);
  if (!database) continue;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, database);
  console.log(`DB-IP Country Lite ${month} written to ${target}`);
  process.exit(0);
}

console.error("No DB-IP Country Lite edition could be downloaded");
process.exit(1);
