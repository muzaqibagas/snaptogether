import { getFilterById } from '../constants/filters';
import type { FilterId } from '../types/booth';

export type DrawableSource =
  | HTMLVideoElement
  | HTMLCanvasElement
  | HTMLImageElement
  | ImageBitmap;

export function getSourceDimensions(source: DrawableSource): { width: number; height: number } {
  if (source instanceof HTMLVideoElement) {
    return {
      width: source.videoWidth || 1280,
      height: source.videoHeight || 720,
    };
  }
  if (source instanceof HTMLImageElement) {
    return {
      width: source.naturalWidth || source.width || 1280,
      height: source.naturalHeight || source.height || 720,
    };
  }
  return {
    width: source.width || 1280,
    height: source.height || 720,
  };
}

/**
 * Draws a source image/video/canvas into target rectangle using cover-crop math (no stretching).
 */
export function drawCoverSource(
  ctx: CanvasRenderingContext2D,
  source: DrawableSource,
  destX: number,
  destY: number,
  destW: number,
  destH: number,
  mirror = false,
): void {
  const { width: srcW, height: srcH } = getSourceDimensions(source);
  if (srcW <= 0 || srcH <= 0 || destW <= 0 || destH <= 0) return;

  const srcAspect = srcW / srcH;
  const destAspect = destW / destH;

  let sx = 0;
  let sy = 0;
  let sw = srcW;
  let sh = srcH;

  if (srcAspect > destAspect) {
    // Source is wider than destination: crop horizontally
    sw = srcH * destAspect;
    sx = (srcW - sw) / 2;
  } else {
    // Source is taller than destination: crop vertically
    sh = srcW / destAspect;
    sy = (srcH - sh) / 2;
  }

  ctx.save();
  if (mirror) {
    ctx.translate(destX + destW, destY);
    ctx.scale(-1, 1);
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, destW, destH);
  } else {
    ctx.drawImage(source, sx, sy, sw, sh, destX, destY, destW, destH);
  }
  ctx.restore();
}

/**
 * Draws the entire uncropped source image centered inside target rectangle (contain math).
 */
export function drawContainSource(
  ctx: CanvasRenderingContext2D,
  source: DrawableSource,
  destX: number,
  destY: number,
  destW: number,
  destH: number,
  mirror = false,
): void {
  const { width: srcW, height: srcH } = getSourceDimensions(source);
  if (srcW <= 0 || srcH <= 0 || destW <= 0 || destH <= 0) return;

  const scale = Math.min(destW / srcW, destH / srcH);
  const drawW = srcW * scale;
  const drawH = srcH * scale;
  const dx = destX + (destW - drawW) / 2;
  const dy = destY + (destH - drawH) / 2;

  ctx.save();
  if (mirror) {
    ctx.translate(dx + drawW, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(source, 0, 0, srcW, srcH, 0, 0, drawW, drawH);
  } else {
    ctx.drawImage(source, 0, 0, srcW, srcH, dx, dy, drawW, drawH);
  }
  ctx.restore();
}

/**
 * Renders a soft iOS-safe blurred ambient cover backdrop behind contain-fitted media.
 */
export function drawBlurredCoverBackdrop(
  ctx: CanvasRenderingContext2D,
  source: DrawableSource,
  destX: number,
  destY: number,
  destW: number,
  destH: number,
  mirror = false,
): void {
  if (destW <= 0 || destH <= 0) return;
  const tiny = document.createElement('canvas');
  tiny.width = 24;
  tiny.height = 24;
  const tCtx = tiny.getContext('2d');
  if (tCtx) {
    drawCoverSource(tCtx, source, 0, 0, 24, 24, mirror);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tiny, destX, destY, destW, destH);
    ctx.fillStyle = 'rgba(34, 18, 25, 0.28)';
    ctx.fillRect(destX, destY, destW, destH);
    ctx.restore();
  }
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/**
 * Applies cross-browser deterministic color grading (works cleanly on iOS Safari too,
 * without relying on CanvasRenderingContext2D.filter).
 */
export function applyFilterGradingToCanvas(
  canvas: HTMLCanvasElement,
  filterId: FilterId,
): void {
  if (filterId === 'normal') return;
  const filter = getFilterById(filterId);
  const g = filter.grading;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const { width, height } = canvas;
  if (width === 0 || height === 0) return;

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  const brightness = g.brightness;
  const contrast = g.contrast;
  const saturate = g.saturate;
  const sepia = g.sepia;
  const grayscale = g.grayscale;
  const fadeLift = g.fadeLift;
  const warmShift = g.warmShift;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let gr = data[i + 1];
    let b = data[i + 2];

    // Brightness
    r *= brightness;
    gr *= brightness;
    b *= brightness;

    // Contrast around midpoint 128
    r = (r - 128) * contrast + 128;
    gr = (gr - 128) * contrast + 128;
    b = (b - 128) * contrast + 128;

    // Saturation
    if (saturate !== 1) {
      const lum = 0.2126 * r + 0.7152 * gr + 0.0722 * b;
      r = lum + (r - lum) * saturate;
      gr = lum + (gr - lum) * saturate;
      b = lum + (b - lum) * saturate;
    }

    // Grayscale
    if (grayscale > 0) {
      const lum = 0.299 * r + 0.587 * gr + 0.114 * b;
      r = r * (1 - grayscale) + lum * grayscale;
      gr = gr * (1 - grayscale) + lum * grayscale;
      b = b * (1 - grayscale) + lum * grayscale;
    }

    // Sepia
    if (sepia > 0) {
      const sr = r * 0.393 + gr * 0.769 + b * 0.189;
      const sg = r * 0.349 + gr * 0.686 + b * 0.168;
      const sb = r * 0.272 + gr * 0.534 + b * 0.131;
      r = r * (1 - sepia) + sr * sepia;
      gr = gr * (1 - sepia) + sg * sepia;
      b = b * (1 - sepia) + sb * sepia;
    }

    // Warm / cool shift
    if (warmShift !== 0) {
      r += warmShift * 0.85;
      gr += warmShift * 0.2;
      b -= warmShift * 0.85;
    }

    // Film fade lift on shadows
    if (fadeLift > 0) {
      const liftRatio = fadeLift / 255;
      r = fadeLift + r * (1 - liftRatio * 0.45);
      gr = fadeLift + gr * (1 - liftRatio * 0.45);
      b = fadeLift + b * (1 - liftRatio * 0.45);
    }

    data[i] = clampByte(r);
    data[i + 1] = clampByte(gr);
    data[i + 2] = clampByte(b);
  }

  ctx.putImageData(imgData, 0, 0);

  // Subtle color tint overlay
  if (g.tintColor && g.tintAlpha && g.tintAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = g.tintAlpha;
    ctx.fillStyle = g.tintColor;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  // Soft radial bloom for Soft Glow / Golden Hour
  if (g.glowAlpha && g.glowAlpha > 0) {
    ctx.save();
    const grad = ctx.createRadialGradient(
      width * 0.5,
      height * 0.45,
      width * 0.08,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.7,
    );
    grad.addColorStop(0, `rgba(255, 245, 240, ${g.glowAlpha})`);
    grad.addColorStop(1, 'rgba(255, 245, 240, 0)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  // Subtle vignette for Noir / Sepia / Cyber / Fade
  if (g.vignetteAlpha && g.vignetteAlpha > 0) {
    ctx.save();
    const grad = ctx.createRadialGradient(
      width * 0.5,
      height * 0.5,
      Math.min(width, height) * 0.3,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.72,
    );
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(1, `rgba(0, 0, 0, ${g.vignetteAlpha})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}

/**
 * Captures a full-resolution still canvas from a video element with mirror applied.
 * Filter is kept raw or applied on demand so users can also preview/export raw or filtered cleanly.
 */
export function captureRawStillCanvas(
  video: HTMLVideoElement,
  mirror = false,
  targetWidth = 1080,
): HTMLCanvasElement {
  const vw = video.videoWidth || 1280;
  const vh = video.videoHeight || 720;
  const aspect = vw / vh;
  const width = Math.min(targetWidth, Math.max(640, vw));
  const height = Math.round(width / aspect);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    drawCoverSource(ctx, video, 0, 0, width, height, mirror);
  }
  return canvas;
}

/**
 * Creates a filtered copy of a raw canvas (non-destructive so filter can even be switched or raw poses preserved).
 */
export function createFilteredCanvas(
  sourceCanvas: HTMLCanvasElement,
  filterId: FilterId,
): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = sourceCanvas.width;
  out.height = sourceCanvas.height;
  const ctx = out.getContext('2d');
  if (ctx) {
    ctx.drawImage(sourceCanvas, 0, 0);
    applyFilterGradingToCanvas(out, filterId);
  }
  return out;
}

/**
 * Captures a lightweight compressed JPEG Blob for Live Photo motion sequences (memory-safe on mobile).
 */
export async function captureMotionFrameBlob(
  video: HTMLVideoElement,
  mirror = false,
  maxWidth = 480,
  quality = 0.72,
): Promise<Blob | null> {
  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 480;
  if (vw === 0 || vh === 0) return null;

  const width = Math.min(maxWidth, vw);
  const height = Math.round((width * vh) / vw);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  drawCoverSource(ctx, video, 0, 0, width, height, mirror);

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
  });
}
