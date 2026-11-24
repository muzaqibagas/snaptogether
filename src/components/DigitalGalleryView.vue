<script setup lang="ts">
import JSZip from 'jszip';
import {
  ArrowLeft,
  Camera,
  Download,
  Film,
  FolderArchive,
  Image as ImageIcon,
  Loader2,
  Sparkles,
} from 'lucide-vue-next';
import { onMounted, onUnmounted, ref } from 'vue';
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
const statusText = ref('Memuat galeri digital...');
const progressReceived = ref(0);
const progressTotal = ref(0);
const errorText = ref<string | null>(null);

let receiverHandle: { destroy: () => void } | null = null;

function downloadUrl(url: string | null, filename: string) {
  if (!url) return;
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
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
  <div class="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
    <div class="mx-auto max-w-3xl space-y-6">
      <!-- Header -->
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-violet-600 text-white">
            <Camera class="h-5 w-5" />
          </div>
          <div>
            <h1 class="font-display text-xl font-bold text-white">Galeri Digital SnapTogether</h1>
            <p class="text-xs text-slate-400">Simpan foto berbingkai, video Live Photo, dan foto individual HD Anda.</p>
          </div>
        </div>

        <button
          v-if="localAssets"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
          @click="$emit('back')"
        >
          <ArrowLeft class="h-4 w-4" />
          <span>Kembali</span>
        </button>
        <button
          v-else
          type="button"
          class="inline-flex items-center gap-1.5 rounded-xl bg-pink-500 px-3.5 py-2 text-xs font-bold text-white hover:bg-pink-400"
          @click="$emit('newSession')"
        >
          <Sparkles class="h-4 w-4" />
          <span>Buat Foto Baru</span>
        </button>
      </div>

      <!-- Loading Remote P2P State -->
      <div
        v-if="!assets && !errorText"
        class="flex flex-col items-center justify-center gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-10 text-center"
      >
        <Loader2 class="h-10 w-10 animate-spin text-pink-500" />
        <div>
          <p class="font-semibold text-white">{{ statusText }}</p>
          <p v-if="progressTotal > 0" class="mt-1 text-xs text-slate-400">
            Menerima aset {{ progressReceived }} / {{ progressTotal }}
          </p>
        </div>
      </div>

      <!-- Error State -->
      <div
        v-else-if="errorText"
        class="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6 text-center"
      >
        <h2 class="font-display text-base font-bold text-rose-200">Tautan Galeri Tidak Tersedia</h2>
        <p class="mt-1 text-xs text-rose-300/90">{{ errorText }}</p>
      </div>

      <!-- Loaded 4 Assets -->
      <div v-else-if="assets" class="space-y-6">
        <!-- Main Photo Preview & Download -->
        <div class="rounded-2xl border border-slate-800 bg-slate-900/85 p-5">
          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <ImageIcon class="h-5 w-5 text-emerald-400" />
              <h2 class="font-display text-base font-bold text-white">1. Foto Utama Berbingkai (.png HD)</h2>
            </div>
            <button
              type="button"
              :disabled="!assets.mainFramedPng.url"
              class="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
              @click="downloadUrl(assets.mainFramedPng.url, assets.mainFramedPng.filename)"
            >
              <Download class="h-4 w-4" />
              <span>Simpan Foto HD</span>
            </button>
          </div>
          <div v-if="assets.mainFramedPng.url" class="flex justify-center rounded-xl bg-slate-950 p-4">
            <img :src="assets.mainFramedPng.url" alt="Foto Utama Berbingkai" class="max-h-[460px] w-auto rounded-lg shadow-xl" />
          </div>
        </div>

        <!-- Videos Grid -->
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="rounded-2xl border border-slate-800 bg-slate-900/85 p-4 space-y-3">
            <div class="flex items-center gap-2">
              <Film class="h-4 w-4 text-violet-400" />
              <h3 class="text-sm font-bold text-white">2. Video Live Photo Bergerak</h3>
            </div>
            <video
              v-if="assets.livePhotoVideo.url"
              :src="assets.livePhotoVideo.url"
              controls
              autoplay
              loop
              muted
              playsinline
              class="max-h-72 w-full rounded-xl bg-black object-contain"
            />
            <button
              type="button"
              :disabled="!assets.livePhotoVideo.url"
              class="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-violet-500 disabled:opacity-50"
              @click="downloadUrl(assets.livePhotoVideo.url, assets.livePhotoVideo.filename)"
            >
              <Download class="h-4 w-4" />
              <span>Unduh Video Live Photo</span>
            </button>
          </div>

          <div class="rounded-2xl border border-slate-800 bg-slate-900/85 p-4 space-y-3">
            <div class="flex items-center gap-2">
              <Film class="h-4 w-4 text-pink-400" />
              <h3 class="text-sm font-bold text-white">3. Video Live Photo Story 9:16</h3>
            </div>
            <video
              v-if="assets.storyVideo.url"
              :src="assets.storyVideo.url"
              controls
              autoplay
              loop
              muted
              playsinline
              class="max-h-72 w-full rounded-xl bg-black object-contain"
            />
            <button
              type="button"
              :disabled="!assets.storyVideo.url"
              class="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-pink-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-pink-500 disabled:opacity-50"
              @click="downloadUrl(assets.storyVideo.url, assets.storyVideo.filename)"
            >
              <Download class="h-4 w-4" />
              <span>Unduh Video Story IG/TikTok</span>
            </button>
          </div>
        </div>

        <!-- Raw Individual Poses -->
        <div class="rounded-2xl border border-slate-800 bg-slate-900/85 p-5">
          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 class="font-display text-base font-bold text-white">4. Semua Foto Biasa Tanpa Bingkai</h3>
              <p class="text-xs text-slate-400">Semua pose individual dari Pose 1 hingga Pose {{ assets.rawPoses.length }}.</p>
            </div>
            <button
              type="button"
              :disabled="assets.rawPoses.length === 0"
              class="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400"
              @click="downloadAllRawZip"
            >
              <FolderArchive class="h-4 w-4" />
              <span>Download Semua (ZIP)</span>
            </button>
          </div>

          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div
              v-for="raw in assets.rawPoses"
              :key="raw.poseIndex"
              class="overflow-hidden rounded-xl border border-slate-800 bg-slate-950"
            >
              <img :src="raw.url" :alt="`Pose ${raw.poseIndex + 1}`" class="aspect-[4/3] w-full object-cover" />
              <button
                type="button"
                class="flex w-full items-center justify-center gap-1.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
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
