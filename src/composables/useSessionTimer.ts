import { computed, getCurrentInstance, onUnmounted, ref } from 'vue';

export const DEFAULT_SESSION_DURATION_SECONDS = 600; // 10 minutes

export function formatTimerSeconds(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function useSessionTimer(onTimeout: () => void, initialSeconds = DEFAULT_SESSION_DURATION_SECONDS) {
  const remainingSeconds = ref(initialSeconds);
  const isActive = ref(false);
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const formattedTime = computed(() => formatTimerSeconds(remainingSeconds.value));
  const isWarning = computed(() => isActive.value && remainingSeconds.value <= 120 && remainingSeconds.value > 30);
  const isCritical = computed(() => isActive.value && remainingSeconds.value <= 30);

  function clearTicker() {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  /**
   * Starts the 10-minute global session countdown once (idempotent if already active).
   */
  function startTimer() {
    if (isActive.value) return;
    isActive.value = true;
    clearTicker();
    intervalId = setInterval(() => {
      if (remainingSeconds.value <= 1) {
        remainingSeconds.value = 0;
        isActive.value = false;
        clearTicker();
        onTimeout();
        return;
      }
      remainingSeconds.value -= 1;
    }, 1000);
  }

  function resetTimer() {
    clearTicker();
    isActive.value = false;
    remainingSeconds.value = initialSeconds;
  }

  if (getCurrentInstance()) {
    onUnmounted(() => {
      clearTicker();
    });
  }

  return {
    remainingSeconds,
    isActive,
    formattedTime,
    isWarning,
    isCritical,
    startTimer,
    resetTimer,
  };
}
