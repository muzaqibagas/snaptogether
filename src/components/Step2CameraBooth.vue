<script setup lang="ts">
import {
  Camera,
  Check,
  FlipHorizontal2,
  Heart,
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
    localVideoRef.value.play?.().catch(() => {});
  }
  if (partnerVideoRef.value && props.remoteStream) {
    partnerVideoRef.value.srcObject = props.remoteStream;
    partnerVideoRef.value.play?.().catch(() => {});
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
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
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
  <section class="safe-x safe-bottom mx-auto grid max-w-7xl gap-5 py-4 sm:py-5 lg:grid-cols-12 lg:gap-6">
    <!-- Camera & Controls Column -->
    <div class="space-y-4 lg:col-span-8 xl:col-span-9">
      <!-- Top Booth Controls Bar -->
      <div
        class="sticker-card flex flex-wrap items-center justify-between gap-2.5 rounded-2xl px-3.5 py-2.5 sm:px-4 sm:py-3"
      >
        <div class="flex flex-wrap items-center gap-2">
          <span
            class="inline-flex items-center gap-1.5 rounded-full border border-[#f5bfd1] bg-[#fff0f5] px-3 py-1 text-xs font-extrabold text-[#c92a5d]"
          >
            <Heart class="h-3.5 w-3.5 fill-[#f05483] text-[#f05483]" />
            Pose {{ activePoseIndex + 1 }} / {{ selectedFrame.poseCount }}
          </span>
          <span
            v-if="isRecordingMotion"
            class="inline-flex items-center gap-1.5 rounded-full border border-[#f6b1c4] bg-[#ffe7ef] px-2.5 py-1 text-[11px] font-extrabold text-[#be1e4d]"
          >
            <span class="h-2 w-2 animate-ping rounded-full bg-[#f05483]" />
            REKAM LIVE PHOTO
          </span>
        </div>

        <div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <!-- Countdown Selector -->
          <div class="flex items-center rounded-xl border-2 border-[#f3d4de] bg-[#fff5f7] p-0.5">
            <button
              v-for="sec in ([3, 5, 10] as CountdownDuration[])"
              :key="sec"
              type="button"
              :disabled="isBusyCapturing || !!reviewingPose"
              class="min-h-[34px] rounded-lg px-2.5 py-1 text-xs font-extrabold transition"
              :class="
                countdownDuration === sec
                  ? 'bg-[#f05483] text-white shadow-xs'
                  : 'text-[#7e5866] hover:text-[#3b212a]'
              "
              @click="handleCountdownSelect(sec)"
            >
              {{ sec }}d
            </button>
          </div>

          <!-- Mirror Toggle -->
          <button
            type="button"
            class="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border-2 px-3 py-1.5 text-xs font-bold transition"
            :class="
              camera.isMirrored.value
                ? 'border-[#f05483] bg-[#fff0f5] text-[#c92a5d]'
                : 'border-[#f3d4de] bg-white text-[#6a4552]'
            "
            @click="camera.toggleMirror()"
          >
            <FlipHorizontal2 class="h-3.5 w-3.5" />
            <span>Mirror</span>
          </button>

          <!-- Switch Camera -->
          <button
            type="button"
            :disabled="isBusyCapturing || !!reviewingPose"
            class="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border-2 border-[#f3d4de] bg-white px-3 py-1.5 text-xs font-bold text-[#5e3b47] transition hover:border-[#ebafc2] hover:bg-[#fff5f8] disabled:opacity-50"
            @click="camera.toggleFacingMode()"
          >
            <SwitchCamera class="h-3.5 w-3.5 text-[#e44b7b]" />
            <span>{{ camera.facingMode.value === 'user' ? 'Depan' : 'Belakang' }}</span>
          </button>
        </div>
      </div>

      <!-- Camera Polaroid Frame Card -->
      <div class="sticker-card overflow-hidden rounded-[26px] p-2.5 sm:p-4">
        <!-- Camera Error Banner -->
        <div
          v-if="camera.errorMessage.value"
          class="flex min-h-[300px] flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-[#f2c2d2] bg-[#fff5f7] p-6 text-center sm:min-h-[380px] sm:p-8"
        >
          <div
            class="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-[#f5c0d0] bg-white text-[#e44b7b] shadow-xs"
          >
            <Video class="h-7 w-7" />
          </div>
          <div class="max-w-md space-y-1.5">
            <h3 class="font-display text-lg font-bold text-[#3b212a]">Izin Kamera Diperlukan ♡</h3>
            <p class="text-xs leading-relaxed text-[#785360] sm:text-sm">{{ camera.errorMessage.value }}</p>
          </div>
          <button
            type="button"
            class="btn-strawberry min-h-[44px] rounded-xl px-5 py-2.5 text-xs font-extrabold"
            @click="camera.startCamera()"
          >
            Izinkan &amp; Nyalakan Kamera
          </button>
        </div>

        <!-- Live Camera Viewfinder (kept mounted with v-show so iOS/Android camera never freezes on review) -->
        <div
          v-show="!camera.errorMessage.value && !reviewingPose"
          class="relative w-full overflow-hidden rounded-2xl border-2 border-[#f3d1dc] bg-[#2a1820]"
          :class="
            mode === 'ldr'
              ? 'grid min-h-[260px] grid-cols-2 aspect-[4/3] sm:min-h-[400px]'
              : 'aspect-[3/4] max-h-[54dvh] sm:aspect-[4/3] sm:max-h-[500px]'
          "
        >
          <!-- Local Camera -->
          <div class="relative h-full w-full overflow-hidden bg-[#2b1921]">
            <video
              ref="localVideoRef"
              autoplay
              playsinline
              muted
              webkit-playsinline="true"
              disablePictureInPicture
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
              class="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 rounded-full border border-white/60 bg-[#fff5f8]/90 px-2.5 py-1 text-[11px] font-extrabold text-[#c92a5d] shadow-xs backdrop-blur-xs"
            >
              Kamu ♡
            </span>
          </div>

          <!-- Partner Camera (LDR Mode Only) -->
          <div
            v-if="mode === 'ldr'"
            class="relative h-full w-full overflow-hidden border-l-2 border-white/75 bg-[#222838]"
          >
            <video
              v-show="remoteStream"
              ref="partnerVideoRef"
              autoplay
              playsinline
              muted
              webkit-playsinline="true"
              disablePictureInPicture
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
              class="flex h-full flex-col items-center justify-center gap-2 bg-[#f5f9ff] p-3 text-center"
            >
              <div class="flex h-11 w-11 items-center justify-center rounded-full bg-[#dceeff] text-[#357ec7]">
                <Users class="h-5 w-5" />
              </div>
              <p class="text-xs font-bold text-[#35506d]">
                {{ ldrState === 'connected' ? 'Menunggu kamera pasangan...' : 'Si dia belum terhubung' }}
              </p>
            </div>
            <span
              class="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-full border border-white/60 bg-[#eef7ff]/90 px-2.5 py-1 text-[11px] font-extrabold text-[#1e609d] shadow-xs backdrop-blur-xs"
            >
              Pasangan ♡
            </span>
          </div>

          <!-- Big Cute Countdown Overlay -->
          <div
            v-if="countdownRemaining !== null"
            class="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#3b1d2a]/20 backdrop-blur-[1px]"
          >
            <div
              class="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-[#f05483]/90 font-display text-5xl font-bold text-white shadow-[0_10px_30px_rgba(240,84,131,0.5)] sm:h-28 sm:w-28 sm:text-6xl"
            >
              {{ countdownRemaining }}
            </div>
          </div>

          <!-- Shutter Flash Effect -->
          <div
            v-if="showFlash"
            class="animate-shutter-flash pointer-events-none absolute inset-0 z-20 bg-white"
          />
        </div>

        <!-- Pose Review & Retake View (natural flow so buttons never clip on iOS/Android) -->
        <div
          v-if="reviewingPose"
          class="flex flex-col justify-between gap-4 rounded-2xl border-2 border-[#f4ceda] bg-[#fff5f8] p-3.5 sm:p-5"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span class="font-display text-sm font-bold text-[#c92a5d] sm:text-base">
                Gemes Banget? Review Pose {{ reviewingPose.poseIndex + 1 }} ♡
              </span>
              <p class="text-xs text-[#785360]">
                Udah oke atau mau ulang gaya? Pose sebelumnya tetap aman tersimpan.
              </p>
            </div>
            <span
              class="rounded-full border border-[#a8e2c3] bg-[#e9fbf1] px-2.5 py-1 text-[11px] font-extrabold text-[#17794d]"
            >
              Live Clip: {{ reviewingPose.motionFrames.length }} frame
            </span>
          </div>

          <div class="flex items-center justify-center overflow-hidden rounded-2xl border-2 border-[#f4d4df] bg-white p-2.5 shadow-inner">
            <canvas
              ref="reviewCanvasRef"
              class="max-h-[44dvh] max-w-full rounded-xl object-contain shadow-md sm:max-h-[420px]"
            />
          </div>

          <div class="flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-center sm:gap-3">
            <button
              type="button"
              class="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl border-2 border-[#f2c4d4] bg-white px-5 py-3 text-sm font-bold text-[#613c49] transition hover:border-[#f09bb4] hover:bg-[#fff0f4]"
              @click="handleRetake(false)"
            >
              <RefreshCw class="h-4 w-4" />
              <span>Ulang Pose Ini</span>
            </button>

            <button
              type="button"
              class="btn-matcha inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl px-6 py-3 text-sm font-extrabold"
              @click="handleConfirmPose(false)"
            >
              <Check class="h-4 w-4" />
              <span>{{ isFinalPose ? 'Selesai! Lihat Hasilnya ✨' : 'Simpan & Lanjut Pose ♡' }}</span>
            </button>
          </div>
        </div>

        <!-- Shutter Button & 9 Real-Time Filter Strip -->
        <div class="mt-3.5 space-y-3.5 border-t-2 border-dashed border-[#f5d5e0] pt-3.5 sm:mt-4 sm:pt-4">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex items-center gap-2 text-xs text-[#6d4956]">
              <Sparkles class="h-4 w-4 shrink-0 text-[#f05483]" />
              <span class="font-bold">Filter Aktif:</span>
              <span class="rounded-full border border-[#f2ceda] bg-[#fff2f6] px-2.5 py-0.5 font-extrabold text-[#b82857]">
                {{ activeFilterDef.name }}
              </span>
            </div>

            <button
              type="button"
              :disabled="isBusyCapturing || !!reviewingPose || !!camera.errorMessage.value"
              class="btn-strawberry inline-flex min-h-[50px] w-full items-center justify-center gap-2.5 rounded-2xl px-7 py-3 text-sm font-extrabold disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              @click="beginCountdownSequence(countdownDuration, false)"
            >
              <Camera class="h-5 w-5" />
              <span>
                {{
                  isBusyCapturing
                    ? 'Tahan Pose Cantik...'
                    : `Cekrek Pose ${activePoseIndex + 1} ♡`
                }}
              </span>
            </button>
          </div>

          <!-- 9 Real-Time Filter Chips (horizontal swipe-friendly on mobile) -->
          <div class="touch-scroll-x flex gap-2 overflow-x-auto pb-1.5">
            <button
              v-for="f in FILTERS"
              :key="f.id"
              type="button"
              class="flex min-h-[40px] shrink-0 items-center gap-2 rounded-xl border-2 px-3 py-1.5 text-xs font-bold transition"
              :class="
                activeFilterId === f.id
                  ? 'border-[#f05483] bg-[#fff0f5] text-[#be2152] shadow-[0_2px_0_#f7c5d5]'
                  : 'border-[#f3d9e2] bg-white text-[#6a4552] hover:border-[#eab6c6] hover:bg-[#fff7f9]'
              "
              @click="handleFilterSelect(f.id)"
            >
              <span
                class="h-4 w-4 rounded-full border border-black/15 shadow-inner"
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
      <div class="sticker-card relative rounded-[24px] p-4 pt-6 lg:sticky lg:top-24">
        <div
          class="washi-tape-butter pointer-events-none absolute -top-3 left-1/2 h-6 w-24 -translate-x-1/2 rotate-2 rounded-xs"
          aria-hidden="true"
        />

        <div class="mb-3 flex items-center justify-between gap-2">
          <div>
            <div class="font-hand text-sm font-bold text-[#c77d19]">Progres Strip Kalian</div>
            <h3 class="font-display text-sm font-bold text-[#3b212a]">{{ selectedFrame.name }}</h3>
          </div>
          <span
            class="rounded-full border border-[#f5c7d7] bg-[#fff0f5] px-2.5 py-0.5 text-xs font-extrabold text-[#c92a5d]"
          >
            {{ capturedPoses.length }}/{{ selectedFrame.poseCount }}
          </span>
        </div>

        <div class="mb-3 grid grid-cols-4 gap-1.5">
          <div
            v-for="idx in selectedFrame.poseCount"
            :key="idx"
            class="rounded-xl border-2 py-1.5 text-center text-[11px] font-extrabold transition"
            :class="
              capturedPoses.some((p) => p.poseIndex === idx - 1)
                ? 'border-[#96deb8] bg-[#e9fbf1] text-[#17794d]'
                : activePoseIndex === idx - 1
                  ? 'border-[#f05483] bg-[#fff0f5] text-[#c92a5d]'
                  : 'border-[#f3dae3] bg-white text-[#a78390]'
            "
          >
            P{{ idx }}
            {{ capturedPoses.some((p) => p.poseIndex === idx - 1) ? '✓' : '' }}
          </div>
        </div>

        <div class="flex justify-center rounded-2xl border-2 border-[#f4d7e1] bg-[#fff5f7] p-3">
          <canvas
            ref="stripPreviewCanvasRef"
            class="max-h-[280px] w-auto rounded-lg shadow-[0_8px_20px_rgba(120,45,70,0.16)] lg:max-h-[370px]"
          />
        </div>
      </div>
    </div>
  </section>
</template>
