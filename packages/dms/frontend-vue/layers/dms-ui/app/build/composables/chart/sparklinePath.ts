/** A point in sparkline viewBox coordinates. */
export interface SparkPoint {
  x: number;
  y: number;
}

/** Box the values are projected into, with a vertical inset for the stroke. */
export interface SparkBox {
  width: number;
  height: number;
  padding: number;
}

/** Catmull-Rom to Bézier divisor: 6 gives the uniform, non-overshooting curve. */
const CATMULL_ROM_DIVISOR = 6;
const COORDINATE_PRECISION = 2;

/** Project values onto the box, highest value at the top. */
export function projectSparkPoints(
  values: number[],
  box: SparkBox,
): SparkPoint[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const denominator = values.length > 1 ? values.length - 1 : 1;
  const drawable = box.height - box.padding * 2;
  return values.map((value, index) => ({
    x: (index / denominator) * box.width,
    y: box.height - box.padding - ((value - min) / span) * drawable,
  }));
}

function format(point: SparkPoint): string {
  return `${point.x.toFixed(COORDINATE_PRECISION)},${point.y.toFixed(COORDINATE_PRECISION)}`;
}

function controlPoints(
  points: SparkPoint[],
  index: number,
): [SparkPoint, SparkPoint] {
  const current = points[index]!;
  const next = points[index + 1]!;
  const previous = points[index - 1] ?? current;
  const afterNext = points[index + 2] ?? next;
  return [
    {
      x: current.x + (next.x - previous.x) / CATMULL_ROM_DIVISOR,
      y: current.y + (next.y - previous.y) / CATMULL_ROM_DIVISOR,
    },
    {
      x: next.x - (afterNext.x - current.x) / CATMULL_ROM_DIVISOR,
      y: next.y - (afterNext.y - current.y) / CATMULL_ROM_DIVISOR,
    },
  ];
}

/** Smooth line through every point (v2 sparkline curve). */
export function smoothSparkPath(points: SparkPoint[]): string {
  if (points.length === 0) return "";
  const segments = [`M${format(points[0]!)}`];
  for (let index = 0; index < points.length - 1; index++) {
    const [first, second] = controlPoints(points, index);
    segments.push(
      `C${format(first)} ${format(second)} ${format(points[index + 1]!)}`,
    );
  }
  return segments.join(" ");
}

/** The line path closed down to the baseline, for the area under it. */
export function closeSparkArea(
  line: string,
  points: SparkPoint[],
  height: number,
): string {
  if (!line) return "";
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return `${line} L${last.x.toFixed(COORDINATE_PRECISION)},${height} L${first.x.toFixed(COORDINATE_PRECISION)},${height} Z`;
}
