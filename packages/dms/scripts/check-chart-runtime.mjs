import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { promisify } from "node:util";

const execute = promisify(execFile);
const require = createRequire(
  new URL("../frontend-vue/package.json", import.meta.url),
);
const libraryPath =
  process.argv[2] ?? require.resolve("apexcharts/dist/apexcharts.min.js");
const session = `chart-parity-${process.pid}`;
const EXPECTED_LABELS = [
  "09 Sep",
  "10 Sep",
  "11 Sep",
  "12 Sep",
  "13 Sep",
  "14 Sep",
];
const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<div id="chart"></div><script src="/apex.js"></script><script>
const DAY = 86400000;
const START = Date.UTC(2026, 8, 9);
const DAYS = 7;
const series = [
  {name: 'Pageviews', data: Array.from({length: DAYS}, (_, i) => ({x: START + i * DAY, y: i === DAYS - 1 ? 23 : 0}))},
  {name: 'Sessions', data: Array.from({length: DAYS}, (_, i) => ({x: START + i * DAY, y: i === DAYS - 1 ? 10 : 0}))}
];
const chart = new ApexCharts(document.querySelector('#chart'), {
  chart: {type: 'area', width: 600, height: 300, animations: {enabled: false}, toolbar: {show: false}, zoom: {enabled: false}},
  series,
  xaxis: {type: 'datetime', labels: {datetimeUTC: false, style: {fontSize: '11px'}}, axisBorder: {show: false}, axisTicks: {show: false}},
  dataLabels: {enabled: false}, stroke: {curve: 'smooth'}, legend: {show: true}
});
chart.render().then(() => { window.chartReady = true; });
</script></body></html>`;

async function browser(...args) {
  const { stdout } = await execute("agent-browser", [
    "--session",
    session,
    "--args",
    "--disable-dev-shm-usage",
    ...args,
  ]);
  return stdout;
}

const server = createServer((request, response) => {
  const isLibrary = request.url === "/apex.js";
  response.setHeader(
    "content-type",
    isLibrary ? "text/javascript" : "text/html; charset=utf-8",
  );
  response.end(isLibrary ? readFileSync(libraryPath) : html);
});

try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await browser("open", `http://127.0.0.1:${port}`);
  await browser("set", "viewport", "1440", "1000", "2");
  await browser("wait", "--fn", "window.chartReady === true");
  const output = await browser(
    "eval",
    "--json",
    `Array.from(document.querySelectorAll('.apexcharts-xaxis-texts-g text')).map(node => node.querySelector('tspan')?.textContent ?? node.textContent).filter(Boolean)`,
  );
  const labels = JSON.parse(output).data.result;
  assert.deepEqual(labels, EXPECTED_LABELS);
  console.log(`Daily chart ticks PASS: ${labels.join(", ")}`);
} finally {
  await browser("close").catch(() => undefined);
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
