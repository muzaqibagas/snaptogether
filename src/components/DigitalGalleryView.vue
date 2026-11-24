<script setup lang="ts">
import JSZip from 'jszip';
import {
  ArrowLeft,
  Download,
  Film,
  FolderArchive,
  Heart,
  Image as ImageIcon,
  Loader2,
  Share2,
  Sparkles,
} from 'lucide-vue-next';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { GeneratedAssets } from '../types/booth';
import { connectQrGalleryReceiver } from '../utils/qrGalleryTransfer';

const props = defineProps<{
  peerGalleryId?: string | null;
  localAssets?: GeneratedAssets | null;
}>();

const emit = defineEmits<{
  (e: 'back'): void;
  (e: 'newSession'): void;
}>();

const assets = ref<GeneratedAssets | null>(props.localAssets ?? null);
const statusText = ref('Membuka galeri kenangan kalian...');
const progressReceived = ref(0);
const progressTotal = ref(0);
const errorText = ref<string | null>(null);

let receiverHandle: { destroy: () => void } | null = null;

const canShareFiles = computed(
  () => typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && typeof navigator.share === 'function',
);

function downloadUrl(url: string | null, filename: string) {
  if (!url) return;
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function shareFile(blob: Blob | null, filename: string, mimeType: string) {
  if (!blob || !canShareFiles.value) return;
  try {
    const file = new File([blob], filename, { type: mimeType });
    if (navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: 'Galeri SnapTogether ♡',
        files: [file],
      });
    }
  } catch {
    // ignore cancelled share sheet
  }
}

async function downloadAllRawZip() {
  if (!assets.value || assets.value.rawPoses.length === 0) return;
  const zip = new JSZip();
  for (const item of assets.value.rawPoses) {
    zip.file(item.filename, item.blob);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  downloadUrl(url, 'snaptogether-foto-polos.zip');
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

onMounted(() => {
  if (props.localAssets) {
    assets.value = props.localAssets;
    return;
  }

  if (props.peerGalleryId) {
    receiverHandle = connectQrGalleryReceiver(props.peerGalleryId, {
      onStatus: (msg) => {
        statusText.value = msg;
      },
      onProgress: (rec, tot) => {
        progressReceived.value = rec;
        progressTotal.value = tot;
      },
      onComplete: (loaded) => {
        assets.value = loaded;
      },
      onError: (msg) => {
        errorText.value = msg;
      },
    });
  }
});

onUnmounted(() => {
  receiverHandle?.destroy();
});
</script>

<template>
  <div class="bg-stationery-paper safe-top safe-bottom safe-x min-h-[100dvh] py-6 text-[#3b212a]">
    <div class="mx-auto max-w-3xl space-y-5">
      <!-- Header -->
      <div
        class="sticker-card flex flex-wrap items-center justify-between gap-3 rounded-[24px] px-4 py-3.5 sm:px-5"
      >
        <div class="flex items-center gap-3">
          <div
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border-2 border-[#f6b8cc] bg-[#ffe7ef] shadow-[0_3px_0_#f7cad8]"
          >
            <Heart class="h-5 w-5 fill-[#f05483] text-[#f05483]" />
          </div>
          <div>
            <h1 class="font-display text-lg font-bold text-[#3b212a] sm:text-xl">
              Galeri Kenangan SnapTogether
            </h1>
            <p class="text-xs text-[#7b5563]">
              Simpan foto berbingkai, video Live Photo, dan pose HD ke galeri HP kalian ♡
            </p>
          </div>
        </div>

        <button
          v-if="localAssets"
          type="button"
          class="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border-2 border-[#f3d4de] bg-white px-4 py-2 text-xs font-extrabold text-[#613c49] hover:bg-[#fff0f4]"
          @click="$emit('back')"
        >
          <ArrowLeft class="h-4 w-4" />
          <span>Kembali</span>
        </button>
        <button
          v-else
          type="button"
          class="btn-strawberry inline-flex min-h-[42px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-extrabold"
          @click="$emit('newSession')"
        >
          <Sparkles class="h-4 w-4" />
          <span>Buat Foto Baru</span>
        </button>
      </div>

      <!-- Loading Remote P2P State -->
      <div
        v-if="!assets && !errorText"
        class="sticker-card flex flex-col items-center justify-center gap-4 rounded-[24px] p-10 text-center"
      >
        <Loader2 class="h-10 w-10 animate-spin text-[#f05483]" />
        <div>
          <p class="font-display text-base font-bold text-[#3b212a]">{{ statusText }}</p>
          <p v-if="progressTotal > 0" class="mt-1 text-xs font-semibold text-[#7d5866]">
            Mengirim kenangan {{ progressReceived }} / {{ progressTotal }}
          </p>
        </div>
      </div>

      <!-- Error State -->
      <div
        v-else-if="errorText"
        class="rounded-[24px] border-2 border-[#f3b6c9] bg-[#fff0f5] p-6 text-center shadow-xs"
      >
        <h2 class="font-display text-base font-bold text-[#b8204f]">Tautan Galeri Belum Tersedia</h2>
        <p class="mt-1 text-xs leading-relaxed text-[#824458]">{{ errorText }}</p>
      </div>

      <!-- Loaded 4 Assets -->
      <div v-else-if="assets" class="space-y-5">
        <!-- Main Photo Preview & Download -->
        <div class="sticker-card rounded-[24px] p-4 sm:p-5">
          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <ImageIcon class="h-5 w-5 text-[#188052]" />
              <h2 class="font-display text-base font-bold text-[#3b212a]">
                1. Foto Utama Berbingkai (.png HD)
              </h2>
            </div>
            <div class="flex gap-2">
              <button
                type="button"
                :disabled="!assets.mainFramedPng.url"
                class="btn-matcha inline-flex min-h-[42px] items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold disabled:opacity-50"
                @click="downloadUrl(assets.mainFramedPng.url, assets.mainFramedPng.filename)"
              >
                <Download class="h-4 w-4" />
                <span>Simpan Foto HD</span>
              </button>
              <button
                v-if="canShareFiles && assets.mainFramedPng.blob"
                type="button"
                class="flex min-h-[42px] w-11 items-center justify-center rounded-xl border-2 border-[#a8e2c3] bg-white text-[#15784c]"
                aria-label="Bagikan Foto HD"
                @click="
                  shareFile(
                    assets.mainFramedPng.blob,
                    assets.mainFramedPng.filename,
                    assets.mainFramedPng.mimeType,
                  )
                "
              >
                <Share2 class="h-4 w-4" />
              </button>
            </div>
          </div>
          <div
            v-if="assets.mainFramedPng.url"
            class="flex justify-center rounded-2xl border-2 border-[#f4d7e1] bg-[#fff5f7] p-4"
          >
            <img
              :src="assets.mainFramedPng.url"
              alt="Foto Utama Berbingkai"
              class="h-auto max-h-[440px] max-w-full w-auto rounded-lg shadow-[0_12px_28px_rgba(120,45,70,0.18)]"
            />
          </div>
        </div>

        <!-- Videos Grid -->
        <div class="grid min-w-0 gap-4 sm:grid-cols-2">
          <div class="sticker-card min-w-0 space-y-3 rounded-[24px] p-4">
            <div class="flex items-center gap-2">
              <Film class="h-4 w-4 text-[#7b4ce2]" />
              <h3 class="font-display text-sm font-bold text-[#3b212a]">2. Video Live Photo Bergerak</h3>
            </div>
            <video
              v-if="assets.livePhotoVideo.url"
              :src="assets.livePhotoVideo.url"
              controls
              autoplay
              loop
              muted
              playsinline
              webkit-playsinline="true"
              class="max-h-72 w-full rounded-2xl border-2 border-[#f4d7e1] bg-[#2a1820] object-contain"
            />
            <div class="flex gap-2">
              <button
                type="button"
                :disabled="!assets.livePhotoVideo.url"
                class="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#7b4ce2] px-4 py-2.5 text-xs font-extrabold text-white shadow-[0_3px_0_#5931b3] hover:bg-[#6a3cd1] disabled:opacity-50"
                @click="downloadUrl(assets.livePhotoVideo.url, assets.livePhotoVideo.filename)"
              >
                <Download class="h-4 w-4" />
                <span>Unduh Video Live Photo</span>
              </button>
              <button
                v-if="canShareFiles && assets.livePhotoVideo.blob"
                type="button"
                class="flex min-h-[44px] w-11 shrink-0 items-center justify-center rounded-xl border-2 border-[#d9c7fa] bg-white text-[#6b33b5]"
                aria-label="Bagikan Video Live Photo"
                @click="
                  shareFile(
                    assets.livePhotoVideo.blob,
                    assets.livePhotoVideo.filename,
                    assets.livePhotoVideo.mimeType,
                  )
                "
              >
                <Share2 class="h-4 w-4" />
              </button>
            </div>
          </div>

          <div class="sticker-card min-w-0 space-y-3 rounded-[24px] p-4">
            <div class="flex items-center gap-2">
              <Film class="h-4 w-4 text-[#f05483]" />
              <h3 class="font-display text-sm font-bold text-[#3b212a]">3. Video Live Story 9:16</h3>
            </div>
            <video
              v-if="assets.storyVideo.url"
              :src="assets.storyVideo.url"
              controls
              autoplay
              loop
              muted
              playsinline
              webkit-playsinline="true"
              class="max-h-72 w-full rounded-2xl border-2 border-[#f4d7e1] bg-[#2a1820] object-contain"
            />
            <div class="flex gap-2">
              <button
                type="button"
                :disabled="!assets.storyVideo.url"
                class="btn-strawberry inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-extrabold disabled:opacity-50"
                @click="downloadUrl(assets.storyVideo.url, assets.storyVideo.filename)"
              >
                <Download class="h-4 w-4" />
                <span>Unduh Story IG / TikTok</span>
              </button>
              <button
                v-if="canShareFiles && assets.storyVideo.blob"
                type="button"
                class="flex min-h-[44px] w-11 shrink-0 items-center justify-center rounded-xl border-2 border-[#f4bfd1] bg-white text-[#c92a5d]"
                aria-label="Bagikan Video Story"
                @click="
                  shareFile(
                    assets.storyVideo.blob,
                    assets.storyVideo.filename,
                    assets.storyVideo.mimeType,
                  )
                "
              >
                <Share2 class="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <!-- Raw Individual Poses -->
        <div class="sticker-card rounded-[24px] p-4 sm:p-5">
          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 class="font-display text-base font-bold text-[#3b212a]">
                4. Semua Foto Polos Tanpa Bingkai
              </h3>
              <p class="text-xs text-[#7b5563]">
                Foto individual Pose 1 sampai Pose {{ assets.rawPoses.length }}.
              </p>
            </div>
            <button
              type="button"
              :disabled="assets.rawPoses.length === 0"
              class="btn-sky inline-flex min-h-[42px] items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold"
              @click="downloadAllRawZip"
            >
              <FolderArchive class="h-4 w-4" />
              <span>Unduh Semua (ZIP)</span>
            </button>
          </div>

          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div
              v-for="raw in assets.rawPoses"
              :key="raw.poseIndex"
              class="overflow-hidden rounded-2xl border-2 border-[#f3d4de] bg-white shadow-xs"
            >
              <img :src="raw.url" :alt="`Pose ${raw.poseIndex + 1}`" class="aspect-[4/3] w-full object-cover" />
              <button
                type="button"
                class="flex min-h-[42px] w-full items-center justify-center gap-1.5 bg-[#fff6f8] py-2 text-xs font-extrabold text-[#b82857] hover:bg-[#ffe8ef]"
                @click="downloadUrl(raw.url, raw.filename)"
              >
                <Download class="h-3.5 w-3.5" />
                <span>Pose {{ raw.poseIndex + 1 }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
