const LANGUAGE_SETTINGS = {
  ur: { utteranceLang: 'ur-PK', rate: 0.85, voicePrefixes: ['ur', 'hi'] },
  en: { utteranceLang: 'en-US', rate: 0.95, voicePrefixes: ['en'] },
};

let pendingVoiceLoad = null;
let activeSpeechRequest = 0;
let activeUtterance = null;

function getSynthesis() {
  if (typeof window === 'undefined') return null;
  return window.speechSynthesis || null;
}

export function isSpeechSupported() {
  return Boolean(
    getSynthesis() &&
      typeof window !== 'undefined' &&
      window.SpeechSynthesisUtterance,
  );
}

export function loadVoices() {
  const synthesis = getSynthesis();
  if (!synthesis) return Promise.resolve([]);

  const availableVoices = synthesis.getVoices();
  if (availableVoices.length > 0) return Promise.resolve(availableVoices);
  if (pendingVoiceLoad) return pendingVoiceLoad;

  pendingVoiceLoad = new Promise((resolve) => {
    let timeoutId;
    let previousHandler;
    let fallbackHandler;
    let settled = false;

    const cleanup = () => {
      clearTimeout(timeoutId);
      if (typeof synthesis.removeEventListener === 'function') {
        synthesis.removeEventListener('voiceschanged', handleVoicesChanged);
      } else if (fallbackHandler && synthesis.onvoiceschanged === fallbackHandler) {
        synthesis.onvoiceschanged = previousHandler || null;
      }
    };

    const settle = (voices) => {
      if (settled) return;
      settled = true;
      cleanup();
      pendingVoiceLoad = null;
      resolve(voices);
    };

    const handleVoicesChanged = () => {
      const voices = synthesis.getVoices();
      if (voices.length > 0) settle(voices);
    };

    if (typeof synthesis.addEventListener === 'function') {
      synthesis.addEventListener('voiceschanged', handleVoicesChanged);
    } else {
      previousHandler = synthesis.onvoiceschanged;
      fallbackHandler = (event) => {
        if (typeof previousHandler === 'function') previousHandler.call(synthesis, event);
        handleVoicesChanged();
      };
      synthesis.onvoiceschanged = fallbackHandler;
    }

    timeoutId = setTimeout(() => settle(synthesis.getVoices()), 2000);
  });

  return pendingVoiceLoad;
}

export function hasLanguageVoice(voices, lang) {
  const settings = LANGUAGE_SETTINGS[lang] || LANGUAGE_SETTINGS.en;
  return settings.voicePrefixes.some((prefix) =>
    voices.some((voice) => voice.lang?.toLowerCase().startsWith(prefix)),
  );
}

export function pickVoice(lang, voices = getSynthesis()?.getVoices() || []) {
  const settings = LANGUAGE_SETTINGS[lang] || LANGUAGE_SETTINGS.en;

  for (const prefix of settings.voicePrefixes) {
    const match = voices.find((voice) =>
      voice.lang?.toLowerCase().startsWith(prefix),
    );
    if (match) return match;
  }

  return voices.find((voice) => voice.default) || voices[0] || null;
}

export function cancelSpeech() {
  activeSpeechRequest += 1;
  getSynthesis()?.cancel();
  activeUtterance = null;
}

export function speak(text, lang = 'ur', { rate } = {}) {
  const synthesis = getSynthesis();
  const fullText = typeof text === 'string' ? text.trim() : '';

  if (!synthesis || !window.SpeechSynthesisUtterance || !fullText) return null;

  const settings = LANGUAGE_SETTINGS[lang] || LANGUAGE_SETTINGS.en;
  const requestId = activeSpeechRequest + 1;
  activeSpeechRequest = requestId;
  synthesis.cancel();

  const utterance = new window.SpeechSynthesisUtterance(fullText);
  utterance.lang = settings.utteranceLang;
  utterance.rate = rate ?? settings.rate;
  activeUtterance = utterance;

  const releaseUtterance = () => {
    if (activeUtterance === utterance) activeUtterance = null;
  };
  utterance.addEventListener('end', releaseUtterance, { once: true });
  utterance.addEventListener('error', releaseUtterance, { once: true });

  loadVoices()
    .then((voices) => {
      if (activeSpeechRequest !== requestId) return;

      const voice = pickVoice(lang, voices);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      }
      synthesis.speak(utterance);
    })
    .catch(() => {
      if (activeSpeechRequest === requestId) synthesis.speak(utterance);
    });

  return utterance;
}

function cleanField(value) {
  return typeof value === 'string' ? value.trim().replace(/[,.]+$/, '') : '';
}

export function getMedicineSpeechText(medicine, lang) {
  if (lang === 'ur') {
    return typeof medicine?.purpose_explanation === 'string'
      ? medicine.purpose_explanation.trim()
      : '';
  }

  const name = cleanField(medicine?.name);
  const dosage = cleanField(medicine?.dosage);
  const frequency = cleanField(medicine?.frequency);
  const duration = cleanField(medicine?.duration);

  if (!name && !dosage && !frequency && !duration) return '';

  let instruction = `Take ${[name, dosage].filter(Boolean).join(' ') || 'this medicine'}`;
  if (frequency) instruction += `, ${frequency}`;
  if (duration) {
    instruction += `, ${/^for\b/i.test(duration) ? duration : `for ${duration}`}`;
  }

  return `${instruction}.`;
}

// Reads the whole day in time order. The slots arrive from /schedule already
// ordered morning -> night, so the spoken order matches the order on screen.
export function getScheduleSpeechText(slots, lang) {
  const filled = (slots || []).filter((slot) => slot.medicines?.length > 0);
  if (filled.length === 0) return '';

  const urdu = lang === 'ur';
  const separator = urdu ? '، ' : ', ';
  const stop = urdu ? '۔ ' : '. ';

  const lines = filled.map((slot) => {
    const label = urdu ? slot.label_ur || slot.label : slot.label;
    const items = slot.medicines
      .map((medicine) => [cleanField(medicine.name), cleanField(medicine.dosage)].filter(Boolean).join(' '))
      .filter(Boolean)
      .join(separator);
    return `${label}: ${items}`;
  });

  const heading = urdu ? 'آج کا شیڈول' : "Today's schedule";
  return `${heading}${stop}${lines.join(stop)}${urdu ? '۔' : '.'}`;
}
