<script setup lang="ts">
import { AlertTriangle, X } from 'lucide-vue-next';
import { onMounted, ref, watch } from 'vue';
import DigitalGalleryView from './components/DigitalGalleryView.vue';
import Step1FrameSelection from './components/Step1FrameSelection.vue';
import Step2CameraBooth from './components/Step2CameraBooth.vue';
import Step3ResultsGallery from './components/Step3ResultsGallery.vue';
import TopHeader from './components/TopHeader.vue';
import { useBoothSession } from './composables/useBoothSession';
import { useLdrPeer } from './composables/useLdrPeer';
import { useSessionTimer } from './composables/useSessionTimer';
import type { BoothMode, CapturedPose, GeneratedAssets } from './types/booth';

const booth = useBoothSession();
const ldrPeer = useLdrPeer();

const step2Ref = ref<InstanceType<typeof Step2CameraBooth> | null>(null);
const qrGalleryPeerId = ref<string | null>(null);
const showLocalGalleryView = ref(false);

const sessionTimer = useSessionTimer(() => {
  ldrPeer.cleanupPeer();
  showLocalGalleryView.value = false;
  booth.resetSession({ timedOut: true });
});

// Keep SessionState timer fields synced
watch(
  () => sessionTimer.remainingSeconds.value,
  (val) => {
    booth.state.timerRemainingSeconds = val;
  },
);
watch(
  () => sessionTimer.isActive.value,
  (val) => {
    booth.state.isTimerActive = val;
  },
);

// Attach Step 2 camera stream to LDR PeerJS when available
watch(
  () => step2Ref.value?.cameraStream,
  (stream) => {
    if (booth.state.mode === 'ldr') {
      ldrPeer.attachLocalStream(stream ?? null);
    }
  },
);

function handleModeChange(mode: BoothMode) {
  booth.setMode(mode);
  if (mode === 'solo') {
    ldrPeer.cleanupPeer();
  }
}

async function handleCreateLdrRoom() {
  try {
    await ldrPeer.createHostRoom();
  } catch {
    // Error handled reactively by ldrPeer.errorMessage
  }
}

async function handleJoinLdrRoom(code: string) {
  await ldrPeer.joinGuestRoom(code);
}

function handleStartSession() {
  if (booth.state.mode === 'ldr' && ldrPeer.connectionState.value === 'connected') {
    ldrPeer.sendSyncMessage({ type: 'enter-booth', frameId: booth.state.selectedFrameId });
  }
  booth.goToStep(2);
}

function handleSelectFrame(frameId: string) {
  booth.selectFrame(frameId);
  if (booth.state.mode === 'ldr' && ldrPeer.connectionState.value === 'connected') {
    ldrPeer.sendSyncMessage({ type: 'sync-frame', frameId });
  }
}

function handleFirstShutter() {
  sessionTimer.startTimer();
}

function handlePoseCaptured(pose: CapturedPose) {
  booth.setReviewingPose(pose);
}

function handleConfirmPose() {
  booth.commitReviewedPose();
}

function handleAssetsReady(assets: GeneratedAssets) {
  booth.generatedAssets.value = assets;
}

function handleFullReset() {
  sessionTimer.resetTimer();
  ldrPeer.cleanupPeer();
  showLocalGalleryView.value = false;
  booth.resetSession();
}

function exitRemoteGalleryToBooth() {
  qrGalleryPeerId.value = null;
  const cleanUrl = `${window.location.origin}${window.location.pathname}`;
  window.history.replaceState({}, '', cleanUrl);
}

onMounted(() => {
  ldrPeer.onSyncMessage((msg) => {
    if (msg.type === 'sync-frame') {
      booth.selectFrame(msg.frameId);
    } else if (msg.type === 'enter-booth') {
      booth.selectFrame(msg.frameId);
      booth.goToStep(2);
    }
  });

  const params = new URLSearchParams(window.location.search);
  const galleryParam = params.get('gallery');
  const roomParam = params.get('room');

  if (galleryParam) {
    qrGalleryPeerId.value = galleryParam;
    return;
  }

  if (roomParam) {
    booth.setMode('ldr');
    ldrPeer.joinGuestRoom(roomParam);
  }
});
</script>

<template>
  <!-- Dedicated QR Digital Gallery Route (from phone scan OR in-app button) -->
  <DigitalGalleryView
    v-if="qrGalleryPeerId || showLocalGalleryView"
    :peer-gallery-id="qrGalleryPeerId"
    :local-assets="showLocalGalleryView ? booth.generatedAssets.value : null"
    @back="showLocalGalleryView = false"
    @new-session="exitRemoteGalleryToBooth"
  />

  <!-- Main 3-Step Photobooth Application -->
  <div v-else class="relative min-h-screen overflow-x-hidden bg-slate-950 text-slate-100">
    <!-- Ambient Decorative Background Glows -->
    <div class="pointer-events-none fixed inset-0 overflow-hidden">
      <div class="absolute -left-28 -top-28 h-96 w-96 rounded-full bg-pink-600/15 blur-3xl" />
      <div class="absolute -right-28 top-1/3 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
      <div class="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-violet-600/10 blur-3xl" />
    </div>

    <div class="relative z-10">
      <TopHeader
        :current-step="booth.state.currentStep"
        :mode="booth.state.mode"
        :formatted-time="sessionTimer.formattedTime.value"
        :is-timer-active="sessionTimer.isActive.value"
        :is-warning="sessionTimer.isWarning.value"
        :is-critical="sessionTimer.isCritical.value"
        :is-muted="booth.isMuted.value"
        :ldr-state="ldrPeer.connectionState.value"
        @toggle-mute="booth.isMuted.value = !booth.isMuted.value"
        @reset="handleFullReset"
      />

      <!-- Session Timeout Banner -->
      <div
        v-if="booth.showTimeoutBanner.value"
        class="mx-auto mt-4 flex max-w-4xl items-center justify-between gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/15 px-4 py-3 text-xs text-amber-200"
      >
        <div class="flex items-center gap-2.5">
          <AlertTriangle class="h-4 w-4 shrink-0 text-amber-400" />
          <span>
            <strong>Waktu sesi 10 menit telah habis.</strong> Memori sementara dibersihkan dan sesi baru telah disiapkan.
          </span>
        </div>
        <button
          type="button"
          class="rounded-lg p-1 hover:bg-amber-500/20"
          @click="booth.showTimeoutBanner.value = false"
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      <!-- Step 1: Frame & Mode Selection -->
      <Step1FrameSelection
        v-if="booth.state.currentStep === 1"
        :mode="booth.state.mode"
        :frames="booth.allFrames.value"
        :selected-frame="booth.selectedFrame.value"
        :active-filter-id="booth.state.activeFilterId"
        :ldr-state="ldrPeer.connectionState.value"
        :ldr-room-code="ldrPeer.roomCode.value"
        :ldr-error="ldrPeer.errorMessage.value"
        :ldr-is-host="ldrPeer.isHost.value"
        @update:mode="handleModeChange"
        @select-frame="handleSelectFrame"
        @add-custom-frame="booth.addCustomFrame"
        @create-ldr-room="handleCreateLdrRoom"
        @join-ldr-room="handleJoinLdrRoom"
        @start-session="handleStartSession"
      />

      <!-- Step 2: Camera Booth, Real-Time Filters & Per-Pose Retake -->
      <Step2CameraBooth
        v-else-if="booth.state.currentStep === 2"
        ref="step2Ref"
        :mode="booth.state.mode"
        :selected-frame="booth.selectedFrame.value"
        :active-filter-id="booth.state.activeFilterId"
        :countdown-duration="booth.state.countdownDuration"
        :active-pose-index="booth.activePoseIndex.value"
        :captured-poses="booth.state.capturedPoses"
        :reviewing-pose="booth.reviewingPose.value"
        :is-muted="booth.isMuted.value"
        :ldr-state="ldrPeer.connectionState.value"
        :remote-stream="ldrPeer.remoteStream.value"
        :on-sync-message="ldrPeer.onSyncMessage"
        @update:filter-id="booth.setFilter"
        @update:countdown="booth.setCountdownDuration"
        @first-shutter-pressed="handleFirstShutter"
        @pose-captured="handlePoseCaptured"
        @retake-pose="booth.retakeActivePose"
        @confirm-pose="handleConfirmPose"
        @send-sync="ldrPeer.sendSyncMessage"
      />

      <!-- Step 3: Results, Live Photo Video, 4 Assets & QR Gallery -->
      <Step3ResultsGallery
        v-else-if="booth.state.currentStep === 3"
        :mode="booth.state.mode"
        :selected-frame="booth.selectedFrame.value"
        :active-filter-id="booth.state.activeFilterId"
        :captured-poses="booth.state.capturedPoses"
        :formatted-time-remaining="sessionTimer.formattedTime.value"
        @assets-ready="handleAssetsReady"
        @open-digital-gallery="showLocalGalleryView = true"
        @start-new-session="handleFullReset"
      />
    </div>
  </div>
</template>
