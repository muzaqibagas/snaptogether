import { computed, reactive, ref } from 'vue';
import { PRESET_FRAMES } from '../constants/frames';
import type {
  BoothMode,
  CapturedPose,
  CountdownDuration,
  FilterId,
  FramePreset,
  GeneratedAssets,
  SessionState,
} from '../types/booth';
import { DEFAULT_SESSION_DURATION_SECONDS } from './useSessionTimer';

export function useBoothSession() {
  const state = reactive<SessionState>({
    currentStep: 1,
    mode: 'solo',
    selectedFrameId: PRESET_FRAMES[0].id,
    activeFilterId: 'normal',
    countdownDuration: 3,
    timerRemainingSeconds: DEFAULT_SESSION_DURATION_SECONDS,
    isTimerActive: false,
    capturedPoses: [],
  });

  const customFrames = ref<FramePreset[]>([]);
  const activePoseIndex = ref(0);
  const reviewingPose = ref<CapturedPose | null>(null);
  const isCapturing = ref(false);
  const isMuted = ref(false);
  const generatedAssets = ref<GeneratedAssets | null>(null);
  const isGeneratingAssets = ref(false);
  const showTimeoutBanner = ref(false);

  const allFrames = computed<FramePreset[]>(() => [
    ...PRESET_FRAMES,
    ...customFrames.value,
  ]);

  const selectedFrame = computed<FramePreset>(() => {
    return (
      allFrames.value.find((f) => f.id === state.selectedFrameId) ?? PRESET_FRAMES[0]
    );
  });

  const totalPosesRequired = computed(() => selectedFrame.value.poseCount);

  const lockedPosesCount = computed(() => state.capturedPoses.length);

  function setMode(mode: BoothMode) {
    state.mode = mode;
  }

  function selectFrame(frameId: string) {
    state.selectedFrameId = frameId;
  }

  function addCustomFrame(frame: FramePreset) {
    customFrames.value = [frame, ...customFrames.value];
    state.selectedFrameId = frame.id;
  }

  function setFilter(filterId: FilterId) {
    state.activeFilterId = filterId;
  }

  function setCountdownDuration(duration: CountdownDuration) {
    state.countdownDuration = duration;
  }

  function goToStep(step: 1 | 2 | 3) {
    state.currentStep = step;
  }

  function setReviewingPose(pose: CapturedPose | null) {
    reviewingPose.value = pose;
  }

  /**
   * Locks the currently reviewed pose without erasing previously locked poses.
   * Returns true if all poses are now filled and session should advance to Step 3.
   */
  function commitReviewedPose(): boolean {
    if (!reviewingPose.value) return false;
    const pose = reviewingPose.value;

    const existingIdx = state.capturedPoses.findIndex(
      (p) => p.poseIndex === pose.poseIndex,
    );
    if (existingIdx >= 0) {
      state.capturedPoses.splice(existingIdx, 1, pose);
    } else {
      state.capturedPoses.push(pose);
      state.capturedPoses.sort((a, b) => a.poseIndex - b.poseIndex);
    }

    reviewingPose.value = null;

    if (state.capturedPoses.length >= totalPosesRequired.value) {
      state.currentStep = 3;
      return true;
    }

    // Move to the next uncaptured pose slot
    for (let i = 0; i < totalPosesRequired.value; i++) {
      const hasPose = state.capturedPoses.some((p) => p.poseIndex === i);
      if (!hasPose) {
        activePoseIndex.value = i;
        break;
      }
    }
    return false;
  }

  /**
   * Discards only the active unconfirmed pose so user can retake it without losing earlier locked poses.
   */
  function retakeActivePose() {
    reviewingPose.value = null;
  }

  function revokeGeneratedAssetUrls() {
    const assets = generatedAssets.value;
    if (!assets) return;

    if (assets.mainFramedPng.url) URL.revokeObjectURL(assets.mainFramedPng.url);
    if (assets.livePhotoVideo.url) URL.revokeObjectURL(assets.livePhotoVideo.url);
    if (assets.storyVideo.url) URL.revokeObjectURL(assets.storyVideo.url);
    for (const raw of assets.rawPoses) {
      if (raw.url) URL.revokeObjectURL(raw.url);
    }
    generatedAssets.value = null;
  }

  function resetSession(options?: { timedOut?: boolean }) {
    revokeGeneratedAssetUrls();
    state.capturedPoses = [];
    reviewingPose.value = null;
    activePoseIndex.value = 0;
    isCapturing.value = false;
    isGeneratingAssets.value = false;
    state.timerRemainingSeconds = DEFAULT_SESSION_DURATION_SECONDS;
    state.isTimerActive = false;
    state.currentStep = 1;
    if (options?.timedOut) {
      showTimeoutBanner.value = true;
    }
  }

  return {
    state,
    customFrames,
    allFrames,
    selectedFrame,
    totalPosesRequired,
    lockedPosesCount,
    activePoseIndex,
    reviewingPose,
    isCapturing,
    isMuted,
    generatedAssets,
    isGeneratingAssets,
    showTimeoutBanner,
    setMode,
    selectFrame,
    addCustomFrame,
    setFilter,
    setCountdownDuration,
    goToStep,
    setReviewingPose,
    commitReviewedPose,
    retakeActivePose,
    revokeGeneratedAssetUrls,
    resetSession,
  };
}
