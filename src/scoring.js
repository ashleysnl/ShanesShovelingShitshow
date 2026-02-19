export function calculateShovelPoints({ snowDepth, combo, nearPlow, frenzy }) {
  const depthScore = Math.max(1, snowDepth) * 100;
  const comboBonus = 1 + Math.min(combo, 250) * 0.12;
  const riskBonus = nearPlow ? 2.2 : 1;
  const frenzyBonus = frenzy ? 1.5 : 1;
  return Math.round(depthScore * comboBonus * riskBonus * frenzyBonus);
}

export function comboRank(combo) {
  if (combo >= 180) return 'BLIZZARD GOD';
  if (combo >= 120) return 'PLATINUM PLOW PANIC';
  if (combo >= 70) return 'STORM SURGE';
  if (combo >= 35) return 'ICY HOT STREAK';
  if (combo >= 15) return 'COMBO COASTING';
  return 'WARMING UP';
}

export function plowIntervalMs(elapsedMs) {
  const min = 2600;
  const max = 7000;
  const eased = Math.min(1, elapsedMs / 110000);
  return Math.round(max - (max - min) * eased);
}

export function snowfallRate(elapsedMs) {
  return 0.35 + Math.min(1.6, elapsedMs / 50000);
}

export function plowSnowBurst(elapsedMs) {
  return 2 + Math.floor(Math.min(5, elapsedMs / 30000));
}
