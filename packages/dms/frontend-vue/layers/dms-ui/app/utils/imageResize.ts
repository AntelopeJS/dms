export interface ImageResizeBounds {
  maxWidth: number;
  maxHeight: number;
  fit?: "cover" | "contain";
}

interface ImageRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

function computeCropRegion(
  width: number,
  height: number,
  bounds: ImageResizeBounds,
): ImageRegion {
  if (bounds.fit !== "cover") {
    return { x: 0, y: 0, width, height };
  }

  const targetAspect = bounds.maxWidth / bounds.maxHeight;
  const cropWidth = Math.min(width, height * targetAspect);
  const cropHeight = Math.min(height, width / targetAspect);

  return {
    x: (width - cropWidth) / 2,
    y: (height - cropHeight) / 2,
    width: cropWidth,
    height: cropHeight,
  };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type));
}

/**
 * Downscales an image file to fit within `bounds` before upload. With
 * `fit: "cover"` the image is first center-cropped to the target aspect
 * ratio (e.g. a square for avatar bounds). Images already within bounds are
 * returned untouched; the source is never upscaled.
 */
export async function resizeImageToBounds(
  file: File,
  bounds: ImageResizeBounds,
): Promise<File> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });

  try {
    const crop = computeCropRegion(bitmap.width, bitmap.height, bounds);
    const scale = Math.min(
      1,
      bounds.maxWidth / crop.width,
      bounds.maxHeight / crop.height,
    );
    const targetWidth = Math.max(1, Math.round(crop.width * scale));
    const targetHeight = Math.max(1, Math.round(crop.height * scale));

    if (targetWidth === bitmap.width && targetHeight === bitmap.height) {
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      return file;
    }

    context.drawImage(
      bitmap,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      targetWidth,
      targetHeight,
    );

    const blob = await canvasToBlob(canvas, file.type);
    if (!blob) {
      return file;
    }

    return new File([blob], file.name, { type: blob.type });
  } finally {
    bitmap.close();
  }
}
