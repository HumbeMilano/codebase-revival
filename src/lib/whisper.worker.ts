import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";
import { WHISPER_MODEL, type WhisperRequest, type WhisperReply } from "./dictation";

// This module is only loaded through a browser Worker, never by SSR.
env.allowLocalModels = false;
env.useBrowserCache = true;
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.numThreads = 1;
  // Load the pinned public runtime outside the 25 MiB static-asset limit.
  // Inference and microphone audio remain on the device.
  env.backends.onnx.wasm.wasmPaths = {
    wasm: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.0-dev.20260914-8d85527a0/dist/ort-wasm-simd-threaded.asyncify.wasm",
  };
}
let transcriber: AutomaticSpeechRecognitionPipeline | undefined;
const reply = (message: WhisperReply) => self.postMessage(message);

self.onmessage = async (event: MessageEvent<WhisperRequest>) => {
  try {
    if (event.data.type === "load") {
      transcriber = await pipeline<"automatic-speech-recognition">(
        "automatic-speech-recognition",
        WHISPER_MODEL,
        {
          device: "wasm",
          dtype: "q8",
          progress_callback: (progress) => {
            if (progress.status === "progress")
              reply({ type: "progress", progress: Math.round(progress.progress) });
          },
        },
      );
      reply({ type: "ready" });
      return;
    }
    if (!transcriber) throw new Error("Modelo no preparado");
    const result = await transcriber(event.data.audio, {
      language: event.data.language === "es" ? "spanish" : "english",
      task: "transcribe",
      num_beams: 3,
      max_new_tokens: 128,
      repetition_penalty: 1.1,
    });
    reply({
      type: "result",
      text: (Array.isArray(result) ? result[0]?.text : result.text)?.trim() ?? "",
    });
  } catch {
    reply({
      type: "error",
      message:
        "No se pudo completar el dictado local. Comprueba la conexión para descargar el modelo o vuelve a intentarlo.",
    });
  }
};
