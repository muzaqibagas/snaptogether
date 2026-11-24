<script setup lang="ts">
import JSZip from 'jszip';
import {
  CheckCircle2,
  CloudUpload,
  Download,
  ExternalLink,
  Film,
  FolderArchive,
  Heart,
  Image as ImageIcon,
  Loader2,
  QrCode,
  RotateCcw,
  Share2,
  Sparkles,
} from 'lucide-vue-next';
import QRCode from 'qrcode';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type {
  BoothMode,
  CapturedPose,
  FilterId,
  FramePreset,
  GeneratedAssets,
  RawPoseAsset,
} from '../types/booth';
import { renderFrameComposite } from '../utils/frameRenderer';
import {
  createQrGallerySender,
  isCloudinaryConfigured,
  uploadAssetsToCloud,
  type CloudGalleryLinks,
} from '../utils/qrGalleryTransfer';
import {
  buildSlotMediaForTick,
  exportCleanPosePng,
  exportFramedLivePhotoVideo,
  exportStoryLivePhotoVideo,
  prepareLivePhotoFrames,
  type PreparedLivePhotoData,
} from '../utils/videoExporter';

const props = defineProps<{
  mode: BoothMode;
  selectedFrame: FramePreset;
  activeFilterId: FilterId;
  capturedPoses: CapturedPose[];
  formattedTimeRemaining: string;
}>();

const emit = defineEmits<{
  (e: 'assetsReady', assets: GeneratedAssets): void;
  (e: 'openDigitalGallery'): void;
  (e: 'startNewSession'): void;
}>();

const activeTab = ref<'photo' | 'video'>('photo');
const livePreviewCanvasRef = ref<HTMLCanvasElement | null>(null);

const isBuildingPhoto = ref(true);
const isEncodingVideos = ref(true);
const buildError = ref<string | null>(null);

const qrDataUrl = ref<string | null>(null);
const galleryShareUrl = ref<string>('');
const qrScanNotified = ref(false);

const cloudEnabled = isCloudinaryConfigured();
const isUploadingCloud = ref(false);
const cloudLinks = ref<CloudGalleryLinks | null>(null);
const cloudError = ref<string | null>(null);

const localAssets = ref<GeneratedAssets>({
  mainFramedPng: { blob: null, url: null, filename: 'snaptogether-frame.png', mimeType: 'image/png' },
  livePhotoVideo: { blob: null, url: null, filename: 'snaptogether-live.mp4', mimeType: 'video/mp4' },
  storyVideo: { blob: null, url: null, filename: 'snaptogether-story.mp4', mimeType: 'video/mp4' },
  rawPoses: [],
});

let preparedLive: PreparedLivePhotoData | null = null;
let liveLoopTimerId: ReturnType<typeof setInterval> | null = null;
let liveTick = 0;
let qrSenderHandle: { destroy: () => void } | null = null;

const canShareFiles = computed(
  () => typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && typeof navigator.share === 'function',
);

const totalAssetsReadyCount = computed(() => {
  let count = 0;
  if (localAssets.value.mainFramedPng.url) count++;
  if (localAssets.value.livePhotoVideo.url) count++;
  if (localAssets.value.storyVideo.url) count++;
  if (localAssets.value.rawPoses.length > 0) count++;
  return count;
});

function startLivePreviewAnimation() {
  stopLivePreviewAnimation();
  if (!preparedLive || activeTab.value !== 'video') return;

  const renderStep = async () => {
    const canvas = livePreviewCanvasRef.value;
    if (!canvas || !preparedLive) return;
    const scale = Math.min(0.45, 380 / props.selectedFrame.canvasWidth);
    const slotsMedia = buildSlotMediaForTick(preparedLive, liveTick++);
    await renderFrameComposite(canvas, {
      frame: props.selectedFrame,
      slotsMedia,
      mode: props.mode,
      filterId: props.activeFilterId,
      scale,
      applyFilterToSource: false,
    });
  };

  renderStep();
  liveLoopTimerId = setInterval(renderStep, 90);
}

function stopLivePreviewAnimation() {
  if (liveLoopTimerId !== null) {
    clearInterval(liveLoopTimerId);
    liveLoopTimerId = null;
  }
}

watch(
  activeTab,
  (tab) => {
    if (tab === 'video') {
      startLivePreviewAnimation();
    } else {
      stopLivePreviewAnimation();
    }
  },
  { flush: 'post' },
);

async function buildSessionOutputs() {
  isBuildingPhoto.value = true;
  isEncodingVideos.value = true;
  buildError.value = null;

  try {
    // 1. Render HD Main Framed PNG
    const hdCanvas = document.createElement('canvas');
    await renderFrameComposite(hdCanvas, {
      frame: props.selectedFrame,
      slotsMedia: props.capturedPoses.map((p) => ({
        local: p.stillLocal,
        partner: p.stillPartner,
      })),
      mode: props.mode,
      filterId: props.activeFilterId,
      scale: 1,
      applyFilterToSource: true,
    });

    const mainBlob = await new Promise<Blob | null>((resolve) =>
      hdCanvas.toBlob((b) => resolve(b), 'image/png'),
    );
    if (mainBlob) {
      localAssets.value.mainFramedPng = {
        blob: mainBlob,
        url: URL.createObjectURL(mainBlob),
        filename: `snaptogether-${props.selectedFrame.id}.png`,
        mimeType: 'image/png',
      };
    }

    // 2. Render Clean Unframed Raw Poses
    const rawList: RawPoseAsset[] = [];
    for (const pose of props.capturedPoses) {
      const rawBlob = await exportCleanPosePng(pose, props.mode, props.activeFilterId);
      if (rawBlob) {
        rawList.push({
          poseIndex: pose.poseIndex,
          blob: rawBlob,
          url: URL.createObjectURL(rawBlob),
          filename: `snaptogether-pose-${pose.poseIndex + 1}.png`,
        });
      }
    }
    localAssets.value.rawPoses = rawList;
    isBuildingPhoto.value = false;
    emit('assetsReady', localAssets.value);

    // 3. Prepare Live Photo frames for interactive tab + MP4/WebM export
    preparedLive = await prepareLivePhotoFrames(props.capturedPoses, props.activeFilterId);
    if (activeTab.value === 'video') {
      startLivePreviewAnimation();
    }

    // Export Live Photo Framed Video
    const liveRes = await exportFramedLivePhotoVideo({
      prepared: preparedLive,
      frame: props.selectedFrame,
      mode: props.mode,
      filterId: props.activeFilterId,
    });
    if (liveRes.blob) {
      localAssets.value.livePhotoVideo = {
        blob: liveRes.blob,
        url: URL.createObjectURL(liveRes.blob),
        filename: `snaptogether-live.${liveRes.extension}`,
        mimeType: liveRes.mimeType,
      };
    }

    // Export Live Photo 9:16 Story Video
    const storyRes = await exportStoryLivePhotoVideo({
      prepared: preparedLive,
      frame: props.selectedFrame,
      mode: props.mode,
      filterId: props.activeFilterId,
    });
    if (storyRes.blob) {
      localAssets.value.storyVideo = {
        blob: storyRes.blob,
        url: URL.createObjectURL(storyRes.blob),
        filename: `snaptogether-story-9x16.${storyRes.extension}`,
        mimeType: storyRes.mimeType,
      };
    }

    emit('assetsReady', localAssets.value);
  } catch (err) {
    buildError.value = err instanceof Error ? err.message : 'Gagal memproses hasil akhir.';
  } finally {
    isBuildingPhoto.value = false;
    isEncodingVideos.value = false;
  }
}

function setupQrGallery() {
  qrSenderHandle = createQrGallerySender(
    () => localAssets.value,
    async (peerId) => {
      const url = `${window.location.origin}${window.location.pathname}?gallery=${encodeURIComponent(peerId)}`;
      galleryShareUrl.value = url;
      try {
        qrDataUrl.value = await QRCode.toDataURL(url, {
          width: 240,
          margin: 2,
          color: {
            dark: '#4a1d35',
            light: '#fffdfb',
          },
        });
      } catch {
        // ignore QR error
      }
    },
    () => {
      qrScanNotified.value = true;
    },
  );
}

function triggerDownload(url: string | null, filename: string) {
  if (!url) return;
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function shareBlobAsset(blob: Blob | null, filename: string, mimeType: string) {
  if (!blob || !canShareFiles.value) return;
  try {
    const file = new File([blob], filename, { type: mimeType });
    if (navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: 'Kenangan SnapTogether ♡',
        files: [file],
      });
    }
  } catch {
    // ignore cancelled share
  }
}

async function downloadAllRawAsZip() {
  if (localAssets.value.rawPoses.length === 0) return;
  const zip = new JSZip();
  for (const raw of localAssets.value.rawPoses) {
    zip.file(raw.filename, raw.blob);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, 'snaptogether-foto-polos.zip');
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function handleCloudUpload() {
  if (!cloudEnabled || isUploadingCloud.value) return;
  isUploadingCloud.value = true;
  cloudError.value = null;
  try {
    cloudLinks.value = await uploadAssetsToCloud(localAssets.value);
  } catch (err) {
    cloudError.value = err instanceof Error ? err.message : 'Upload cloud gagal.';
  } finally {
    isUploadingCloud.value = false;
  }
}

onMounted(() => {
  setupQrGallery();
  buildSessionOutputs();
});

onUnmounted(() => {
  stopLivePreviewAnimation();
  preparedLive?.dispose();
  qrSenderHandle?.destroy();
});
</script>

<template>
  <section class="safe-x safe-bottom mx-auto grid max-w-7xl gap-5 py-4 sm:py-6 lg:grid-cols-12 lg:gap-6">
    <!-- Left Preview Tabs (Framed Strip vs Live Photo Video) -->
    <div class="space-y-4 lg:col-span-6 xl:col-span-5">
      <div class="sticker-card relative rounded-[24px] p-4 pt-6 sm:p-5 sm:pt-7">
        <div
          class="washi-tape pointer-events-none absolute -top-3 left-1/2 h-6 w-28 -translate-x-1/2 -rotate-1 rounded-xs"
          aria-hidden="true"
        />

        <div class="mb-3 flex items-center justify-between">
          <div class="font-hand text-base font-bold text-[#d84a76]">
            Yeay! Hasil Fotobox Kalian ♡
          </div>
          <span class="rounded-full border border-[#f5c7d7] bg-[#fff0f5] px-2.5 py-0.5 text-[11px] font-extrabold text-[#c92a5d]">
            {{ selectedFrame.name }}
          </span>
        </div>

        <!-- Tabs -->
        <div class="mb-4 grid grid-cols-2 gap-1.5 rounded-2xl border-2 border-[#f3d4de] bg-[#fff5f8] p-1">
          <button
            type="button"
            class="flex min-h-[40px] items-center justify-center gap-2 rounded-xl py-2 text-xs font-extrabold transition"
            :class="
              activeTab === 'photo'
                ? 'bg-[#f05483] text-white shadow-[0_2px_0_#c63360]'
                : 'text-[#7b5563] hover:text-[#3b212a]'
            "
            @click="activeTab = 'photo'"
          >
            <ImageIcon class="h-4 w-4" />
            <span>Foto Berbingkai</span>
          </button>
          <button
            type="button"
            class="flex min-h-[40px] items-center justify-center gap-2 rounded-xl py-2 text-xs font-extrabold transition"
            :class="
              activeTab === 'video'
                ? 'bg-[#f05483] text-white shadow-[0_2px_0_#c63360]'
                : 'text-[#7b5563] hover:text-[#3b212a]'
            "
            @click="activeTab = 'video'"
          >
            <Film class="h-4 w-4" />
            <span>Live Photo</span>
          </button>
        </div>

        <!-- Tab Content -->
        <div
          class="flex min-h-[340px] items-center justify-center rounded-2xl border-2 border-[#f4d7e1] bg-[#fff5f7] p-4 sm:min-h-[420px]"
        >
          <div v-if="isBuildingPhoto" class="flex flex-col items-center gap-3 text-[#835a68]">
            <Loader2 class="h-8 w-8 animate-spin text-[#f05483]" />
            <p class="text-xs font-bold">Lagi merangkai kenangan kalian HD...</p>
          </div>

          <img
            v-else-if="activeTab === 'photo' && localAssets.mainFramedPng.url"
            :src="localAssets.mainFramedPng.url"
            alt="Hasil Foto Strip Berbingkai"
            class="max-h-[420px] w-auto rounded-lg shadow-[0_12px_28px_rgba(120,45,70,0.18)] sm:max-h-[480px]"
          />

          <canvas
            v-else-if="activeTab === 'video'"
            ref="livePreviewCanvasRef"
            class="max-h-[420px] w-auto rounded-lg shadow-[0_12px_28px_rgba(120,45,70,0.18)] sm:max-h-[480px]"
          />
        </div>

        <p v-if="buildError" class="mt-3 rounded-xl bg-[#ffe8ef] px-3 py-2 text-xs font-semibold text-[#be2152]">
          {{ buildError }}
        </p>
      </div>
    </div>

    <!-- Right Downloads + QR Code Gallery Column -->
    <div class="space-y-5 lg:col-span-6 xl:col-span-7">
      <!-- QR Barcode & Digital Gallery Card -->
      <div class="sticker-card rounded-[24px] p-4 sm:p-5">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
          <!-- QR Box -->
          <div
            class="mx-auto flex shrink-0 flex-col items-center justify-center rounded-2xl border-2 border-[#f3cedb] bg-[#fffdfb] p-3 shadow-xs sm:mx-0"
          >
            <img
              v-if="qrDataUrl"
              :src="qrDataUrl"
              alt="QR Code Galeri SnapTogether"
              class="h-36 w-36 sm:h-40 sm:w-40"
            />
            <div v-else class="flex h-36 w-36 items-center justify-center text-[#9b7684] sm:h-40 sm:w-40">
              <Loader2 class="h-6 w-6 animate-spin text-[#f05483]" />
            </div>
            <span class="mt-1.5 text-[10px] font-extrabold tracking-wide text-[#7c4057]">
              SCAN DARI KAMERA HP ♡
            </span>
          </div>

          <!-- QR Info & Actions -->
          <div class="flex-1 space-y-2.5">
            <div class="flex flex-wrap items-center gap-2">
              <span
                class="inline-flex items-center gap-1.5 rounded-full border border-[#9ce0be] bg-[#e8faf0] px-2.5 py-1 text-[11px] font-extrabold text-[#17794d]"
              >
                <QrCode class="h-3.5 w-3.5" />
                Galeri Siap ({{ totalAssetsReadyCount }}/4 Paket)
              </span>
              <span
                v-if="qrScanNotified"
                class="inline-flex items-center gap-1 rounded-full border border-[#a9d5fa] bg-[#e9f5ff] px-2.5 py-1 text-[11px] font-extrabold text-[#2163a1]"
              >
                <CheckCircle2 class="h-3.5 w-3.5" />
                HP Tersambung! ♡
              </span>
            </div>

            <h2 class="font-display text-lg font-bold text-[#3b212a]">
              Simpan Cepat lewat QR atau Langsung
            </h2>
            <p class="text-xs leading-relaxed text-[#795361]">
              Scan QR pakai kamera HP buat langsung buka galeri 4 aset lengkap selama sesi aktif
              (<span class="font-mono-timer font-bold text-[#c92a5d]">{{ formattedTimeRemaining }}</span> tersisa).
            </p>

            <div class="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                class="btn-strawberry inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-extrabold"
                @click="$emit('openDigitalGallery')"
              >
                <ExternalLink class="h-4 w-4" />
                <span>Buka Halaman Galeri (4 Aset)</span>
              </button>

              <button
                v-if="cloudEnabled"
                type="button"
                :disabled="isUploadingCloud"
                class="btn-sky inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-extrabold disabled:opacity-50"
                @click="handleCloudUpload"
              >
                <CloudUpload class="h-4 w-4" />
                <span>{{ isUploadingCloud ? 'Mengunggah...' : 'Simpan Link Cloud' }}</span>
              </button>
            </div>

            <p v-if="cloudLinks" class="text-[11px] font-bold text-[#17794d]">
              Berhasil diunggah ke Cloudinary! Tautan siap dibagikan ke pasangan.
            </p>
            <p v-if="cloudError" class="text-[11px] font-semibold text-[#be2152]">{{ cloudError }}</p>
          </div>
        </div>
      </div>

      <!-- 4-Asset Complete Download Section -->
      <div class="sticker-card rounded-[24px] p-4 sm:p-5">
        <div class="mb-4 flex items-center justify-between gap-2">
          <div>
            <h3 class="font-display text-base font-bold text-[#3b212a]">
              4 Paket Kenangan Lengkap ♡
            </h3>
            <p class="text-xs text-[#795361]">
              Semua foto &amp; video diproses gratis di browser tanpa watermark.
            </p>
          </div>
          <Sparkles class="h-5 w-5 shrink-0 text-[#f59e0b]" />
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <!-- Asset 1: Video Live Photo Bergerak -->
          <div class="craft-panel flex flex-col justify-between rounded-2xl p-4">
            <div>
              <div class="flex items-center justify-between">
                <span class="rounded-full bg-[#efe4ff] px-2.5 py-0.5 text-[10px] font-extrabold text-[#6b33b5]">
                  1. VIDEO LIVE
                </span>
                <Loader2
                  v-if="isEncodingVideos && !localAssets.livePhotoVideo.url"
                  class="h-4 w-4 animate-spin text-[#9a7382]"
                />
              </div>
              <h4 class="mt-2 font-display text-sm font-bold text-[#3b212a]">
                Video Live Photo Bergerak
              </h4>
              <p class="mt-1 text-xs text-[#7a5462]">
                Gabungan semua momen gerak kalian dalam 1 video berbingkai lucu.
              </p>
            </div>
            <div class="mt-3 flex gap-2">
              <button
                type="button"
                :disabled="!localAssets.livePhotoVideo.url"
                class="inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#7b4ce2] px-3.5 py-2 text-xs font-extrabold text-white shadow-[0_3px_0_#5931b3] transition hover:bg-[#6a3cd1] active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50"
                @click="triggerDownload(localAssets.livePhotoVideo.url, localAssets.livePhotoVideo.filename)"
              >
                <Download class="h-4 w-4" />
                <span>{{ localAssets.livePhotoVideo.url ? 'Unduh Video Live' : 'Membuat Video...' }}</span>
              </button>
              <button
                v-if="canShareFiles && localAssets.livePhotoVideo.blob"
                type="button"
                class="flex min-h-[42px] w-11 shrink-0 items-center justify-center rounded-xl border-2 border-[#d9c7fa] bg-white text-[#6b33b5] hover:bg-[#f6f0ff]"
                title="Bagikan / Simpan di HP"
                aria-label="Bagikan Video Live"
                @click="
                  shareBlobAsset(
                    localAssets.livePhotoVideo.blob,
                    localAssets.livePhotoVideo.filename,
                    localAssets.livePhotoVideo.mimeType,
                  )
                "
              >
                <Share2 class="h-4 w-4" />
              </button>
            </div>
          </div>

          <!-- Asset 2: Video Story 9:16 -->
          <div class="craft-panel flex flex-col justify-between rounded-2xl p-4">
            <div>
              <div class="flex items-center justify-between">
                <span class="rounded-full bg-[#ffe0eb] px-2.5 py-0.5 text-[10px] font-extrabold text-[#c92a5d]">
                  2. STORY 9:16
                </span>
                <Loader2
                  v-if="isEncodingVideos && !localAssets.storyVideo.url"
                  class="h-4 w-4 animate-spin text-[#9a7382]"
                />
              </div>
              <h4 class="mt-2 font-display text-sm font-bold text-[#3b212a]">
                Video Live Story IG / TikTok
              </h4>
              <p class="mt-1 text-xs text-[#7a5462]">
                Versi vertikal 9:16 langsung pas buat pamer di IG Story, TikTok, atau WA Status.
              </p>
            </div>
            <div class="mt-3 flex gap-2">
              <button
                type="button"
                :disabled="!localAssets.storyVideo.url"
                class="btn-strawberry inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-extrabold disabled:cursor-not-allowed disabled:opacity-50"
                @click="triggerDownload(localAssets.storyVideo.url, localAssets.storyVideo.filename)"
              >
                <Download class="h-4 w-4" />
                <span>{{ localAssets.storyVideo.url ? 'Unduh Video Story' : 'Merender Story...' }}</span>
              </button>
              <button
                v-if="canShareFiles && localAssets.storyVideo.blob"
                type="button"
                class="flex min-h-[42px] w-11 shrink-0 items-center justify-center rounded-xl border-2 border-[#f4bfd1] bg-white text-[#c92a5d] hover:bg-[#fff0f5]"
                title="Bagikan / Simpan di HP"
                aria-label="Bagikan Video Story"
                @click="
                  shareBlobAsset(
                    localAssets.storyVideo.blob,
                    localAssets.storyVideo.filename,
                    localAssets.storyVideo.mimeType,
                  )
                "
              >
                <Share2 class="h-4 w-4" />
              </button>
            </div>
          </div>

          <!-- Asset 3: Foto Utama Berbingkai HD -->
          <div class="craft-panel flex flex-col justify-between rounded-2xl p-4">
            <div>
              <span class="rounded-full bg-[#dff8eb] px-2.5 py-0.5 text-[10px] font-extrabold text-[#15784c]">
                3. FOTO UTAMA HD
              </span>
              <h4 class="mt-2 font-display text-sm font-bold text-[#3b212a]">
                Foto Strip Berbingkai (.png)
              </h4>
              <p class="mt-1 text-xs text-[#7a5462]">
                Resolusi tinggi lengkap dengan filter dan ornamen lucu.
              </p>
            </div>
            <div class="mt-3 flex gap-2">
              <button
                type="button"
                :disabled="!localAssets.mainFramedPng.url"
                class="btn-matcha inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-extrabold disabled:opacity-50"
                @click="triggerDownload(localAssets.mainFramedPng.url, localAssets.mainFramedPng.filename)"
              >
                <Download class="h-4 w-4" />
                <span>Unduh Foto Berbingkai</span>
              </button>
              <button
                v-if="canShareFiles && localAssets.mainFramedPng.blob"
                type="button"
                class="flex min-h-[42px] w-11 shrink-0 items-center justify-center rounded-xl border-2 border-[#a8e2c3] bg-white text-[#15784c] hover:bg-[#ebfbf2]"
                title="Simpan / Bagikan ke Galeri HP"
                aria-label="Simpan Foto Berbingkai"
                @click="
                  shareBlobAsset(
                    localAssets.mainFramedPng.blob,
                    localAssets.mainFramedPng.filename,
                    localAssets.mainFramedPng.mimeType,
                  )
                "
              >
                <Share2 class="h-4 w-4" />
              </button>
            </div>
          </div>

          <!-- Asset 4: Semua Foto Biasa Tanpa Bingkai -->
          <div class="craft-panel flex flex-col justify-between rounded-2xl p-4">
            <div>
              <span class="rounded-full bg-[#e0f2fe] px-2.5 py-0.5 text-[10px] font-extrabold text-[#1d63a1]">
                4. FOTO POLOS ({{ localAssets.rawPoses.length }})
              </span>
              <h4 class="mt-2 font-display text-sm font-bold text-[#3b212a]">
                Semua Foto Tanpa Bingkai
              </h4>
              <p class="mt-1 text-xs text-[#7a5462]">
                Foto satuan Pose 1–{{ localAssets.rawPoses.length }} bersih tanpa bingkai.
              </p>
            </div>
            <div class="mt-3 flex flex-wrap gap-1.5">
              <button
                type="button"
                :disabled="localAssets.rawPoses.length === 0"
                class="btn-sky inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold disabled:opacity-50"
                @click="downloadAllRawAsZip"
              >
                <FolderArchive class="h-4 w-4" />
                <span>Unduh ZIP</span>
              </button>
              <button
                v-for="raw in localAssets.rawPoses"
                :key="raw.poseIndex"
                type="button"
                class="min-h-[42px] rounded-xl border-2 border-[#c6e2fb] bg-white px-3 py-2 text-xs font-extrabold text-[#2163a1] transition hover:border-[#4f9ee8] hover:bg-[#eef7ff]"
                @click="triggerDownload(raw.url, raw.filename)"
              >
                P{{ raw.poseIndex + 1 }}
              </button>
            </div>
          </div>
        </div>

        <div class="mt-5 flex flex-wrap items-center justify-between gap-3 border-t-2 border-dashed border-[#f4d4df] pt-4">
          <span class="inline-flex items-center gap-1.5 text-xs font-medium text-[#8a6371]">
            <Heart class="h-3.5 w-3.5 fill-[#f05483] text-[#f05483]" />
            Mau coba gaya frame atau filter lain?
          </span>

          <button
            type="button"
            class="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border-2 border-[#f2c4d4] bg-white px-5 py-2.5 text-xs font-extrabold text-[#663d4b] transition hover:border-[#f05483] hover:bg-[#fff0f5] hover:text-[#c92a5d] sm:w-auto"
            @click="$emit('startNewSession')"
          >
            <RotateCcw class="h-4 w-4" />
            <span>Foto Lagi Dari Awal ♡</span>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
