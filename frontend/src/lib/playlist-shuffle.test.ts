import { describe, expect, it } from 'vitest';
import {
  advanceShufflePlayback,
  buildShuffleOrder,
  canAdvanceShuffle,
  canRetreatShuffle,
  resolveShuffleCursor,
  retreatShufflePlayback,
} from './playlist-shuffle';

describe('resolveShuffleCursor', () => {
  it('uses order position for active index', () => {
    expect(resolveShuffleCursor([2, 0, 4, 1, 3], 1, 0)).toBe(3);
  });

  it('falls back when active index is missing from order', () => {
    expect(resolveShuffleCursor([2, 0, 4], 9, 2)).toBe(2);
  });
});

describe('advanceShufflePlayback', () => {
  const order = [2, 0, 4, 1, 3];

  it('advances along shuffle order using active index', () => {
    const result = advanceShufflePlayback(order, 1, 0, 5, 'off');
    expect(result).toEqual({ kind: 'track', index: 3, cursor: 4 });
  });

  it('does not stop early when cursor state drifted ahead', () => {
    const result = advanceShufflePlayback(order, 1, 4, 5, 'off');
    expect(result).toEqual({ kind: 'track', index: 3, cursor: 4 });
  });

  it('stops only after the full shuffle round', () => {
    const result = advanceShufflePlayback(order, 3, 4, 5, 'off');
    expect(result).toEqual({ kind: 'stop' });
  });

  it('reshuffles when repeat all is enabled', () => {
    const nextOrder = [1, 3, 0, 2, 4];
    const result = advanceShufflePlayback(order, 3, 4, 5, 'all', () => nextOrder);
    expect(result).toEqual({ kind: 'reshuffle', order: nextOrder, index: 1, cursor: 0 });
  });
});

describe('retreatShufflePlayback', () => {
  it('goes back along shuffle order using active index', () => {
    const order = [2, 0, 4, 1, 3];
    expect(retreatShufflePlayback(order, 1, 4)).toEqual({ index: 4, cursor: 2 });
  });
});

describe('canAdvanceShuffle', () => {
  const order = [2, 0, 4, 1, 3];

  it('allows next before round end', () => {
    expect(canAdvanceShuffle(order, 1, 4, 5, 'off')).toBe(true);
  });

  it('blocks next only at round end without repeat', () => {
    expect(canAdvanceShuffle(order, 3, 0, 5, 'off')).toBe(false);
  });
});

describe('canRetreatShuffle', () => {
  it('allows previous when not at round start', () => {
    expect(canRetreatShuffle([2, 0, 4, 1, 3], 1, 0)).toBe(true);
  });
});

describe('buildShuffleOrder', () => {
  it('returns a permutation of indices', () => {
    const order = buildShuffleOrder(6);
    expect(order).toHaveLength(6);
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
