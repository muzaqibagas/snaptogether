<script setup lang="ts">
import JSZip from 'jszip';
import {
  CheckCircle2,
  CloudUpload,
  Download,
  ExternalLink,
  Film,
  FolderArchive,
  Image as ImageIcon,
  Loader2,
  QrCode,
  RotateCcw,
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

watch(activeTab, (tab) => {
  if (tab === 'video') {
    startLivePreviewAnimation();
  } else {
    stopLivePreviewAnimation();
  }
}, { flush: 'post' });

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
            dark: '#0f172a',
            light: '#ffffff',
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
  <section class="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-12">
    <!-- Left Preview Tabs (Framed Strip vs Live Photo Video) -->
    <div class="space-y-4 lg:col-span-6 xl:col-span-5">
      <div class="rounded-2xl border border-slate-800 bg-slate-900/85 p-5 shadow-2xl">
        <!-- Tabs -->
        <div class="mb-4 grid grid-cols-2 gap-1.5 rounded-xl border border-slate-800 bg-slate-950 p-1">
          <button
            type="button"
            class="flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold transition"
            :class="activeTab === 'photo' ? 'bg-pink-500 text-white shadow' : 'text-slate-400 hover:text-white'"
            @click="activeTab = 'photo'"
          >
            <ImageIcon class="h-4 w-4" />
            <span>Foto Strip Berbingkai</span>
          </button>
          <button
            type="button"
            class="flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold transition"
            :class="activeTab === 'video' ? 'bg-pink-500 text-white shadow' : 'text-slate-400 hover:text-white'"
            @click="activeTab = 'video'"
          >
            <Film class="h-4 w-4" />
            <span>Live Photo Video</span>
          </button>
        </div>

        <!-- Tab Content -->
        <div class="flex min-h-[420px] items-center justify-center rounded-xl border border-slate-800 bg-slate-950 p-4">
          <div v-if="isBuildingPhoto" class="flex flex-col items-center gap-3 text-slate-400">
            <Loader2 class="h-8 w-8 animate-spin text-pink-500" />
            <p class="text-xs font-medium">Merender foto berbingkai HD...</p>
          </div>

          <img
            v-else-if="activeTab === 'photo' && localAssets.mainFramedPng.url"
            :src="localAssets.mainFramedPng.url"
            alt="Hasil Foto Strip Berbingkai"
            class="max-h-[480px] w-auto rounded-lg shadow-2xl"
          />

          <canvas
            v-else-if="activeTab === 'video'"
            ref="livePreviewCanvasRef"
            class="max-h-[480px] w-auto rounded-lg shadow-2xl"
          />
        </div>

        <p v-if="buildError" class="mt-3 text-xs text-rose-400">{{ buildError }}</p>
      </div>
    </div>

    <!-- Right Downloads + QR Code Gallery Column -->
    <div class="space-y-6 lg:col-span-6 xl:col-span-7">
      <!-- QR Barcode & Digital Gallery Card -->
      <div class="rounded-2xl border border-slate-800 bg-slate-900/85 p-5 shadow-xl">
        <div class="flex flex-col gap-5 sm:flex-row sm:items-center">
          <!-- QR Box -->
          <div class="flex shrink-0 flex-col items-center justify-center rounded-2xl border border-slate-700 bg-white p-3">
            <img
              v-if="qrDataUrl"
              :src="qrDataUrl"
              alt="QR Code Galeri SnapTogether"
              class="h-40 w-40"
            />
            <div v-else class="flex h-40 w-40 items-center justify-center text-slate-500">
              <Loader2 class="h-6 w-6 animate-spin" />
            </div>
            <span class="mt-1.5 text-[10px] font-bold tracking-wide text-slate-700">SCAN DARI KAMERA HP</span>
          </div>

          <!-- QR Info & Actions -->
          <div class="flex-1 space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
                <QrCode class="h-3.5 w-3.5" />
                Galeri Digital Siap ({{ totalAssetsReadyCount }}/4 Aset)
              </span>
              <span
                v-if="qrScanNotified"
                class="inline-flex items-center gap-1 rounded-full bg-cyan-500/20 px-2.5 py-1 text-[11px] font-semibold text-cyan-300"
              >
                <CheckCircle2 class="h-3.5 w-3.5" />
                HP Terhubung!
              </span>
            </div>

            <h2 class="font-display text-lg font-bold text-white">Unduh Cepat lewat QR atau Langsung</h2>
            <p class="text-xs leading-relaxed text-slate-400">
              Pindai kode QR menggunakan kamera ponsel untuk membuka halaman galeri berisi 4 aset lengkap selama sesi aktif
              (<span class="font-mono-timer font-semibold text-slate-200">{{ formattedTimeRemaining }}</span> tersisa).
            </p>

            <div class="flex flex-wrap gap-2.5 pt-1">
              <button
                type="button"
                class="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 to-violet-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-pink-500/25 transition hover:brightness-110"
                @click="$emit('openDigitalGallery')"
              >
                <ExternalLink class="h-4 w-4" />
                <span>Buka Halaman Galeri (4 Aset)</span>
              </button>

              <button
                v-if="cloudEnabled"
                type="button"
                :disabled="isUploadingCloud"
                class="inline-flex items-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-4 py-2.5 text-xs font-bold text-cyan-200 transition hover:bg-cyan-500/25 disabled:opacity-50"
                @click="handleCloudUpload"
              >
                <CloudUpload class="h-4 w-4" />
                <span>{{ isUploadingCloud ? 'Mengunggah...' : 'Simpan Link Cloud' }}</span>
              </button>
            </div>

            <p v-if="cloudLinks" class="text-[11px] text-emerald-300">
              Berhasil diunggah ke Cloudinary! Tautan siap dibagikan.
            </p>
            <p v-if="cloudError" class="text-[11px] text-rose-400">{{ cloudError }}</p>
          </div>
        </div>
      </div>

      <!-- 4-Asset Complete Download Section -->
      <div class="rounded-2xl border border-slate-800 bg-slate-900/85 p-5 shadow-xl">
        <div class="mb-4 flex items-center justify-between">
          <div>
            <h3 class="font-display text-base font-bold text-white">4 Paket Unduhan Sesi</h3>
            <p class="text-xs text-slate-400">Semua file diproses langsung di browser tanpa watermark berbayar.</p>
          </div>
          <Sparkles class="h-5 w-5 text-pink-400" />
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <!-- Asset 1: Video Live Photo Bergerak -->
          <div class="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-950/75 p-4">
            <div>
              <div class="flex items-center justify-between">
                <span class="rounded-md bg-violet-500/20 px-2 py-0.5 text-[10px] font-bold text-violet-300">1. VIDEO LIVE</span>
                <Loader2 v-if="isEncodingVideos && !localAssets.livePhotoVideo.url" class="h-4 w-4 animate-spin text-slate-400" />
              </div>
              <h4 class="mt-2 text-sm font-bold text-white">Video Live Photo Bergerak</h4>
              <p class="mt-1 text-xs text-slate-400">Gabungan semua pose bergerak dalam 1 video berbingkai.</p>
            </div>
            <button
              type="button"
              :disabled="!localAssets.livePhotoVideo.url"
              class="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-50"
              @click="triggerDownload(localAssets.livePhotoVideo.url, localAssets.livePhotoVideo.filename)"
            >
              <Download class="h-4 w-4" />
              <span>{{ localAssets.livePhotoVideo.url ? 'Unduh Video Live' : 'Membuat Video...' }}</span>
            </button>
          </div>

          <!-- Asset 2: Video Story 9:16 -->
          <div class="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-950/75 p-4">
            <div>
              <div class="flex items-center justify-between">
                <span class="rounded-md bg-pink-500/20 px-2 py-0.5 text-[10px] font-bold text-pink-300">2. STORY 9:16</span>
                <Loader2 v-if="isEncodingVideos && !localAssets.storyVideo.url" class="h-4 w-4 animate-spin text-slate-400" />
              </div>
              <h4 class="mt-2 text-sm font-bold text-white">Video Live Photo Story</h4>
              <p class="mt-1 text-xs text-slate-400">Versi playback vertikal siap upload ke IG Story & TikTok.</p>
            </div>
            <button
              type="button"
              :disabled="!localAssets.storyVideo.url"
              class="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-pink-600 disabled:cursor-not-allowed disabled:opacity-50"
              @click="triggerDownload(localAssets.storyVideo.url, localAssets.storyVideo.filename)"
            >
              <Download class="h-4 w-4" />
              <span>{{ localAssets.storyVideo.url ? 'Unduh Video Story' : 'Merender Story...' }}</span>
            </button>
          </div>

          <!-- Asset 3: Foto Utama Berbingkai HD -->
          <div class="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-950/75 p-4">
            <div>
              <span class="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">3. FOTO UTAMA HD</span>
              <h4 class="mt-2 text-sm font-bold text-white">Foto Strip Berbingkai (.png)</h4>
              <p class="mt-1 text-xs text-slate-400">Resolusi tinggi lengkap dengan filter dan ornamen bingkai.</p>
            </div>
            <button
              type="button"
              :disabled="!localAssets.mainFramedPng.url"
              class="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3.5 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
              @click="triggerDownload(localAssets.mainFramedPng.url, localAssets.mainFramedPng.filename)"
            >
              <Download class="h-4 w-4" />
              <span>Unduh Foto Berbingkai</span>
            </button>
          </div>

          <!-- Asset 4: Semua Foto Biasa Tanpa Bingkai -->
          <div class="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-950/75 p-4">
            <div>
              <span class="rounded-md bg-cyan-500/20 px-2 py-0.5 text-[10px] font-bold text-cyan-300">
                4. FOTO POLOS ({{ localAssets.rawPoses.length }})
              </span>
              <h4 class="mt-2 text-sm font-bold text-white">Semua Foto Tanpa Bingkai</h4>
              <p class="mt-1 text-xs text-slate-400">Foto individual Pose 1–{{ localAssets.rawPoses.length }} bersih tanpa bingkai.</p>
            </div>
            <div class="mt-3 flex flex-wrap gap-1.5">
              <button
                type="button"
                :disabled="localAssets.rawPoses.length === 0"
                class="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-cyan-500 px-3 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50"
                @click="downloadAllRawAsZip"
              >
                <FolderArchive class="h-4 w-4" />
                <span>Unduh ZIP</span>
              </button>
              <button
                v-for="raw in localAssets.rawPoses"
                :key="raw.poseIndex"
                type="button"
                class="rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-2 text-[11px] font-bold text-slate-200 transition hover:border-cyan-400 hover:text-cyan-300"
                @click="triggerDownload(raw.url, raw.filename)"
              >
                P{{ raw.poseIndex + 1 }}
              </button>
            </div>
          </div>
        </div>

        <div class="mt-5 flex justify-end border-t border-slate-800 pt-4">
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-5 py-2.5 text-xs font-bold text-white transition hover:border-pink-500/50 hover:bg-slate-700"
            @click="$emit('startNewSession')"
          >
            <RotateCcw class="h-4 w-4" />
            <span>Akhiri & Mulai Sesi Baru</span>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
