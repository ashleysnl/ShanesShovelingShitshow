const DEAD_ZONE = 0.18;

export class InputController {
  constructor({ joystickPad, actionButton, pauseButton, canvas }) {
    this.canvas = canvas;
    this.joystickPad = joystickPad;
    this.actionButton = actionButton;
    this.pauseButton = pauseButton;

    this.vector = { x: 0, y: 0 };
    this.actionHeld = false;
    this.pausePressed = false;
    this.mouseTarget = null;

    this.keys = new Set();
    this.touchId = null;
    this.touchCenter = null;

    this.bind();
  }

  bind() {
    window.addEventListener('keydown', (event) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyP', 'Escape'].includes(event.code)) {
        event.preventDefault();
      }
      this.keys.add(event.code);
      if (event.code === 'Space') this.actionHeld = true;
      if (event.code === 'KeyP' || event.code === 'Escape') this.pausePressed = true;
    }, { passive: false });

    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
      if (event.code === 'Space') this.actionHeld = false;
    });

    const setActionState = (value) => {
      this.actionHeld = value;
      this.actionButton.classList.toggle('is-down', value);
    };

    this.actionButton.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      setActionState(true);
    }, { passive: false });

    this.actionButton.addEventListener('pointerup', () => setActionState(false));
    this.actionButton.addEventListener('pointercancel', () => setActionState(false));
    this.actionButton.addEventListener('pointerleave', () => setActionState(false));

    this.pauseButton.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.pausePressed = true;
    }, { passive: false });

    this.joystickPad.addEventListener('touchstart', (event) => this.onJoystickStart(event), { passive: false });
    this.joystickPad.addEventListener('touchmove', (event) => this.onJoystickMove(event), { passive: false });
    this.joystickPad.addEventListener('touchend', (event) => this.onJoystickEnd(event), { passive: false });
    this.joystickPad.addEventListener('touchcancel', (event) => this.onJoystickEnd(event), { passive: false });

    this.canvas.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'mouse') return;
      this.mouseTarget = this.normalizeCanvasPoint(event.clientX, event.clientY);
    });

    this.canvas.addEventListener('pointermove', (event) => {
      if (event.pointerType !== 'mouse' || (event.buttons & 1) === 0) return;
      this.mouseTarget = this.normalizeCanvasPoint(event.clientX, event.clientY);
    });

    this.canvas.addEventListener('pointerup', (event) => {
      if (event.pointerType !== 'mouse') return;
      this.mouseTarget = null;
    });
  }

  onJoystickStart(event) {
    event.preventDefault();
    if (this.touchId !== null) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    this.touchId = touch.identifier;

    const rect = this.joystickPad.getBoundingClientRect();
    this.touchCenter = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      radius: rect.width * 0.44
    };

    this.updateJoystickVector(touch.clientX, touch.clientY);
  }

  onJoystickMove(event) {
    event.preventDefault();
    if (this.touchId === null) return;

    const touch = [...event.changedTouches].find((item) => item.identifier === this.touchId);
    if (!touch) return;
    this.updateJoystickVector(touch.clientX, touch.clientY);
  }

  onJoystickEnd(event) {
    event.preventDefault();
    if (this.touchId === null) return;

    const touch = [...event.changedTouches].find((item) => item.identifier === this.touchId);
    if (!touch) return;

    this.touchId = null;
    this.touchCenter = null;
    this.vector.x = 0;
    this.vector.y = 0;
    this.joystickPad.style.setProperty('--knob-x', '0px');
    this.joystickPad.style.setProperty('--knob-y', '0px');
  }

  updateJoystickVector(clientX, clientY) {
    if (!this.touchCenter) return;
    const dx = clientX - this.touchCenter.x;
    const dy = clientY - this.touchCenter.y;
    const radius = this.touchCenter.radius;
    const dist = Math.hypot(dx, dy);
    const clamped = dist > radius ? radius / dist : 1;
    const nx = (dx * clamped) / radius;
    const ny = (dy * clamped) / radius;

    this.vector.x = Math.abs(nx) < DEAD_ZONE ? 0 : nx;
    this.vector.y = Math.abs(ny) < DEAD_ZONE ? 0 : ny;

    this.joystickPad.style.setProperty('--knob-x', `${Math.round(nx * radius * 0.58)}px`);
    this.joystickPad.style.setProperty('--knob-y', `${Math.round(ny * radius * 0.58)}px`);
  }

  normalizeCanvasPoint(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height
    };
  }

  readMovement(playerPosNormalized) {
    let x = 0;
    let y = 0;

    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) x -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) x += 1;
    if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) y -= 1;
    if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) y += 1;

    x += this.vector.x;
    y += this.vector.y;

    if (this.mouseTarget) {
      const dx = this.mouseTarget.x - playerPosNormalized.x;
      const dy = this.mouseTarget.y - playerPosNormalized.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.02) {
        x += dx / dist;
        y += dy / dist;
      }
    }

    const mag = Math.hypot(x, y);
    if (mag > 1) {
      x /= mag;
      y /= mag;
    }

    return { x, y };
  }

  consumePausePress() {
    const value = this.pausePressed;
    this.pausePressed = false;
    return value;
  }
}
