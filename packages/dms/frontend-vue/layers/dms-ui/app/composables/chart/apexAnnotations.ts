import type { ChartAnnotation } from "./types";
import { resolveChartColor } from "./useChartTheme";

const ANNOTATION_DASH = 4;
const SOLID_DASH = 0;
const ANNOTATION_STROKE_WIDTH = 1;
const BAND_FILL_OPACITY = 0.08;
const LABEL_OFFSET_Y = -4;
const LABEL_FONT_SIZE = "11px";
const LABEL_POSITION = "right";
const TRANSPARENT = "transparent";

interface ApexAnnotationLabelStyle {
  background: string;
  color: string;
  fontSize: string;
}

interface ApexAnnotationLabel {
  text: string;
  position: string;
  offsetY: number;
  borderColor: string;
  style: ApexAnnotationLabelStyle;
}

interface ApexYAxisAnnotation {
  y: number;
  y2?: number;
  strokeDashArray: number;
  borderColor: string;
  borderWidth: number;
  fillColor?: string;
  opacity?: number;
  label?: ApexAnnotationLabel;
}

function buildLabel(text: string, color: string): ApexAnnotationLabel {
  return {
    text,
    position: LABEL_POSITION,
    offsetY: LABEL_OFFSET_Y,
    borderColor: TRANSPARENT,
    style: {
      background: TRANSPARENT,
      color,
      fontSize: LABEL_FONT_SIZE,
    },
  };
}

function buildYAxisAnnotation(
  annotation: ChartAnnotation,
): ApexYAxisAnnotation {
  const color = resolveChartColor(annotation.color);
  const isBand = annotation.y2 !== undefined;
  return {
    y: annotation.y,
    y2: annotation.y2,
    strokeDashArray: annotation.dashed === false ? SOLID_DASH : ANNOTATION_DASH,
    borderColor: color,
    borderWidth: ANNOTATION_STROKE_WIDTH,
    fillColor: isBand ? color : undefined,
    opacity: isBand ? BAND_FILL_OPACITY : undefined,
    label: annotation.label ? buildLabel(annotation.label, color) : undefined,
  };
}

export function buildAnnotations(
  annotations: ChartAnnotation[] | undefined,
): Record<string, unknown> | null {
  if (!annotations || annotations.length === 0) return null;
  return { yaxis: annotations.map(buildYAxisAnnotation) };
}
