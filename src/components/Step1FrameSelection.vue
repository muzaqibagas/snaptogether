<script setup lang="ts">
import {
  ArrowRight,
  Check,
  Copy,
  Eye,
  Heart,
  Link2,
  Share2,
  Sparkles,
  Upload,
  User,
  Users,
  Wifi,
} from 'lucide-vue-next';
import { computed, onMounted, ref, watch } from 'vue';
import { createCustomFramePreset } from '../constants/frames';
import type {
  BoothMode,
  FilterId,
  FrameLayoutType,
  FramePreset,
  LdrConnectionState,
} from '../types/booth';
import { processCustomFrameUpload } from '../utils/customFrameDetector';
import { renderFrameComposite } from '../utils/frameRenderer';

const props = defineProps<{
  mode: BoothMode;
  frames: FramePreset[];
  selectedFrame: FramePreset;
  activeFilterId: FilterId;
  ldrState: LdrConnectionState;
  ldrRoomCode: string;
  ldrError: string | null;
  ldrIsHost: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:mode', mode: BoothMode): void;
  (e: 'selectFrame', frameId: string): void;
  (e: 'addCustomFrame', frame: FramePreset): void;
  (e: 'createLdrRoom'): void;
  (e: 'joinLdrRoom', code: string): void;
  (e: 'startSession'): void;
}>();

const previewCanvasRef = ref<HTMLCanvasElement | null>(null);
const previewSectionRef = ref<HTMLElement | null>(null);
const customLayout = ref<FrameLayoutType>('strip-3');
const isUploadingCustom = ref(false);
const customUploadFeedback = ref<string | null>(null);
const customUploadError = ref<string | null>(null);

const ldrTab = ref<'host' | 'join'>('host');
const joinCodeInput = ref('');
const copiedState = ref<'code' | 'link' | null>(null);

const canNativeShare = computed(
  () => typeof navigator !== 'undefined' && typeof navigator.share === 'function',
);

async function drawLivePreview() {
  const canvas = previewCanvasRef.value;
  if (!canvas) return;
  const frame = props.selectedFrame;
  const scale = Math.min(0.32, 340 / frame.canvasWidth);
  await renderFrameComposite(canvas, {
    frame,
    slotsMedia: new Array(frame.poseCount).fill(undefined),
    mode: props.mode,
    filterId: props.activeFilterId,
    scale,
    applyFilterToSource: false,
  });
}

onMounted(() => {
  drawLivePreview();
});

watch(
  () => [props.selectedFrame, props.mode, props.activeFilterId],
  () => {
    drawLivePreview();
  },
  { deep: true },
);

async function handleCustomFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  customUploadError.value = null;
  customUploadFeedback.value = null;

  if (!['image/png', 'image/webp'].includes(file.type)) {
    customUploadError.value = 'Gunakan file PNG atau WebP transparan ya.';
    input.value = '';
    return;
  }

  isUploadingCustom.value = true;
  try {
    const result = await processCustomFrameUpload(file, customLayout.value);
    const cleanName = file.name.replace(/\.(png|webp)$/i, '').slice(0, 24) || 'Custom Frame';
    const newFrame = createCustomFramePreset({
      id: `custom-${Date.now()}`,
      name: cleanName,
      layout: customLayout.value,
      customImageSrc: result.dataUrl,
      customWidth: result.width,
      customHeight: result.height,
      detectedSlots: result.detectedSlots,
    });
    emit('addCustomFrame', newFrame);
    customUploadFeedback.value = result.usedAutoDetection
      ? `Bingkai siap dipakai (${result.detectedSlots.length} slot transparan terdeteksi otomatis!).`
      : `Bingkai siap dipakai dengan tata letak ${customLayout.value === 'grid-2x2' ? 'Grid 2x2' : customLayout.value === 'strip-4' ? '4 Pose Strip' : '3 Pose Strip'}.`;
  } catch (err) {
    customUploadError.value = err instanceof Error ? err.message : 'Gagal memuat bingkai custom.';
  } finally {
    isUploadingCustom.value = false;
    input.value = '';
  }
}

async function copyTextSafe(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below for iOS/Android in-app browsers or non-HTTPS origins
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

async function copyRoomCode() {
  if (!props.ldrRoomCode) return;
  if (await copyTextSafe(props.ldrRoomCode)) {
    copiedState.value = 'code';
    setTimeout(() => (copiedState.value = null), 2000);
  }
}

function getInviteUrl(): string {
  return `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(props.ldrRoomCode)}`;
}

async function copyInviteLink() {
  if (!props.ldrRoomCode) return;
  if (await copyTextSafe(getInviteUrl())) {
    copiedState.value = 'link';
    setTimeout(() => (copiedState.value = null), 2000);
  }
}

async function shareInviteLink() {
  if (!props.ldrRoomCode || !canNativeShare.value) return;
  try {
    await navigator.share({
      title: 'Yuk Photobooth Bareng di SnapTogether ♡',
      text: `Masuk ke ruang photobooth kita yuk! Kode: ${props.ldrRoomCode}`,
      url: getInviteUrl(),
    });
  } catch {
    // User cancelled share sheet
  }
}

function scrollToPreview() {
  previewSectionRef.value?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
</script>

<template>
  <section class="safe-x mx-auto max-w-7xl space-y-5 py-4 pb-28 sm:py-6 lg:pb-8">
    <!-- Cute Bucin Intro Banner -->
    <div
      class="relative overflow-hidden rounded-[24px] border-2 border-[#f4ceda] bg-gradient-to-r from-[#fff0f4] via-[#fff9f2] to-[#eef7ff] px-4 py-4 shadow-[0_4px_0_#f7dce5] sm:px-6 sm:py-5"
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="max-w-2xl space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <span
              class="inline-flex -rotate-1 items-center gap-1 rounded-full border border-[#f6b8cb] bg-white px-2.5 py-0.5 text-[11px] font-bold text-[#dc3f71] shadow-xs"
            >
              <Heart class="h-3 w-3 fill-[#f05483] text-[#f05483]" />
              Photobox Mode Bucin
            </span>
            <span class="font-hand text-base font-bold text-[#c96b88]">
              ~ abadikan momen gemes kalian ~
            </span>
          </div>
          <h1 class="font-display text-xl font-bold tracking-tight text-[#3b212a] sm:text-2xl">
            Yuk foto bareng biar makin lengket!
          </h1>
          <p class="text-xs leading-relaxed text-[#75515e] sm:text-sm">
            Bisa foto sendiri, dempetan bareng ayang di satu layar, atau LDR jarak jauh tetap satu frame.
          </p>
        </div>

        <!-- Cute Sticker Stamp -->
        <div
          class="animate-gentle-float hidden items-center gap-2 rounded-2xl border-2 border-dashed border-[#f2a8bf] bg-white/90 px-3.5 py-2 text-xs font-bold text-[#b83b65] shadow-xs md:flex"
        >
          <Sparkles class="h-4 w-4 text-[#f59e0b]" />
          <span>Gratis • Tanpa Watermark • Bisa Live Photo</span>
        </div>
      </div>
    </div>

    <!-- Main 2-Column Workspace -->
    <div class="grid min-w-0 gap-5 lg:grid-cols-12 lg:gap-6">
      <!-- Left Configuration Column -->
      <div class="min-w-0 w-full space-y-5 lg:col-span-7 xl:col-span-8">
        <!-- 1. Mode Booth Selection -->
        <div class="sticker-card rounded-[24px] p-4 sm:p-5">
          <div class="mb-3.5 flex items-start justify-between gap-2">
            <div>
              <span class="text-[11px] font-extrabold uppercase tracking-wider text-[#e44b7b]">
                Langkah 1
              </span>
              <h2 class="font-display text-lg font-bold text-[#3b212a]">Pilih Gaya Pemotretan</h2>
              <p class="text-xs text-[#7d5866]">
                Lagi ketemuan atau lagi kangen dari jauh? Pilih sesuai kondisi kalian ya.
              </p>
            </div>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              class="flex min-h-[84px] items-start gap-3.5 rounded-2xl border-2 p-3.5 text-left transition-all sm:p-4"
              :class="
                mode === 'solo'
                  ? 'border-[#f05483] bg-[#fff1f5] shadow-[0_4px_0_#f7c5d5]'
                  : 'border-[#f3d9e2] bg-[#fffaf8] hover:border-[#eab9c9] hover:bg-[#fff4f7]'
              "
              @click="$emit('update:mode', 'solo')"
            >
              <div
                class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border-2 transition-colors"
                :class="
                  mode === 'solo'
                    ? 'border-[#e04574] bg-[#f05483] text-white'
                    : 'border-[#f4d4df] bg-white text-[#8f6674]'
                "
              >
                <User class="h-5 w-5" />
              </div>
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-1.5 font-display text-sm font-bold text-[#3b212a] sm:text-base">
                  <span>Solo / Bareng Di Sini</span>
                  <span
                    v-if="mode === 'solo'"
                    class="rounded-full bg-[#ffdce7] px-2 py-0.5 text-[10px] font-extrabold text-[#c92a5d]"
                  >
                    Dipilih ♡
                  </span>
                </div>
                <p class="mt-1 text-xs leading-relaxed text-[#7a5562]">
                  1 kamera perangkat ini. Pas buat selfie gemes atau foto dempetan bareng pasangan di sebelahmu.
                </p>
              </div>
            </button>

            <button
              type="button"
              class="flex min-h-[84px] items-start gap-3.5 rounded-2xl border-2 p-3.5 text-left transition-all sm:p-4"
              :class="
                mode === 'ldr'
                  ? 'border-[#4f9ee8] bg-[#eef7ff] shadow-[0_4px_0_#c2e0fa]'
                  : 'border-[#f3d9e2] bg-[#fffaf8] hover:border-[#b7d9f7] hover:bg-[#f4faff]'
              "
              @click="$emit('update:mode', 'ldr')"
            >
              <div
                class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border-2 transition-colors"
                :class="
                  mode === 'ldr'
                    ? 'border-[#3a8ad4] bg-[#4f9ee8] text-white'
                    : 'border-[#f4d4df] bg-white text-[#8f6674]'
                "
              >
                <Users class="h-5 w-5" />
              </div>
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-1.5 font-display text-sm font-bold text-[#3b212a] sm:text-base">
                  <span>LDR Duo Booth</span>
                  <span
                    class="rounded-full px-2 py-0.5 text-[10px] font-extrabold"
                    :class="
                      mode === 'ldr'
                        ? 'bg-[#d5ebff] text-[#1f62a1]'
                        : 'bg-[#e9f4ff] text-[#3a7ab8]'
                    "
                  >
                    Jarak Jauh ♥
                  </span>
                </div>
                <p class="mt-1 text-xs leading-relaxed text-[#7a5562]">
                  Beda kota tetep satu frame! Split-screen live + countdown bareng pasangan via kode ruang.
                </p>
              </div>
            </button>
          </div>

          <!-- LDR Connection Panel -->
          <div
            v-if="mode === 'ldr'"
            class="mt-4 rounded-2xl border-2 border-[#bdddf9] bg-[#f4faff] p-3.5 sm:p-4"
          >
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div class="grid w-full grid-cols-2 gap-1 rounded-xl border border-[#cce4fa] bg-white p-1 sm:flex sm:w-auto">
                <button
                  type="button"
                  class="min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-bold transition"
                  :class="ldrTab === 'host' ? 'bg-[#4f9ee8] text-white shadow-xs' : 'text-[#5b6f85] hover:text-[#2a435d]'"
                  @click="ldrTab = 'host'"
                >
                  Buat Ruang Berdua
                </button>
                <button
                  type="button"
                  class="min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-bold transition"
                  :class="ldrTab === 'join' ? 'bg-[#4f9ee8] text-white shadow-xs' : 'text-[#5b6f85] hover:text-[#2a435d]'"
                  @click="ldrTab = 'join'"
                >
                  Masuk Ruang Pasangan
                </button>
              </div>

              <div class="flex items-center gap-1.5 rounded-full border border-[#d6e9fb] bg-white px-2.5 py-1 text-xs font-bold">
                <Wifi
                  class="h-3.5 w-3.5"
                  :class="
                    ldrState === 'connected'
                      ? 'text-[#1c9c64]'
                      : ldrState === 'waiting' || ldrState === 'connecting'
                        ? 'animate-pulse text-[#d98816]'
                        : 'text-[#8ba1b8]'
                  "
                />
                <span
                  :class="
                    ldrState === 'connected'
                      ? 'text-[#167d50]'
                      : ldrState === 'error'
                        ? 'text-[#c92a5d]'
                        : 'text-[#486581]'
                  "
                >
                  {{
                    ldrState === 'connected'
                      ? 'Pasangan Udah Masuk! ♡'
                      : ldrState === 'waiting'
                        ? 'Nunggu si dia masuk...'
                        : ldrState === 'connecting' || ldrState === 'creating'
                          ? 'Menyiapkan jalur P2P...'
                          : 'Belum tersambung'
                  }}
                </span>
              </div>
            </div>

            <div v-if="ldrTab === 'host'" class="space-y-3">
              <div v-if="!ldrRoomCode || !ldrIsHost" class="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  class="btn-sky min-h-[42px] rounded-xl px-4 py-2 text-xs font-bold"
                  @click="$emit('createLdrRoom')"
                >
                  Buat Kode Ruang LDR ♡
                </button>
                <span class="text-xs text-[#546e87]">Gratis langsung antar HP/laptop (WebRTC P2P).</span>
              </div>

              <div
                v-else
                class="flex flex-col justify-between gap-3 rounded-2xl border-2 border-[#cbe3fa] bg-white p-3.5 sm:flex-row sm:items-center"
              >
                <div>
                  <div class="text-[11px] font-bold uppercase tracking-wider text-[#5b7d9e]">
                    Kode Rahasia Berdua
                  </div>
                  <div class="font-mono-timer text-xl font-bold tracking-wider text-[#1f62a1]">
                    {{ ldrRoomCode }}
                  </div>
                </div>
                <div class="flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border-2 border-[#d4e7fa] bg-[#f7fbff] px-3 py-1.5 text-xs font-bold text-[#2b547e] transition hover:bg-[#eaf4ff]"
                    @click="copyRoomCode"
                  >
                    <Check v-if="copiedState === 'code'" class="h-3.5 w-3.5 text-[#1c9c64]" />
                    <Copy v-else class="h-3.5 w-3.5" />
                    <span>{{ copiedState === 'code' ? 'Kode Tersalin!' : 'Salin Kode' }}</span>
                  </button>
                  <button
                    type="button"
                    class="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border-2 border-[#a7d2fa] bg-[#e5f2ff] px-3 py-1.5 text-xs font-bold text-[#1b5a96] transition hover:bg-[#d5ebff]"
                    @click="copyInviteLink"
                  >
                    <Check v-if="copiedState === 'link'" class="h-3.5 w-3.5 text-[#1c9c64]" />
                    <Link2 v-else class="h-3.5 w-3.5" />
                    <span>{{ copiedState === 'link' ? 'Link Tersalin!' : 'Salin Link' }}</span>
                  </button>
                  <button
                    v-if="canNativeShare"
                    type="button"
                    class="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#4f9ee8] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#3a8bd7]"
                    @click="shareInviteLink"
                  >
                    <Share2 class="h-3.5 w-3.5" />
                    <span>Kirim</span>
                  </button>
                </div>
              </div>
            </div>

            <div v-else class="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                v-model="joinCodeInput"
                type="text"
                autocapitalize="characters"
                autocorrect="off"
                spellcheck="false"
                enterkeyhint="go"
                placeholder="Masukkan kode, misal: SNAP-4829"
                class="min-h-[44px] w-full min-w-0 flex-1 rounded-xl border-2 border-[#c7e1fa] bg-white px-3.5 py-2 font-mono-timer text-base uppercase text-[#243b53] placeholder:text-[#8ba5bf] focus:border-[#4f9ee8] focus:outline-none sm:text-sm"
                @keyup.enter="$emit('joinLdrRoom', joinCodeInput)"
              />
              <button
                type="button"
                class="btn-sky min-h-[44px] rounded-xl px-5 py-2 text-xs font-bold"
                @click="$emit('joinLdrRoom', joinCodeInput)"
              >
                Gabung Sekarang
              </button>
            </div>

            <p v-if="ldrError" class="mt-2.5 rounded-xl bg-[#ffe8ef] px-3 py-2 text-xs font-semibold text-[#be2152]">
              {{ ldrError }}
            </p>
          </div>
        </div>

        <!-- 2. Preset Frame Gallery -->
        <div class="sticker-card rounded-[24px] p-4 sm:p-5">
          <div class="mb-4 flex items-start justify-between gap-3">
            <div>
              <span class="text-[11px] font-extrabold uppercase tracking-wider text-[#e44b7b]">
                Langkah 2
              </span>
              <h2 class="font-display text-lg font-bold text-[#3b212a]">Pilih Bingkai Gemes</h2>
              <p class="text-xs text-[#7d5866]">
                Semua warna, ornamen lucu, dan tata letak strip / grid 2x2 udah siap pakai.
              </p>
            </div>
            <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#fff0f5] text-[#f05483]">
              <Sparkles class="h-5 w-5" />
            </div>
          </div>

          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <button
              v-for="frame in frames"
              :key="frame.id"
              type="button"
              class="group relative flex min-h-[112px] items-stretch gap-3 rounded-2xl border-2 p-3 text-left transition-all"
              :class="
                selectedFrame.id === frame.id
                  ? 'border-[#f05483] bg-[#fff2f6] shadow-[0_4px_0_#f7c5d5]'
                  : 'border-[#f3d9e2] bg-[#fffaf8] hover:border-[#e9b3c4] hover:bg-[#fff5f8]'
              "
              @click="$emit('selectFrame', frame.id)"
            >
              <!-- Mini Visual Frame Silhouette -->
              <div
                class="flex w-11 shrink-0 flex-col items-center justify-center rounded-xl border border-black/10 p-1.5 shadow-inner"
                :style="{ backgroundColor: frame.backgroundColor }"
              >
                <div
                  v-if="frame.layout === 'grid-2x2'"
                  class="grid w-full grid-cols-2 gap-1"
                >
                  <span
                    v-for="n in 4"
                    :key="n"
                    class="aspect-square rounded-[3px] bg-white/85 ring-1 ring-black/10"
                  />
                </div>
                <div v-else class="flex w-full flex-col gap-1">
                  <span
                    v-for="n in frame.poseCount"
                    :key="n"
                    class="h-2.5 w-full rounded-[3px] bg-white/85 ring-1 ring-black/10"
                  />
                </div>
                <span
                  class="mt-1 h-1 w-5 rounded-full"
                  :style="{ backgroundColor: frame.accentColor }"
                />
              </div>

              <!-- Frame Details -->
              <div class="flex min-w-0 flex-1 flex-col justify-between">
                <div>
                  <div class="flex items-start justify-between gap-1.5">
                    <span class="font-display text-sm font-bold leading-snug text-[#3b212a]">
                      {{ frame.name }}
                    </span>
                    <span
                      v-if="selectedFrame.id === frame.id"
                      class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f05483] text-[10px] font-bold text-white shadow-xs"
                    >
                      ♥
                    </span>
                  </div>
                  <p class="mt-0.5 text-[11px] leading-snug text-[#7c5663]">{{ frame.subtitle }}</p>
                </div>

                <div class="mt-2 flex flex-wrap items-center gap-1.5">
                  <span
                    class="rounded-full border border-[#f2d0dc] bg-white px-2 py-0.5 text-[10px] font-bold text-[#6e4654]"
                  >
                    {{ frame.poseCount }} Pose • {{ frame.layout === 'grid-2x2' ? 'Grid 2x2' : 'Strip' }}
                  </span>
                  <span
                    v-if="frame.isCustom"
                    class="rounded-full bg-[#ffefc7] px-2 py-0.5 text-[10px] font-bold text-[#945a00]"
                  >
                    Custom
                  </span>
                </div>
              </div>
            </button>
          </div>
        </div>

        <!-- 3. Upload Custom PNG/WebP Frame -->
        <div class="sticker-card rounded-[24px] p-4 sm:p-5">
          <div class="mb-3">
            <span class="text-[11px] font-extrabold uppercase tracking-wider text-[#d97706]">
              Opsional
            </span>
            <h2 class="font-display text-base font-bold text-[#3b212a]">
              Upload Bingkai Buatan Sendiri (PNG / WebP)
            </h2>
            <p class="text-xs text-[#7d5866]">
              Punya bingkai transparan lucu dari Canva atau Figma? Unggah di sini lalu pilih jumlah pose-nya.
            </p>
          </div>

          <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div class="grid grid-cols-3 gap-1 rounded-xl border-2 border-[#f3d4de] bg-[#fff5f8] p-1 sm:inline-flex">
              <button
                v-for="opt in [
                  { id: 'strip-3', label: '3 Strip' },
                  { id: 'strip-4', label: '4 Strip' },
                  { id: 'grid-2x2', label: 'Grid 2x2' },
                ]"
                :key="opt.id"
                type="button"
                class="min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-bold transition"
                :class="
                  customLayout === opt.id
                    ? 'bg-[#f05483] text-white shadow-xs'
                    : 'text-[#7c5663] hover:text-[#3b212a]'
                "
                @click="customLayout = opt.id as FrameLayoutType"
              >
                {{ opt.label }}
              </button>
            </div>

            <label
              class="inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#e79eb5] bg-[#fff9fb] px-4 py-2 text-xs font-bold text-[#9e3156] transition hover:border-[#f05483] hover:bg-[#fff0f5]"
            >
              <Upload class="h-4 w-4" />
              <span>{{ isUploadingCustom ? 'Memproses Bingkai...' : 'Pilih File PNG / WebP' }}</span>
              <input
                type="file"
                accept="image/png,image/webp"
                class="hidden"
                :disabled="isUploadingCustom"
                @change="handleCustomFileChange"
              />
            </label>
          </div>

          <p
            v-if="customUploadFeedback"
            class="mt-2.5 rounded-xl bg-[#e8faf0] px-3 py-2 text-xs font-semibold text-[#17794d]"
          >
            {{ customUploadFeedback }}
          </p>
          <p
            v-if="customUploadError"
            class="mt-2.5 rounded-xl bg-[#ffe8ef] px-3 py-2 text-xs font-semibold text-[#be2152]"
          >
            {{ customUploadError }}
          </p>
        </div>
      </div>

      <!-- Right Live Canvas Preview Column (Washi-Taped Polaroid Card) -->
      <div ref="previewSectionRef" class="min-w-0 w-full lg:col-span-5 xl:col-span-4">
        <div class="sticker-card relative rounded-[24px] p-4 pt-6 sm:p-5 sm:pt-7 lg:sticky lg:top-24">
          <!-- Decorative Washi Tape Strip -->
          <div
            class="washi-tape pointer-events-none absolute -top-3 left-1/2 h-6 w-28 -translate-x-1/2 -rotate-2 rounded-xs"
            aria-hidden="true"
          />

          <div class="mb-3 flex items-center justify-between gap-2">
            <div>
              <div class="font-hand text-base font-bold text-[#d84a76]">
                Intip Hasil Bingkai ♡
              </div>
              <h3 class="font-display text-lg font-bold text-[#3b212a]">{{ selectedFrame.name }}</h3>
            </div>
            <span
              class="rounded-full border border-[#f5c7d7] bg-[#fff0f5] px-3 py-1 text-xs font-extrabold text-[#c92a5d]"
            >
              {{ selectedFrame.poseCount }} Pose
            </span>
          </div>

          <div
            class="flex justify-center rounded-2xl border-2 border-[#f4d7e1] bg-[#fff5f7] p-4 shadow-inner"
          >
            <canvas
              ref="previewCanvasRef"
              class="h-auto max-h-[380px] max-w-full w-auto rounded-lg shadow-[0_12px_28px_rgba(120,45,70,0.18)] sm:max-h-[430px]"
            />
          </div>

          <div class="mt-4 space-y-3">
            <div class="craft-panel space-y-1.5 rounded-2xl p-3 text-xs">
              <div class="flex items-center justify-between">
                <span class="font-medium text-[#7f5967]">Mode Booth</span>
                <span class="font-bold text-[#3b212a]">
                  {{ mode === 'ldr' ? 'LDR Duo Split-Screen ♡' : 'Solo / Bareng Di Sini' }}
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="font-medium text-[#7f5967]">Timer Sesi</span>
                <span class="font-bold text-[#188052]">10 Menit (saat jepret pertama)</span>
              </div>
            </div>

            <button
              type="button"
              class="btn-strawberry flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-extrabold"
              @click="$emit('startSession')"
            >
              <Heart class="h-4 w-4 fill-white" />
              <span>Mulai Sesi Foto</span>
              <ArrowRight class="h-4 w-4" />
            </button>

            <p
              v-if="mode === 'ldr' && ldrState !== 'connected'"
              class="rounded-xl border border-[#f5d388] bg-[#fff8e2] px-3 py-2 text-center text-[11px] font-semibold text-[#8a5508]"
            >
              Tips: Sambungkan kode ruang dulu sama si dia biar kameranya langsung tampil sebelahan ya!
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Mobile Sticky Bottom CTA Bar (Android & iOS One-Thumb Ready) -->
    <div
      class="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t-2 border-[#f4ceda] bg-[#fffaf8]/95 px-4 pt-2.5 shadow-[0_-8px_24px_rgba(180,60,100,0.1)] backdrop-blur-md lg:hidden"
    >
      <div class="mx-auto flex max-w-xl items-center gap-2.5">
        <button
          type="button"
          class="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 rounded-xl border-2 border-[#f4d1dd] bg-white px-3 py-1.5 text-left"
          @click="scrollToPreview"
        >
          <Eye class="h-4 w-4 shrink-0 text-[#e44b7b]" />
          <div class="min-w-0">
            <div class="truncate font-display text-xs font-bold text-[#3b212a]">
              {{ selectedFrame.name }}
            </div>
            <div class="text-[10px] font-semibold text-[#87616f]">
              {{ selectedFrame.poseCount }} Pose • Ketuk untuk intip
            </div>
          </div>
        </button>

        <button
          type="button"
          class="btn-strawberry inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-extrabold"
          @click="$emit('startSession')"
        >
          <span>Mulai Foto</span>
          <ArrowRight class="h-4 w-4" />
        </button>
      </div>
    </div>
  </section>
</template>
