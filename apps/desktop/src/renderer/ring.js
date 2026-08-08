/**
 * The ring window: name, two buttons, and a ringtone.
 *
 * The tone is synthesised rather than shipped as an audio file, the same way
 * the web overlay does it — one less asset to package, and it cannot fail to
 * load. Two tones a beat apart, repeating, which is the cadence a phone uses.
 */

let call = null;
let audio = null;
let ringTimer = null;

window.ring.onCall((incoming) => {
  call = incoming;
  document.getElementById('caller').textContent = incoming.callerName;
  document.getElementById('initial').textContent =
    (incoming.callerName || '?').trim().charAt(0).toUpperCase() || '?';
  startTone();
});

function startTone() {
  try {
    audio = new AudioContext();
  } catch {
    return; // No audio device. The window still shows, which is the point.
  }

  const beep = (at, frequency) => {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    // Ramped rather than switched: a square-edged gain change clicks.
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.18, at + 0.04);
    gain.gain.linearRampToValueAtTime(0, at + 0.38);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.4);
  };

  const cycle = () => {
    if (!audio) return;
    const now = audio.currentTime;
    beep(now, 880);
    beep(now + 0.5, 660);
  };

  cycle();
  ringTimer = setInterval(cycle, 2000);
}

function stopTone() {
  if (ringTimer) clearInterval(ringTimer);
  ringTimer = null;
  audio?.close().catch(() => {});
  audio = null;
}

document.getElementById('accept').addEventListener('click', () => {
  stopTone();
  if (call) window.ring.accept(call.id);
});

document.getElementById('decline').addEventListener('click', () => {
  stopTone();
  if (call) window.ring.decline(call.id);
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !call) return;
  stopTone();
  window.ring.decline(call.id);
});

window.addEventListener('beforeunload', stopTone);
