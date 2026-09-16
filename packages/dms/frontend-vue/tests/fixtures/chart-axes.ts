import ApexCharts from "apexcharts";
import { useApexChart } from "../../layers/dms-ui/app/composables/chart/useApexChart";
import type { UseApexChartInput } from "../../layers/dms-ui/app/composables/chart/useApexChart.types";

const SHORT_MONTH_DAYS = 5;
const LONG_MONTH_DAYS = 31;
const CHART_HEIGHT = 240;
const AXIS_INTERVALS = 2;
const START_DATE = Date.UTC(2026, 0, 1);
const DAY_MS = 86_400_000;

function dailySeries(days: number, datetime = false) {
  return [
    {
      name: "Usage",
      data: Array.from({ length: days }, (_, index) => ({
        x: datetime ? START_DATE + index * DAY_MS : index + 1,
        y: index + 1,
      })),
    },
  ];
}

async function renderChart(title: string, input: Partial<UseApexChartInput>) {
  const article = document.createElement("article");
  const heading = document.createElement("h2");
  heading.textContent = title;
  const host = document.createElement("div");
  article.append(heading, host);
  document.querySelector("main")!.append(article);
  const chart = useApexChart(() => ({
    type: "line",
    series: dailySeries(LONG_MONTH_DAYS),
    height: `${CHART_HEIGHT}px`,
    showLegend: false,
    colors: "#235ac3",
    xAxis: {
      tickAmount: AXIS_INTERVALS,
      rotate: 0,
      hideOverlappingLabels: true,
    },
    xAxisFormatter: (value) => `Jour ${value}`,
    ...input,
  }));
  await new ApexCharts(host, {
    ...chart.options.value,
    series: chart.series.value,
  }).render();
}

await renderChart("Mois en cours · 5 jours", {
  series: dailySeries(SHORT_MONTH_DAYS),
});
await renderChart("Mois complet · 31 jours", {});
await renderChart("Comparaison · 5 jours / 31 jours", {
  series: [
    ...dailySeries(SHORT_MONTH_DAYS),
    { ...dailySeries(LONG_MONTH_DAYS)[0]!, name: "Précédent" },
  ],
});
await renderChart("Dates · format serveur dd MMM", {
  xaxisType: "datetime",
  series: dailySeries(LONG_MONTH_DAYS, true),
  xAxis: { datetimeFormat: "dd MMM", rotate: 0, hideOverlappingLabels: true },
  xAxisFormatter: undefined,
});
document.body.dataset.ready = "true";
