const SVG_TYPE = "image/svg+xml";
const PNG_TYPE = "image/png";
const EMAIL_TYPES = ["image/png", "image/jpeg"];
const EMAIL_EXTENSION = /\.(?:png|jpe?g)$/i;
/** Twice the 48 pixels an email header shows the logo at, for dense screens. */
const EMAIL_LOGO_HEIGHT = 96;
/** The email's column. */
const EMAIL_LOGO_MAX_WIDTH = 600;

const SVG_VIEW_BOX =
  /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i;
const SVG_WIDTH = /<svg[^>]*\swidth\s*=\s*["']\s*([\d.]+)(?:px)?\s*["']/i;
const SVG_HEIGHT = /<svg[^>]*\sheight\s*=\s*["']\s*([\d.]+)(?:px)?\s*["']/i;

type NamedFile = Pick<File, "type" | "name">;

function isSvg(file: NamedFile): boolean {
  return file.type === SVG_TYPE || file.name.toLowerCase().endsWith(".svg");
}

/** PNG and JPEG are the only images every mail client shows. */
export function isMailable(file: NamedFile): boolean {
  return file.type === ""
    ? EMAIL_EXTENSION.test(file.name)
    : EMAIL_TYPES.includes(file.type);
}

/** Width over height an SVG declares, else its `viewBox`'s. */
export function svgAspect(text: string): number | undefined {
  const box = SVG_VIEW_BOX.exec(text);
  const width = Number(SVG_WIDTH.exec(text)?.[1] ?? box?.[1]);
  const height = Number(SVG_HEIGHT.exec(text)?.[1] ?? box?.[2]);
  return width > 0 && height > 0 ? width / height : undefined;
}

/** The email header's size for an aspect ratio. */
export function emailLogoSize(aspect: number): {
  width: number;
  height: number;
} {
  const width = Math.min(
    Math.round(EMAIL_LOGO_HEIGHT * aspect),
    EMAIL_LOGO_MAX_WIDTH,
  );
  return { width, height: Math.round(width / aspect) };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The image could not be drawn."));
    image.src = url;
  });
}

function drawnSize(
  image: HTMLImageElement,
  svgText: string | undefined,
): { width: number; height: number } {
  const width = image.naturalWidth || 1;
  const height = image.naturalHeight || 1;
  if (svgText !== undefined) {
    return emailLogoSize(svgAspect(svgText) ?? width / height);
  }
  const size = emailLogoSize(width / height);
  return size.height > height ? { width, height } : size;
}

/**
 * A logo mail clients cannot show (SVG, WebP, icon) drawn to a PNG at
 * email-header size; a bitmap is never upscaled. Undefined when the browser
 * cannot draw it.
 */
export async function rasterizeForEmail(file: File): Promise<File | undefined> {
  const svgText = isSvg(file) ? await file.text() : undefined;
  const url = URL.createObjectURL(
    svgText === undefined ? file : new Blob([svgText], { type: SVG_TYPE }),
  );
  try {
    const image = await loadImage(url);
    const { width, height } = drawnSize(image, svgText);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, PNG_TYPE),
    );
    const name = `${file.name.replace(/\.[^./]+$/, "")}.png`;
    return blob ? new File([blob], name, { type: PNG_TYPE }) : undefined;
  } catch {
    return undefined;
  } finally {
    URL.revokeObjectURL(url);
  }
}
