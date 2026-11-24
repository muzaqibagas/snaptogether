<script setup lang="ts">
import {
  ArrowRight,
  Check,
  Copy,
  Link2,
  Sparkles,
  Upload,
  User,
  Users,
  Wifi,
} from 'lucide-vue-next';
import { onMounted, ref, watch } from 'vue';
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
const customLayout = ref<FrameLayoutType>('strip-3');
const isUploadingCustom = ref(false);
const customUploadFeedback = ref<string | null>(null);
const customUploadError = ref<string | null>(null);

const ldrTab = ref<'host' | 'join'>('host');
const joinCodeInput = ref('');
const copiedState = ref<'code' | 'link' | null>(null);

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
    customUploadError.value = 'Gunakan file PNG atau WebP transparan.';
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
      ? `Bingkai dimuat (${result.detectedSlots.length} slot transparan terdeteksi otomatis!).`
      : `Bingkai dimuat dengan tata letak ${customLayout.value === 'grid-2x2' ? 'Grid 2x2' : customLayout.value === 'strip-4' ? '4 Pose Strip' : '3 Pose Strip'}.`;
  } catch (err) {
    customUploadError.value = err instanceof Error ? err.message : 'Gagal memuat bingkai custom.';
  } finally {
    isUploadingCustom.value = false;
    input.value = '';
  }
}

async function copyRoomCode() {
  if (!props.ldrRoomCode) return;
  try {
    await navigator.clipboard.writeText(props.ldrRoomCode);
    copiedState.value = 'code';
    setTimeout(() => (copiedState.value = null), 2000);
  } catch {
    // ignore clipboard fallback
  }
}

async function copyInviteLink() {
  if (!props.ldrRoomCode) return;
  const url = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(props.ldrRoomCode)}`;
  try {
    await navigator.clipboard.writeText(url);
    copiedState.value = 'link';
    setTimeout(() => (copiedState.value = null), 2000);
  } catch {
    // ignore clipboard fallback
  }
}
</script>

<template>
  <section class="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-12">
    <!-- Left Configuration Column -->
    <div class="space-y-6 lg:col-span-7 xl:col-span-8">
      <!-- 1. Mode Booth Selection -->
      <div class="rounded-2xl border border-slate-800/90 bg-slate-900/75 p-5 shadow-xl backdrop-blur">
        <div class="mb-4 flex items-center justify-between">
          <div>
            <h2 class="font-display text-lg font-bold text-white">1. Pilih Mode Pemotretan</h2>
            <p class="text-xs text-slate-400">Pilih foto sendiri atau bersama pasangan jarak jauh secara real-time.</p>
          </div>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            class="flex items-start gap-3.5 rounded-xl border p-4 text-left transition-all"
            :class="
              mode === 'solo'
                ? 'border-pink-500 bg-pink-500/12 ring-2 ring-pink-500/30'
                : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
            "
            @click="$emit('update:mode', 'solo')"
          >
            <div
              class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
              :class="mode === 'solo' ? 'bg-pink-500 text-white' : 'bg-slate-800 text-slate-300'"
            >
              <User class="h-5 w-5" />
            </div>
            <div>
              <div class="flex items-center gap-2 font-semibold text-white">
                Solo Booth
                <span v-if="mode === 'solo'" class="rounded-full bg-pink-500/20 px-2 py-0.5 text-[10px] text-pink-300">
                  Aktif
                </span>
              </div>
              <p class="mt-1 text-xs leading-relaxed text-slate-400">
                1 kamera perangkat lokal. Cocok untuk foto sendiri atau bareng teman di lokasi yang sama.
              </p>
            </div>
          </button>

          <button
            type="button"
            class="flex items-start gap-3.5 rounded-xl border p-4 text-left transition-all"
            :class="
              mode === 'ldr'
                ? 'border-cyan-400 bg-cyan-500/12 ring-2 ring-cyan-400/30'
                : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
            "
            @click="$emit('update:mode', 'ldr')"
          >
            <div
              class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
              :class="mode === 'ldr' ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800 text-slate-300'"
            >
              <Users class="h-5 w-5" />
            </div>
            <div>
              <div class="flex items-center gap-2 font-semibold text-white">
                LDR Duo Booth
                <span class="rounded-full bg-cyan-500/20 px-2 py-0.5 text-[10px] text-cyan-300">P2P Live</span>
              </div>
              <p class="mt-1 text-xs leading-relaxed text-slate-400">
                Layar split-screen & sinkronisasi countdown P2P dengan pasangan via Room Code.
              </p>
            </div>
          </button>
        </div>

        <!-- LDR Connection Panel -->
        <div
          v-if="mode === 'ldr'"
          class="mt-4 rounded-xl border border-cyan-500/30 bg-slate-950/80 p-4"
        >
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div class="flex gap-1.5 rounded-lg bg-slate-900 p-1">
              <button
                type="button"
                class="rounded-md px-3 py-1.5 text-xs font-semibold transition"
                :class="ldrTab === 'host' ? 'bg-cyan-500 text-slate-950' : 'text-slate-300 hover:text-white'"
                @click="ldrTab = 'host'"
              >
                Buat Room (Host)
              </button>
              <button
                type="button"
                class="rounded-md px-3 py-1.5 text-xs font-semibold transition"
                :class="ldrTab === 'join' ? 'bg-cyan-500 text-slate-950' : 'text-slate-300 hover:text-white'"
                @click="ldrTab = 'join'"
              >
                Gabung Room
              </button>
            </div>

            <div class="flex items-center gap-1.5 text-xs font-medium">
              <Wifi
                class="h-3.5 w-3.5"
                :class="
                  ldrState === 'connected'
                    ? 'text-emerald-400'
                    : ldrState === 'waiting' || ldrState === 'connecting'
                      ? 'animate-pulse text-amber-400'
                      : 'text-slate-500'
                "
              />
              <span
                :class="
                  ldrState === 'connected'
                    ? 'text-emerald-300'
                    : ldrState === 'error'
                      ? 'text-rose-400'
                      : 'text-slate-300'
                "
              >
                {{
                  ldrState === 'connected'
                    ? 'Pasangan Terhubung!'
                    : ldrState === 'waiting'
                      ? 'Menunggu pasangan masuk...'
                      : ldrState === 'connecting' || ldrState === 'creating'
                        ? 'Menyiapkan jalur P2P...'
                        : 'Belum terhubung'
                }}
              </span>
            </div>
          </div>

          <div v-if="ldrTab === 'host'" class="space-y-3">
            <div v-if="!ldrRoomCode || !ldrIsHost" class="flex flex-wrap items-center gap-3">
              <button
                type="button"
                class="rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-cyan-400"
                @click="$emit('createLdrRoom')"
              >
                Buat Room Code LDR
              </button>
              <span class="text-xs text-slate-400">Gratis tanpa server media (WebRTC P2P).</span>
            </div>

            <div v-else class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/90 p-3">
              <div>
                <div class="text-[11px] uppercase tracking-wider text-slate-400">Kode Ruang LDR</div>
                <div class="font-mono-timer text-xl font-bold tracking-wider text-cyan-300">{{ ldrRoomCode }}</div>
              </div>
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
                  @click="copyRoomCode"
                >
                  <Check v-if="copiedState === 'code'" class="h-3.5 w-3.5 text-emerald-400" />
                  <Copy v-else class="h-3.5 w-3.5" />
                  {{ copiedState === 'code' ? 'Tersalin' : 'Salin Kode' }}
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/30"
                  @click="copyInviteLink"
                >
                  <Check v-if="copiedState === 'link'" class="h-3.5 w-3.5 text-emerald-400" />
                  <Link2 v-else class="h-3.5 w-3.5" />
                  {{ copiedState === 'link' ? 'Link Tersalin' : 'Salin Link Undangan' }}
                </button>
              </div>
            </div>
          </div>

          <div v-else class="flex flex-wrap items-center gap-2">
            <input
              v-model="joinCodeInput"
              type="text"
              placeholder="Contoh: SNAP-4829"
              class="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 font-mono-timer text-sm uppercase text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
              @keyup.enter="$emit('joinLdrRoom', joinCodeInput)"
            />
            <button
              type="button"
              class="rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-cyan-400"
              @click="$emit('joinLdrRoom', joinCodeInput)"
            >
              Gabung
            </button>
          </div>

          <p v-if="ldrError" class="mt-2 text-xs text-rose-400">{{ ldrError }}</p>
        </div>
      </div>

      <!-- 2. Preset Frame Gallery -->
      <div class="rounded-2xl border border-slate-800/90 bg-slate-900/75 p-5 shadow-xl backdrop-blur">
        <div class="mb-4 flex items-center justify-between">
          <div>
            <h2 class="font-display text-lg font-bold text-white">2. Galeri Bingkai Preset</h2>
            <p class="text-xs text-slate-400">
              Jumlah pose, tata letak (Strip / Grid 2x2), warna, ornamen, dan caption sudah menyatu dalam bingkai.
            </p>
          </div>
          <Sparkles class="h-5 w-5 text-pink-400" />
        </div>

        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <button
            v-for="frame in frames"
            :key="frame.id"
            type="button"
            class="group relative flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all"
            :class="
              selectedFrame.id === frame.id
                ? 'border-pink-500 bg-pink-500/12 ring-2 ring-pink-500/30'
                : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-900'
            "
            @click="$emit('selectFrame', frame.id)"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="flex items-center gap-2">
                <span
                  class="h-6 w-6 rounded-lg border border-white/20 shadow-inner"
                  :style="{
                    background: `linear-gradient(135deg, ${frame.backgroundColor}, ${frame.accentColor})`,
                  }"
                />
                <span class="text-sm font-bold text-white">{{ frame.name }}</span>
              </div>
              <span
                v-if="selectedFrame.id === frame.id"
                class="flex h-5 w-5 items-center justify-center rounded-full bg-pink-500 text-[11px] text-white"
              >
                ✓
              </span>
            </div>

            <p class="mt-2 text-xs text-slate-400">{{ frame.subtitle }}</p>

            <div class="mt-3 flex items-center justify-between gap-2">
              <span
                class="rounded-md bg-slate-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300"
              >
                {{ frame.poseCount }} Pose • {{ frame.layout === 'grid-2x2' ? 'Grid 2x2' : 'Strip' }}
              </span>
              <span v-if="frame.isCustom" class="text-[10px] font-semibold text-amber-300">Custom PNG</span>
            </div>
          </button>
        </div>
      </div>

      <!-- 3. Upload Custom PNG/WebP Frame -->
      <div class="rounded-2xl border border-slate-800/90 bg-slate-900/75 p-5 shadow-xl backdrop-blur">
        <div class="mb-3">
          <h2 class="font-display text-base font-bold text-white">3. Upload Bingkai PNG Custom (Opsional)</h2>
          <p class="text-xs text-slate-400">
            Unggah bingkai transparan (.png / .webp) buatan sendiri dari Canva atau Figma lalu pilih jumlah slot fotonya.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <div class="flex rounded-xl border border-slate-800 bg-slate-950 p-1">
            <button
              v-for="opt in [
                { id: 'strip-3', label: '3 Pose Strip' },
                { id: 'strip-4', label: '4 Pose Strip' },
                { id: 'grid-2x2', label: '4 Pose Grid 2x2' },
              ]"
              :key="opt.id"
              type="button"
              class="rounded-lg px-3 py-1.5 text-xs font-semibold transition"
              :class="
                customLayout === opt.id
                  ? 'bg-pink-500 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              "
              @click="customLayout = opt.id as FrameLayoutType"
            >
              {{ opt.label }}
            </button>
          </div>

          <label
            class="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-600 bg-slate-950/70 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-pink-400 hover:text-pink-300"
          >
            <Upload class="h-4 w-4" />
            <span>{{ isUploadingCustom ? 'Memproses...' : 'Pilih File PNG / WebP' }}</span>
            <input
              type="file"
              accept="image/png,image/webp"
              class="hidden"
              :disabled="isUploadingCustom"
              @change="handleCustomFileChange"
            />
          </label>
        </div>

        <p v-if="customUploadFeedback" class="mt-2 text-xs text-emerald-400">{{ customUploadFeedback }}</p>
        <p v-if="customUploadError" class="mt-2 text-xs text-rose-400">{{ customUploadError }}</p>
      </div>
    </div>

    <!-- Right Live Canvas Preview Column -->
    <div class="lg:col-span-5 xl:col-span-4">
      <div class="sticky top-24 rounded-2xl border border-slate-800/90 bg-slate-900/85 p-5 shadow-2xl backdrop-blur">
        <div class="mb-3 flex items-center justify-between">
          <div>
            <div class="text-xs font-semibold uppercase tracking-wider text-pink-400">Live Canvas Preview</div>
            <h3 class="font-display text-base font-bold text-white">{{ selectedFrame.name }}</h3>
          </div>
          <span class="rounded-lg bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-300">
            {{ selectedFrame.poseCount }} Pose
          </span>
        </div>

        <div class="flex justify-center rounded-xl border border-slate-800 bg-slate-950/90 p-4">
          <canvas
            ref="previewCanvasRef"
            class="max-h-[440px] w-auto rounded-lg shadow-2xl"
          />
        </div>

        <div class="mt-4 space-y-3">
          <div class="rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-300">
            <div class="flex items-center justify-between">
              <span class="text-slate-400">Mode Booth</span>
              <span class="font-semibold text-white">{{ mode === 'ldr' ? 'LDR Duo Split-Screen' : 'Solo Booth' }}</span>
            </div>
            <div class="mt-1.5 flex items-center justify-between">
              <span class="text-slate-400">Durasi Sesi</span>
              <span class="font-semibold text-emerald-300">10 Menit (saat jepret pertama)</span>
            </div>
          </div>

          <button
            type="button"
            class="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 via-rose-500 to-violet-600 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-pink-500/25 transition hover:brightness-110 active:scale-[0.99]"
            @click="$emit('startSession')"
          >
            <span>Mulai Sesi Foto</span>
            <ArrowRight class="h-4 w-4" />
          </button>

          <p v-if="mode === 'ldr' && ldrState !== 'connected'" class="text-center text-[11px] text-amber-300/90">
            Tips: Hubungkan Room Code pasangan sebelum mulai agar kamera pasangan langsung tampil split-screen.
          </p>
        </div>
      </div>
    </div>
  </section>
</template>
