import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";
import type { WhisperRequest, WhisperReply } from "./dictation";

// This module is only loaded through a browser Worker, never by SSR.
env.allowLocalModels = false;
env.useBrowserCache = true;
if (env.backends.onnx.wasm) env.backends.onnx.wasm.numThreads = 1;
let transcriber: AutomaticSpeechRecognitionPipeline | undefined;
const reply = (message: WhisperReply) => self.postMessage(message);

self.onmessage = async (event: MessageEvent<WhisperRequest>) => {
  try {
    if (event.data.type === "load") {
      transcriber = await pipeline<"automatic-speech-recognition">("automatic-speech-recognition", "Xenova/whisper-tiny", {
        device: "wasm",
        dtype: "q8",
        progress_callback: (progress) => {
          if (progress.status === "progress") reply({ type: "progress", progress: Math.round(progress.progress) });
        },
      });
      reply({ type: "ready" });
      return;
    }
    if (!transcriber) throw new Error("Modelo no preparado");
    const result = await transcriber(event.data.audio, {
      language: event.data.language === "es" ? "spanish" : "english",
      task: "transcribe",
    });
    reply({ type: "result", text: (Array.isArray(result) ? result[0]?.text : result.text)?.trim() ?? "" });
  } catch {
    reply({ type: "error", message: "No se pudo completar el dictado local. Comprueba la conexión para descargar el modelo o vuelve a intentarlo." });
  }
};