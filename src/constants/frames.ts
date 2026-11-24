import type { FrameLayoutType, FramePreset, FrameSlotRect } from '../types/booth';

export const LAYOUT_DIMENSIONS: Record<
  FrameLayoutType,
  { width: number; height: number; poseCount: 3 | 4; slots: FrameSlotRect[] }
> = {
  'strip-3': {
    width: 900,
    height: 2400,
    poseCount: 3,
    slots: [
      { x: 70, y: 185, width: 760, height: 570, radius: 22 },
      { x: 70, y: 820, width: 760, height: 570, radius: 22 },
      { x: 70, y: 1455, width: 760, height: 570, radius: 22 },
    ],
  },
  'strip-4': {
    width: 900,
    height: 2950,
    poseCount: 4,
    slots: [
      { x: 70, y: 180, width: 760, height: 550, radius: 22 },
      { x: 70, y: 785, width: 760, height: 550, radius: 22 },
      { x: 70, y: 1390, width: 760, height: 550, radius: 22 },
      { x: 70, y: 1995, width: 760, height: 550, radius: 22 },
    ],
  },
  'grid-2x2': {
    width: 1500,
    height: 1950,
    poseCount: 4,
    slots: [
      { x: 75, y: 175, width: 650, height: 670, radius: 24 },
      { x: 775, y: 175, width: 650, height: 670, radius: 24 },
      { x: 75, y: 895, width: 650, height: 670, radius: 24 },
      { x: 775, y: 895, width: 650, height: 670, radius: 24 },
    ],
  },
};

export const PRESET_FRAMES: FramePreset[] = [
  {
    id: 'ocean-breeze',
    name: 'Ocean Breeze',
    subtitle: '3 Pose Strip • Coastal Sky & Shells',
    poseCount: 3,
    layout: 'strip-3',
    canvasWidth: LAYOUT_DIMENSIONS['strip-3'].width,
    canvasHeight: LAYOUT_DIMENSIONS['strip-3'].height,
    backgroundColor: '#e0f2fe',
    secondaryColor: '#bae6fd',
    accentColor: '#0284c7',
    textColor: '#0c4a6e',
    caption: 'OCEAN BREEZE • SNAPTOGETHER',
    themeStyle: 'ocean-breeze',
    slots: LAYOUT_DIMENSIONS['strip-3'].slots,
  },
  {
    id: 'coquette-ribbon',
    name: 'Coquette Ribbon',
    subtitle: '4 Pose Strip • Pastel Blush & Bows',
    poseCount: 4,
    layout: 'strip-4',
    canvasWidth: LAYOUT_DIMENSIONS['strip-4'].width,
    canvasHeight: LAYOUT_DIMENSIONS['strip-4'].height,
    backgroundColor: '#fff1f5',
    secondaryColor: '#fce7f3',
    accentColor: '#ec4899',
    textColor: '#831843',
    caption: 'COQUETTE MEMORIES ♡',
    themeStyle: 'coquette-ribbon',
    slots: LAYOUT_DIMENSIONS['strip-4'].slots,
  },
  {
    id: 'cinema-35mm',
    name: 'Cinema 35mm Film',
    subtitle: '3 Pose Strip • Classic Film Roll',
    poseCount: 3,
    layout: 'strip-3',
    canvasWidth: 960,
    canvasHeight: 2450,
    backgroundColor: '#111827',
    secondaryColor: '#1f2937',
    accentColor: '#f59e0b',
    textColor: '#fef3c7',
    caption: 'KODAK 35MM • SNAPTOGETHER',
    themeStyle: 'cinema-35mm',
    slots: [
      { x: 110, y: 205, width: 740, height: 560, radius: 8 },
      { x: 110, y: 840, width: 740, height: 560, radius: 8 },
      { x: 110, y: 1475, width: 740, height: 560, radius: 8 },
    ],
  },
  {
    id: 'y2k-cyber-grid',
    name: 'Y2K Cyber Grid',
    subtitle: '4 Pose Grid 2x2 • Chrome & Neon',
    poseCount: 4,
    layout: 'grid-2x2',
    canvasWidth: LAYOUT_DIMENSIONS['grid-2x2'].width,
    canvasHeight: LAYOUT_DIMENSIONS['grid-2x2'].height,
    backgroundColor: '#0f172a',
    secondaryColor: '#1e1b4b',
    accentColor: '#38bdf8',
    textColor: '#f8fafc',
    caption: 'Y2K // CYBER BOOTH 2000',
    themeStyle: 'y2k-cyber-grid',
    slots: LAYOUT_DIMENSIONS['grid-2x2'].slots,
  },
  {
    id: 'warm-scrapbook',
    name: 'Warm Scrapbook',
    subtitle: '3 Pose Strip • Kraft & Tape Doodles',
    poseCount: 3,
    layout: 'strip-3',
    canvasWidth: LAYOUT_DIMENSIONS['strip-3'].width,
    canvasHeight: LAYOUT_DIMENSIONS['strip-3'].height,
    backgroundColor: '#f5ead6',
    secondaryColor: '#ead7b7',
    accentColor: '#b45309',
    textColor: '#451a03',
    caption: 'OUR LITTLE SCRAPBOOK ★',
    themeStyle: 'warm-scrapbook',
    slots: LAYOUT_DIMENSIONS['strip-3'].slots,
  },
  {
    id: 'midnight-starlight',
    name: 'Midnight Navy Starlight',
    subtitle: '4 Pose Grid 2x2 • Constellations',
    poseCount: 4,
    layout: 'grid-2x2',
    canvasWidth: LAYOUT_DIMENSIONS['grid-2x2'].width,
    canvasHeight: LAYOUT_DIMENSIONS['grid-2x2'].height,
    backgroundColor: '#0b132b',
    secondaryColor: '#1c2541',
    accentColor: '#fbbf24',
    textColor: '#fef9c3',
    caption: 'UNDER THE SAME STARS ✦',
    themeStyle: 'midnight-starlight',
    slots: LAYOUT_DIMENSIONS['grid-2x2'].slots,
  },
];

export function createCustomFramePreset(options: {
  id: string;
  name: string;
  layout: FrameLayoutType;
  customImageSrc: string;
  customWidth?: number;
  customHeight?: number;
  detectedSlots?: FrameSlotRect[];
}): FramePreset {
  const base = LAYOUT_DIMENSIONS[options.layout];
  const width = options.customWidth && options.customWidth > 0 ? options.customWidth : base.width;
  const height = options.customHeight && options.customHeight > 0 ? options.customHeight : base.height;

  return {
    id: options.id,
    name: options.name,
    subtitle: `${base.poseCount} Pose ${options.layout === 'grid-2x2' ? 'Grid 2x2' : 'Strip'} • Custom PNG`,
    poseCount: base.poseCount,
    layout: options.layout,
    canvasWidth: width,
    canvasHeight: height,
    backgroundColor: '#ffffff',
    secondaryColor: '#f1f5f9',
    accentColor: '#ec4899',
    textColor: '#0f172a',
    caption: options.name.toUpperCase(),
    themeStyle: 'custom',
    slots: options.detectedSlots && options.detectedSlots.length === base.poseCount ? options.detectedSlots : base.slots,
    isCustom: true,
    customImageSrc: options.customImageSrc,
  };
}
