/**
 * OCR Image Preprocessing Utility
 * Performs: Crop, Scale, Grayscale, Invert, Binarize
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
      const dpr = window.devicePixelRatio || 1;

      // Calculate scaled dimensions
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
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}
