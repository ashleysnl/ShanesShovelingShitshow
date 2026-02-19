import {
  calculateShovelPoints,
  comboRank,
  plowIntervalMs,
  snowfallRate,
  plowSnowBurst
} from './scoring.js';

const WIDTH = 420;
const HEIGHT = 640;

const DRIVEWAY = {
  x: 54,
  y: 184,
  width: 312,
  height: 446,
  cols: 8,
  rows: 10
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
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

    this.highScore = Number(localStorage.getItem('ssa-high-score') || 0);

    this.bindUi();
    this.configureCanvas();
    this.resetSession();
  }

  bindUi() {
    this.overlays.startButton.addEventListener('click', async () => {
      await this.audio.unlock();
      this.startRun();
    });

    this.overlays.restartButton.addEventListener('click', async () => {
      await this.audio.unlock();
      this.startRun();
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
      facingY: -1
    };

    this.snowGrid = new Array(DRIVEWAY.cols * DRIVEWAY.rows).fill(2);
    this.snowTicker = 0;
    this.passiveSnowEvent = 0;

    this.plow = {
      state: 'waiting',
      timer: plowIntervalMs(0),
      x: -220,
      y: 148,
      direction: 1,
      speed: 280,
      warningMs: 1200
    };

    this.upgrade = {
      type: null,
      timer: 0
    };
    this.upgradeSpawnTimer = 10;
    this.upgradePickup = null;
    this.helpers = [];

    this.floatingText = [];
    this.particles = [];
    this.callouts = [];
    this.screenShake = 0;
    this.flash = 0;
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
    if (this.comboClock === 0 && this.combo > 0) this.combo = 0;

    this.updatePlayer(dt);
    this.updateSnow(dt);
    this.updatePlow(dt);
    this.updateUpgrades(dt);
    this.updateHelpers(dt);
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
    this.snowTicker += dt * snowfallRate(this.elapsedMs);
    while (this.snowTicker >= 1) {
      this.snowTicker -= 1;
      const idx = Math.floor(Math.random() * this.snowGrid.length);
      this.snowGrid[idx] = clamp(this.snowGrid[idx] + 0.5, 0, 10);
    }

    this.passiveSnowEvent += dt;
    if (this.passiveSnowEvent > 1.9) {
      this.passiveSnowEvent = 0;
      const columns = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < columns; i += 1) {
        const c = Math.floor(Math.random() * DRIVEWAY.cols);
        for (let r = 0; r < DRIVEWAY.rows; r += 1) {
          const amount = Math.max(0.1, 0.25 - r * 0.015);
          this.addSnow(c, r, amount);
        }
      }
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

      const progress = plow.direction === 1 ? plow.x + 90 : WIDTH - plow.x + 90;
      const ratio = clamp(progress / (WIDTH + 180), 0, 1);
      const burstCol = clamp(Math.floor(ratio * DRIVEWAY.cols), 0, DRIVEWAY.cols - 1);
      const burst = plowSnowBurst(this.elapsedMs) * dt * 6;

      this.addSnow(burstCol, 0, burst);
      this.addSnow(burstCol, 1, burst * 0.76);
      if (Math.random() > 0.5) this.addSnow(clamp(burstCol + (Math.random() > 0.5 ? 1 : -1), 0, DRIVEWAY.cols - 1), 0, burst * 0.65);

      if (Math.random() > 0.78) {
        this.particles.push({
          x: DRIVEWAY.x + (burstCol + 0.5) * (DRIVEWAY.width / DRIVEWAY.cols),
          y: DRIVEWAY.y + 18,
          vx: randomRange(-30, 30),
          vy: randomRange(10, 70),
          life: randomRange(0.3, 0.6),
          maxLife: 0.6,
          type: 'snow'
        });
      }

      this.screenShake = Math.max(this.screenShake, 2.6);

      const streetHit = this.player.y < DRIVEWAY.y + 50;
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
        this.callouts.push({
          text: 'UPGRADE EXPIRED',
          life: 0.9,
          color: '#ffd9a8',
          size: 16,
          x: this.player.x,
          y: this.player.y - 26
        });
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
    this.upgradePickup = {
      type,
      x: randomRange(DRIVEWAY.x + 24, DRIVEWAY.x + DRIVEWAY.width - 24),
      y: randomRange(DRIVEWAY.y + 48, DRIVEWAY.y + DRIVEWAY.height - 56),
      bob: randomRange(0, Math.PI * 2)
    };
    this.upgradeSpawnTimer = randomRange(16, 24);
    this.callouts.push({ text: 'UPGRADE DROP!', life: 0.9, color: '#8ff8ff', size: 18 });
  }

  collectUpgrade(type) {
    this.upgrade.type = type;
    this.upgrade.timer = type === UPGRADE_TYPES.HONDA ? 10 : type === UPGRADE_TYPES.HIGDON ? 12 : 12;

    if (type === UPGRADE_TYPES.SCOOP) {
      this.callouts.push({
        text: 'THE SCOOP',
        life: 1.2,
        color: '#7cd3ff',
        size: 28,
        x: this.player.x,
        y: this.player.y - 10,
        style: 'brick'
      });
    } else if (type === UPGRADE_TYPES.HONDA) {
      this.callouts.push({
        text: 'THE HONDA',
        life: 1.2,
        color: '#ffcd68',
        size: 28,
        x: this.player.x,
        y: this.player.y - 10,
        style: 'brick'
      });
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
      this.callouts.push({
        text: 'HIGDON IS HERE TO HELP',
        life: 1.5,
        color: '#ffb6c1',
        size: 24,
        x: this.player.x,
        y: this.player.y - 10,
        style: 'brick'
      });
    }

    for (let i = 0; i < 18; i += 1) {
      this.particles.push({
        x: this.player.x,
        y: this.player.y,
        vx: randomRange(-90, 90),
        vy: randomRange(-120, -30),
        life: randomRange(0.3, 0.7),
        maxLife: 0.7,
        type: 'spark'
      });
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
          this.particles.push({
            x: helper.x + randomRange(-6, 6),
            y: helper.y + randomRange(-6, 6),
            vx: randomRange(-35, 35),
            vy: randomRange(-80, -20),
            life: randomRange(0.16, 0.3),
            maxLife: 0.3,
            type: 'snow'
          });
        }
      }
    }

    if (this.upgrade.type !== UPGRADE_TYPES.HIGDON && this.helpers.length > 0) {
      this.callouts.push({
        text: 'HIGDON BOUNCED',
        life: 1,
        color: '#ffd9a8',
        size: 18,
        x: this.helpers[0].x,
        y: this.helpers[0].y - 10
      });
      this.helpers = [];
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

    for (let i = 0; i < 26; i += 1) {
      this.particles.push({
        x: this.player.x,
        y: this.player.y,
        vx: randomRange(-150, 150),
        vy: randomRange(-190, -20),
        life: randomRange(0.35, 0.75),
        maxLife: 0.75,
        type: 'spark'
      });
    }
  }

  blowSnow() {
    let removed = 0;

    for (let i = 1; i <= 3; i += 1) {
      const target = this.worldToCell(
        this.player.x + this.player.facingX * (18 + i * 15),
        this.player.y + this.player.facingY * (18 + i * 15)
      );
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

    for (let i = 0; i < 6; i += 1) {
      this.particles.push({
        x: this.player.x + this.player.facingX * 16,
        y: this.player.y + this.player.facingY * 16,
        vx: this.player.facingX * randomRange(60, 140) + randomRange(-40, 40),
        vy: this.player.facingY * randomRange(60, 140) + randomRange(-40, 40),
        life: randomRange(0.18, 0.36),
        maxLife: 0.36,
        type: 'snow'
      });
    }

    return this.applyScoreFromClear(removed);
  }

  shovelSnow() {
    const center = this.worldToCell(this.player.x, this.player.y - 16);
    const front = this.worldToCell(
      this.player.x + this.player.facingX * 20,
      this.player.y + this.player.facingY * 20
    );

    const targets = [center, front].filter(Boolean);
    let removed = 0;
    const scoopBoost = this.upgrade.type === UPGRADE_TYPES.SCOOP ? 1.95 : 1;

    for (const target of targets) {
      const idx = target.row * DRIVEWAY.cols + target.col;
      const depth = this.snowGrid[idx];
      if (depth <= 0.1) continue;

      const scoop = Math.min(depth, 1.25 * scoopBoost);
      this.snowGrid[idx] = Math.max(0, depth - scoop);
      removed += scoop;

      for (let i = 0; i < 2; i += 1) {
        this.particles.push({
          x: DRIVEWAY.x + (target.col + 0.5) * (DRIVEWAY.width / DRIVEWAY.cols),
          y: DRIVEWAY.y + (target.row + 0.5) * (DRIVEWAY.height / DRIVEWAY.rows),
          vx: randomRange(-60, 60),
          vy: randomRange(-80, -10),
          life: randomRange(0.2, 0.5),
          maxLife: 0.5,
          type: 'snow'
        });
      }
    }

    if (removed <= 0) return false;
    return this.applyScoreFromClear(removed);
  }

  applyScoreFromClear(removed) {
    this.combo += 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.comboClock = 2.5;

    const nearPlow = this.player.y < DRIVEWAY.y + 80 && (this.plow.state === 'warning' || this.plow.state === 'passing');
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
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('ssa-high-score', String(this.highScore));
    }
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
    this.drawDrivewaySnow();
    this.drawUpgradePickup();
    this.drawHelpers();
    this.drawPlayer();
    this.drawPlow();
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
    grad.addColorStop(0, '#1f3061');
    grad.addColorStop(1, '#112039');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.fillStyle = '#173f53';
    ctx.fillRect(DRIVEWAY.x - 6, DRIVEWAY.y - 6, DRIVEWAY.width + 12, DRIVEWAY.height + 8);

    ctx.fillStyle = '#46728c';
    ctx.fillRect(DRIVEWAY.x, DRIVEWAY.y, DRIVEWAY.width, DRIVEWAY.height);

    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    for (let i = 1; i < DRIVEWAY.cols; i += 1) {
      const x = DRIVEWAY.x + (DRIVEWAY.width / DRIVEWAY.cols) * i;
      ctx.beginPath();
      ctx.moveTo(x, DRIVEWAY.y);
      ctx.lineTo(x, DRIVEWAY.y + DRIVEWAY.height);
      ctx.stroke();
    }

    this.drawSideDetails();
  }

  drawSideDetails() {
    const ctx = this.ctx;
    const leftW = DRIVEWAY.x - 8;
    const rightX = DRIVEWAY.x + DRIVEWAY.width + 8;
    const rightW = WIDTH - rightX;

    // Side yards
    ctx.fillStyle = '#214e4f';
    ctx.fillRect(0, DRIVEWAY.y - 6, leftW, DRIVEWAY.height + 14);
    ctx.fillRect(rightX, DRIVEWAY.y - 6, rightW, DRIVEWAY.height + 14);

    // Snowbanks framing driveway
    ctx.fillStyle = '#e7f5ff';
    ctx.fillRect(DRIVEWAY.x - 20, DRIVEWAY.y + 8, 12, DRIVEWAY.height - 18);
    ctx.fillRect(DRIVEWAY.x + DRIVEWAY.width + 8, DRIVEWAY.y + 8, 12, DRIVEWAY.height - 18);

    // Fence / post details
    ctx.fillStyle = '#9ec8de';
    for (let y = DRIVEWAY.y + 26; y < DRIVEWAY.y + DRIVEWAY.height - 12; y += 44) {
      ctx.fillRect(8, y, leftW - 18, 6);
      ctx.fillRect(rightX + 10, y, rightW - 18, 6);
    }

    // Mailbox on left, lamp on right for scene flavor
    ctx.fillStyle = '#2a3c66';
    ctx.fillRect(14, DRIVEWAY.y + 84, 6, 26);
    ctx.fillStyle = '#ff8d62';
    ctx.fillRect(9, DRIVEWAY.y + 72, 16, 12);

    ctx.fillStyle = '#2a3c66';
    ctx.fillRect(WIDTH - 22, DRIVEWAY.y + 66, 6, 36);
    ctx.fillStyle = '#ffe182';
    ctx.fillRect(WIDTH - 26, DRIVEWAY.y + 52, 14, 12);
  }

  drawMarquee() {
    const ctx = this.ctx;
    ctx.fillStyle = '#071332';
    ctx.fillRect(8, 8, WIDTH - 16, 102);
    ctx.strokeStyle = '#7cc9ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, WIDTH - 16, 102);

    ctx.textAlign = 'center';
    ctx.font = '900 22px "Arial Black", Impact, sans-serif';
    ctx.strokeStyle = '#49d6ff';
    ctx.lineWidth = 3;
    ctx.strokeText("SHANE'S SHOVELING", WIDTH / 2, 32);
    ctx.fillStyle = '#ff64be';
    ctx.fillText("SHANE'S SHOVELING", WIDTH / 2, 32);

    ctx.font = '900 34px "Arial Black", Impact, sans-serif';
    ctx.strokeStyle = '#ffe679';
    ctx.lineWidth = 3;
    ctx.strokeText('SHITSHOW', WIDTH / 2, 65);
    ctx.fillStyle = '#ff4d9f';
    ctx.fillText('SHITSHOW', WIDTH / 2, 65);

    ctx.font = '900 25px "Arial Black", Impact, sans-serif';
    ctx.fillStyle = '#fff6b4';
    ctx.fillText(this.score.toLocaleString(), WIDTH / 2, 92);

    ctx.textAlign = 'start';
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#c7ebff';
    ctx.fillText(`LIVES ${this.remainingLives}`, 12, 116);
    ctx.fillText(`WAVE ${Math.floor(this.elapsedMs / 18000) + 1}`, 108, 116);
    ctx.fillText(`COMBO ${this.combo}x`, 196, 116);
  }

  drawStreet() {
    const ctx = this.ctx;
    ctx.fillStyle = '#2d2f3a';
    ctx.fillRect(0, 106, WIDTH, 72);

    ctx.fillStyle = '#f6f7f9';
    for (let x = 16; x < WIDTH - 28; x += 74) ctx.fillRect(x, 140, 40, 5);

    if (this.plow.state === 'warning') {
      const alpha = 0.45 + Math.sin(performance.now() / 75) * 0.3;
      ctx.fillStyle = `rgba(255, 78, 88, ${alpha})`;
      ctx.fillRect(0, 106, WIDTH, 72);
    }
  }

  drawDrivewaySnow() {
    const ctx = this.ctx;
    const cellW = DRIVEWAY.width / DRIVEWAY.cols;
    const cellH = DRIVEWAY.height / DRIVEWAY.rows;

    for (let row = 0; row < DRIVEWAY.rows; row += 1) {
      for (let col = 0; col < DRIVEWAY.cols; col += 1) {
        const idx = row * DRIVEWAY.cols + col;
        const depth = this.snowGrid[idx];
        if (depth <= 0.05) continue;

        const x = DRIVEWAY.x + col * cellW;
        const y = DRIVEWAY.y + row * cellH;
        const h = Math.min(cellH, depth * (cellH * 0.16 + 1.2));

        ctx.fillStyle = depth > 6 ? '#e8f7ff' : depth > 3 ? '#d4ecff' : '#b6dcfb';
        ctx.fillRect(x + 1, y + cellH - h, cellW - 2, h);

        if (depth > 5.4) ctx.drawImage(this.sprites.snowChunk, x + cellW * 0.16, y + cellH - h - 10, 18, 18);
      }
    }
  }

  drawUpgradePickup() {
    if (!this.upgradePickup) return;

    const ctx = this.ctx;
    const bobY = Math.sin(this.upgradePickup.bob) * 3;
    const x = this.upgradePickup.x;
    const y = this.upgradePickup.y + bobY;

    ctx.fillStyle = '#0b1b3b';
    ctx.fillRect(x - 18, y - 14, 36, 28);

    if (this.upgradePickup.type === UPGRADE_TYPES.SCOOP) {
      ctx.fillStyle = '#74ccff';
      ctx.fillRect(x - 14, y - 10, 28, 20);
      ctx.fillStyle = '#dff3ff';
      ctx.fillRect(x - 3, y - 10, 6, 20);
    } else if (this.upgradePickup.type === UPGRADE_TYPES.HONDA) {
      ctx.fillStyle = '#ffc95f';
      ctx.fillRect(x - 14, y - 10, 28, 20);
      ctx.fillStyle = '#f36f2d';
      ctx.fillRect(x - 10, y - 6, 20, 12);
    } else {
      ctx.fillStyle = '#ffb6c1';
      ctx.fillRect(x - 14, y - 10, 28, 20);
      ctx.fillStyle = '#2f3a6c';
      ctx.fillRect(x - 8, y - 6, 16, 12);
    }
  }

  drawHelpers() {
    const ctx = this.ctx;
    for (const helper of this.helpers) {
      ctx.fillStyle = '#0f1a36';
      ctx.fillRect(helper.x - 9, helper.y - 10, 18, 20);
      ctx.fillStyle = '#ffb6c1';
      ctx.fillRect(helper.x - 7, helper.y - 8, 14, 12);
      ctx.fillStyle = '#76d6ff';
      ctx.fillRect(helper.x - 8, helper.y + 4, 16, 6);
    }
  }

  drawPlayer() {
    const ctx = this.ctx;
    const w = 46;
    const h = 46;
    ctx.drawImage(this.sprites.player, this.player.x - w / 2, this.player.y - h / 2, w, h);

    if (this.upgrade.type === UPGRADE_TYPES.SCOOP) {
      ctx.strokeStyle = '#78d4ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.player.x, this.player.y, 20, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (this.upgrade.type === UPGRADE_TYPES.HONDA) {
      const px = this.player.x + this.player.facingX * 14;
      const py = this.player.y + this.player.facingY * 14;
      ctx.fillStyle = '#8f0f1f';
      ctx.fillRect(px - 10, py - 8, 20, 14);
      ctx.fillStyle = '#e53b3b';
      ctx.fillRect(px - 8, py - 6, 16, 10);
      ctx.fillStyle = '#cfd8ec';
      ctx.fillRect(px + this.player.facingX * 8 - 4, py + this.player.facingY * 8 - 3, 8, 6);
    }

    if (this.input.actionHeld) {
      ctx.globalAlpha = 0.5;
      ctx.drawImage(this.sprites.spark, this.player.x + this.player.facingX * 13 - 8, this.player.y + this.player.facingY * 13 - 8, 16, 16);
      ctx.globalAlpha = 1;
    }
  }

  drawPlow() {
    if (this.plow.state !== 'passing') return;
    const ctx = this.ctx;
    const dir = this.plow.direction;
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
    for (const particle of this.particles) {
      const t = particle.life / particle.maxLife;
      ctx.globalAlpha = clamp(t, 0, 1);
      if (particle.type === 'snow') {
        ctx.fillStyle = '#ecf8ff';
        ctx.fillRect(particle.x, particle.y, 4, 4);
      } else {
        ctx.fillStyle = '#ffd469';
        ctx.fillRect(particle.x, particle.y, 3, 3);
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
      const alpha = clamp(callout.life, 0, 1);
      const cx = callout.x ?? WIDTH / 2;
      const cy = callout.y ?? (DRIVEWAY.y - 14);
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';

      if (callout.style === 'brick') {
        ctx.font = `900 ${callout.size}px "Arial Black", Impact, sans-serif`;
        ctx.strokeStyle = '#531113';
        ctx.lineWidth = 4;
        ctx.strokeText(callout.text, cx, cy);
        ctx.fillStyle = callout.color;
        ctx.fillText(callout.text, cx, cy);
      } else {
        ctx.font = `bold ${callout.size}px monospace`;
        ctx.fillStyle = '#1e2340';
        ctx.fillText(callout.text, cx + 2, cy + 2);
        ctx.fillStyle = callout.color;
        ctx.fillText(callout.text, cx, cy);
      }
      ctx.textAlign = 'start';
    }
    ctx.globalAlpha = 1;
  }
}

export function constants() {
  return { WIDTH, HEIGHT, DRIVEWAY, STATES };
}
