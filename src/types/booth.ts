export type BoothMode = 'solo' | 'ldr';

export type CameraFitMode = 'contain' | 'cover';

export type FrameLayoutType = 'strip-3' | 'strip-4' | 'grid-2x2';

export type CountdownDuration = 3 | 5 | 10;

export type FilterId =
  | 'normal'
  | 'soft-glow'
  | 'cool-blue'
  | 'bw-noir'
  | 'vintage-sepia'
  | 'retro-warm'
  | 'film-fade'
  | 'cyber-pink'
  | 'golden-hour';

export interface FilterGrading {
  brightness: number; // 1.0 = neutral
  contrast: number; // 1.0 = neutral
  saturate: number; // 1.0 = neutral
  sepia: number; // 0..1
  grayscale: number; // 0..1
  fadeLift: number; // 0..45 lifts blacks for film fade
  warmShift: number; // -30..30 (negative = cool blue, positive = warm golden)
  tintColor?: string;
  tintAlpha?: number;
  glowAlpha?: number;
  vignetteAlpha?: number;
}

export interface FilterDefinition {
  id: FilterId;
  name: string;
  swatchColor: string;
  cssFilter: string;
  overlayBg?: string;
  grading: FilterGrading;
}

export interface FrameSlotRect {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

export type FrameThemeStyle =
  | 'ocean-breeze'
  | 'coquette-ribbon'
  | 'cinema-35mm'
  | 'y2k-cyber-grid'
  | 'warm-scrapbook'
  | 'midnight-starlight'
  | 'custom';

export interface FramePreset {
  id: string;
  name: string;
  subtitle: string;
  poseCount: 3 | 4;
  layout: FrameLayoutType;
  canvasWidth: number;
  canvasHeight: number;
  backgroundColor: string;
  secondaryColor: string;
  accentColor: string;
  textColor: string;
  caption: string;
  themeStyle: FrameThemeStyle;
  slots: FrameSlotRect[];
  isCustom?: boolean;
  customImageSrc?: string;
}

export interface MotionFrame {
  local: Blob | HTMLCanvasElement;
  partner?: Blob | HTMLCanvasElement;
}

export interface CapturedPose {
  poseIndex: number;
  stillLocal: HTMLCanvasElement;
  stillPartner?: HTMLCanvasElement;
  motionFrames: MotionFrame[];
}

export interface SessionState {
  currentStep: 1 | 2 | 3;
  mode: BoothMode;
  selectedFrameId: string;
  activeFilterId: FilterId;
  countdownDuration: CountdownDuration;
  timerRemainingSeconds: number;
  isTimerActive: boolean;
  capturedPoses: CapturedPose[];
}

export interface GeneratedAssetItem {
  blob: Blob | null;
  url: string | null;
  filename: string;
  mimeType: string;
}

export interface RawPoseAsset {
  poseIndex: number;
  blob: Blob;
  url: string;
  filename: string;
}

export interface GeneratedAssets {
  mainFramedPng: GeneratedAssetItem;
  livePhotoVideo: GeneratedAssetItem;
  storyVideo: GeneratedAssetItem;
  rawPoses: RawPoseAsset[];
}

export type LdrConnectionState =
  | 'idle'
  | 'creating'
  | 'waiting'
  | 'connecting'
  | 'connected'
  | 'error';

export type LdrSyncMessage =
  | { type: 'sync-frame'; frameId: string }
  | { type: 'enter-booth'; frameId: string }
  | { type: 'sync-filter'; filterId: FilterId }
  | { type: 'sync-countdown'; duration: CountdownDuration }
  | { type: 'start-pose'; poseIndex: number; duration: CountdownDuration }
  | { type: 'capture-now'; poseIndex: number }
  | { type: 'partner-still'; poseIndex: number; dataUrl: string }
  | { type: 'retake-pose'; poseIndex: number }
  | { type: 'next-pose'; nextIndex: number }
  | { type: 'finish-session' }
  | { type: 'reset-session' }
  | { type: 'ping' }
  | { type: 'pong' };
