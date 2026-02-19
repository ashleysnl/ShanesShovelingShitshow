import { createSprites } from './pixelAssets.js';
import { InputController } from './input.js';
import { AudioEngine } from './audio.js';
import { Game } from './game.js';

const canvas = document.querySelector('#game-canvas');
const hud = {
  score: document.querySelector('[data-score]'),
  combo: document.querySelector('[data-combo]'),
  rank: document.querySelector('[data-rank]'),
  wave: document.querySelector('[data-wave]'),
  lives: document.querySelector('[data-lives]'),
  highScore: document.querySelector('[data-high-score]')
};

const overlays = {
  title: document.querySelector('#title-screen'),
  pause: document.querySelector('#pause-screen'),
  gameOver: document.querySelector('#game-over-screen'),
  startButton: document.querySelector('[data-start]'),
  restartButton: document.querySelector('[data-restart]'),
  resumeButton: document.querySelector('[data-resume]'),
  finalScore: document.querySelector('[data-final-score]'),
  finalBestCombo: document.querySelector('[data-final-combo]'),
  muteToggle: document.querySelector('[data-mute]'),
  volumeSlider: document.querySelector('[data-volume]')
};

const input = new InputController({
  joystickPad: document.querySelector('[data-joystick]'),
  actionButton: document.querySelector('[data-action]'),
  pauseButton: document.querySelector('[data-pause]'),
  canvas
});

const audio = new AudioEngine();
const sprites = createSprites();

const game = new Game({
  canvas,
  hud,
  overlays,
  input,
  audio,
  sprites
});

requestAnimationFrame(game.loop);

window.addEventListener('touchmove', (event) => {
  if (event.target.closest('.controls, #game-canvas')) {
    event.preventDefault();
  }
}, { passive: false });
