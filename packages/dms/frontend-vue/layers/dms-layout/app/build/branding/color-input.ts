/** A color nobody types: if `fillStyle` still holds it after the assignment, the browser refused the color. */
const SENTINEL_COLOR = "#fe01fd";
let context: CanvasRenderingContext2D | null | undefined;

/**
 * A CSS color as the `#rrggbb` a color input holds, so the picker opens on
 * the color shown rather than black. Undefined when the browser cannot draw
 * it, or has no canvas.
 */
export function hexOf(color: string): string | undefined {
  if (typeof document === "undefined" || color.trim() === "") return undefined;
  try {
    context ??= document
      .createElement("canvas")
      .getContext("2d", { willReadFrequently: true });
  } catch {
    context = null;
  }
  if (!context) return undefined;
  context.fillStyle = SENTINEL_COLOR;
  context.fillStyle = color;
  if (context.fillStyle === SENTINEL_COLOR) return undefined;
  context.clearRect(0, 0, 1, 1);
  context.fillRect(0, 0, 1, 1);
  const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data;
  return `#${[red, green, blue]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

/** The color an element paints as its background, as `#rrggbb`. */
export function backgroundHex(element: Element | null): string {
  const color = element ? getComputedStyle(element).backgroundColor : "";
  return hexOf(color) ?? "#000000";
}
