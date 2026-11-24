import type { BoothMode, CameraFitMode, CapturedPose, FilterId, FramePreset } from '../types/booth';
import {
  applyFilterGradingToCanvas,
  drawBlurredCoverBackdrop,
  drawContainSource,
  drawCoverSource,
  type DrawableSource,
} from './canvasFilters';
import { renderFrameComposite, type SlotRenderMedia } from './frameRenderer';

export interface DecodedPoseMotion {
  poseIndex: number;
  frames: Array<{ local: DrawableSource; partner?: DrawableSource }>;
}

export interface PreparedLivePhotoData {
  poses: DecodedPoseMotion[];
  frameCount: number;
  dispose: () => void;
}

async function sourceToFilteredBitmap(
  src: Blob | HTMLCanvasElement,
  filterId: FilterId,
  maxWidth = 420,
): Promise<ImageBitmap | HTMLCanvasElement> {
  const temp = document.createElement('canvas');
  let rawBitmap: ImageBitmap | null = null;

  if (src instanceof Blob) {
    rawBitmap = await createImageBitmap(src);
    const scale = Math.min(1, maxWidth / (rawBitmap.width || maxWidth));
    temp.width = Math.max(1, Math.round(rawBitmap.width * scale));
    temp.height = Math.max(1, Math.round(rawBitmap.height * scale));
    const ctx = temp.getContext('2d');
    if (ctx) {
      ctx.drawImage(rawBitmap, 0, 0, temp.width, temp.height);
    }
    rawBitmap.close();
  } else {
    const scale = Math.min(1, maxWidth / (src.width || maxWidth));
    temp.width = Math.max(1, Math.round(src.width * scale));
    temp.height = Math.max(1, Math.round(src.height * scale));
    const ctx = temp.getContext('2d');
    if (ctx) {
      ctx.drawImage(src, 0, 0, temp.width, temp.height);
    }
  }

  if (filterId !== 'normal') {
    applyFilterGradingToCanvas(temp, filterId);
  }

  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(temp);
    } catch {
      return temp;
    }
  }
  return temp;
}

/**
 * Pre-decodes and color-grades all motion frames once so Live Photo preview
 * and video export run smoothly across Chrome, Firefox, and Safari iOS.
 */
export async function prepareLivePhotoFrames(
  capturedPoses: CapturedPose[],
  filterId: FilterId,
): Promise<PreparedLivePhotoData> {
  const createdBitmaps: ImageBitmap[] = [];
  const poses: DecodedPoseMotion[] = [];

  for (const pose of capturedPoses) {
    const frames: Array<{ local: DrawableSource; partner?: DrawableSource }> = [];
    const sourceFrames = pose.motionFrames.length > 0
      ? pose.motionFrames
      : [{ local: pose.stillLocal, partner: pose.stillPartner }];

    for (const mf of sourceFrames) {
      const localBmp = await sourceToFilteredBitmap(mf.local, filterId);
      if ('close' in localBmp && typeof localBmp.close === 'function') {
        createdBitmaps.push(localBmp);
      }
      let partnerBmp: ImageBitmap | HTMLCanvasElement | undefined;
      if (mf.partner) {
        partnerBmp = await sourceToFilteredBitmap(mf.partner, filterId);
        if ('close' in partnerBmp && typeof partnerBmp.close === 'function') {
          createdBitmaps.push(partnerBmp);
        }
      }
      frames.push({ local: localBmp, partner: partnerBmp });
    }

    // Append the sharp final still at the end so the clip pauses nicely on the pose snap
    const stillLocalBmp = await sourceToFilteredBitmap(pose.stillLocal, filterId);
    if ('close' in stillLocalBmp && typeof stillLocalBmp.close === 'function') {
      createdBitmaps.push(stillLocalBmp);
    }
    let stillPartnerBmp: ImageBitmap | HTMLCanvasElement | undefined;
    if (pose.stillPartner) {
      stillPartnerBmp = await sourceToFilteredBitmap(pose.stillPartner, filterId);
      if ('close' in stillPartnerBmp && typeof stillPartnerBmp.close === 'function') {
        createdBitmaps.push(stillPartnerBmp);
      }
    }
    for (let k = 0; k < 5; k++) {
      frames.push({ local: stillLocalBmp, partner: stillPartnerBmp });
    }

    poses.push({ poseIndex: pose.poseIndex, frames });
  }

  const maxLen = Math.max(1, ...poses.map((p) => p.frames.length));

  return {
    poses,
    frameCount: maxLen,
    dispose: () => {
      for (const bmp of createdBitmaps) {
        try {
          bmp.close();
        } catch {
          // ignore already closed
        }
      }
    },
  };
}

export function getBestSupportedVideoMimeType(): { mimeType: string; extension: 'mp4' | 'webm' } {
  if (typeof MediaRecorder === 'undefined') {
    return { mimeType: 'video/webm', extension: 'webm' };
  }

  const candidates: Array<{ mimeType: string; extension: 'mp4' | 'webm' }> = [
    { mimeType: 'video/mp4;codecs=avc1.42E01E', extension: 'mp4' },
    { mimeType: 'video/mp4;codecs=h264', extension: 'mp4' },
    { mimeType: 'video/mp4', extension: 'mp4' },
    { mimeType: 'video/webm;codecs=vp9', extension: 'webm' },
    { mimeType: 'video/webm;codecs=vp8', extension: 'webm' },
    { mimeType: 'video/webm', extension: 'webm' },
  ];

  for (const item of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(item.mimeType)) {
        return item;
      }
    } catch {
      // continue checking
    }
  }

  return { mimeType: 'video/webm', extension: 'webm' };
}

export function buildSlotMediaForTick(
  prepared: PreparedLivePhotoData,
  tick: number,
): Array<SlotRenderMedia | undefined> {
  return prepared.poses.map((pose) => {
    if (pose.frames.length === 0) return undefined;
    const idx = tick % pose.frames.length;
    return pose.frames[idx];
  });
}

async function recordCanvasLoop(
  canvas: HTMLCanvasElement,
  renderTick: (tick: number) => Promise<void>,
  totalTicks: number,
  fps: number,
): Promise<{ blob: Blob | null; mimeType: string; extension: 'mp4' | 'webm' }> {
  const { mimeType, extension } = getBestSupportedVideoMimeType();

  if (typeof MediaRecorder === 'undefined' || typeof canvas.captureStream !== 'function') {
    return { blob: null, mimeType, extension };
  }

  // Render initial frame before starting captureStream
  await renderTick(0);

  const stream = canvas.captureStream(fps);
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 3_500_000,
    });
  } catch {
    recorder = new MediaRecorder(stream);
  }

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  recorder.start(150);

  const intervalMs = Math.round(1000 / fps);
  for (let tick = 0; tick < totalTicks; tick++) {
    const start = performance.now();
    await renderTick(tick);
    const elapsed = performance.now() - start;
    const wait = Math.max(8, intervalMs - elapsed);
    await new Promise((r) => setTimeout(r, wait));
  }

  if (recorder.state !== 'inactive') {
    recorder.stop();
  }
  await stopped;
  stream.getTracks().forEach((t) => t.stop());

  const finalType = chunks[0]?.type || mimeType;
  const blob = chunks.length > 0 ? new Blob(chunks, { type: finalType }) : null;
  const finalExt: 'mp4' | 'webm' = finalType.includes('mp4') ? 'mp4' : extension;

  return { blob, mimeType: finalType, extension: finalExt };
}

/**
 * Exports Asset 1: Framed Live Photo Video matching the chosen strip/grid dimensions.
 */
export async function exportFramedLivePhotoVideo(options: {
  prepared: PreparedLivePhotoData;
  frame: FramePreset;
  mode: BoothMode;
  filterId: FilterId;
  fitMode?: CameraFitMode;
}): Promise<{ blob: Blob | null; mimeType: string; extension: 'mp4' | 'webm' }> {
  const { prepared, frame, mode, filterId, fitMode = 'cover' } = options;

  // Target max height 1200px so MediaRecorder encodes fast & smoothly across devices
  const scale = Math.min(1, 1200 / frame.canvasHeight);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round((frame.canvasWidth * scale) / 2) * 2);
  canvas.height = Math.max(2, Math.round((frame.canvasHeight * scale) / 2) * 2);

  const fps = 12;
  // Loop 2 cycles so the video plays ~4-5 seconds cleanly
  const totalTicks = Math.max(24, prepared.frameCount * 2);

  return recordCanvasLoop(
    canvas,
    async (tick) => {
      const slotMedia = buildSlotMediaForTick(prepared, tick);
      await renderFrameComposite(canvas, {
        frame,
        slotsMedia: slotMedia,
        mode,
        filterId,
        scale,
        applyFilterToSource: false, // already pre-graded in prepared bitmaps
        fitMode,
      });
    },
    totalTicks,
    fps,
  );
}

/**
 * Exports Asset 2: Vertical 9:16 Live Photo Video with decorative backdrop ready for IG Story / TikTok.
 */
export async function exportStoryLivePhotoVideo(options: {
  prepared: PreparedLivePhotoData;
  frame: FramePreset;
  mode: BoothMode;
  filterId: FilterId;
  fitMode?: CameraFitMode;
}): Promise<{ blob: Blob | null; mimeType: string; extension: 'mp4' | 'webm' }> {
  const { prepared, frame, mode, filterId, fitMode = 'cover' } = options;

  const storyW = 720;
  const storyH = 1280;
  const storyCanvas = document.createElement('canvas');
  storyCanvas.width = storyW;
  storyCanvas.height = storyH;

  const frameBuffer = document.createElement('canvas');
  const frameScale = Math.min((storyW * 0.78) / frame.canvasWidth, (storyH * 0.8) / frame.canvasHeight);

  const fps = 12;
  const totalTicks = Math.max(24, prepared.frameCount * 2);

  return recordCanvasLoop(
    storyCanvas,
    async (tick) => {
      const slotMedia = buildSlotMediaForTick(prepared, tick);
      await renderFrameComposite(frameBuffer, {
        frame,
        slotsMedia: slotMedia,
        mode,
        filterId,
        scale: frameScale,
        applyFilterToSource: false,
        fitMode,
      });

      const ctx = storyCanvas.getContext('2d');
      if (!ctx) return;

      // Aesthetic gradient backdrop derived from frame colors
      const bg = ctx.createLinearGradient(0, 0, storyW, storyH);
      bg.addColorStop(0, frame.backgroundColor);
      bg.addColorStop(0.55, frame.secondaryColor);
      bg.addColorStop(1, frame.accentColor);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, storyW, storyH);

      // Subtle dark scrim so bright frames still pop
      ctx.fillStyle = 'rgba(15, 23, 42, 0.24)';
      ctx.fillRect(0, 0, storyW, storyH);

      // Soft ambient glow behind strip
      const glow = ctx.createRadialGradient(storyW / 2, storyH / 2, 40, storyW / 2, storyH / 2, 460);
      glow.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
      glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, storyW, storyH);

      // Draw centered framed strip with soft drop shadow
      const drawW = frameBuffer.width;
      const drawH = frameBuffer.height;
      const dx = Math.round((storyW - drawW) / 2);
      const dy = Math.round((storyH - drawH) / 2) - 10;

      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 32;
      ctx.shadowOffsetY = 14;
      ctx.drawImage(frameBuffer, dx, dy, drawW, drawH);
      ctx.restore();

      // Subtle footer watermark badge
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.font = '700 22px "Space Grotesk", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SNAPTOGETHER • LIVE PHOTOBOOTH', storyW / 2, storyH - 42);
    },
    totalTicks,
    fps,
  );
}

/**
 * Helper to export individual raw pose PNG blobs cleanly without frame.
 */
export async function exportCleanPosePng(
  pose: CapturedPose,
  mode: BoothMode,
  filterId: FilterId,
  fitMode: CameraFitMode = 'cover',
): Promise<Blob | null> {
  const w = mode === 'ldr' && pose.stillPartner ? 1280 : pose.stillLocal.width || 1080;
  const h = mode === 'ldr' && pose.stillPartner ? 854 : pose.stillLocal.height || 810;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  if (mode === 'ldr' && pose.stillPartner) {
    const half = Math.floor(w / 2);
    if (fitMode === 'contain') {
      drawBlurredCoverBackdrop(ctx, pose.stillLocal, 0, 0, half, h, false);
      drawContainSource(ctx, pose.stillLocal, 0, 0, half, h, false);
      drawBlurredCoverBackdrop(ctx, pose.stillPartner, half, 0, w - half, h, false);
      drawContainSource(ctx, pose.stillPartner, half, 0, w - half, h, false);
    } else {
      drawCoverSource(ctx, pose.stillLocal, 0, 0, half, h, false);
      drawCoverSource(ctx, pose.stillPartner, half, 0, w - half, h, false);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(half - 1, 0, 2, h);
  } else {
    ctx.drawImage(pose.stillLocal, 0, 0, w, h);
  }

  if (filterId !== 'normal') {
    applyFilterGradingToCanvas(canvas, filterId);
  }

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}
