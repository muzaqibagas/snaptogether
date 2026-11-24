import { describe, expect, it } from 'vitest';
import type { CapturedPose } from '../../types/booth';
import { useBoothSession } from '../useBoothSession';

function makeMockPose(poseIndex: number): CapturedPose {
  const canvas = document.createElement('canvas');
  return {
    poseIndex,
    stillLocal: canvas,
    motionFrames: [],
  };
}

describe('useBoothSession', () => {
  it('supports per-pose review & retake without erasing earlier locked poses', () => {
    const booth = useBoothSession();
    // ocean-breeze has 3 poses
    expect(booth.selectedFrame.value.poseCount).toBe(3);

    booth.goToStep(2);

    // Capture & lock Pose 0
    const pose0 = makeMockPose(0);
    booth.setReviewingPose(pose0);
    expect(booth.commitReviewedPose()).toBe(false);
    expect(booth.lockedPosesCount.value).toBe(1);
    expect(booth.activePoseIndex.value).toBe(1);

    // Capture Pose 1, then retake Pose 1
    booth.setReviewingPose(makeMockPose(1));
    booth.retakeActivePose();
    expect(booth.reviewingPose.value).toBeNull();
    // Pose 0 must still be safely locked!
    expect(booth.lockedPosesCount.value).toBe(1);
    expect(booth.state.capturedPoses[0]).toStrictEqual(pose0);
    expect(booth.activePoseIndex.value).toBe(1);

    // Re-capture & lock Pose 1 and Pose 2 -> should advance to Step 3
    booth.setReviewingPose(makeMockPose(1));
    expect(booth.commitReviewedPose()).toBe(false);
    expect(booth.activePoseIndex.value).toBe(2);

    booth.setReviewingPose(makeMockPose(2));
    expect(booth.commitReviewedPose()).toBe(true);
    expect(booth.state.currentStep).toBe(3);
    expect(booth.lockedPosesCount.value).toBe(3);
  });

  it('resets session cleanly to Step 1 on timeout', () => {
    const booth = useBoothSession();
    booth.goToStep(2);
    booth.setReviewingPose(makeMockPose(0));
    booth.commitReviewedPose();

    booth.resetSession({ timedOut: true });
    expect(booth.state.currentStep).toBe(1);
    expect(booth.state.capturedPoses).toHaveLength(0);
    expect(booth.state.timerRemainingSeconds).toBe(600);
    expect(booth.showTimeoutBanner.value).toBe(true);
  });
});
