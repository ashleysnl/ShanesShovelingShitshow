import { calculateShovelPoints, comboRank, plowIntervalMs, snowfallRate, plowSnowBurst } from './scoring.js';

const WIDTH = 480;
const HEIGHT = 640;

const DRIVEWAY = {
  x: 67,
  y: 228,
  width: 346,
  height: 302,
  cols: 8,
  rows: 9
};

const STATES = {
  TITLE: 'title',
  RUNNING: 'running',
  PAUSED: 'paused',
  GAME_OVER: 'gameover'
};

const UPGRADE_TYPES = {
  SCOOP: 'scoop',
  HONDA: 'honda',
  HIGDON: 'higdon'
};

const WEATHER_TYPES = {
  CLEAR: 'clear',
  FLURRY: 'flurry',
  WIND: 'wind',
  BLIZZARD: 'blizzard'
};

const WEATHER_CONFIG = {
  [WEATHER_TYPES.CLEAR]: { snowMult: 0.7, wind: 0.12, tint: 0.0, label: 'CLEAR SKIES' },
  [WEATHER_TYPES.FLURRY]: { snowMult: 1.45, wind: 0.7, tint: 0.04, label: 'HEAVY FLURRIES' },
  [WEATHER_TYPES.WIND]: { snowMult: 1.9, wind: 1.8, tint: 0.08, label: 'GALE FORCE WIND' },
  [WEATHER_TYPES.BLIZZARD]: { snowMult: 2.8, wind: 2.8, tint: 0.14, label: 'WHITEOUT BLIZZARD' }
};

const WEATHER_SEQUENCE = [
  WEATHER_TYPES.CLEAR,
  WEATHER_TYPES.FLURRY,
  WEATHER_TYPES.WIND,
  WEATHER_TYPES.BLIZZARD
];

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function sanitizeInitials(value) {
  return (value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 3);
}

export class Game {
  constructor({ canvas, hud, overlays, input, audio, sprites }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.hud = hud;
    this.overlays = overlays;
    this.input = input;
    this.audio = audio;
    this.sprites = sprites;

    this.state = STATES.TITLE;
    this.lastTime = 0;
    this.accumulator = 0;
    this.fixedStep = 1 / 60;
    this.pendingLeaderboardEntry = false;
    this.leaderboard = this.loadLeaderboard();
    this.highScore = this.leaderboard[0]?.score || Number(localStorage.getItem('ssa-high-score') || 0);

    this.bindUi();
    this.configureCanvas();
    this.resetSession();
    this.renderLeaderboard();
  }

  bindUi() {
    this.overlays.startButton.addEventListener('click', async () => {
      await this.audio.unlock();
      this.startRun();
    });

    this.overlays.restartButton.addEventListener('click', async () => {
      if (this.pendingLeaderboardEntry) this.submitLeaderboardScore();
      await this.audio.unlock();
      this.startRun();
    });

    this.overlays.submitScoreButton?.addEventListener('click', () => {
      this.submitLeaderboardScore();
    });

    this.overlays.initialsInput?.addEventListener('input', () => {
      this.overlays.initialsInput.value = sanitizeInitials(this.overlays.initialsInput.value);
    });

    this.overlays.initialsInput?.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        this.submitLeaderboardScore();
      }
    });

    this.overlays.resumeButton.addEventListener('click', () => {
      if (this.state === STATES.PAUSED) this.setState(STATES.RUNNING);
    });

    this.overlays.muteToggle.addEventListener('click', () => {
      const next = !this.audio.muted;
      this.audio.setMuted(next);
      this.overlays.muteToggle.textContent = next ? 'Unmute' : 'Mute';
    });

    this.overlays.volumeSlider.addEventListener('input', (event) => {
      this.audio.setVolume(Number(event.target.value));
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === STATES.RUNNING) this.setState(STATES.PAUSED);
    });

    window.addEventListener('resize', () => this.configureCanvas());
    window.addEventListener('orientationchange', () => this.configureCanvas());
  }

  configureCanvas() {
    this.canvas.width = WIDTH;
    this.canvas.height = HEIGHT;
  }

  getArt(name) {
    return this.sprites?.art?.frames?.[name] || null;
  }

  drawArt(name, x, y, w, h, options = {}) {
    const art = this.getArt(name);
    if (!art) return false;
    const { flipX = false, alpha = 1 } = options;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (flipX) {
      ctx.translate(x + w / 2, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(art, -w / 2, y, w, h);
    } else {
      ctx.drawImage(art, x, y, w, h);
    }
    ctx.restore();
    return true;
  }

  getStreetY() {
    return DRIVEWAY.y + DRIVEWAY.height + 6;
  }

  getStreetHeight() {
    return 72;
  }

  getHouseTop() {
    // Keep house below marquee/HUD and above driveway.
    return 108;
  }

  getHouseBottom() {
    return DRIVEWAY.y - 4;
  }

  loadLeaderboard() {
    const fallback = [
      { initials: 'SNO', score: 125000 },
      { initials: 'PLO', score: 95000 },
      { initials: 'ICE', score: 80000 },
      { initials: 'BRR', score: 55000 },
      { initials: 'DIG', score: 32000 }
    ];

    try {
      const parsed = JSON.parse(localStorage.getItem('ssa-leaderboard') || '[]');
      if (!Array.isArray(parsed) || parsed.length === 0) return fallback;
      return parsed
        .map((entry) => ({
          initials: sanitizeInitials(entry?.initials) || '???',
          score: Number(entry?.score) || 0
        }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
    } catch {
      return fallback;
    }
  }

  saveLeaderboard() {
    localStorage.setItem('ssa-leaderboard', JSON.stringify(this.leaderboard.slice(0, 5)));
    localStorage.setItem('ssa-high-score', String(this.highScore));
  }

  qualifiesForLeaderboard(score) {
    if (score <= 0) return false;
    if (this.leaderboard.length < 5) return true;
    return score > (this.leaderboard[this.leaderboard.length - 1]?.score || 0);
  }

  submitLeaderboardScore() {
    if (!this.pendingLeaderboardEntry) return;
    const typed = sanitizeInitials(this.overlays.initialsInput?.value);
    const initials = typed || '???';
    this.leaderboard.push({ initials, score: this.score });
    this.leaderboard.sort((a, b) => b.score - a.score);
    this.leaderboard = this.leaderboard.slice(0, 5);
    this.highScore = this.leaderboard[0]?.score || this.highScore;
    this.pendingLeaderboardEntry = false;
    this.saveLeaderboard();
    this.renderLeaderboard();
    this.overlays.leaderboardEntry?.classList.add('is-hidden');
  }

  renderLeaderboard() {
    if (!this.overlays.leaderboardList) return;
    this.overlays.leaderboardList.innerHTML = '';
    this.leaderboard.slice(0, 5).forEach((entry) => {
      const li = document.createElement('li');
      li.textContent = `${entry.initials}  ${entry.score.toLocaleString()}`;
      this.overlays.leaderboardList.append(li);
    });
  }

  resetSession() {
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.comboClock = 0;
    this.elapsedMs = 0;
    this.remainingLives = 3;

    this.player = {
      x: DRIVEWAY.x + DRIVEWAY.width / 2,
      y: DRIVEWAY.y + DRIVEWAY.height - 55,
      speed: 150,
      shovelCooldown: 0,
      facingX: 0,
      facingY: -1,
      hurtCooldown: 0
    };

    this.snowGrid = new Array(DRIVEWAY.cols * DRIVEWAY.rows).fill(2);
    this.snowTicker = 0;
    this.passiveSnowEvent = 0;

    this.plow = {
      state: 'waiting',
      timer: plowIntervalMs(0),
      x: -220,
      y: this.getStreetY() + this.getStreetHeight() * 0.54,
      direction: 1,
      speed: 280,
      warningMs: 1200
    };

    this.upgrade = { type: null, timer: 0 };
    this.upgradeSpawnTimer = 10;
    this.upgradePickup = null;
    this.helpers = [];

    this.snowmen = [];
    this.snowmanSpawnTimer = 14;

    this.floatingText = [];
    this.particles = [];
    this.callouts = [];
    this.screenShake = 0;
    this.flash = 0;

    this.weather = {
      type: WEATHER_TYPES.CLEAR,
      timer: randomRange(9, 15),
      intensity: WEATHER_CONFIG[WEATHER_TYPES.CLEAR].snowMult,
      wind: WEATHER_CONFIG[WEATHER_TYPES.CLEAR].wind,
      direction: Math.random() > 0.5 ? 1 : -1
    };
    this.weatherStreaks = Array.from({ length: 32 }, () => ({
      x: randomRange(0, WIDTH),
      y: randomRange(118, HEIGHT - 6),
      speed: randomRange(110, 220),
      size: randomRange(5, 11)
    }));
  }

  startRun() {
    this.resetSession();
    this.setState(STATES.RUNNING);
  }

  setState(nextState) {
    this.state = nextState;
    this.overlays.title.classList.toggle('is-hidden', nextState !== STATES.TITLE);
    this.overlays.pause.classList.toggle('is-hidden', nextState !== STATES.PAUSED);
    this.overlays.gameOver.classList.toggle('is-hidden', nextState !== STATES.GAME_OVER);

    if (nextState === STATES.GAME_OVER) {
      this.overlays.finalScore.textContent = this.score.toLocaleString();
      this.overlays.finalBestCombo.textContent = this.bestCombo.toLocaleString();
      this.renderLeaderboard();

      const qualifies = this.qualifiesForLeaderboard(this.score);
      this.pendingLeaderboardEntry = qualifies;
      this.overlays.leaderboardEntry?.classList.toggle('is-hidden', !qualifies);
      if (this.overlays.initialsInput) {
        this.overlays.initialsInput.value = '';
        if (qualifies) this.overlays.initialsInput.focus();
      }
    }
  }

  loop = (timestamp) => {
    if (!this.lastTime) this.lastTime = timestamp;
    const delta = Math.min(0.05, (timestamp - this.lastTime) / 1000);
    this.lastTime = timestamp;

    this.accumulator += delta;
    while (this.accumulator >= this.fixedStep) {
      this.update(this.fixedStep);
      this.accumulator -= this.fixedStep;
    }

    this.render();
    requestAnimationFrame(this.loop);
  };

  update(dt) {
    if (this.input.consumePausePress() && (this.state === STATES.RUNNING || this.state === STATES.PAUSED)) {
      this.setState(this.state === STATES.RUNNING ? STATES.PAUSED : STATES.RUNNING);
    }

    if (this.state !== STATES.RUNNING) {
      this.updateFx(dt);
      this.updateHud();
      return;
    }

    this.elapsedMs += dt * 1000;
    this.comboClock = Math.max(0, this.comboClock - dt);
    this.player.hurtCooldown = Math.max(0, this.player.hurtCooldown - dt);
    if (this.comboClock === 0 && this.combo > 0) this.combo = 0;

    this.updatePlayer(dt);
    this.updateWeather(dt);
    this.updateSnow(dt);
    this.updatePlow(dt);
    this.updateUpgrades(dt);
    this.updateHelpers(dt);
    this.updateSnowmen(dt);
    this.updateFx(dt);
    this.updateHud();

    if (this.remainingLives <= 0) this.endRun();
  }

  updatePlayer(dt) {
    const movement = this.input.readMovement({
      x: this.player.x / WIDTH,
      y: this.player.y / HEIGHT
    });

    if (Math.abs(movement.x) > 0.01 || Math.abs(movement.y) > 0.01) {
      this.player.facingX = movement.x;
      this.player.facingY = movement.y;
    }

    this.player.x += movement.x * this.player.speed * dt;
    this.player.y += movement.y * this.player.speed * dt;

    // Wind storms can push the player around for higher tension.
    if (this.weather.wind > 0.85) {
      const gust = this.weather.direction * this.weather.wind * 20 * dt;
      this.player.x += gust;
    }

    this.player.x = clamp(this.player.x, DRIVEWAY.x + 16, DRIVEWAY.x + DRIVEWAY.width - 16);
    this.player.y = clamp(this.player.y, DRIVEWAY.y + 16, DRIVEWAY.y + DRIVEWAY.height - 18);

    if (this.upgradePickup) {
      const dist = Math.hypot(this.player.x - this.upgradePickup.x, this.player.y - this.upgradePickup.y);
      if (dist < 26) {
        this.collectUpgrade(this.upgradePickup.type);
        this.upgradePickup = null;
      }
    }

    this.player.shovelCooldown = Math.max(0, this.player.shovelCooldown - dt);

    if (this.input.actionHeld && this.player.shovelCooldown === 0) {
      const didDig = this.upgrade.type === UPGRADE_TYPES.HONDA ? this.blowSnow() : this.shovelSnow();
      if (this.upgrade.type === UPGRADE_TYPES.HONDA) {
        this.player.shovelCooldown = didDig ? 0.03 : 0.07;
      } else if (this.upgrade.type === UPGRADE_TYPES.SCOOP) {
        this.player.shovelCooldown = didDig ? 0.045 : 0.09;
      } else {
        this.player.shovelCooldown = didDig ? 0.09 : 0.14;
      }
      if (didDig) this.audio.playShovel();
    }
  }

  updateSnow(dt) {
    this.snowTicker += dt * snowfallRate(this.elapsedMs) * this.weather.intensity;
    while (this.snowTicker >= 1) {
      this.snowTicker -= 1;
      const idx = Math.floor(Math.random() * this.snowGrid.length);
      this.snowGrid[idx] = clamp(this.snowGrid[idx] + 0.5, 0, 10);
    }

    const passiveInterval = this.weather.type === WEATHER_TYPES.BLIZZARD ? 0.95 : this.weather.type === WEATHER_TYPES.WIND ? 1.25 : 1.8;
    this.passiveSnowEvent += dt;
    if (this.passiveSnowEvent > passiveInterval) {
      this.passiveSnowEvent = 0;
      const columns = 1 + Math.floor(Math.random() * 2) + (this.weather.type === WEATHER_TYPES.BLIZZARD ? 1 : 0);
      for (let i = 0; i < columns; i += 1) {
        const c = Math.floor(Math.random() * DRIVEWAY.cols);
        for (let r = 0; r < DRIVEWAY.rows; r += 1) {
          const baseAmount = Math.max(0.1, 0.25 - r * 0.015);
          const amount = baseAmount * (0.65 + this.weather.intensity * 0.45);
          this.addSnow(c, r, amount);
        }
      }
    }
  }

  updateWeather(dt) {
    this.weather.timer -= dt;
    if (this.weather.timer <= 0) {
      const currentIndex = WEATHER_SEQUENCE.indexOf(this.weather.type);
      const nextType = WEATHER_SEQUENCE[(currentIndex + 1) % WEATHER_SEQUENCE.length];
      const cfg = WEATHER_CONFIG[nextType];
      this.weather.type = nextType;
      this.weather.intensity = cfg.snowMult;
      this.weather.wind = cfg.wind;
      this.weather.direction = Math.random() > 0.5 ? 1 : -1;
      this.weather.timer = randomRange(9, 16);
      this.callouts.push({ text: cfg.label, life: 1.1, color: '#d8f2ff', size: 22, style: 'brick' });
    }
  }

  updatePlow(dt) {
    const plow = this.plow;
    plow.speed = 260 + Math.min(230, this.elapsedMs / 280);

    if (plow.state === 'waiting') {
      plow.timer -= dt * 1000;
      if (plow.timer <= 0) {
        plow.state = 'warning';
        plow.timer = plow.warningMs;
        this.callouts.push({ text: 'PLOW INCOMING', life: 1.2, color: '#ffd84c', size: 26 });
        this.screenShake = Math.max(this.screenShake, 5);
        this.audio.playPlowRush();
      }
      return;
    }

    if (plow.state === 'warning') {
      plow.timer -= dt * 1000;
      if (plow.timer <= 0) {
        plow.state = 'passing';
        plow.direction = Math.random() > 0.5 ? 1 : -1;
        plow.x = plow.direction === 1 ? -200 : WIDTH + 200;
      }
      return;
    }

    if (plow.state === 'passing') {
      plow.x += plow.direction * plow.speed * dt;

      // Use plow blade position so snow deposition follows travel direction.
      const bladeX = plow.x + plow.direction * 68;
      const bladeRow = DRIVEWAY.rows - 1;
      const insideDriveway = bladeX >= DRIVEWAY.x && bladeX <= DRIVEWAY.x + DRIVEWAY.width;
      if (insideDriveway) {
        const localX = bladeX - DRIVEWAY.x;
        const burstCol = clamp(Math.floor((localX / DRIVEWAY.width) * DRIVEWAY.cols), 0, DRIVEWAY.cols - 1);
        const burst = plowSnowBurst(this.elapsedMs) * dt * 6;
        const trailCol = clamp(burstCol - plow.direction, 0, DRIVEWAY.cols - 1);

        this.addSnow(burstCol, bladeRow, burst);
        this.addSnow(burstCol, bladeRow - 1, burst * 0.76);
        this.addSnow(trailCol, bladeRow, burst * 0.65);
      }

      this.screenShake = Math.max(this.screenShake, 2.6);

      const streetHit = this.player.y > DRIVEWAY.y + DRIVEWAY.height - 50;
      if (streetHit && Math.abs(this.player.x - plow.x) < 80) {
        this.damagePlayer();
        plow.state = 'cooldown';
        plow.timer = 600;
      }

      const outLeft = plow.direction === 1 && plow.x > WIDTH + 220;
      const outRight = plow.direction === -1 && plow.x < -220;
      if (outLeft || outRight) {
        plow.state = 'cooldown';
        plow.timer = 620;
      }
      return;
    }

    if (plow.state === 'cooldown') {
      plow.timer -= dt * 1000;
      if (plow.timer <= 0) {
        plow.state = 'waiting';
        plow.timer = plowIntervalMs(this.elapsedMs);
      }
    }
  }

  updateUpgrades(dt) {
    if (this.upgrade.type) {
      this.upgrade.timer = Math.max(0, this.upgrade.timer - dt);
      if (this.upgrade.timer === 0) {
        this.callouts.push({ text: 'UPGRADE EXPIRED', life: 0.9, color: '#ffd9a8', size: 16, x: this.player.x, y: this.player.y - 26 });
        this.upgrade.type = null;
      }
    }

    if (!this.upgradePickup && !this.upgrade.type) {
      this.upgradeSpawnTimer -= dt;
      if (this.upgradeSpawnTimer <= 0) this.spawnUpgrade();
    }
  }

  spawnUpgrade() {
    const roll = Math.random();
    const type = roll < 0.38 ? UPGRADE_TYPES.SCOOP : roll < 0.76 ? UPGRADE_TYPES.HONDA : UPGRADE_TYPES.HIGDON;
    const label = type === UPGRADE_TYPES.SCOOP ? 'THE SCOOP' : type === UPGRADE_TYPES.HONDA ? 'THE HONDA' : 'HIGDON';
    this.upgradePickup = {
      type,
      label,
      x: randomRange(DRIVEWAY.x + 24, DRIVEWAY.x + DRIVEWAY.width - 24),
      y: randomRange(DRIVEWAY.y + 48, DRIVEWAY.y + DRIVEWAY.height - 56),
      bob: randomRange(0, Math.PI * 2)
    };
    this.upgradeSpawnTimer = randomRange(16, 24);
    this.callouts.push({ text: 'UPGRADE DROP!', life: 0.9, color: '#8ff8ff', size: 18 });
  }

  collectUpgrade(type) {
    this.upgrade.type = type;
    this.upgrade.timer = type === UPGRADE_TYPES.HONDA ? 10 : 12;

    if (type === UPGRADE_TYPES.SCOOP) {
      this.callouts.push({ text: 'THE SCOOP', life: 1.2, color: '#7cd3ff', size: 28, x: this.player.x, y: this.player.y - 10, style: 'brick', grow: true, shake: 8 });
    } else if (type === UPGRADE_TYPES.HONDA) {
      this.callouts.push({ text: 'THE HONDA', life: 1.2, color: '#ffcd68', size: 28, x: this.player.x, y: this.player.y - 10, style: 'brick', grow: true, shake: 8 });
    } else {
      this.helpers.push({
        x: clamp(this.player.x + randomRange(-20, 20), DRIVEWAY.x + 18, DRIVEWAY.x + DRIVEWAY.width - 18),
        y: clamp(this.player.y + 10, DRIVEWAY.y + 20, DRIVEWAY.y + DRIVEWAY.height - 20),
        targetX: this.player.x,
        targetY: this.player.y,
        speed: 95,
        retargetTimer: 0,
        cleanTimer: 0
      });
      this.callouts.push({ text: 'HIGDON IS HERE TO HELP', life: 1.5, color: '#ffb6c1', size: 24, x: this.player.x, y: this.player.y - 10, style: 'brick', grow: true, shake: 8 });
    }
  }

  updateHelpers(dt) {
    for (const helper of this.helpers) {
      helper.retargetTimer -= dt;
      helper.cleanTimer -= dt;

      if (helper.retargetTimer <= 0) {
        helper.retargetTimer = randomRange(0.5, 1.4);
        helper.targetX = randomRange(DRIVEWAY.x + 20, DRIVEWAY.x + DRIVEWAY.width - 20);
        helper.targetY = randomRange(DRIVEWAY.y + 28, DRIVEWAY.y + DRIVEWAY.height - 20);
      }

      const dx = helper.targetX - helper.x;
      const dy = helper.targetY - helper.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1) {
        const step = Math.min(dist, helper.speed * dt);
        helper.x += (dx / dist) * step;
        helper.y += (dy / dist) * step;
      }

      if (helper.cleanTimer <= 0) {
        helper.cleanTimer = 0.11;
        const cell = this.worldToCell(helper.x, helper.y);
        if (cell) {
          for (let r = -1; r <= 1; r += 1) {
            for (let c = -1; c <= 1; c += 1) {
              const col = clamp(cell.col + c, 0, DRIVEWAY.cols - 1);
              const row = clamp(cell.row + r, 0, DRIVEWAY.rows - 1);
              const idx = row * DRIVEWAY.cols + col;
              this.snowGrid[idx] = Math.max(0, this.snowGrid[idx] - randomRange(0.25, 0.5));
            }
          }
        }
      }
    }

    if (this.upgrade.type !== UPGRADE_TYPES.HIGDON && this.helpers.length > 0) {
      this.callouts.push({ text: 'HIGDON BOUNCED', life: 1, color: '#ffd9a8', size: 18, x: this.helpers[0].x, y: this.helpers[0].y - 10 });
      this.helpers = [];
    }
  }

  updateSnowmen(dt) {
    this.snowmanSpawnTimer -= dt;
    if (this.snowmanSpawnTimer <= 0 && this.snowmen.length < 2) {
      this.spawnSnowman();
      this.snowmanSpawnTimer = randomRange(18, 30);
    }

    for (const snowman of this.snowmen) {
      snowman.hitCooldown = Math.max(0, snowman.hitCooldown - dt);
      snowman.attackCooldown -= dt;
      snowman.life -= dt;
      snowman.pulse += dt * 4;
      snowman.trailTimer -= dt;

      if (snowman.state === 'enter') {
        const dx = snowman.targetX - snowman.x;
        const dy = snowman.targetY - snowman.y;
        const dist = Math.hypot(dx, dy);
        const step = Math.min(dist, snowman.speed * dt);
        if (dist > 1) {
          snowman.x += (dx / dist) * step;
          snowman.y += (dy / dist) * step;
        } else {
          snowman.state = 'invade';
          snowman.targetX = randomRange(DRIVEWAY.x + 30, DRIVEWAY.x + DRIVEWAY.width - 30);
          snowman.targetY = randomRange(DRIVEWAY.y + 45, DRIVEWAY.y + DRIVEWAY.height - 40);
        }
      } else if (snowman.state === 'invade') {
        const dx = snowman.targetX - snowman.x;
        const dy = snowman.targetY - snowman.y;
        const dist = Math.hypot(dx, dy);
        const step = Math.min(dist, snowman.speed * dt);
        if (dist > 1) {
          snowman.x += (dx / dist) * step;
          snowman.y += (dy / dist) * step;
        } else {
          snowman.state = 'menace';
          snowman.attackCooldown = 1.1;
        }
      } else if (snowman.state === 'menace') {
        snowman.y += Math.sin(performance.now() / 230 + snowman.pulse) * 0.35;
        if (snowman.attackCooldown <= 0) {
          snowman.attackCooldown = randomRange(1.1, 1.8);
          snowman.targetX = randomRange(DRIVEWAY.x + 26, DRIVEWAY.x + DRIVEWAY.width - 26);
          snowman.targetY = randomRange(DRIVEWAY.y + 40, DRIVEWAY.y + DRIVEWAY.height - 36);
          snowman.state = 'invade';
        }
        if (snowman.life <= 0) snowman.state = 'leave';
      } else {
        snowman.x += snowman.side * snowman.speed * dt;
      }

      if (snowman.trailTimer <= 0 && snowman.state !== 'leave') {
        snowman.trailTimer = 0.22;
        const cell = this.worldToCell(snowman.x, snowman.y);
        if (cell) {
          for (let rr = -1; rr <= 1; rr += 1) {
            for (let cc = -1; cc <= 1; cc += 1) {
              const col = clamp(cell.col + cc, 0, DRIVEWAY.cols - 1);
              const row = clamp(cell.row + rr, 0, DRIVEWAY.rows - 1);
              this.addSnow(col, row, randomRange(0.18, 0.38));
            }
          }
        }
      }

      const distToPlayer = Math.hypot(this.player.x - snowman.x, this.player.y - snowman.y);
      if (distToPlayer < snowman.size * 0.52 && this.player.hurtCooldown === 0) {
        this.player.hurtCooldown = 1.2;
        this.damagePlayer();
      }
    }

    this.snowmen = this.snowmen.filter((snowman) => {
      const offscreenLeft = snowman.x < -120;
      const offscreenRight = snowman.x > WIDTH + 120;
      return snowman.hp > 0 && !offscreenLeft && !offscreenRight;
    });
  }

  spawnSnowman() {
    const side = Math.random() > 0.5 ? 1 : -1;
    const targetY = randomRange(DRIVEWAY.y + 38, DRIVEWAY.y + DRIVEWAY.height - 50);
    const size = randomRange(68, 84);

    this.snowmen.push({
      x: side < 0 ? -52 : WIDTH + 52,
      y: targetY,
      side,
      targetX: side < 0 ? DRIVEWAY.x + 12 : DRIVEWAY.x + DRIVEWAY.width - 12,
      targetY,
      size,
      hp: 10,
      maxHp: 10,
      speed: randomRange(45, 64),
      attackCooldown: 1.2,
      hitCooldown: 0,
      pulse: randomRange(0, Math.PI * 2),
      life: randomRange(14, 18),
      state: 'enter',
      trailTimer: 0.08
    });

    this.callouts.push({ text: 'ROGUE SNOWMAN ATTACK!!', life: 1.5, color: '#ff8f9f', size: 30, style: 'brick' });
    this.screenShake = Math.max(this.screenShake, 9);
  }

  damageSnowmenAt(x, y, power) {
    for (const snowman of this.snowmen) {
      if (snowman.hitCooldown > 0) continue;
      const dist = Math.hypot(x - snowman.x, y - snowman.y);
      if (dist > snowman.size * 0.72) continue;

      snowman.hitCooldown = 0.12;
      snowman.hp -= power;
      this.screenShake = Math.max(this.screenShake, 4.2);
      this.callouts.push({ text: '-1', life: 0.35, color: '#ffe9af', size: 16, x: snowman.x, y: snowman.y - snowman.size * 0.8 });

      if (snowman.hp <= 0) {
        const bonus = 7500 + this.combo * 90;
        this.score += bonus;
        this.callouts.push({ text: 'SNOWMAN SMASHED!', life: 1.0, color: '#ffe47f', size: 22, x: snowman.x, y: snowman.y - snowman.size, style: 'brick' });
        this.floatingText.push({ x: snowman.x - 20, y: snowman.y - 18, value: `+${bonus.toLocaleString()}`, life: 1, maxLife: 1, color: '#fff4ca' });
      }
      return;
    }
  }

  damagePlayer() {
    this.remainingLives -= 1;
    this.combo = 0;
    this.comboClock = 0;
    this.screenShake = 12;
    this.flash = 0.4;
    this.callouts.push({ text: 'SMOKED BY THE PLOW!', life: 1.0, color: '#ff5570', size: 20 });
    this.audio.playCrash();
  }

  blowSnow() {
    let removed = 0;

    for (let i = 1; i <= 3; i += 1) {
      const tx = this.player.x + this.player.facingX * (18 + i * 15);
      const ty = this.player.y + this.player.facingY * (18 + i * 15);
      const target = this.worldToCell(tx, ty);
      this.damageSnowmenAt(tx, ty, 1.2);
      if (!target) continue;

      for (let spread = -1; spread <= 1; spread += 1) {
        const col = clamp(target.col + spread, 0, DRIVEWAY.cols - 1);
        const idx = target.row * DRIVEWAY.cols + col;
        const depth = this.snowGrid[idx];
        if (depth <= 0.08) continue;

        const scoop = Math.min(depth, 1.5);
        this.snowGrid[idx] = Math.max(0, depth - scoop);
        removed += scoop;
      }
    }

    if (removed <= 0) return false;
    return this.applyScoreFromClear(removed);
  }

  shovelSnow() {
    const center = this.worldToCell(this.player.x, this.player.y - 16);
    const front = this.worldToCell(this.player.x + this.player.facingX * 20, this.player.y + this.player.facingY * 20);

    const targets = [center, front].filter(Boolean);
    let removed = 0;
    const scoopBoost = this.upgrade.type === UPGRADE_TYPES.SCOOP ? 1.95 : 1;

    for (const target of targets) {
      const worldX = DRIVEWAY.x + (target.col + 0.5) * (DRIVEWAY.width / DRIVEWAY.cols);
      const worldY = DRIVEWAY.y + (target.row + 0.5) * (DRIVEWAY.height / DRIVEWAY.rows);
      this.damageSnowmenAt(worldX, worldY, 1);

      const idx = target.row * DRIVEWAY.cols + target.col;
      const depth = this.snowGrid[idx];
      if (depth <= 0.1) continue;

      const scoop = Math.min(depth, 1.25 * scoopBoost);
      this.snowGrid[idx] = Math.max(0, depth - scoop);
      removed += scoop;
    }

    if (removed <= 0) return false;
    return this.applyScoreFromClear(removed);
  }

  applyScoreFromClear(removed) {
    this.combo += 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.comboClock = 2.5;

    const nearPlow = this.player.y > DRIVEWAY.y + DRIVEWAY.height - 80 && (this.plow.state === 'warning' || this.plow.state === 'passing');
    const frenzy = this.topRowsSnowAverage() > 4.2;

    const points = calculateShovelPoints({ snowDepth: removed, combo: this.combo, nearPlow, frenzy });
    this.score += points;

    if (this.combo % 20 === 0) {
      this.callouts.push({ text: comboRank(this.combo), life: 1.2, color: '#ffea73', size: 18 });
      this.audio.playCombo();
      this.screenShake = Math.max(this.screenShake, 5);
    }

    const bonusLabel = nearPlow ? 'RISK!' : frenzy ? 'FRENZY!' : '';
    this.floatingText.push({
      x: this.player.x + randomRange(-8, 8),
      y: this.player.y - 28,
      value: `+${points.toLocaleString()} ${bonusLabel}`.trim(),
      life: 0.9,
      maxLife: 0.9,
      color: nearPlow ? '#ff9f62' : frenzy ? '#8ff8ff' : '#fff4ca'
    });

    return true;
  }

  worldToCell(x, y) {
    if (x < DRIVEWAY.x || y < DRIVEWAY.y || x > DRIVEWAY.x + DRIVEWAY.width || y > DRIVEWAY.y + DRIVEWAY.height) return null;
    const col = clamp(Math.floor(((x - DRIVEWAY.x) / DRIVEWAY.width) * DRIVEWAY.cols), 0, DRIVEWAY.cols - 1);
    const row = clamp(Math.floor(((y - DRIVEWAY.y) / DRIVEWAY.height) * DRIVEWAY.rows), 0, DRIVEWAY.rows - 1);
    return { col, row };
  }

  addSnow(col, row, amount) {
    const index = row * DRIVEWAY.cols + col;
    this.snowGrid[index] = clamp(this.snowGrid[index] + amount, 0, 10);

    if (row < DRIVEWAY.rows - 1 && Math.random() > 0.68) {
      const spill = index + DRIVEWAY.cols;
      this.snowGrid[spill] = clamp(this.snowGrid[spill] + amount * 0.2, 0, 10);
    }
  }

  topRowsSnowAverage() {
    let total = 0;
    let count = 0;
    for (let row = 0; row < 2; row += 1) {
      for (let col = 0; col < DRIVEWAY.cols; col += 1) {
        total += this.snowGrid[row * DRIVEWAY.cols + col];
        count += 1;
      }
    }
    return total / count;
  }

  updateFx(dt) {
    this.screenShake = Math.max(0, this.screenShake - dt * 18);
    this.flash = Math.max(0, this.flash - dt * 2.8);

    this.floatingText = this.floatingText.filter((item) => {
      item.life -= dt;
      item.y -= dt * 35;
      return item.life > 0;
    });

    this.callouts = this.callouts.filter((item) => {
      if (item.maxLife === undefined) item.maxLife = item.life;
      item.life -= dt;
      if (item.x !== undefined && item.y !== undefined) item.y -= dt * 18;
      return item.life > 0;
    });

    this.particles = this.particles.filter((item) => {
      item.life -= dt;
      item.x += item.vx * dt;
      item.y += item.vy * dt;
      item.vy += 180 * dt;
      return item.life > 0;
    });

    if (this.upgradePickup) this.upgradePickup.bob += dt * 3.8;
  }

  endRun() {
    if (this.score > this.highScore) this.highScore = this.score;
    this.saveLeaderboard();
    this.setState(STATES.GAME_OVER);
  }

  updateHud() {
    if (!this.hud?.score) return;
    this.hud.score.textContent = this.score.toLocaleString();
    this.hud.combo.textContent = `${this.combo.toLocaleString()}x`;
    this.hud.rank.textContent = comboRank(this.combo);
    this.hud.wave.textContent = `${Math.floor(this.elapsedMs / 18000) + 1}`;
    this.hud.lives.textContent = `${this.remainingLives}`;
    this.hud.highScore.textContent = this.highScore.toLocaleString();
  }

  render() {
    const ctx = this.ctx;
    ctx.save();

    const shakeX = this.screenShake > 0 ? randomRange(-this.screenShake, this.screenShake) : 0;
    const shakeY = this.screenShake > 0 ? randomRange(-this.screenShake, this.screenShake) : 0;
    ctx.translate(shakeX, shakeY);

    this.drawBackground();
    this.drawMarquee();
    this.drawStreet();
    this.drawHouse();
    this.drawDrivewaySnow();
    this.drawUpgradePickup();
    this.drawSnowmen();
    this.drawHelpers();
    this.drawPlayer();
    this.drawPlow();
    this.drawWeatherOverlay();
    this.drawParticles();
    this.drawTextFx();

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255, 90, 120, ${this.flash * 0.3})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    ctx.restore();
  }

  drawBackground() {
    const ctx = this.ctx;
    const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    grad.addColorStop(0, '#77b9c8');
    grad.addColorStop(0.45, '#5e93a8');
    grad.addColorStop(1, '#29455e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Tiny drifting flakes in sky.
    ctx.fillStyle = '#eaf7ff';
    for (let i = 0; i < 32; i += 1) {
      const px = (i * 47 + 9) % WIDTH;
      const py = 16 + ((i * 29) % 130);
      ctx.fillRect(px, py, (i % 3) + 1, (i % 3) + 1);
    }

    // Far mountains.
    ctx.fillStyle = '#a8cfda';
    ctx.beginPath();
    ctx.moveTo(0, 150);
    ctx.lineTo(56, 108);
    ctx.lineTo(95, 150);
    ctx.lineTo(164, 84);
    ctx.lineTo(236, 150);
    ctx.lineTo(300, 102);
    ctx.lineTo(358, 150);
    ctx.lineTo(WIDTH, 124);
    ctx.lineTo(WIDTH, 182);
    ctx.lineTo(0, 182);
    ctx.closePath();
    ctx.fill();

    // Mid mountains.
    ctx.fillStyle = '#7eaebf';
    ctx.beginPath();
    ctx.moveTo(0, 164);
    ctx.lineTo(50, 124);
    ctx.lineTo(98, 164);
    ctx.lineTo(146, 104);
    ctx.lineTo(204, 164);
    ctx.lineTo(278, 118);
    ctx.lineTo(340, 164);
    ctx.lineTo(WIDTH, 136);
    ctx.lineTo(WIDTH, 194);
    ctx.lineTo(0, 194);
    ctx.closePath();
    ctx.fill();

    // Treeline layers.
    for (let i = 0; i < 14; i += 1) {
      this.drawSnowyPine(10 + i * 30, 182 + (i % 2) * 3, 0.62, '#4c7781', '#7aa9b6');
    }
    for (let i = 0; i < 12; i += 1) {
      this.drawSnowyPine(20 + i * 34, 194 + (i % 3), 0.78, '#355f69', '#5f8f9c');
    }

    // Snow field and fence horizon.
    ctx.fillStyle = '#dbeef7';
    ctx.fillRect(0, 182, WIDTH, HEIGHT - 182);

    ctx.fillStyle = '#edf9ff';
    for (let x = 0; x < WIDTH; x += 26) {
      ctx.fillRect(x, 188, 18, 3);
      ctx.fillRect(x + 2, 184, 2, 8);
    }

    // Top house is drawn in drawHouse(), keeping background scenery behind gameplay.

    ctx.fillStyle = '#274f67';
    ctx.fillRect(DRIVEWAY.x - 6, DRIVEWAY.y - 6, DRIVEWAY.width + 12, DRIVEWAY.height + 8);

    ctx.fillStyle = '#4f7187';
    ctx.fillRect(DRIVEWAY.x, DRIVEWAY.y, DRIVEWAY.width, DRIVEWAY.height);

    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 2;
    for (let i = 1; i < DRIVEWAY.cols; i += 1) {
      const x = DRIVEWAY.x + (DRIVEWAY.width / DRIVEWAY.cols) * i;
      ctx.beginPath();
      ctx.moveTo(x, DRIVEWAY.y);
      ctx.lineTo(x, DRIVEWAY.y + DRIVEWAY.height);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 18; i += 1) {
      ctx.fillRect((i * 23 + 7) % WIDTH, 118 + (i % 5) * 8, 3, 3);
    }

    this.drawSideDetails();
  }

  drawWeatherOverlay() {
    const ctx = this.ctx;
    const weatherCfg = WEATHER_CONFIG[this.weather.type];
    if (!weatherCfg) return;

    if (weatherCfg.tint > 0) {
      ctx.fillStyle = `rgba(221, 241, 255, ${weatherCfg.tint})`;
      ctx.fillRect(0, 106, WIDTH, HEIGHT - 106);
    }

    const streakAlpha = this.weather.type === WEATHER_TYPES.BLIZZARD ? 0.56 : this.weather.type === WEATHER_TYPES.WIND ? 0.42 : this.weather.type === WEATHER_TYPES.FLURRY ? 0.28 : 0.18;
    ctx.fillStyle = `rgba(245, 252, 255, ${streakAlpha})`;
    for (const streak of this.weatherStreaks) {
      streak.x += this.weather.direction * this.weather.wind * streak.speed * this.fixedStep;
      streak.y += streak.speed * (0.07 + this.weather.wind * 0.05) * this.fixedStep;
      if (streak.x > WIDTH + 14) streak.x = -14;
      if (streak.x < -14) streak.x = WIDTH + 14;
      if (streak.y > HEIGHT + 8) streak.y = 112;
      ctx.fillRect(streak.x, streak.y, streak.size, 2);
    }

    // Strong visibility drop for storm surge conditions.
    if (this.weather.type === WEATHER_TYPES.WIND || this.weather.type === WEATHER_TYPES.BLIZZARD) {
      const pulseBase = this.weather.type === WEATHER_TYPES.BLIZZARD ? 0.26 : 0.14;
      const pulseAmp = this.weather.type === WEATHER_TYPES.BLIZZARD ? 0.1 : 0.06;
      const pulse = pulseBase + (Math.sin(performance.now() / 170) + 1) * pulseAmp;
      ctx.fillStyle = `rgba(232, 245, 255, ${pulse})`;
      ctx.fillRect(0, 106, WIDTH, HEIGHT - 106);

      const dotAlpha = this.weather.type === WEATHER_TYPES.BLIZZARD ? 0.42 : 0.28;
      const dotCount = this.weather.type === WEATHER_TYPES.BLIZZARD ? 120 : 70;
      ctx.fillStyle = `rgba(248, 252, 255, ${dotAlpha})`;
      for (let i = 0; i < dotCount; i += 1) {
        const x = (i * 31 + (performance.now() * 0.18 * this.weather.direction)) % (WIDTH + 40) - 20;
        const y = (i * 23 + performance.now() * 0.12) % (HEIGHT - 106) + 106;
        const w = 2 + (i % 3);
        ctx.fillRect(x, y, w, w);
      }
    }
  }

  drawScenicHouse() {
    const ctx = this.ctx;
    const hx = 246;
    const hy = 124;
    const hw = 130;
    const hh = 56;

    // House body.
    ctx.fillStyle = '#7f523e';
    ctx.fillRect(hx + 46, hy + 26, hw - 46, hh - 2);
    ctx.fillStyle = '#8f5f48';
    for (let y = hy + 30; y < hy + hh + 20; y += 8) {
      ctx.fillRect(hx + 52 + ((y / 8) % 2) * 4, y, hw - 58, 2);
    }

    // Gabled brick front.
    ctx.fillStyle = '#8d5a44';
    ctx.beginPath();
    ctx.moveTo(hx, hy + 26);
    ctx.lineTo(hx + 34, hy - 4);
    ctx.lineTo(hx + 68, hy + 26);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#a06c54';
    for (let y = hy + 4; y < hy + 26; y += 6) {
      ctx.fillRect(hx + 8 + ((y / 6) % 2) * 3, y, 50, 2);
    }

    // Roof + snow.
    ctx.fillStyle = '#6f9eb0';
    ctx.beginPath();
    ctx.moveTo(hx - 6, hy + 26);
    ctx.lineTo(hx + 34, hy - 8);
    ctx.lineTo(hx + 132, hy + 12);
    ctx.lineTo(hx + 138, hy + 26);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f4fcff';
    ctx.fillRect(hx - 2, hy + 22, 144, 4);
    ctx.fillRect(hx + 18, hy + 6, 96, 4);

    // Chimney + smoke.
    ctx.fillStyle = '#9a6a54';
    ctx.fillRect(hx + 86, hy - 6, 10, 18);
    ctx.fillStyle = '#edf9ff';
    ctx.fillRect(hx + 90, hy - 12, 8, 5);
    ctx.fillRect(hx + 98, hy - 18, 8, 5);

    // Windows/door.
    ctx.fillStyle = '#3f2a20';
    ctx.fillRect(hx + 12, hy + 30, 30, 26);
    ctx.fillRect(hx + 74, hy + 34, 14, 22);
    ctx.fillRect(hx + 98, hy + 32, 22, 18);
    ctx.fillStyle = '#ffd46b';
    ctx.fillRect(hx + 16, hy + 34, 10, 18);
    ctx.fillRect(hx + 28, hy + 34, 10, 18);
    for (let i = 0; i < 3; i += 1) {
      ctx.fillRect(hx + 102 + i * 6, hy + 36, 4, 5);
      ctx.fillRect(hx + 102 + i * 6, hy + 43, 4, 5);
    }

    // Driveway-side parked car.
    ctx.fillStyle = '#7ea9be';
    ctx.fillRect(hx + 114, hy + 54, 64, 18);
    ctx.fillRect(hx + 128, hy + 44, 33, 10);
    ctx.fillStyle = '#cde5f0';
    ctx.fillRect(hx + 132, hy + 46, 10, 6);
    ctx.fillRect(hx + 145, hy + 46, 10, 6);
    ctx.fillStyle = '#5f7f93';
    ctx.fillRect(hx + 118, hy + 68, 10, 4);
    ctx.fillRect(hx + 160, hy + 68, 10, 4);
  }

  drawSnowyPine(x, baseY, scale, body, snow) {
    const ctx = this.ctx;
    ctx.fillStyle = '#2a4d58';
    ctx.fillRect(x - 2 * scale, baseY - 10 * scale, 4 * scale, 10 * scale);

    for (let i = 0; i < 4; i += 1) {
      const w = (18 - i * 3) * scale;
      const y = baseY - (10 + i * 8) * scale;
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(x, y - 10 * scale);
      ctx.lineTo(x - w / 2, y + 5 * scale);
      ctx.lineTo(x + w / 2, y + 5 * scale);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = snow;
      ctx.fillRect(x - w * 0.22, y - 3 * scale, w * 0.44, 2 * scale);
    }
  }

  drawSideDetails() {
    const ctx = this.ctx;
    const leftW = DRIVEWAY.x - 8;
    const rightX = DRIVEWAY.x + DRIVEWAY.width + 8;
    const rightW = WIDTH - rightX;

    // Layered snowpack shoulders.
    ctx.fillStyle = '#d5eaf4';
    ctx.fillRect(0, DRIVEWAY.y - 6, leftW, DRIVEWAY.height + 14);
    ctx.fillRect(rightX, DRIVEWAY.y - 6, rightW, DRIVEWAY.height + 14);

    ctx.fillStyle = '#f7fdff';
    ctx.fillRect(DRIVEWAY.x - 20, DRIVEWAY.y + 8, 12, DRIVEWAY.height - 18);
    ctx.fillRect(DRIVEWAY.x + DRIVEWAY.width + 8, DRIVEWAY.y + 8, 12, DRIVEWAY.height - 18);

    ctx.fillStyle = '#c1dced';
    for (let y = DRIVEWAY.y + 14; y < DRIVEWAY.y + DRIVEWAY.height - 10; y += 20) {
      ctx.fillRect(5, y, leftW - 10, 5);
      ctx.fillRect(rightX + 5, y + 7, rightW - 10, 5);
    }

    // Buried shrubs and marker posts.
    ctx.fillStyle = '#89adbe';
    for (let y = DRIVEWAY.y + 28; y < DRIVEWAY.y + DRIVEWAY.height - 20; y += 44) {
      ctx.fillRect(12, y, 10, 8);
      ctx.fillRect(WIDTH - 22, y + 8, 10, 8);
    }

    ctx.fillStyle = '#f0fbff';
    for (let y = DRIVEWAY.y + 24; y < DRIVEWAY.y + DRIVEWAY.height - 12; y += 32) {
      ctx.fillRect(8, y, 5, 2);
      ctx.fillRect(WIDTH - 14, y + 6, 5, 2);
    }
  }

  drawMarquee() {
    const ctx = this.ctx;
    ctx.fillStyle = '#071332';
    ctx.fillRect(8, 8, WIDTH - 16, 104);
    ctx.strokeStyle = '#7cc9ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, WIDTH - 16, 104);

    ctx.textAlign = 'center';
    ctx.font = '900 26px "Arial Black", Impact, sans-serif';
    ctx.strokeStyle = '#49d6ff';
    ctx.lineWidth = 3;
    ctx.strokeText("SHANE'S SHOVELING", WIDTH / 2, 34);
    ctx.fillStyle = '#ff64be';
    ctx.fillText("SHANE'S SHOVELING", WIDTH / 2, 34);

    ctx.font = '900 41px "Arial Black", Impact, sans-serif';
    ctx.strokeStyle = '#ffe679';
    ctx.lineWidth = 3;
    ctx.strokeText('SHITSHOW', WIDTH / 2, 71);
    ctx.fillStyle = '#ff4d9f';
    ctx.fillText('SHITSHOW', WIDTH / 2, 71);

    ctx.font = '900 24px "Arial Black", Impact, sans-serif';
    ctx.fillStyle = '#fff6b4';
    ctx.fillText(this.score.toLocaleString(), WIDTH / 2, 93);

    ctx.textAlign = 'start';
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = '#c7ebff';
    ctx.fillText(`LIVES ${this.remainingLives}`, 12, 103);
    ctx.fillText(`WAVE ${Math.floor(this.elapsedMs / 18000) + 1}`, 110, 103);
    ctx.fillText(`COMBO ${this.combo}x`, 202, 103);

    // Health bar stays fully inside the marquee so it's always visible.
    const hpMax = 3;
    const hpX = WIDTH - 102;
    const hpY = 94;
    ctx.fillStyle = '#1f3754';
    ctx.fillRect(hpX, hpY, 90, 10);
    for (let i = 0; i < hpMax; i += 1) {
      ctx.fillStyle = i < this.remainingLives ? '#ff6b7f' : '#4c5f77';
      ctx.fillRect(hpX + 4 + i * 28, hpY + 2, 24, 6);
    }
  }

  drawStreet() {
    const ctx = this.ctx;
    const sy = this.getStreetY();
    const sh = this.getStreetHeight();
    ctx.fillStyle = '#4a5f70';
    ctx.fillRect(0, sy, WIDTH, sh);

    ctx.fillStyle = '#95aab8';
    ctx.fillRect(0, sy, WIDTH, 5);
    ctx.fillRect(0, sy + sh - 5, WIDTH, 5);

    ctx.fillStyle = '#e0e8ee';
    for (let x = 16; x < WIDTH - 28; x += 74) ctx.fillRect(x, sy + 34, 40, 5);

    ctx.fillStyle = 'rgba(190, 211, 224, 0.28)';
    for (let x = 8; x < WIDTH - 16; x += 48) {
      ctx.fillRect(x, sy + 50, 20, 2);
    }

    if (this.plow.state === 'warning') {
      const alpha = 0.45 + Math.sin(performance.now() / 75) * 0.3;
      ctx.fillStyle = `rgba(255, 78, 88, ${alpha})`;
      ctx.fillRect(0, sy, WIDTH, sh);
    }

    // Keep street fully solid for strong readability on mobile.
  }

  drawDrivewaySnow() {
    const ctx = this.ctx;
    const cellW = DRIVEWAY.width / DRIVEWAY.cols;
    const cellH = DRIVEWAY.height / DRIVEWAY.rows;

    // Driveway base texture.
    ctx.fillStyle = '#6f90a6';
    for (let r = 0; r < DRIVEWAY.rows; r += 1) {
      const y = DRIVEWAY.y + r * cellH;
      ctx.fillRect(DRIVEWAY.x + ((r % 2) * 4), y + cellH - 3, DRIVEWAY.width - 8, 2);
    }

    for (let row = 0; row < DRIVEWAY.rows; row += 1) {
      for (let col = 0; col < DRIVEWAY.cols; col += 1) {
        const idx = row * DRIVEWAY.cols + col;
        const depth = this.snowGrid[idx];
        if (depth <= 0.05) continue;

        const x = DRIVEWAY.x + col * cellW;
        const y = DRIVEWAY.y + row * cellH;
        const h = Math.min(cellH, depth * (cellH * 0.16 + 1.2));

        ctx.fillStyle = depth > 6 ? '#fbfeff' : depth > 3 ? '#eaf6ff' : '#cfe6f5';
        ctx.fillRect(x + 1, y + cellH - h, cellW - 2, h);

        if (depth > 2) {
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.fillRect(x + 3, y + cellH - h + 2, cellW - 10, 2);
        }

        if (depth > 4) {
          ctx.fillStyle = 'rgba(156, 198, 222, 0.48)';
          ctx.fillRect(x + 2, y + cellH - h + 5, cellW - 7, 2);
        }
      }
    }
  }

  drawHouse() {
    const ctx = this.ctx;
    const houseTop = this.getHouseTop();
    const houseBottom = this.getHouseBottom();
    const houseHeight = Math.max(48, houseBottom - houseTop);
    const paintedHouse = this.getArt('house');
    if (paintedHouse) {
      // Fill full game width for a stronger scene composition.
      ctx.drawImage(paintedHouse, 0, houseTop, WIDTH, houseHeight);
      return;
    }

    const baseY = houseBottom - 2;
    const houseX = DRIVEWAY.x - 42;
    const houseW = DRIVEWAY.width + 84;

    // Snow apron between house frontage and driveway.
    ctx.fillStyle = '#eef8ff';
    ctx.fillRect(houseX - 8, baseY, houseW + 16, 8);

    // House mass above driveway.
    const bodyY = houseTop + 10;
    const bodyH = baseY - bodyY;
    const gableW = Math.floor(houseW * 0.52);
    const gableX = houseX + 10;

    ctx.fillStyle = '#835543';
    ctx.fillRect(houseX, bodyY, houseW, bodyH);
    ctx.fillStyle = '#694130';
    for (let y = bodyY + 6; y < bodyY + bodyH - 3; y += 8) {
      ctx.fillRect(houseX + 6 + ((y / 8) % 2) * 6, y, houseW - 12, 2);
    }

    // Gable front to read clearly as a house.
    ctx.fillStyle = '#9e6a52';
    ctx.beginPath();
    ctx.moveTo(gableX, bodyY);
    ctx.lineTo(gableX + gableW / 2, bodyY - 30);
    ctx.lineTo(gableX + gableW, bodyY);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#3f5166';
    ctx.beginPath();
    ctx.moveTo(gableX - 6, bodyY);
    ctx.lineTo(gableX + gableW / 2, bodyY - 36);
    ctx.lineTo(gableX + gableW + 6, bodyY);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#f8fdff';
    ctx.beginPath();
    ctx.moveTo(gableX - 2, bodyY);
    ctx.lineTo(gableX + gableW / 2, bodyY - 32);
    ctx.lineTo(gableX + gableW + 2, bodyY);
    ctx.closePath();
    ctx.fill();

    // Garage door centered to driveway.
    const garageW = DRIVEWAY.width - 40;
    const garageX = DRIVEWAY.x + 20;
    const garageTop = bodyY + 14;
    const garageH = Math.max(18, baseY - garageTop - 2);
    ctx.fillStyle = '#b7cad8';
    ctx.fillRect(garageX, garageTop, garageW, garageH);
    ctx.fillStyle = '#7293aa';
    for (let y = garageTop + 6; y < garageTop + garageH - 2; y += 7) {
      ctx.fillRect(garageX + 6, y, garageW - 12, 2);
    }

    // Warm windows + front door detail.
    ctx.fillStyle = '#3f2a20';
    ctx.fillRect(houseX + 20, bodyY + 16, 30, 20);
    ctx.fillRect(houseX + houseW - 50, bodyY + 16, 30, 20);
    ctx.fillStyle = '#ffd978';
    ctx.fillRect(houseX + 24, bodyY + 20, 9, 12);
    ctx.fillRect(houseX + 36, bodyY + 20, 9, 12);
    ctx.fillRect(houseX + houseW - 46, bodyY + 20, 9, 12);
    ctx.fillRect(houseX + houseW - 34, bodyY + 20, 9, 12);

    ctx.fillStyle = '#3f2a20';
    ctx.fillRect(houseX + 86, bodyY + 12, 20, 44);
    ctx.fillStyle = '#d19b5f';
    ctx.fillRect(houseX + 90, bodyY + 18, 12, 30);

    // Snow drifts and shrub shapes.
    ctx.fillStyle = '#dff1ff';
    ctx.fillRect(houseX + 2, baseY - 8, 72, 8);
    ctx.fillRect(houseX + houseW - 74, baseY - 8, 72, 8);
    ctx.fillRect(garageX - 8, baseY - 4, 18, 4);
    ctx.fillRect(garageX + garageW - 10, baseY - 4, 18, 4);
    ctx.fillStyle = '#8fb7c2';
    ctx.fillRect(houseX + 10, baseY - 12, 14, 4);
    ctx.fillRect(houseX + houseW - 24, baseY - 12, 14, 4);
  }

  drawUpgradePickup() {
    if (!this.upgradePickup) return;
    const ctx = this.ctx;
    const y = this.upgradePickup.y + Math.sin(this.upgradePickup.bob) * 3;
    const x = this.upgradePickup.x;
    const color = this.upgradePickup.type === UPGRADE_TYPES.SCOOP ? '#74ccff' : this.upgradePickup.type === UPGRADE_TYPES.HONDA ? '#ffcd68' : '#ffb6c1';

    ctx.fillStyle = '#0b1b3b';
    ctx.fillRect(x - 20, y - 16, 40, 32);

    const pickupArt = this.upgradePickup.type === UPGRADE_TYPES.SCOOP ? 'scoop' : this.upgradePickup.type === UPGRADE_TYPES.HONDA ? 'honda' : 'higdon';
    const drewArt = this.drawArt(pickupArt, x - 14, y - 12, 28, 24);
    if (!drewArt) {
      if (this.upgradePickup.type === UPGRADE_TYPES.SCOOP) {
        ctx.fillStyle = '#74ccff';
      } else if (this.upgradePickup.type === UPGRADE_TYPES.HONDA) {
        ctx.fillStyle = '#e53b3b';
      } else {
        ctx.fillStyle = '#ffb6c1';
      }
      ctx.fillRect(x - 14, y - 10, 28, 20);
    }

    // Pickup labels are block letters in-world, not in the HUD.
    const pulse = 1 + Math.sin(this.upgradePickup.bob * 1.8) * 0.08;
    ctx.textAlign = 'center';
    ctx.font = `900 ${Math.round(14 * pulse)}px "Arial Black", Impact, sans-serif`;
    ctx.strokeStyle = '#2f0a1d';
    ctx.lineWidth = 3;
    ctx.strokeText(this.upgradePickup.label, x, y - 22);
    ctx.fillStyle = color;
    ctx.fillText(this.upgradePickup.label, x, y - 22);
    ctx.textAlign = 'start';
  }

  drawSnowmen() {
    const ctx = this.ctx;
    const snowmanArt = this.getArt('snowman');
    for (const snowman of this.snowmen) {
      const t = 0.82 + Math.sin(snowman.pulse) * 0.08;
      const size = snowman.size * t;

      ctx.fillStyle = 'rgba(0,0,0,0.27)';
      ctx.fillRect(snowman.x - size * 0.5, snowman.y + size * 0.4, size, 10);

      if (snowmanArt) {
        const wobble = Math.sin(snowman.pulse) * 2;
        ctx.drawImage(snowmanArt, snowman.x - size * 0.58, snowman.y - size * 0.72 + wobble, size * 1.16, size * 1.16);
        const hpRatio = clamp(snowman.hp / snowman.maxHp, 0, 1);
        ctx.fillStyle = '#182a4f';
        ctx.fillRect(snowman.x - 26, snowman.y - size * 0.72, 52, 6);
        ctx.fillStyle = '#8ff8ff';
        ctx.fillRect(snowman.x - 26, snowman.y - size * 0.72, 52 * hpRatio, 6);
        continue;
      }

      ctx.fillStyle = '#eaf8ff';
      ctx.beginPath();
      ctx.arc(snowman.x, snowman.y + size * 0.18, size * 0.37, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(snowman.x, snowman.y - size * 0.25, size * 0.27, 0, Math.PI * 2);
      ctx.fill();

      // Edge shading and highlights for depth.
      ctx.fillStyle = 'rgba(163, 196, 214, 0.55)';
      ctx.beginPath();
      ctx.arc(snowman.x + size * 0.12, snowman.y + size * 0.2, size * 0.3, -1.2, 1.2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(snowman.x + size * 0.1, snowman.y - size * 0.22, size * 0.2, -1.1, 1.15);
      ctx.fill();
      ctx.strokeStyle = '#b7d5e5';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(snowman.x, snowman.y + size * 0.18, size * 0.37, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(snowman.x, snowman.y - size * 0.25, size * 0.27, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(snowman.x - size * 0.16, snowman.y - size * 0.36, size * 0.1, size * 0.05);
      ctx.fillRect(snowman.x - size * 0.2, snowman.y + size * 0.05, size * 0.12, size * 0.05);

      ctx.fillStyle = '#16254a';
      ctx.fillRect(snowman.x - 9, snowman.y - size * 0.54, 18, 9);
      ctx.fillRect(snowman.x - 20, snowman.y - size * 0.45, 40, 7);

      ctx.fillStyle = '#ff4b5f';
      ctx.fillRect(snowman.x - 13, snowman.y - size * 0.28, 8, 5);
      ctx.fillRect(snowman.x + 5, snowman.y - size * 0.28, 8, 5);
      ctx.fillStyle = '#f3943f';
      ctx.fillRect(snowman.x - 2, snowman.y - size * 0.22, 14, 4);

      // Stick arms and coat buttons.
      ctx.fillStyle = '#6f4b35';
      ctx.fillRect(snowman.x - size * 0.5, snowman.y - size * 0.02, size * 0.2, 3);
      ctx.fillRect(snowman.x + size * 0.3, snowman.y + size * 0.02, size * 0.2, 3);
      ctx.fillStyle = '#2a3f5e';
      ctx.fillRect(snowman.x - 2, snowman.y + size * 0.02, 4, 4);
      ctx.fillRect(snowman.x - 2, snowman.y + size * 0.14, 4, 4);

      const hpRatio = clamp(snowman.hp / snowman.maxHp, 0, 1);
      ctx.fillStyle = '#182a4f';
      ctx.fillRect(snowman.x - 26, snowman.y - size * 0.72, 52, 6);
      ctx.fillStyle = '#8ff8ff';
      ctx.fillRect(snowman.x - 26, snowman.y - size * 0.72, 52 * hpRatio, 6);
    }
  }

  drawHelpers() {
    const ctx = this.ctx;
    for (const helper of this.helpers) {
      if (this.drawArt('higdon', helper.x - 27, helper.y - 34, 53, 62)) continue;
      ctx.fillStyle = '#0f1a36';
      ctx.fillRect(helper.x - 9, helper.y - 10, 18, 20);
      ctx.fillStyle = '#ffb6c1';
      ctx.fillRect(helper.x - 7, helper.y - 8, 14, 12);
    }
  }

  drawPlayer() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(this.player.x - 12, this.player.y + 14, 24, 4);
    const facingLeft = this.player.facingX < -0.12;
    const usingArt = this.drawArt('shane', this.player.x - 28, this.player.y - 32, 56, 63, { flipX: facingLeft });
    if (!usingArt) ctx.drawImage(this.sprites.player, this.player.x - 23, this.player.y - 23, 46, 46);

    ctx.fillStyle = '#b8d3e0';
    ctx.fillRect(this.player.x - 4, this.player.y - 2, 8, 2);

    if (this.upgrade.type === UPGRADE_TYPES.HONDA) {
      const px = this.player.x + this.player.facingX * 14;
      const py = this.player.y + this.player.facingY * 14;
      const hondaFacingLeft = this.player.facingX < -0.12;
      const hondaDrew = this.drawArt('honda', px - 44, py - 7, 88, 72, { flipX: hondaFacingLeft });
      if (!hondaDrew) {
        ctx.fillStyle = '#8f0f1f';
        ctx.fillRect(px - 10, py - 8, 20, 14);
        ctx.fillStyle = '#e53b3b';
        ctx.fillRect(px - 8, py - 6, 16, 10);
      }
    } else if (this.upgrade.type === UPGRADE_TYPES.SCOOP) {
      const px = this.player.x + this.player.facingX * 13;
      const py = this.player.y + this.player.facingY * 8;
      this.drawArt('scoop', px - 20, py - 16, 40, 32, { flipX: this.player.facingX < -0.12 });
    }
  }

  drawPlow() {
    if (this.plow.state !== 'passing') return;
    const ctx = this.ctx;
    const dir = this.plow.direction;
    if (this.drawArt('plough', this.plow.x - 102, this.plow.y - 34, 204, 90, { flipX: dir === 1 })) return;
    ctx.save();
    if (dir === -1) {
      ctx.translate(this.plow.x, this.plow.y);
      ctx.scale(-1, 1);
      ctx.drawImage(this.sprites.plow, -95, -25, 190, 80);
    } else {
      ctx.drawImage(this.sprites.plow, this.plow.x - 95, this.plow.y - 25, 190, 80);
    }
    ctx.restore();
  }

  drawParticles() {
    const ctx = this.ctx;
    const snowburst = this.getArt('snowburst');
    for (const particle of this.particles) {
      const t = particle.life / particle.maxLife;
      ctx.globalAlpha = clamp(t, 0, 1);
      if (snowburst && particle.type === 'snow') {
        ctx.drawImage(snowburst, particle.x - 3, particle.y - 3, 8, 8);
      } else {
        ctx.fillStyle = particle.type === 'snow' ? '#ecf8ff' : '#ffd469';
        ctx.fillRect(particle.x, particle.y, particle.type === 'snow' ? 4 : 3, particle.type === 'snow' ? 4 : 3);
      }
    }
    ctx.globalAlpha = 1;
  }

  drawTextFx() {
    const ctx = this.ctx;
    for (const text of this.floatingText) {
      const alpha = clamp(text.life / text.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 12px monospace';
      ctx.fillStyle = text.color;
      ctx.fillText(text.value, text.x - 20, text.y);
    }

    ctx.globalAlpha = 1;
    for (const callout of this.callouts) {
      const maxLife = callout.maxLife || 1;
      const ratio = clamp(callout.life / maxLife, 0, 1);
      const alpha = ratio;
      const progress = 1 - ratio;
      const cxBase = callout.x ?? WIDTH / 2;
      const cyBase = callout.y ?? (this.getStreetY() + this.getStreetHeight() / 2 + 8);
      const scale = callout.grow ? (0.7 + progress * 2.5) : (0.95 + progress * 0.2);
      const shakeAmp = (callout.shake ?? 4) * (callout.grow ? ratio * 1.2 : ratio);
      const jitterX = shakeAmp > 0 ? Math.sin(performance.now() * 0.05 + progress * 12) * shakeAmp : 0;
      const jitterY = shakeAmp > 0 ? Math.cos(performance.now() * 0.07 + progress * 11) * shakeAmp : 0;
      const cx = cxBase + jitterX;
      const cy = cyBase + jitterY;
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';

      ctx.font = `900 ${Math.max(12, Math.round(callout.size * scale))}px "Arial Black", Impact, sans-serif`;
      ctx.strokeStyle = '#531113';
      ctx.lineWidth = 4;
      ctx.strokeText(callout.text, cx, cy);
      ctx.fillStyle = callout.color;
      ctx.fillText(callout.text, cx, cy);
      ctx.textAlign = 'start';
    }
    ctx.globalAlpha = 1;
  }
}

export function constants() {
  return { WIDTH, HEIGHT, DRIVEWAY, STATES };
}
