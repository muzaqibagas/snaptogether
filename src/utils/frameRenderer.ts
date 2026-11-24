import type { BoothMode, CameraFitMode, FilterId, FramePreset, FrameSlotRect } from '../types/booth';
import {
  applyFilterGradingToCanvas,
  drawBlurredCoverBackdrop,
  drawContainSource,
  drawCoverSource,
  type DrawableSource,
} from './canvasFilters';

export interface SlotRenderMedia {
  local: DrawableSource;
  partner?: DrawableSource;
}

const imageElementCache = new Map<string, Promise<HTMLImageElement>>();

export function loadCachedImage(src: string): Promise<HTMLImageElement> {
  const existing = imageElementCache.get(src);
  if (existing) return existing;

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => {
      imageElementCache.delete(src);
      reject(err);
    };
    img.src = src;
  });
  imageElementCache.set(src, promise);
  return promise;
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  points: number,
  outerR: number,
  innerR: number,
  fill: string,
  alpha = 1,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fill;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawRibbonBow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  color: string,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.fillStyle = color;

  // Left loop
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-26, -24, -40, 8, -2, 8);
  ctx.closePath();
  ctx.fill();

  // Right loop
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(26, -24, 40, 8, 2, 8);
  ctx.closePath();
  ctx.fill();

  // Ribbon tails
  ctx.beginPath();
  ctx.moveTo(-3, 5);
  ctx.lineTo(-18, 28);
  ctx.lineTo(-7, 25);
  ctx.lineTo(0, 8);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(3, 5);
  ctx.lineTo(18, 28);
  ctx.lineTo(7, 25);
  ctx.lineTo(0, 8);
  ctx.closePath();
  ctx.fill();

  // Center knot
  ctx.beginPath();
  ctx.arc(0, 3, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFrameBackground(ctx: CanvasRenderingContext2D, frame: FramePreset): void {
  const { canvasWidth: w, canvasHeight: h, themeStyle } = frame;

  if (themeStyle === 'ocean-breeze') {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#f0f9ff');
    grad.addColorStop(0.5, '#e0f2fe');
    grad.addColorStop(1, '#bae6fd');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Soft wave shapes at top and bottom
    ctx.fillStyle = 'rgba(14, 165, 233, 0.14)';
    ctx.beginPath();
    ctx.moveTo(0, h - 220);
    ctx.bezierCurveTo(w * 0.3, h - 290, w * 0.65, h - 140, w, h - 230);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(2, 132, 199, 0.16)';
    ctx.beginPath();
    ctx.moveTo(0, h - 130);
    ctx.bezierCurveTo(w * 0.35, h - 80, w * 0.7, h - 200, w, h - 115);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
    return;
  }

  if (themeStyle === 'coquette-ribbon') {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#fff5f7');
    grad.addColorStop(0.5, '#ffe4ee');
    grad.addColorStop(1, '#fbcfe8');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Scalloped lace border inside
    ctx.save();
    ctx.strokeStyle = 'rgba(236, 72, 153, 0.28)';
    ctx.lineWidth = 4;
    ctx.setLineDash([12, 10]);
    drawRoundedRectPath(ctx, 26, 26, w - 52, h - 52, 34);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (themeStyle === 'cinema-35mm') {
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, w, h);

    // Subtle film edge lines
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(86, 42, w - 172, h - 84);

    // Perforated 35mm sprocket holes on left & right edges
    ctx.fillStyle = '#030712';
    const holeW = 36;
    const holeH = 54;
    const step = 96;
    for (let y = 44; y < h - 60; y += step) {
      drawRoundedRectPath(ctx, 25, y, holeW, holeH, 8);
      ctx.fill();
      drawRoundedRectPath(ctx, w - 25 - holeW, y, holeW, holeH, 8);
      ctx.fill();
    }
    return;
  }

  if (themeStyle === 'y2k-cyber-grid') {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#090d1f');
    grad.addColorStop(0.5, '#1e1b4b');
    grad.addColorStop(1, '#3b0764');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Cyber perspective grid lines
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
    ctx.lineWidth = 2;
    for (let x = 0; x <= w; x += 75) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += 75) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  if (themeStyle === 'warm-scrapbook') {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#f7eedc');
    grad.addColorStop(1, '#ead7b7');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Subtle craft dots texture
    ctx.fillStyle = 'rgba(146, 64, 14, 0.08)';
    for (let y = 40; y < h; y += 56) {
      for (let x = 36; x < w; x += 56) {
        ctx.beginPath();
        ctx.arc(x + ((y / 56) % 2) * 20, y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return;
  }

  if (themeStyle === 'midnight-starlight') {
    const grad = ctx.createRadialGradient(w * 0.5, h * 0.25, 100, w * 0.5, h * 0.5, h * 0.85);
    grad.addColorStop(0, '#1e293b');
    grad.addColorStop(0.55, '#0f172a');
    grad.addColorStop(1, '#070b19');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Delicate constellation lines
    ctx.save();
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(110, 95);
    ctx.lineTo(240, 62);
    ctx.lineTo(340, 118);
    ctx.moveTo(w - 110, h - 150);
    ctx.lineTo(w - 260, h - 90);
    ctx.lineTo(w - 390, h - 170);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Custom fallback background
  ctx.fillStyle = frame.backgroundColor || '#ffffff';
  ctx.fillRect(0, 0, w, h);
}

function drawFrameForegroundOrnaments(ctx: CanvasRenderingContext2D, frame: FramePreset): void {
  const { canvasWidth: w, canvasHeight: h, themeStyle, slots } = frame;

  if (themeStyle === 'ocean-breeze') {
    // Slot borders
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 10;
    for (const s of slots) {
      drawRoundedRectPath(ctx, s.x, s.y, s.width, s.height, s.radius);
      ctx.stroke();
    }

    // Header badge
    ctx.fillStyle = '#0369a1';
    ctx.font = '700 34px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('☀ SUMMER COASTAL MEMORIES', w / 2, 108);

    // Decorative bubbles & starfish
    drawStar(ctx, 130, h - 220, 5, 28, 13, '#fb923c', 0.88);
    drawStar(ctx, w - 135, 102, 5, 22, 10, '#38bdf8', 0.85);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.arc(w - 140, h - 160, 14, 0, Math.PI * 2);
    ctx.arc(w - 105, h - 195, 9, 0, Math.PI * 2);
    ctx.fill();

    // Footer caption
    ctx.fillStyle = frame.textColor;
    ctx.font = '800 40px "Space Grotesk", sans-serif';
    ctx.fillText(frame.caption, w / 2, h - 155);
    ctx.font = '600 24px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#0284c7';
    ctx.fillText(new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }), w / 2, h - 102);
    return;
  }

  if (themeStyle === 'coquette-ribbon') {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 12;
    for (const s of slots) {
      drawRoundedRectPath(ctx, s.x, s.y, s.width, s.height, s.radius);
      ctx.stroke();
    }

    // Bows on top and corners
    drawRibbonBow(ctx, w / 2, 92, 1.35, '#ec4899');
    drawRibbonBow(ctx, 120, h - 210, 1.0, '#f472b6');
    drawRibbonBow(ctx, w - 120, h - 210, 1.0, '#f472b6');

    drawStar(ctx, 140, 105, 4, 18, 6, '#f472b6', 0.8);
    drawStar(ctx, w - 140, 105, 4, 18, 6, '#f472b6', 0.8);

    ctx.textAlign = 'center';
    ctx.fillStyle = frame.textColor;
    ctx.font = 'italic 700 42px Georgia, serif';
    ctx.fillText(frame.caption, w / 2, h - 185);
    ctx.font = '600 24px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#be185d';
    ctx.fillText('SNAPTOGETHER • PRETTY BOOTH', w / 2, h - 120);
    return;
  }

  if (themeStyle === 'cinema-35mm') {
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 4;
    for (let idx = 0; idx < slots.length; idx++) {
      const s = slots[idx];
      drawRoundedRectPath(ctx, s.x, s.y, s.width, s.height, s.radius);
      ctx.stroke();

      // Film frame numbers
      ctx.fillStyle = '#f59e0b';
      ctx.font = '700 24px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`0${idx + 1}A`, s.x + 8, s.y - 16);
      ctx.textAlign = 'right';
      ctx.fillText('▶ ISO 400', s.x + s.width - 8, s.y - 16);
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#fbbf24';
    ctx.font = '700 32px "JetBrains Mono", monospace';
    ctx.fillText('35MM CINEMA EDITION', w / 2, 112);

    ctx.fillStyle = frame.textColor;
    ctx.font = '700 36px "JetBrains Mono", monospace';
    ctx.fillText(frame.caption, w / 2, h - 175);
    ctx.font = '500 22px "JetBrains Mono", monospace';
    ctx.fillStyle = '#9ca3af';
    ctx.fillText(`FRAME RATE 24FPS • ${new Date().getFullYear()}`, w / 2, h - 118);
    return;
  }

  if (themeStyle === 'y2k-cyber-grid') {
    // Neon chrome slot borders
    for (const s of slots) {
      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 8;
      ctx.shadowColor = '#ec4899';
      ctx.shadowBlur = 16;
      drawRoundedRectPath(ctx, s.x, s.y, s.width, s.height, s.radius);
      ctx.stroke();
      ctx.restore();
    }

    // Header Y2K pill
    ctx.save();
    ctx.fillStyle = 'rgba(236, 72, 153, 0.25)';
    ctx.strokeStyle = '#f472b6';
    ctx.lineWidth = 3;
    drawRoundedRectPath(ctx, w / 2 - 280, 56, 560, 74, 37);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 34px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('✦ CYBER CAM 2000 // REC ✦', w / 2, 105);
    ctx.restore();

    drawStar(ctx, 130, 92, 4, 24, 7, '#38bdf8', 0.95);
    drawStar(ctx, w - 130, 92, 4, 24, 7, '#f472b6', 0.95);
    drawStar(ctx, 160, h - 165, 4, 28, 8, '#38bdf8', 0.9);
    drawStar(ctx, w - 160, h - 165, 4, 28, 8, '#f472b6', 0.9);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#f8fafc';
    ctx.font = '800 46px "Space Grotesk", sans-serif';
    ctx.fillText(frame.caption, w / 2, h - 190);
    ctx.fillStyle = '#38bdf8';
    ctx.font = '600 26px "JetBrains Mono", monospace';
    ctx.fillText('SYSTEM://SNAPTOGETHER_ONLINE', w / 2, h - 125);
    return;
  }

  if (themeStyle === 'warm-scrapbook') {
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      // Polaroid white trim
      ctx.strokeStyle = '#fffdf8';
      ctx.lineWidth = 14;
      drawRoundedRectPath(ctx, s.x, s.y, s.width, s.height, s.radius);
      ctx.stroke();

      // Washi masking tape strip at top corners of each slot
      ctx.save();
      const tapeX = i % 2 === 0 ? s.x + 56 : s.x + s.width - 56;
      ctx.translate(tapeX, s.y - 4);
      ctx.rotate(i % 2 === 0 ? -0.18 : 0.18);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(245, 158, 11, 0.55)' : 'rgba(236, 72, 153, 0.42)';
      ctx.fillRect(-68, -18, 136, 36);
      ctx.restore();
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#92400e';
    ctx.font = '700 34px "Space Grotesk", sans-serif';
    ctx.fillText('✂ COLLECTED MOMENTS ✎', w / 2, 108);

    drawStar(ctx, 130, h - 195, 5, 22, 10, '#d97706', 0.85);
    drawStar(ctx, w - 130, h - 195, 5, 22, 10, '#d97706', 0.85);

    ctx.fillStyle = frame.textColor;
    ctx.font = '800 40px "Space Grotesk", sans-serif';
    ctx.fillText(frame.caption, w / 2, h - 170);
    ctx.fillStyle = '#92400e';
    ctx.font = '600 24px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('HANDCRAFTED MEMORY STRIP', w / 2, h - 115);
    return;
  }

  if (themeStyle === 'midnight-starlight') {
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.72)';
    ctx.lineWidth = 5;
    for (const s of slots) {
      drawRoundedRectPath(ctx, s.x, s.y, s.width, s.height, s.radius);
      ctx.stroke();
    }

    // Crescent moon in top left
    ctx.save();
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(135, 95, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#141e33';
    ctx.beginPath();
    ctx.arc(150, 88, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    drawStar(ctx, 240, 62, 4, 14, 5, '#fef08a', 0.95);
    drawStar(ctx, 340, 118, 4, 10, 4, '#fef08a', 0.8);
    drawStar(ctx, w - 140, 92, 4, 22, 7, '#fbbf24', 0.95);
    drawStar(ctx, w - 260, h - 90, 4, 16, 5, '#fef08a', 0.9);
    drawStar(ctx, 180, h - 165, 4, 20, 6, '#fbbf24', 0.9);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#fef08a';
    ctx.font = '700 34px "Space Grotesk", sans-serif';
    ctx.fillText('✦ STARLIGHT EDITION ✦', w / 2, 106);

    ctx.fillStyle = frame.textColor;
    ctx.font = '800 46px "Space Grotesk", sans-serif';
    ctx.fillText(frame.caption, w / 2, h - 185);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 24px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('SNAPTOGETHER • NIGHT SKY SERIES', w / 2, h - 122);
  }
}

function drawSlotMedia(
  ctx: CanvasRenderingContext2D,
  slot: FrameSlotRect,
  media: SlotRenderMedia | undefined,
  poseIndex: number,
  mode: BoothMode,
  filterId: FilterId,
  accentColor: string,
  textColor: string,
  applyFilterToSource: boolean,
  fitMode: CameraFitMode = 'cover',
): void {
  ctx.save();
  drawRoundedRectPath(ctx, slot.x, slot.y, slot.width, slot.height, slot.radius);
  ctx.clip();

  if (!media) {
    // Stylish empty placeholder slot
    ctx.fillStyle = 'rgba(148, 163, 184, 0.16)';
    ctx.fillRect(slot.x, slot.y, slot.width, slot.height);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 4;
    ctx.setLineDash([14, 10]);
    ctx.strokeRect(slot.x + 12, slot.y + 12, slot.width - 24, slot.height - 24);
    ctx.setLineDash([]);

    ctx.fillStyle = textColor;
    ctx.globalAlpha = 0.65;
    ctx.font = '700 42px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      mode === 'ldr' ? `POSE ${poseIndex + 1} • DUO` : `POSE ${poseIndex + 1}`,
      slot.x + slot.width / 2,
      slot.y + slot.height / 2 - 14,
    );
    ctx.font = '500 24px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = accentColor;
    ctx.fillText(
      mode === 'ldr' ? 'KAMERA LOKAL | PASANGAN' : 'MENUNGGU JEPRETAN',
      slot.x + slot.width / 2,
      slot.y + slot.height / 2 + 34,
    );
    ctx.restore();
    return;
  }

  // Render into temporary slot canvas if filter grading is needed cleanly on the slot
  const drawSourceInto = (
    targetCtx: CanvasRenderingContext2D,
    src: DrawableSource,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ) => {
    if (fitMode === 'contain') {
      drawBlurredCoverBackdrop(targetCtx, src, dx, dy, dw, dh, false);
      drawContainSource(targetCtx, src, dx, dy, dw, dh, false);
    } else {
      drawCoverSource(targetCtx, src, dx, dy, dw, dh, false);
    }
  };

  const renderSlotInto = (targetCtx: CanvasRenderingContext2D, ox: number, oy: number) => {
    if (mode === 'ldr' && media.partner) {
      const halfW = Math.floor(slot.width / 2);
      drawSourceInto(targetCtx, media.local, ox, oy, halfW, slot.height);
      drawSourceInto(targetCtx, media.partner, ox + halfW, oy, slot.width - halfW, slot.height);
      // Crisp hairline center split
      targetCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      targetCtx.fillRect(ox + halfW - 1.5, oy, 3, slot.height);
    } else {
      drawSourceInto(targetCtx, media.local, ox, oy, slot.width, slot.height);
    }
  };

  if (applyFilterToSource && filterId !== 'normal') {
    const temp = document.createElement('canvas');
    temp.width = Math.max(1, Math.round(slot.width));
    temp.height = Math.max(1, Math.round(slot.height));
    const tCtx = temp.getContext('2d');
    if (tCtx) {
      renderSlotInto(tCtx, 0, 0);
      applyFilterGradingToCanvas(temp, filterId);
      ctx.drawImage(temp, slot.x, slot.y, slot.width, slot.height);
    }
  } else {
    renderSlotInto(ctx, slot.x, slot.y);
  }

  ctx.restore();
}

export interface RenderFrameOptions {
  frame: FramePreset;
  slotsMedia: Array<SlotRenderMedia | undefined>;
  mode: BoothMode;
  filterId: FilterId;
  /** Downscale factor for fast previews (e.g. 0.45) or 1 for full HD PNG export */
  scale?: number;
  applyFilterToSource?: boolean;
  fitMode?: CameraFitMode;
}

/**
 * Composites the selected frame (preset vector ornaments OR custom PNG overlay) with captured slot media.
 */
export async function renderFrameComposite(
  targetCanvas: HTMLCanvasElement,
  options: RenderFrameOptions,
): Promise<void> {
  const {
    frame,
    slotsMedia,
    mode,
    filterId,
    scale = 1,
    applyFilterToSource = true,
    fitMode = 'cover',
  } = options;

  const outW = Math.max(1, Math.round(frame.canvasWidth * scale));
  const outH = Math.max(1, Math.round(frame.canvasHeight * scale));

  if (targetCanvas.width !== outW || targetCanvas.height !== outH) {
    targetCanvas.width = outW;
    targetCanvas.height = outH;
  }

  const ctx = targetCanvas.getContext('2d');
  if (!ctx) return;

  ctx.save();
  ctx.clearRect(0, 0, outW, outH);
  ctx.scale(scale, scale);

  if (frame.isCustom && frame.customImageSrc) {
    // For custom PNG frames, draw white base + photos underneath, then overlay the transparent PNG on top
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, frame.canvasWidth, frame.canvasHeight);

    for (let i = 0; i < frame.slots.length; i++) {
      drawSlotMedia(
        ctx,
        frame.slots[i],
        slotsMedia[i],
        i,
        mode,
        filterId,
        frame.accentColor,
        frame.textColor,
        applyFilterToSource,
        fitMode,
      );
    }

    try {
      const overlayImg = await loadCachedImage(frame.customImageSrc);
      ctx.drawImage(overlayImg, 0, 0, frame.canvasWidth, frame.canvasHeight);
    } catch {
      // If custom frame image failed to load, leave slots cleanly drawn
    }
  } else {
    drawFrameBackground(ctx, frame);

    for (let i = 0; i < frame.slots.length; i++) {
      drawSlotMedia(
        ctx,
        frame.slots[i],
        slotsMedia[i],
        i,
        mode,
        filterId,
        frame.accentColor,
        frame.textColor,
        applyFilterToSource,
        fitMode,
      );
    }

    drawFrameForegroundOrnaments(ctx, frame);
  }

  ctx.restore();
}
