import { describe, expect, it } from 'vitest';
import { FILTERS, getFilterById } from '../filters';
import { PRESET_FRAMES, createCustomFramePreset } from '../frames';

describe('Preset Frames & Filters', () => {
  it('provides all 6 blueprint preset frames with matching pose counts and slot arrays', () => {
    expect(PRESET_FRAMES).toHaveLength(6);
    const ids = PRESET_FRAMES.map((f) => f.id);
    expect(ids).toEqual([
      'ocean-breeze',
      'coquette-ribbon',
      'cinema-35mm',
      'y2k-cyber-grid',
      'warm-scrapbook',
      'midnight-starlight',
    ]);

    for (const frame of PRESET_FRAMES) {
      expect(frame.slots).toHaveLength(frame.poseCount);
      expect(frame.canvasWidth).toBeGreaterThan(0);
      expect(frame.canvasHeight).toBeGreaterThan(0);
    }
  });

  it('creates custom PNG frames with appropriate layout slot counts', () => {
    const customStrip4 = createCustomFramePreset({
      id: 'custom-1',
      name: 'My Canva Strip',
      layout: 'strip-4',
      customImageSrc: 'data:image/png;base64,AAA',
    });

    expect(customStrip4.isCustom).toBe(true);
    expect(customStrip4.poseCount).toBe(4);
    expect(customStrip4.slots).toHaveLength(4);
  });

  it('provides all 9 real-time filters from the blueprint', () => {
    expect(FILTERS).toHaveLength(9);
    expect(FILTERS.map((f) => f.name)).toEqual([
      'Normal',
      'Soft Glow',
      'Cool Blue',
      'B&W Noir',
      'Vintage Sepia',
      'Retro Warm',
      'Film Fade',
      'Cyber Pink',
      'Golden Hour',
    ]);
    expect(getFilterById('cyber-pink').name).toBe('Cyber Pink');
  });
});
