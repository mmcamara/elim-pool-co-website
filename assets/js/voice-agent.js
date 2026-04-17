// Elim Pool Co. — Voice Agent Widget
// Floating "Let's Chat" → LiveKit voice room with the Moses agent.

import {
  Room,
  RoomEvent,
  Track,
  createLocalAudioTrack,
} from 'https://esm.sh/livekit-client@2.5.7';

const TOKEN_ENDPOINT = '/.netlify/functions/livekit-token';
const AGENT_LABEL = 'Moses · Elim Pool Concierge';
const NAVY = '#126486';
const TEAL = '#62AEB6';

const STATE = {
  idle:       { label: 'Tap to talk',                hint: 'Voice chat with our concierge.' },
  connecting: { label: 'Connecting…',                hint: 'Securing the line.' },
  listening:  { label: 'Moses is listening…',         hint: 'Speak naturally — she\'ll respond.' },
  speaking:   { label: 'Moses is speaking…',          hint: '' },
  muted:      { label: 'Microphone muted',           hint: 'Tap the mic to unmute.' },
  error:      { label: 'Something went wrong',       hint: 'Please try again in a moment.' },
};

const ICONS = {
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  pool: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 18c2 0 2-1.5 4-1.5S8 18 10 18s2-1.5 4-1.5S16 18 18 18s2-1.5 4-1.5"/><path d="M2 13c2 0 2-1.5 4-1.5S8 13 10 13s2-1.5 4-1.5S16 13 18 13s2-1.5 4-1.5"/><path d="M6 8V4h12v4"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
  micOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
  phoneOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="23" y1="1" x2="1" y2="23"/></svg>',
};

class VoiceAgentWidget {
  constructor() {
    this.room = null;
    this.localTrack = null;
    this.audioCtx = null;
    this.analyser = null;
    this.analyserSource = null;
    this.rafId = null;
    this.canvasCtx = null;
    this.state = 'idle';
    this.activeColor = TEAL; // teal when visitor speaks, navy when agent speaks
    this.bars = [0, 0, 0, 0, 0, 0, 0]; // smoothed bar heights
    this.muted = false;
  }

  mount() {
    this.fab = document.createElement('button');
    this.fab.className = 'va-fab';
    this.fab.type = 'button';
    this.fab.setAttribute('aria-expanded', 'false');
    this.fab.setAttribute('aria-controls', 'va-popup');
    this.fab.innerHTML = `<span class="va-fab__icon">${ICONS.chat}</span><span>Let's Chat</span>`;
    this.fab.addEventListener('click', () => this.open());

    this.popup = document.createElement('aside');
    this.popup.className = 'va-popup';
    this.popup.id = 'va-popup';
    this.popup.setAttribute('role', 'dialog');
    this.popup.setAttribute('aria-modal', 'false');
    this.popup.setAttribute('aria-label', 'Voice chat with Moses');
    this.popup.dataset.state = 'idle';
    this.popup.innerHTML = `
      <div class="va-popup__header">
        <div class="va-popup__avatar" aria-hidden="true">${ICONS.pool}</div>
        <div class="va-popup__title">
          <strong>${AGENT_LABEL.split('·')[0].trim()}</strong>
          <span>${AGENT_LABEL.split('·')[1].trim()}</span>
        </div>
        <button class="va-popup__close" type="button" aria-label="Close chat">${ICONS.close}</button>
      </div>
      <div class="va-popup__body">
        <canvas class="va-popup__viz" width="480" height="240" aria-hidden="true"></canvas>
        <p class="va-popup__status" role="status" aria-live="polite">${STATE.idle.label}</p>
        <p class="va-popup__hint">${STATE.idle.hint}</p>
      </div>
      <div class="va-popup__footer">
        <button class="va-btn va-btn--mute" type="button" aria-pressed="false" aria-label="Mute microphone" disabled>${ICONS.mic}</button>
        <button class="va-btn va-btn--primary va-btn--start" type="button" aria-label="Start voice chat">${ICONS.mic}</button>
        <button class="va-btn va-btn--danger va-btn--end" type="button" aria-label="End chat" disabled>${ICONS.phoneOff}</button>
      </div>
    `;

    document.body.appendChild(this.fab);
    document.body.appendChild(this.popup);

    this.canvas = this.popup.querySelector('.va-popup__viz');
    this.canvasCtx = this.canvas.getContext('2d');
    this.statusEl = this.popup.querySelector('.va-popup__status');
    this.hintEl = this.popup.querySelector('.va-popup__hint');
    this.startBtn = this.popup.querySelector('.va-btn--start');
    this.muteBtn = this.popup.querySelector('.va-btn--mute');
    this.endBtn = this.popup.querySelector('.va-btn--end');
    this.closeBtn = this.popup.querySelector('.va-popup__close');

    this.startBtn.addEventListener('click', () => this.connect());
    this.endBtn.addEventListener('click', () => this.disconnect());
    this.muteBtn.addEventListener('click', () => this.toggleMute());
    this.closeBtn.addEventListener('click', () => this.close());

    this.startIdleAnimation();
  }

  open() {
    this.popup.classList.add('is-open');
    this.fab.setAttribute('aria-expanded', 'true');
  }

  close() {
    this.popup.classList.remove('is-open');
    this.fab.setAttribute('aria-expanded', 'false');
    if (this.room) this.disconnect();
  }

  setState(name) {
    this.state = name;
    this.popup.dataset.state = name;
    const meta = STATE[name] || STATE.idle;
    this.statusEl.textContent = meta.label;
    this.hintEl.textContent = meta.hint;
    if (name === 'speaking') this.activeColor = NAVY;
    else if (name === 'listening') this.activeColor = TEAL;
  }

  async connect() {
    if (this.room) return;
    this.setState('connecting');
    this.startBtn.disabled = true;

    try {
      const res = await fetch(TOKEN_ENDPOINT, { method: 'GET' });
      if (!res.ok) throw new Error(`Token endpoint returned ${res.status}`);
      const { token, url } = await res.json();
      if (!token || !url) throw new Error('Token response missing fields');

      this.room = new Room({
        adaptiveStream: true,
        dynacast: true,
        publishDefaults: { dtx: true, red: true },
      });

      this.room
        .on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
          if (track.kind !== Track.Kind.Audio) return;
          if (participant.isLocal) return;
          this.attachAgentAudio(track);
          this.setState('listening');
        })
        .on(RoomEvent.TrackUnsubscribed, (track) => {
          if (track.kind === Track.Kind.Audio) this.detachAgentAudio();
        })
        .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
          const remoteSpeaking = speakers.some((p) => !p.isLocal);
          const localSpeaking = speakers.some((p) => p.isLocal);
          if (remoteSpeaking) this.setState('speaking');
          else if (localSpeaking) this.setState('listening');
          else if (this.state !== 'muted') this.setState('listening');
        })
        .on(RoomEvent.Disconnected, () => this.cleanup());

      await this.room.connect(url, token);
      this.localTrack = await createLocalAudioTrack({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      await this.room.localParticipant.publishTrack(this.localTrack);

      this.muteBtn.disabled = false;
      this.endBtn.disabled = false;
      this.setState('listening');
    } catch (err) {
      console.error('[voice-agent] connect failed', err);
      if (this.room) {
        try { await this.room.disconnect(); } catch (_) {}
      }
      this.detachAgentAudio();
      if (this.localTrack) {
        try { this.localTrack.stop(); } catch (_) {}
        this.localTrack = null;
      }
      this.room = null;
      this.startBtn.disabled = false;
      this.muteBtn.disabled = true;
      this.endBtn.disabled = true;
      this.setState('error');
      this.hintEl.textContent = err.message || 'Connection failed.';
    }
  }

  attachAgentAudio(track) {
    const mediaStream = new MediaStream([track.mediaStreamTrack]);
    this.remoteAudioEl = track.attach();
    this.remoteAudioEl.style.display = 'none';
    document.body.appendChild(this.remoteAudioEl);

    if (!this.audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new Ctx();
    }
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

    this.analyserSource = this.audioCtx.createMediaStreamSource(mediaStream);
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.7;
    this.analyserSource.connect(this.analyser);
  }

  detachAgentAudio() {
    if (this.remoteAudioEl) {
      this.remoteAudioEl.remove();
      this.remoteAudioEl = null;
    }
    if (this.analyserSource) {
      try { this.analyserSource.disconnect(); } catch (_) {}
      this.analyserSource = null;
    }
    this.analyser = null;
  }

  toggleMute() {
    if (!this.localTrack) return;
    this.muted = !this.muted;
    this.localTrack.mute(this.muted);
    this.muteBtn.setAttribute('aria-pressed', String(this.muted));
    this.muteBtn.innerHTML = this.muted ? ICONS.micOff : ICONS.mic;
    this.muteBtn.setAttribute('aria-label', this.muted ? 'Unmute microphone' : 'Mute microphone');
    if (this.muted) this.setState('muted');
    else this.setState('listening');
  }

  async disconnect() {
    if (!this.room) {
      this.cleanup();
      return;
    }
    try {
      await this.room.disconnect();
    } catch (err) {
      console.warn('[voice-agent] disconnect error', err);
    }
  }

  cleanup() {
    this.detachAgentAudio();
    if (this.localTrack) {
      try { this.localTrack.stop(); } catch (_) {}
      this.localTrack = null;
    }
    this.room = null;
    this.muted = false;
    this.muteBtn.setAttribute('aria-pressed', 'false');
    this.muteBtn.innerHTML = ICONS.mic;
    this.muteBtn.disabled = true;
    this.endBtn.disabled = true;
    this.startBtn.disabled = false;
    this.setState('idle');
  }

  // ── Visualizer (canvas bar animation) ──────────────────────────
  startIdleAnimation() {
    const draw = (ts) => {
      this.rafId = requestAnimationFrame(draw);
      this.renderFrame(ts);
    };
    this.rafId = requestAnimationFrame(draw);
  }

  renderFrame(ts) {
    const ctx = this.canvasCtx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    const N = this.bars.length;
    const gap = 14;
    const barW = (w - gap * (N - 1)) / N;
    const baseline = h * 0.5;

    let levels;
    if (this.analyser && this.state === 'speaking') {
      const buf = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(buf);
      levels = bucketize(buf, N).map((v) => v / 255);
    } else {
      const t = ts / 1000;
      const amp = this.state === 'idle' || this.state === 'error' ? 0.10 : 0.32;
      levels = Array.from({ length: N }, (_, i) =>
        amp * (0.55 + 0.45 * Math.sin(t * 2.4 + i * 0.7))
      );
    }

    for (let i = 0; i < N; i++) {
      const target = levels[i];
      this.bars[i] += (target - this.bars[i]) * 0.35;
      const bh = Math.max(8, this.bars[i] * (h * 0.85));
      const x = i * (barW + gap);
      const y = baseline - bh / 2;
      drawRoundedBar(ctx, x, y, barW, bh, barW / 2, this.activeColor);
    }
  }
}

function bucketize(buf, n) {
  const out = new Array(n).fill(0);
  const step = Math.floor(buf.length / n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < step; j++) sum += buf[i * step + j];
    out[i] = sum / step;
  }
  return out;
}

function drawRoundedBar(ctx, x, y, w, h, r, color) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
  ctx.fill();
}

const init = () => {
  const widget = new VoiceAgentWidget();
  widget.mount();
  window.__elimVoiceAgent = widget;
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
