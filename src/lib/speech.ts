// Narración voluntaria con la síntesis de voz del navegador. El texto siempre permanece visible.

export const speechSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

function spanishVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => /^es[-_](CO|MX|US|419)/i.test(v.lang)) ??
    voices.find((v) => /^es/i.test(v.lang))
  );
}

export function speak(text: string, onEnd?: () => void): void {
  if (!speechSupported()) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'es-419';
  const v = spanishVoice();
  if (v) u.voice = v;
  u.rate = 0.95;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  window.speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if (speechSupported()) window.speechSynthesis.cancel();
}
