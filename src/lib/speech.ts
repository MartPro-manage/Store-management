// Speech Synthesis Utility for POS Audio Greetings and Feedback

let cachedVoices: SpeechSynthesisVoice[] = [];

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  const loadVoices = () => {
    try {
      const v = window.speechSynthesis.getVoices();
      if (v && v.length > 0) {
        cachedVoices = v;
      }
    } catch {
      // ignore
    }
  };

  loadVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
}

// Global registry of announced sales to guarantee speech occurs strictly ONE time per transaction
const announcedSalesRegistry = new Set<string>();

// Format text for clear, natural human pronunciation
export const formatTextForSpeech = (text: string): string => {
  return text
    .replace(/\bRs\.?\s*(\d+)\.00\b/gi, '$1 rupees')
    .replace(/\bRs\.?\s*(\d+)\.(\d{1,2})\b/gi, '$1 point $2 rupees')
    .replace(/\bRs\.?\s*(\d+)\b/gi, '$1 rupees')
    .replace(/\bRs\.?\b/gi, 'rupees')
    .replace(/\bPKR\b/gi, 'rupees')
    .replace(/#/g, 'number ')
    .replace(/\bQty:?\s*/gi, 'Quantity ')
    .replace(/\bBC:?\s*/gi, 'Barcode ')
    .replace(/\bPOS\b/g, 'P O S')
    .replace(/\b(\d+)\s*pcs\b/gi, '$1 pieces')
    .replace(/\b(\d+)\s*kg\b/gi, '$1 kilograms')
    .replace(/•/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export const formatAmountWords = (val: number): string => {
  const rounded = Math.round(val * 100) / 100;
  const whole = Math.floor(rounded);
  const fraction = Math.round((rounded - whole) * 100);
  if (fraction > 0) {
    return `${whole} rupees and ${fraction} paisa`;
  }
  return `${whole} rupees`;
};

export const getBestAvailableVoice = (): SpeechSynthesisVoice | null => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;

  let voices = cachedVoices;
  if (!voices || voices.length === 0) {
    voices = window.speechSynthesis.getVoices() || [];
    cachedVoices = voices;
  }

  if (!voices || voices.length === 0) return null;

  // Prioritize high-quality, natural neural voices
  const voiceScore = (v: SpeechSynthesisVoice): number => {
    let score = 0;
    const name = v.name.toLowerCase();
    const lang = v.lang.toLowerCase();

    if (lang.startsWith('en')) score += 50;
    if (lang.startsWith('en-us') || lang.startsWith('en-gb') || lang.startsWith('en-in')) score += 20;

    // High quality voice indicators
    if (name.includes('natural') || name.includes('neural') || name.includes('online')) score += 40;
    if (name.includes('google')) score += 30;
    if (name.includes('samantha') || name.includes('ava') || name.includes('karen') || name.includes('daniel') || name.includes('serena') || name.includes('jenny') || name.includes('guy') || name.includes('aria') || name.includes('zira')) score += 25;
    if (name.includes('enhanced') || name.includes('premium')) score += 20;
    if (v.default) score += 5;

    return score;
  };

  const sorted = [...voices].sort((a, b) => voiceScore(b) - voiceScore(a));
  return sorted[0] || null;
};

export interface SpeakOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
}

let lastSpokenText = '';
let lastSpokenTime = 0;

export const speakMessage = (
  text: string = 'Thank you for your purchase!',
  options: SpeakOptions = {}
): boolean => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return false;
  }

  try {
    const formatted = formatTextForSpeech(text);
    if (!formatted) return false;

    // Strict deduplication: Ignore if identical message was spoken within 4 seconds
    const now = Date.now();
    if (formatted === lastSpokenText && now - lastSpokenTime < 4000) {
      return false;
    }

    lastSpokenText = formatted;
    lastSpokenTime = now;

    // Cancel any previous active utterance to avoid overlapping or garbled speech
    window.speechSynthesis.cancel();

    // Chrome freeze safeguard: resume if paused
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

    // Brief timeout ensures previous utterance is fully cleared from audio buffer
    setTimeout(() => {
      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }

        const utterance = new SpeechSynthesisUtterance(formatted);
        utterance.rate = options.rate ?? 0.9; 
        utterance.pitch = options.pitch ?? 1.0;
        utterance.volume = options.volume ?? 1.0;
        utterance.lang = 'en-US';

        const preferredVoice = getBestAvailableVoice();
        if (preferredVoice) {
          utterance.voice = preferredVoice;
          utterance.lang = preferredVoice.lang;
        }

        window.speechSynthesis.speak(utterance);
      } catch (innerErr) {
        console.warn('Speech utterance execution error:', innerErr);
      }
    }, 40);

    return true;
  } catch (err) {
    console.error('Error triggering voice speech synthesis:', err);
    return false;
  }
};

/**
 * Specifically format and speak customer change announcement with exact rupees and paisas.
 * Guaranteed to execute strictly ONE time per sale transaction unless explicitly replayed.
 */
export const speakCustomerChange = (
  totalBill: number,
  cashReceived: number,
  changeToReturn: number,
  saleId?: string,
  forceReplay: boolean = false
) => {
  if (saleId && !forceReplay) {
    if (announcedSalesRegistry.has(saleId)) {
      return false; // Already announced one time
    }
    announcedSalesRegistry.add(saleId);
  }

  const round2 = (num: number) => Math.round(num * 100) / 100;
  const billVal = round2(totalBill);
  const receivedVal = round2(cashReceived);
  const changeVal = round2(changeToReturn);

  if (changeVal > 0) {
    const speech = `Total bill is ${formatAmountWords(billVal)}. Cash received is ${formatAmountWords(receivedVal)}. Return ${formatAmountWords(changeVal)} change to customer.`;
    return speakMessage(speech, { rate: 0.9 });
  } else {
    const speech = `Total bill is ${formatAmountWords(billVal)}. Exact payment received. Thank you!`;
    return speakMessage(speech, { rate: 0.9 });
  }
};

/**
 * Mark a sale as already announced to avoid duplicate speech from downstream receipt modals
 */
export const markSaleAsAnnounced = (saleId: string) => {
  if (saleId) {
    announcedSalesRegistry.add(saleId);
  }
};

export const isSaleAnnounced = (saleId: string): boolean => {
  return saleId ? announcedSalesRegistry.has(saleId) : false;
};


