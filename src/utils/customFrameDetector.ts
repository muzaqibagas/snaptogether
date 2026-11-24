import { LAYOUT_DIMENSIONS } from '../constants/frames';
import type { FrameLayoutType, FrameSlotRect } from '../types/booth';

export interface CustomFrameLoadResult {
  dataUrl: string;
  width: number;
  height: number;
  detectedSlots: FrameSlotRect[];
  usedAutoDetection: boolean;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Gagal membaca file gambar bingkai.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Format gambar bingkai tidak valid atau rusak.'));
    img.src = src;
  });
}

/**
 * Attempts to detect transparent cutout regions in an uploaded PNG/WebP frame.
 * Falls back gracefully to scaled standard layout coordinates when cutouts aren't distinct.
 */
export function detectTransparentSlotRects(
  img: HTMLImageElement,
  layout: FrameLayoutType,
): { slots: FrameSlotRect[]; autoDetected: boolean } {
  const base = LAYOUT_DIMENSIONS[layout];
  const imgW = img.naturalWidth || base.width;
  const imgH = img.naturalHeight || base.height;

  // Scaled standard fallback slots matching the uploaded image's size
  const scaleX = imgW / base.width;
  const scaleY = imgH / base.height;
  const fallbackSlots: FrameSlotRect[] = base.slots.map((s) => ({
    x: Math.round(s.x * scaleX),
    y: Math.round(s.y * scaleY),
    width: Math.round(s.width * scaleX),
    height: Math.round(s.height * scaleY),
    radius: Math.round(s.radius * Math.min(scaleX, scaleY)),
  }));

  try {
    const maxScan = 260;
    const ratio = Math.min(maxScan / imgW, maxScan / imgH, 1);
    const sw = Math.max(16, Math.round(imgW * ratio));
    const sh = Math.max(16, Math.round(imgH * ratio));

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { slots: fallbackSlots, autoDetected: false };

    ctx.drawImage(img, 0, 0, sw, sh);
    const data = ctx.getImageData(0, 0, sw, sh).data;

    const transparent = new Uint8Array(sw * sh);
    for (let i = 0; i < sw * sh; i++) {
      // Consider pixels with alpha < 40 as cutout transparent windows
      if (data[i * 4 + 3] < 40) {
        transparent[i] = 1;
      }
    }

    const visited = new Uint8Array(sw * sh);
    const boxes: Array<{ minX: number; minY: number; maxX: number; maxY: number; area: number; touchesEdge: boolean }> = [];
    const queue = new Int32Array(sw * sh);

    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const startIdx = y * sw + x;
        if (transparent[startIdx] === 0 || visited[startIdx] === 1) continue;

        let head = 0;
        let tail = 0;
        queue[tail++] = startIdx;
        visited[startIdx] = 1;

        let minX = x;
        let maxX = x;
        let minY = y;
        let maxY = y;
        let area = 0;
        let touchesEdge = false;

        while (head < tail) {
          const idx = queue[head++];
          const cx = idx % sw;
          const cy = Math.floor(idx / sw);
          area++;

          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;
          if (cx === 0 || cy === 0 || cx === sw - 1 || cy === sh - 1) {
            touchesEdge = true;
          }

          const neighbors = [
            cx > 0 ? idx - 1 : -1,
            cx < sw - 1 ? idx + 1 : -1,
            cy > 0 ? idx - sw : -1,
            cy < sh - 1 ? idx + sw : -1,
          ];

          for (const n of neighbors) {
            if (n >= 0 && transparent[n] === 1 && visited[n] === 0) {
              visited[n] = 1;
              queue[tail++] = n;
            }
          }
        }

        const boxW = maxX - minX + 1;
        const boxH = maxY - minY + 1;
        const minArea = sw * sh * 0.04;
        if (!touchesEdge && area >= minArea && boxW > sw * 0.15 && boxH > sh * 0.1) {
          boxes.push({ minX, minY, maxX, maxY, area, touchesEdge });
        }
      }
    }

    if (boxes.length >= base.poseCount) {
      // Keep the largest N transparent regions and sort top-to-bottom, left-to-right
      const topBoxes = boxes
        .sort((a, b) => b.area - a.area)
        .slice(0, base.poseCount)
        .sort((a, b) => {
          const rowDiff = a.minY - b.minY;
          if (Math.abs(rowDiff) > sh * 0.08) return rowDiff;
          return a.minX - b.minX;
        });

      const slots: FrameSlotRect[] = topBoxes.map((b) => ({
        x: Math.max(0, Math.round((b.minX / sw) * imgW) - 4),
        y: Math.max(0, Math.round((b.minY / sh) * imgH) - 4),
        width: Math.min(imgW, Math.round(((b.maxX - b.minX + 1) / sw) * imgW) + 8),
        height: Math.min(imgH, Math.round(((b.maxY - b.minY + 1) / sh) * imgH) + 8),
        radius: 12,
      }));

      return { slots, autoDetected: true };
    }
  } catch {
    // Fallback cleanly if canvas tainted or unsupported
  }

  return { slots: fallbackSlots, autoDetected: false };
}

export async function processCustomFrameUpload(
  file: File,
  layout: FrameLayoutType,
): Promise<CustomFrameLoadResult> {
  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(dataUrl);
  const { slots, autoDetected } = detectTransparentSlotRects(img, layout);

  return {
    dataUrl,
    width: img.naturalWidth,
    height: img.naturalHeight,
    detectedSlots: slots,
    usedAutoDetection: autoDetected,
  };
}
