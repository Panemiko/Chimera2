let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function blip(audio: AudioContext, freq: number, startAt: number, duration: number) {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(0.08, startAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.05);
}

export function playDicePopupSound() {
  const audio = getContext();
  if (!audio) return;
  try {
    const now = audio.currentTime;
    blip(audio, 660, now, 0.12);
    blip(audio, 880, now + 0.1, 0.16);
  } catch {
    // Audio is best-effort, never break the popup.
  }
}
