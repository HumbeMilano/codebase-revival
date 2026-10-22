export type DictationLanguage = "es" | "en";
export const WHISPER_MODEL = "Xenova/whisper-base";
export const WHISPER_SAMPLE_RATE = 16000;
export const DICTATION_LIMIT_SECONDS = 30;
export type WhisperRequest =
  { type: "load" } | { type: "transcribe"; audio: Float32Array; language: DictationLanguage };
export type WhisperReply =
  | { type: "progress"; progress: number }
  | { type: "ready" }
  | { type: "result"; text: string }
  | { type: "error"; message: string };

export function appendDictation(current: string, spoken: string): string {
  const text = spoken.trim();
  if (!text) return current;
  return current + (current && !/\s$/.test(current) ? " " : "") + text;
}

export function monoAudio(channels: Float32Array[]): Float32Array {
  const first = channels[0];
  if (!first) return new Float32Array();
  const result = new Float32Array(first.length);
  for (const channel of channels) {
    for (let i = 0; i < result.length; i++)
      result[i] = (result[i] ?? 0) + (channel[i] ?? 0) / channels.length;
  }
  return result;
}
