import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SESSION_DURATION_SECONDS,
  formatTimerSeconds,
  useSessionTimer,
} from '../useSessionTimer';

describe('useSessionTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats seconds as MM:SS', () => {
    expect(formatTimerSeconds(600)).toBe('10:00');
    expect(formatTimerSeconds(65)).toBe('01:05');
    expect(formatTimerSeconds(0)).toBe('00:00');
  });

  it('defaults to 10 minutes (600s) and triggers onTimeout at 00:00', () => {
    const onTimeout = vi.fn();
    const timer = useSessionTimer(onTimeout);

    expect(timer.remainingSeconds.value).toBe(DEFAULT_SESSION_DURATION_SECONDS);
    expect(timer.formattedTime.value).toBe('10:00');
    expect(timer.isActive.value).toBe(false);

    timer.startTimer();
    expect(timer.isActive.value).toBe(true);

    vi.advanceTimersByTime(1000);
    expect(timer.remainingSeconds.value).toBe(599);
    expect(timer.formattedTime.value).toBe('09:59');

    vi.advanceTimersByTime(598 * 1000);
    expect(timer.isCritical.value).toBe(true);
    expect(onTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(timer.remainingSeconds.value).toBe(0);
    expect(timer.isActive.value).toBe(false);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('resets back to 10:00 cleanly', () => {
    const timer = useSessionTimer(() => {});
    timer.startTimer();
    vi.advanceTimersByTime(30000);
    expect(timer.remainingSeconds.value).toBe(570);

    timer.resetTimer();
    expect(timer.remainingSeconds.value).toBe(600);
    expect(timer.isActive.value).toBe(false);
  });
});
