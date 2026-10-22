import { describe, expect, it } from "vitest";
import {
  appendDictation,
  monoAudio,
  WHISPER_MODEL,
  WHISPER_SAMPLE_RATE,
  DICTATION_LIMIT_SECONDS,
} from "./dictation";

describe("local bilingual dictation", () => {
  it("uses multilingual Base for the final accuracy trial", () => {
    expect(WHISPER_MODEL).toBe("Xenova/whisper-base");
  });
  it("feeds Whisper 16 kHz audio", () => {
    expect(WHISPER_SAMPLE_RATE).toBe(16000);
  });
  it("bounds each recording to 30 seconds", () => {
    expect(DICTATION_LIMIT_SECONDS).toBe(30);
  });
  it("preserves typed content and Spanish accents", () => {
    expect(appendDictation("Comprar", "  café y piña. ")).toBe("Comprar café y piña.");
  });
  it("keeps English as spoken without translation", () => {
    expect(appendDictation("", "Milk and bread.")).toBe("Milk and bread.");
  });
  it("does not replace existing text on empty recognition", () => {
    expect(appendDictation("Pendiente\n", " ")).toBe("Pendiente\n");
  });
  it("mixes both audio channels for the local model", () => {
    expect([...monoAudio([new Float32Array([1, 0]), new Float32Array([0, -1])])]).toEqual([
      0.5, -0.5,
    ]);
  });
});
