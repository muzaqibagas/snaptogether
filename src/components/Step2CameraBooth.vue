<script setup lang="ts">
import {
  Camera,
  Check,
  FlipHorizontal2,
  RefreshCw,
  Sparkles,
  SwitchCamera,
  Users,
  Video,
} from 'lucide-vue-next';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useCamera } from '../composables/useCamera';
import { FILTERS, getFilterById } from '../constants/filters';
import type {
  BoothMode,
  CapturedPose,
  CountdownDuration,
  FilterId,
  FramePreset,
  LdrConnectionState,
  LdrSyncMessage,
  MotionFrame,
} from '../types/booth';
import {
  captureMotionFrameBlob,
  captureRawStillCanvas,
  createFilteredCanvas,
} from '../utils/canvasFilters';
import { renderFrameComposite, type SlotRenderMedia } from '../utils/frameRenderer';
import { playCountdownBeep, playShutterSound } from '../utils/soundEffects';

const props = defineProps<{
  mode: BoothMode;
  selectedFrame: FramePreset;
  activeFilterId: FilterId;
  countdownDuration: CountdownDuration;
  activePoseIndex: number;
  capturedPoses: CapturedPose[];
  reviewingPose: CapturedPose | null;
  isMuted: boolean;
  ldrState: LdrConnectionState;
  remoteStream: MediaStream | null;
  onSyncMessage: (cb: (msg: LdrSyncMessage) => void) => () => void;
}>();

const emit = defineEmits<{
  (e: 'update:filterId', filterId: FilterId): void;
  (e: 'update:countdown', duration: CountdownDuration): void;
  (e: 'firstShutterPressed'): void;
  (e: 'poseCaptured', pose: CapturedPose): void;
  (e: 'retakePose'): void;
  (e: 'confirmPose'): void;
  (e: 'sendSync', msg: LdrSyncMessage): void;
}>();

const camera = useCamera();
const localVideoRef = ref<HTMLVideoElement | null>(null);
const partnerVideoRef = ref<HTMLVideoElement | null>(null);
const reviewCanvasRef = ref<HTMLCanvasElement | null>(null);
const stripPreviewCanvasRef = ref<HTMLCanvasElement | null>(null);

const countdownRemaining = ref<number | null>(null);
const isRecordingMotion = ref(false);
const showFlash = ref(false);
const isBusyCapturing = ref(false);

let motionTimerId: ReturnType<typeof setInterval> | null = null;
let countdownTimerId: ReturnType<typeof setInterval> | null = null;
let capturedMotionBuffer: MotionFrame[] = [];
let unsubscribeSync: (() => void) | null = null;
const pendingPartnerStills = new Map<number, HTMLCanvasElement>();

const activeFilterDef = computed(() => getFilterById(props.activeFilterId));
const isFinalPose = computed(
  () => props.capturedPoses.length + (props.reviewingPose ? 1 : 0) >= props.selectedFrame.poseCount,
);

function attachVideoStreams() {
  if (localVideoRef.value && camera.stream.value) {
    localVideoRef.value.srcObject = camera.stream.value;
  }
  if (partnerVideoRef.value && props.remoteStream) {
    partnerVideoRef.value.srcObject = props.remoteStream;
  }
}

watch(
  () => camera.stream.value,
  () => attachVideoStreams(),
);
watch(
  () => props.remoteStream,
  () => attachVideoStreams(),
);

async function drawReviewPreview() {
  const canvas = reviewCanvasRef.value;
  const pose = props.reviewingPose;
  if (!canvas || !pose) return;

  const filteredLocal = createFilteredCanvas(pose.stillLocal, props.activeFilterId);

  if (props.mode === 'ldr' && pose.stillPartner) {
    const filteredPartner = createFilteredCanvas(pose.stillPartner, props.activeFilterId);
    canvas.width = filteredLocal.width * 2;
    canvas.height = filteredLocal.height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(filteredLocal, 0, 0);
      ctx.drawImage(filteredPartner, filteredLocal.width, 0);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(filteredLocal.width - 2, 0, 4, canvas.height);
    }
  } else {
    canvas.width = filteredLocal.width;
    canvas.height = filteredLocal.height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(filteredLocal, 0, 0);
    }
  }
}

async function drawStripProgressPreview() {
  const canvas = stripPreviewCanvasRef.value;
  if (!canvas) return;
  const frame = props.selectedFrame;
  const slotsMedia: Array<SlotRenderMedia | undefined> = new Array(frame.poseCount).fill(undefined);

  for (const pose of props.capturedPoses) {
    slotsMedia[pose.poseIndex] = {
      local: pose.stillLocal,
      partner: pose.stillPartner,
    };
  }
  if (props.reviewingPose) {
    slotsMedia[props.reviewingPose.poseIndex] = {
      local: props.reviewingPose.stillLocal,
      partner: props.reviewingPose.stillPartner,
    };
  }

  const scale = Math.min(0.28, 300 / frame.canvasWidth);
  await renderFrameComposite(canvas, {
    frame,
    slotsMedia,
    mode: props.mode,
    filterId: props.activeFilterId,
    scale,
    applyFilterToSource: true,
  });
}

watch(
  () => [props.reviewingPose, props.activeFilterId],
  () => {
    drawReviewPreview();
    drawStripProgressPreview();
  },
  { deep: true, flush: 'post' },
);

watch(
  () => [props.capturedPoses, props.selectedFrame],
  () => {
    drawStripProgressPreview();
  },
  { deep: true },
);

function stopMotionCapture() {
  if (motionTimerId !== null) {
    clearInterval(motionTimerId);
    motionTimerId = null;
  }
  isRecordingMotion.value = false;
}

function stopCountdown() {
  if (countdownTimerId !== null) {
    clearInterval(countdownTimerId);
    countdownTimerId = null;
  }
  countdownRemaining.value = null;
}

function startRollingMotionCapture() {
  stopMotionCapture();
  capturedMotionBuffer = [];
  isRecordingMotion.value = true;

  const captureOneTick = async () => {
    const lv = localVideoRef.value;
    if (!lv || lv.readyState < 2) return;

    const localBlob = await captureMotionFrameBlob(lv, camera.isMirrored.value, 440, 0.7);
    if (!localBlob) return;

    let partnerBlob: Blob | undefined;
    if (props.mode === 'ldr' && partnerVideoRef.value && partnerVideoRef.value.readyState >= 2) {
      const pb = await captureMotionFrameBlob(partnerVideoRef.value, false, 440, 0.7);
      if (pb) partnerBlob = pb;
    }

    capturedMotionBuffer.push({ local: localBlob, partner: partnerBlob });
    // Keep a rolling ~2.5s buffer (~20 frames at 125ms interval) so memory stays bounded
    if (capturedMotionBuffer.length > 22) {
      capturedMotionBuffer.shift();
    }
  };

  captureOneTick();
  motionTimerId = setInterval(captureOneTick, 125);
}

async function performShutterCapture(fromRemoteSync = false) {
  stopMotionCapture();
  stopCountdown();

  const lv = localVideoRef.value;
  if (!lv) {
    isBusyCapturing.value = false;
    return;
  }

  // Flash + sound
  showFlash.value = true;
  playShutterSound(props.isMuted);
  setTimeout(() => {
    showFlash.value = false;
  }, 420);

  if (props.mode === 'ldr' && !fromRemoteSync && props.ldrState === 'connected') {
    emit('sendSync', { type: 'capture-now', poseIndex: props.activePoseIndex });
  }

  const stillLocal = captureRawStillCanvas(lv, camera.isMirrored.value, 1080);

  // Send high-res still to LDR partner over DataChannel
  if (props.mode === 'ldr' && props.ldrState === 'connected') {
    try {
      const dataUrl = stillLocal.toDataURL('image/jpeg', 0.9);
      emit('sendSync', {
        type: 'partner-still',
        poseIndex: props.activePoseIndex,
        dataUrl,
      });
    } catch {
      // ignore serialization failure
    }
  }

  let stillPartner: HTMLCanvasElement | undefined = pendingPartnerStills.get(props.activePoseIndex);
  if (stillPartner) {
    pendingPartnerStills.delete(props.activePoseIndex);
  } else if (props.mode === 'ldr' && partnerVideoRef.value && partnerVideoRef.value.readyState >= 2) {
    stillPartner = captureRawStillCanvas(partnerVideoRef.value, false, 1080);
  }

  const pose: CapturedPose = {
    poseIndex: props.activePoseIndex,
    stillLocal,
    stillPartner,
    motionFrames: [...capturedMotionBuffer],
  };

  capturedMotionBuffer = [];
  isBusyCapturing.value = false;
  emit('poseCaptured', pose);
}

function beginCountdownSequence(duration: CountdownDuration, fromRemoteSync = false) {
  if (isBusyCapturing.value || props.reviewingPose) return;

  emit('firstShutterPressed');
  isBusyCapturing.value = true;

  if (props.mode === 'ldr' && !fromRemoteSync && props.ldrState === 'connected') {
    emit('sendSync', {
      type: 'start-pose',
      poseIndex: props.activePoseIndex,
      duration,
    });
  }

  let remaining: number = duration;
  countdownRemaining.value = remaining;
  playCountdownBeep(remaining === 1, props.isMuted);

  // Start capturing ~2.5s motion window immediately for 3s, or when <= 3s for 5s/10s
  if (remaining <= 3) {
    startRollingMotionCapture();
  }

  countdownTimerId = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      performShutterCapture(fromRemoteSync);
      return;
    }

    countdownRemaining.value = remaining;
    playCountdownBeep(remaining === 1, props.isMuted);

    if (remaining <= 3 && !isRecordingMotion.value) {
      startRollingMotionCapture();
    }
  }, 1000);
}

function handleFilterSelect(id: FilterId) {
  emit('update:filterId', id);
  if (props.mode === 'ldr' && props.ldrState === 'connected') {
    emit('sendSync', { type: 'sync-filter', filterId: id });
  }
}

function handleCountdownSelect(dur: CountdownDuration) {
  emit('update:countdown', dur);
  if (props.mode === 'ldr' && props.ldrState === 'connected') {
    emit('sendSync', { type: 'sync-countdown', duration: dur });
  }
}

function handleRetake(fromRemote = false) {
  if (props.mode === 'ldr' && !fromRemote && props.ldrState === 'connected') {
    emit('sendSync', { type: 'retake-pose', poseIndex: props.activePoseIndex });
  }
  emit('retakePose');
}

function handleConfirmPose(fromRemote = false) {
  if (props.mode === 'ldr' && !fromRemote && props.ldrState === 'connected') {
    emit('sendSync', { type: 'next-pose', nextIndex: props.activePoseIndex + 1 });
  }
  emit('confirmPose');
}

onMounted(async () => {
  await camera.startCamera();
  attachVideoStreams();
  drawStripProgressPreview();

  unsubscribeSync = props.onSyncMessage((msg) => {
    if (msg.type === 'sync-filter') {
      emit('update:filterId', msg.filterId);
    } else if (msg.type === 'sync-countdown') {
      emit('update:countdown', msg.duration);
    } else if (msg.type === 'start-pose') {
      beginCountdownSequence(msg.duration, true);
    } else if (msg.type === 'capture-now') {
      if (isBusyCapturing.value) {
        performShutterCapture(true);
      }
    } else if (msg.type === 'partner-still') {
      const img = new Image();
      img.onload = () => {
        const hdCanvas = document.createElement('canvas');
        hdCanvas.width = img.naturalWidth;
        hdCanvas.height = img.naturalHeight;
        const ctx = hdCanvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);
        if (props.reviewingPose && props.reviewingPose.poseIndex === msg.poseIndex) {
          emit('poseCaptured', {
            ...props.reviewingPose,
            stillPartner: hdCanvas,
          });
        } else {
          pendingPartnerStills.set(msg.poseIndex, hdCanvas);
        }
      };
      img.src = msg.dataUrl;
    } else if (msg.type === 'retake-pose') {
      emit('retakePose');
    } else if (msg.type === 'next-pose') {
      emit('confirmPose');
    }
  });
});

onUnmounted(() => {
  stopCountdown();
  stopMotionCapture();
  camera.stopCamera();
  unsubscribeSync?.();
});

defineExpose({
  cameraStream: camera.stream,
});
</script>

<template>
  <section class="mx-auto grid max-w-7xl gap-6 px-4 py-5 sm:px-6 lg:grid-cols-12">
    <!-- Camera & Controls Column -->
    <div class="space-y-4 lg:col-span-8 xl:col-span-9">
      <!-- Top Booth Controls Bar -->
      <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3">
        <div class="flex items-center gap-2.5">
          <span class="rounded-lg bg-pink-500/20 px-2.5 py-1 text-xs font-bold text-pink-300">
            Pose {{ activePoseIndex + 1 }} / {{ selectedFrame.poseCount }}
          </span>
          <span
            v-if="isRecordingMotion"
            class="inline-flex items-center gap-1.5 rounded-full bg-rose-500/20 px-2.5 py-1 text-[11px] font-semibold text-rose-300"
          >
            <span class="h-2 w-2 animate-ping rounded-full bg-rose-500" />
            REC LIVE PHOTO
          </span>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <!-- Countdown Selector -->
          <div class="flex items-center rounded-xl border border-slate-800 bg-slate-950 p-1">
            <button
              v-for="sec in ([3, 5, 10] as CountdownDuration[])"
              :key="sec"
              type="button"
              :disabled="isBusyCapturing"
              class="rounded-lg px-2.5 py-1 text-xs font-semibold transition"
              :class="
                countdownDuration === sec
                  ? 'bg-pink-500 text-white'
                  : 'text-slate-400 hover:text-white'
              "
              @click="handleCountdownSelect(sec)"
            >
              {{ sec }}d
            </button>
          </div>

          <!-- Mirror Toggle -->
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition"
            :class="
              camera.isMirrored.value
                ? 'border-pink-500/50 bg-pink-500/15 text-pink-200'
                : 'border-slate-700 bg-slate-950 text-slate-300'
            "
            @click="camera.toggleMirror()"
          >
            <FlipHorizontal2 class="h-3.5 w-3.5" />
            <span>Mirror</span>
          </button>

          <!-- Switch Camera -->
          <button
            type="button"
            :disabled="isBusyCapturing"
            class="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-800"
            @click="camera.toggleFacingMode()"
          >
            <SwitchCamera class="h-3.5 w-3.5" />
            <span>{{ camera.facingMode.value === 'user' ? 'Depan' : 'Belakang' }}</span>
          </button>
        </div>
      </div>

      <!-- Camera Viewport OR Pose Review -->
      <div class="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
        <!-- Camera Error Banner -->
        <div
          v-if="camera.errorMessage.value"
          class="flex min-h-[360px] flex-col items-center justify-center gap-4 p-8 text-center"
        >
          <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-400">
            <Video class="h-7 w-7" />
          </div>
          <div class="max-w-md space-y-1.5">
            <h3 class="font-display text-base font-bold text-white">Kamera Belum Siap</h3>
            <p class="text-xs leading-relaxed text-slate-400">{{ camera.errorMessage.value }}</p>
          </div>
          <button
            type="button"
            class="rounded-xl bg-pink-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-pink-400"
            @click="camera.startCamera()"
          >
            Coba Akses Kamera Lagi
          </button>
        </div>

        <!-- Live Camera Viewfinder -->
        <div
          v-show="!camera.errorMessage.value"
          class="relative w-full overflow-hidden bg-black"
          :class="mode === 'ldr' ? 'grid min-h-[340px] grid-cols-2 sm:min-h-[430px]' : 'aspect-[4/3] max-h-[520px]'"
        >
          <!-- Local Camera -->
          <div class="relative h-full w-full overflow-hidden bg-slate-900">
            <video
              ref="localVideoRef"
              autoplay
              playsinline
              muted
              class="h-full w-full object-cover transition-transform duration-200"
              :style="{
                filter: activeFilterDef.cssFilter,
                transform: camera.isMirrored.value ? 'scaleX(-1)' : 'none',
              }"
            />
            <div
              v-if="activeFilterDef.overlayBg"
              class="pointer-events-none absolute inset-0"
              :style="{ background: activeFilterDef.overlayBg }"
            />
            <span
              v-if="mode === 'ldr'"
              class="absolute bottom-3 left-3 rounded-lg bg-slate-950/75 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur"
            >
              Kamera Kamu
            </span>
          </div>

          <!-- Partner Camera (LDR Mode Only) -->
          <div v-if="mode === 'ldr'" class="relative h-full w-full overflow-hidden border-l border-white/20 bg-slate-900">
            <video
              v-show="remoteStream"
              ref="partnerVideoRef"
              autoplay
              playsinline
              muted
              class="h-full w-full object-cover"
              :style="{ filter: activeFilterDef.cssFilter }"
            />
            <div
              v-if="remoteStream && activeFilterDef.overlayBg"
              class="pointer-events-none absolute inset-0"
              :style="{ background: activeFilterDef.overlayBg }"
            />
            <div
              v-if="!remoteStream"
              class="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-slate-400"
            >
              <Users class="h-8 w-8 text-cyan-400/70" />
              <p class="text-xs font-medium text-slate-300">
                {{ ldrState === 'connected' ? 'Menunggu video pasangan...' : 'Pasangan belum terhubung' }}
              </p>
            </div>
            <span
              class="absolute bottom-3 right-3 rounded-lg bg-slate-950/75 px-2.5 py-1 text-[11px] font-semibold text-cyan-300 backdrop-blur"
            >
              Pasangan
            </span>
          </div>

          <!-- Big Countdown Number Overlay -->
          <div
            v-if="countdownRemaining !== null"
            class="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/25 backdrop-blur-[1px]"
          >
            <div
              class="flex h-28 w-28 items-center justify-center rounded-full border-4 border-white/70 bg-slate-950/70 font-display text-6xl font-extrabold text-white shadow-2xl"
            >
              {{ countdownRemaining }}
            </div>
          </div>

          <!-- Shutter Flash Effect -->
          <div
            v-if="showFlash"
            class="animate-shutter-flash pointer-events-none absolute inset-0 z-20 bg-white"
          />

          <!-- Pose Review & Retake Overlay -->
          <div
            v-if="reviewingPose"
            class="absolute inset-0 z-30 flex flex-col justify-between bg-slate-950/95 p-4 sm:p-5"
          >
            <div class="flex items-center justify-between">
              <div>
                <span class="text-xs font-bold uppercase tracking-wider text-pink-400">
                  Review Pose {{ reviewingPose.poseIndex + 1 }}
                </span>
                <p class="text-xs text-slate-400">
                  Sudah oke atau mau ulang pose ini? Pose sebelumnya tetap aman tersimpan.
                </p>
              </div>
              <span class="rounded-lg bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                Live Clip: {{ reviewingPose.motionFrames.length }} frame
              </span>
            </div>

            <div class="my-3 flex flex-1 items-center justify-center overflow-hidden">
              <canvas
                ref="reviewCanvasRef"
                class="max-h-full max-w-full rounded-xl border border-slate-700 object-contain shadow-2xl"
              />
            </div>

            <div class="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                class="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-5 py-3 text-sm font-bold text-white transition hover:border-amber-400/50 hover:bg-slate-700"
                @click="handleRetake(false)"
              >
                <RefreshCw class="h-4 w-4" />
                <span>Retake Pose Ini</span>
              </button>

              <button
                type="button"
                class="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/25 transition hover:brightness-110"
                @click="handleConfirmPose(false)"
              >
                <Check class="h-4 w-4" />
                <span>{{ isFinalPose ? 'Kunci & Lihat Hasil Akhir' : 'Lanjut Pose Berikutnya' }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Shutter & Filter Strip -->
        <div class="space-y-4 border-t border-slate-800 bg-slate-900/90 p-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-2 text-xs text-slate-300">
              <Sparkles class="h-4 w-4 text-pink-400" />
              <span class="font-semibold">Filter Aktif:</span>
              <span class="rounded-md bg-slate-800 px-2 py-0.5 font-semibold text-white">
                {{ activeFilterDef.name }}
              </span>
            </div>

            <button
              type="button"
              :disabled="isBusyCapturing || !!reviewingPose || !!camera.errorMessage.value"
              class="inline-flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-pink-500 via-rose-500 to-violet-600 px-7 py-3 text-sm font-bold text-white shadow-lg shadow-pink-500/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              @click="beginCountdownSequence(countdownDuration, false)"
            >
              <Camera class="h-5 w-5" />
              <span>
                {{
                  isBusyCapturing
                    ? 'Bersiap...'
                    : `Ambil Foto Pose ${activePoseIndex + 1}`
                }}
              </span>
            </button>
          </div>

          <!-- 9 Real-Time Filter Chips -->
          <div class="flex gap-2 overflow-x-auto pb-1">
            <button
              v-for="f in FILTERS"
              :key="f.id"
              type="button"
              class="flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition"
              :class="
                activeFilterId === f.id
                  ? 'border-pink-500 bg-pink-500/15 text-white ring-1 ring-pink-500/40'
                  : 'border-slate-800 bg-slate-950/70 text-slate-300 hover:border-slate-700 hover:text-white'
              "
              @click="handleFilterSelect(f.id)"
            >
              <span
                class="h-3.5 w-3.5 rounded-full border border-white/30"
                :style="{ backgroundColor: f.swatchColor }"
              />
              <span>{{ f.name }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Right Progress Strip Column -->
    <div class="lg:col-span-4 xl:col-span-3">
      <div class="sticky top-24 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-xl">
        <div class="mb-3 flex items-center justify-between">
          <div>
            <div class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Progres Bingkai</div>
            <h3 class="font-display text-sm font-bold text-white">{{ selectedFrame.name }}</h3>
          </div>
          <span class="rounded-lg bg-slate-800 px-2 py-0.5 text-xs font-bold text-pink-300">
            {{ capturedPoses.length }}/{{ selectedFrame.poseCount }}
          </span>
        </div>

        <div class="flex justify-center rounded-xl border border-slate-800 bg-slate-950 p-3">
          <canvas
            ref="stripPreviewCanvasRef"
            class="max-h-[380px] w-auto rounded-lg shadow-xl"
          />
        </div>

        <div class="mt-3 grid grid-cols-4 gap-1.5">
          <div
            v-for="idx in selectedFrame.poseCount"
            :key="idx"
            class="rounded-lg border py-1.5 text-center text-[11px] font-bold"
            :class="
              capturedPoses.some((p) => p.poseIndex === idx - 1)
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                : activePoseIndex === idx - 1
                  ? 'border-pink-500/60 bg-pink-500/15 text-pink-300'
                  : 'border-slate-800 bg-slate-950 text-slate-500'
            "
          >
            P{{ idx }}
            {{ capturedPoses.some((p) => p.poseIndex === idx - 1) ? '✓' : '' }}
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
