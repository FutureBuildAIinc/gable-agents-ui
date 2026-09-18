import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Voice input via the Web Speech API. Gracefully degrades — when unsupported,
 * `supported` is false and callers should render nothing.
 *
 * TypeScript 7 ships its own SpeechRecognition types; we use a structural
 * interface matching them so both `window.SpeechRecognition` and
 * `webkitSpeechRecognition` work without redeclaring globals.
 */

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}

interface RecognitionEventLike {
  resultIndex: number;
  results: { length: number; [i: number]: RecognitionResult | undefined };
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: RecognitionEventLike) => void) | null;
  onerror: ((ev: { error?: string } | Event) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export interface VoiceInput {
  supported: boolean;
  listening: boolean;
  transcript: string;
  toggle: () => void;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

function getCtor(): (new () => SpeechRecognitionLike) | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
    | (new () => SpeechRecognitionLike)
    | undefined;
}

export function useVoiceInput(lang = "en-US"): VoiceInput {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef("");

  useEffect(() => {
    setSupported(Boolean(getCtor()));
  }, []);

  const stop = useCallback(() => {
    recRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    if (!supported || listening) return;
    const Ctor = getCtor();
    if (!Ctor) return;
    finalRef.current = "";
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (ev: RecognitionEventLike) => {
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        if (!res) continue;
        if (res.isFinal) finalRef.current += res[0].transcript + " ";
        else interim += res[0].transcript;
      }
      setTranscript(finalRef.current + interim);
    };
    rec.onerror = (ev) => {
      console.warn("[voice] recognition error:", (ev as { error?: string })?.error);
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
    setTranscript("");
  }, [supported, listening, lang]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  const reset = useCallback(() => {
    finalRef.current = "";
    setTranscript("");
  }, []);

  useEffect(() => () => recRef.current?.stop(), []);

  return { supported, listening, transcript, toggle, start, stop, reset };
}
