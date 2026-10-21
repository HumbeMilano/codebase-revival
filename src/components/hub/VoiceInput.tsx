import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square, X } from "lucide-react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { monoAudio, WHISPER_SAMPLE_RATE, DICTATION_LIMIT_SECONDS, type DictationLanguage, type WhisperReply, type WhisperRequest } from "@/lib/dictation";

let sessionWorker: Worker | null = null;
let sessionReady = false;
let lastLanguage: DictationLanguage = "es";

export function VoiceInput({ label, onText }: { label: string; onText: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button type="button" size="icon" variant="ghost" className="size-11 shrink-0 rounded-xl text-success-foreground" title={`Dictar ${label}`} aria-label={`Dictar ${label}`} onClick={() => setOpen(true)}><Mic className="size-5" /></Button>
    {open && <VoiceDialog label={label} close={() => setOpen(false)} onText={onText} />}
  </>;
}

function VoiceDialog({ label, close, onText }: { label: string; close: () => void; onText: (text: string) => void }) {
  const [language, setLanguage] = useState<DictationLanguage>(lastLanguage);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "recording" | "transcribing" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const worker = useRef<Worker | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const active = useRef(true);
  const requesting = useRef(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);
  const callback = useRef(onText);
  const onClose = useRef(close);
  callback.current = onText; onClose.current = close;

  const stopTracks = () => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  const fail = (message: string) => { if (active.current) { setError(message); setState("error"); } };
  useEffect(() => {
    active.current = true;
    const before = document.activeElement;
    closeButton.current?.focus();
    load();
    return () => {
      active.current = false;
      if (recorder.current) { recorder.current.onstop = null; if (recorder.current.state !== "inactive") recorder.current.stop(); }
      stopTracks();
      void audioContext.current?.close();
      if (worker.current) {
        worker.current.onmessage = null; worker.current.onerror = null;
        if (busy.current || !sessionReady) { worker.current.terminate(); sessionWorker = null; sessionReady = false; }
      }
      if (before instanceof HTMLElement) before.focus();
    };
  }, []);

  const load = () => {
    setState("loading"); setProgress(0); setError("");
    try {
      if (!sessionWorker) sessionWorker = new Worker(new URL("../../lib/whisper.worker.ts", import.meta.url), { type: "module" });
      const instance = sessionWorker;
      worker.current = instance;
      instance.onmessage = (event: MessageEvent<WhisperReply>) => {
        if (!active.current) return;
        const message = event.data;
        if (message.type === "progress") setProgress(message.progress);
        if (message.type === "ready") { sessionReady = true; setState("ready"); }
        if (message.type === "error") fail(message.message);
        if (message.type === "result") {
          busy.current = false;
          if (message.text) { callback.current(message.text); onClose.current(); }
          else fail("No se reconoció voz. Puedes grabar de nuevo.");
        }
      };
      instance.onerror = () => fail("Whisper no pudo iniciarse en este navegador. Puedes seguir escribiendo.");
      if (sessionReady) setState("ready");
      else instance.postMessage({ type: "load" } satisfies WhisperRequest);
    } catch { fail("Este navegador no admite dictado local. Puedes seguir escribiendo."); }
  };

  const record = async () => {
    if (requesting.current) return;
    requesting.current = true;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        fail("El micrófono no está disponible en este navegador."); return;
      }
      const media = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
      if (!active.current) { media.getTracks().forEach((track) => track.stop()); return; }
      stream.current = media;
      const context = new AudioContext();
      audioContext.current = context;
      await context.resume();
      const chunks: Blob[] = [];
      const capture = new MediaRecorder(media);
      recorder.current = capture;
      capture.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      capture.onerror = () => { stopTracks(); fail("La grabación se interrumpió. Vuelve a intentarlo."); };
      capture.onstop = async () => {
        stopTracks();
        if (!active.current) return;
        busy.current = true; setState("transcribing");
        try {
          const buffer = await context.decodeAudioData(await new Blob(chunks, { type: capture.mimeType }).arrayBuffer());
          // Explicit conversion: mobile browsers may ignore a requested AudioContext rate.
          const resampler = new OfflineAudioContext(1, Math.ceil(buffer.duration * WHISPER_SAMPLE_RATE), WHISPER_SAMPLE_RATE);
          const source = resampler.createBufferSource();
          source.buffer = buffer; source.connect(resampler.destination); source.start();
          const resampled = await resampler.startRendering();
          const audio = monoAudio([resampled.getChannelData(0)]);
          await context.close(); audioContext.current = null;
          if (!active.current) return;
          worker.current?.postMessage({ type: "transcribe", audio, language } satisfies WhisperRequest, [audio.buffer]);
        } catch { fail("No se pudo leer la grabación. Vuelve a intentarlo."); }
      };
      setSeconds(0); setState("recording"); setError("");
      capture.start();
      let elapsed = 0;
      timer.current = setInterval(() => { elapsed++; setSeconds(elapsed); if (elapsed >= DICTATION_LIMIT_SECONDS && capture.state === "recording") capture.stop(); }, 1000);
    } catch (err) {
      stopTracks();
      void audioContext.current?.close(); audioContext.current = null;
      fail(err instanceof DOMException && err.name === "NotAllowedError" ? "Permite el acceso al micrófono para dictar." : "No se pudo abrir el micrófono.");
    } finally { requesting.current = false; }
  };

  return createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-foreground/30 p-4 backdrop-blur-sm" onKeyDown={(e) => {
    if (e.key === "Escape") { e.stopPropagation(); close(); }
    if (e.key === "Tab") {
      const buttons = e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), textarea');
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  }}>
    <section role="dialog" aria-modal="true" aria-labelledby="voice-title" aria-describedby="voice-privacy" className="max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-3xl bg-card p-5 text-foreground shadow-card">
      <header className="flex items-center justify-between gap-2"><div><h2 id="voice-title" className="font-display text-xl font-bold">Dictar {label}</h2><p id="voice-privacy" className="text-xs text-muted-foreground">Whisper Base · Local y privado</p></div><Button ref={closeButton} type="button" variant="ghost" size="icon" aria-label="Cerrar dictado" onClick={close}><X /></Button></header>
      <div className="my-5 grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1" aria-label="Idioma de dictado">{([['es', 'Español'], ['en', 'English']] as const).map(([id, name]) => <Button key={id} type="button" variant="ghost" disabled={state === "recording" || state === "transcribing"} aria-pressed={language === id} onClick={() => { lastLanguage = id; setLanguage(id); }} className={cn("rounded-lg", language === id && "bg-card shadow-card")}>{name}</Button>)}</div>
      <div className="space-y-4" aria-live="polite">
        {state === "loading" && <div className="space-y-3 py-6 text-center"><Loader2 className="mx-auto size-8 animate-spin motion-reduce:animate-none" /><p className="text-sm">Preparando Whisper Base… {progress}%</p><p className="text-xs text-muted-foreground">Primera descarga: unos 75 MB</p><progress className="h-2 w-full accent-primary" value={progress} max={100} /></div>}
        {state === "ready" && <Button type="button" className="w-full" onClick={() => void record()}><Mic />Grabar</Button>}
        {state === "recording" && <div className="space-y-4 text-center"><Mic className="mx-auto size-10 text-destructive" /><p className="font-display text-3xl font-bold tabular">00:{String(seconds).padStart(2, "0")}</p><p className="text-xs text-muted-foreground">Grabando · máximo 30 s</p><Button type="button" className="w-full" onClick={() => { if (recorder.current?.state === "recording") recorder.current.stop(); }}><Square />Terminar grabación</Button></div>}
        {state === "transcribing" && <div className="py-6 text-center"><Loader2 className="mx-auto mb-3 size-8 animate-spin motion-reduce:animate-none" /><p className="text-sm">Transcribiendo en este dispositivo…</p></div>}
        {state === "error" && <><p role="alert" className="text-sm text-destructive">{error}</p><Button type="button" className="w-full" onClick={() => { worker.current?.terminate(); sessionWorker = null; sessionReady = false; busy.current = false; load(); }}>Reintentar</Button></>}
      </div>
    </section>
  </div>, document.body);
}