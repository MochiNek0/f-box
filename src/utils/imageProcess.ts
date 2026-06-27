/**
 * OCR Image Preprocessing Utility
 * Performs: Crop, Scale, Grayscale, Invert, Binarize
 */

/**
 * An OCR crop region.
 *
 * COORDINATE CONVENTION (shared, load-bearing): x/y/w/h are in **CSS pixels**
 * of the captured window — i.e. the screenshot's natural-pixel size divided by
 * `window.devicePixelRatio`. This convention is produced by
 * `OCRSelectionOverlay` (which maps mouse coords to natural pixels via
 * `toImageCoords`, then divides by dpr before persisting) and consumed here in
 * `preprocessImage` (which multiplies by dpr to crop the natural-pixel image).
 * Both sides MUST agree. It matches the legacy on-disk format, so breakpoint
 * regions saved by older versions keep working on HiDPI displays.
 */
export interface OCRRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Preprocess image for better OCR results
 * @param dataUrl Original screenshot data URL
 * @param region Region to process
 * @param options Processing options
 */
export async function preprocessImage(
  dataUrl: string,
  region: OCRRegion,
  options = {
    scale: 2,
    threshold: 128,
    invert: true,
    grayscale: true,
  },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      // `region` is in CSS pixels (see OCRRegion). The screenshot `img` is at
      // natural-pixel resolution, so scale the region up by devicePixelRatio to
      // index into it. This mirrors the overlay's natural→CSS conversion and
      // keeps legacy (pre-natural-pixel) breakpoint regions correct on HiDPI.
      const dpr = window.devicePixelRatio || 1;
      const sw = region.w * dpr;
      const sh = region.h * dpr;
      const dw = sw * options.scale;
      const dh = sh * options.scale;

      const canvas = document.createElement("canvas");
      canvas.width = dw;
      canvas.height = dh;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      // 1. Draw cropped and scaled image
      ctx.imageSmoothingEnabled = false; // Keep it sharp
      ctx.drawImage(img, region.x * dpr, region.y * dpr, sw, sh, 0, 0, dw, dh);

      // 2. Filter processing
      const imageData = ctx.getImageData(0, 0, dw, dh);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        let r = data[i];
        let g = data[i + 1];
        let b = data[i + 2];

        // Grayscale (Luminance)
        if (options.grayscale) {
          const gray = 0.299 * r + 0.587 * g + 0.114 * b;
          r = g = b = gray;
        }

        // Invert
        if (options.invert) {
          r = 255 - r;
          g = 255 - g;
          b = 255 - b;
        }

        // Binarization (Threshold)
        if (options.threshold > 0) {
          const v = (r + g + b) / 3 >= options.threshold ? 255 : 0;
          r = g = b = v;
        }

        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        // alpha remains same
      }

      ctx.putImageData(imageData, 0, 0);
      const result = canvas.toDataURL("image/png");
      // Release canvas GPU memory immediately
      canvas.width = 0;
      canvas.height = 0;
      resolve(result);
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}
