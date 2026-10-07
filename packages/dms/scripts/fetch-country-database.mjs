// Downloads the month's DB-IP Country Lite database into `data/`, where the
// sign-in country lookup reads it (`src/utils/sign-in-country.ts`). Runs from
// `prepack`, so every release ships the edition current on its publish day;
// the file stays out of git. DB-IP publishes a new edition at the start of
// each month, so the previous month's is the fallback while the new one is not
// out yet.
//
// The database is licensed under CC BY 4.0 (https://db-ip.com, no account
// needed); `data/NOTICE.md` carries the attribution the licence asks for.

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
