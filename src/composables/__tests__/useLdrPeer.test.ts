import { describe, expect, it } from 'vitest';
import { generateRoomCode, normalizeRoomCode } from '../useLdrPeer';

describe('useLdrPeer helpers', () => {
  it('generates room codes matching SNAP-XXXX format', () => {
    const code = generateRoomCode();
    expect(code).toMatch(/^SNAP-[A-Z0-9]{4}$/);
  });

  it('normalizes user room code input reliably', () => {
    expect(normalizeRoomCode(' 4829 ')).toBe('SNAP-4829');
    expect(normalizeRoomCode('snap-ab12')).toBe('SNAP-AB12');
    expect(normalizeRoomCode('   ')).toBe('');
  });
});
