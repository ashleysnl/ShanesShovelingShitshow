import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateShovelPoints,
  comboRank,
  plowIntervalMs,
  snowfallRate,
  plowSnowBurst
} from '../src/scoring.js';

test('calculateShovelPoints scales with combo and risk', () => {
  const base = calculateShovelPoints({ snowDepth: 1, combo: 1, nearPlow: false, frenzy: false });
  const risky = calculateShovelPoints({ snowDepth: 1, combo: 20, nearPlow: true, frenzy: true });
  assert.ok(risky > base * 4);
});

test('comboRank returns highest tier for huge combos', () => {
  assert.equal(comboRank(200), 'BLIZZARD GOD');
  assert.equal(comboRank(40), 'ICY HOT STREAK');
});

test('difficulty helpers increase pressure over time', () => {
  assert.ok(plowIntervalMs(0) > plowIntervalMs(120000));
  assert.ok(snowfallRate(90000) > snowfallRate(0));
  assert.ok(plowSnowBurst(100000) > plowSnowBurst(0));
});
