import type {
  ChartGroupPoint,
  ChartResponse,
  ChartSeries,
} from "../../../composables/chart/types";

type XAxisType = "category" | "datetime" | "numeric";

function isGroupPoint(
  entry: ChartSeries | ChartGroupPoint,
): entry is ChartGroupPoint {
  return "x" in entry && "y" in entry && !("data" in entry);
}

function isSeries(entry: ChartSeries | ChartGroupPoint): entry is ChartSeries {
  return "data" in entry;
}

/**
 * The series a bare chart draws from its data source's answer.
 *
 * One point per group becomes one series called `name`. On a category axis
 * each group key becomes its label: Apex lays numeric keys out on a number
 * line whatever axis type it is given, which bunches `202512` and `202601`
 * apart and shifts the bars of a numeric breakdown off their labels.
 */
export function responseSeries(
  series: ChartResponse["series"],
  name: string,
  xaxisType: XAxisType = "category",
): ChartSeries[] {
  const entries: Array<ChartSeries | ChartGroupPoint> = series;
  if (entries.length === 0 || !entries.every(isGroupPoint))
    return entries.filter(isSeries);
  const labelled = xaxisType === "category";
  const data = entries
    .filter(isGroupPoint)
    .map((point) => (labelled ? { ...point, x: String(point.x) } : point));
  return [{ name, data }];
}
