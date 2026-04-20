"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type AppState = "idle" | "recording" | "processing" | "result";
type ProcessingStep = "transcribing" | "structuring";

interface Topic {
  topic: string;
  content: string;
}

interface StructuredMemo {
  title: string;
  summary?: string;
  participants?: string[];
  topics?: Topic[];
  key_points?: string[];
  decisions?: string[];
  actions?: string[];
  next_steps?: string[];
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const MicIcon = ({ size = 52 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="9" y="1" width="6" height="13" rx="3" fill="currentColor" />
    <path d="M5 11a7 7 0 0 0 14 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <line x1="8"  y1="23" x2="16" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const StopIcon = () => (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="5" y="5" width="14" height="14" rx="3" />
  </svg>
);

const CopyIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const CheckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// ─── Section card ─────────────────────────────────────────────────────────────

function SectionCard({
  label, emoji, borderColor, children,
}: {
  label: string; emoji: string; borderColor: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-[#0d1424] p-4" style={{ border: `1px solid ${borderColor}` }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg leading-none">{emoji}</span>
        <span className="text-xs font-semibold tracking-widest uppercase" style={{ opacity: 0.55 }}>
          {label}
        </span>
      </div>
      <div className="space-y-2 text-sm leading-relaxed">{children}</div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Home() {
  const [appState, setAppState]         = useState<AppState>("idle");
  const [processingStep, setProcessingStep] = useState<ProcessingStep>("transcribing");
  const [timer, setTimer]               = useState(0);
  const [memo, setMemo]                 = useState<StructuredMemo | null>(null);
  const [error, setError]               = useState<string | null>(null);
  const [copied, setCopied]             = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef        = useRef<Blob[]>([]);
  const streamRef        = useRef<MediaStream | null>(null);
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null);

  // Timer
  useEffect(() => {
    if (appState === "recording") {
      timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      if (appState === "idle") setTimer(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [appState]);

  const fmt = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  // ── Transcribe → Structure ──
  const transcribeAndStructure = useCallback(async (blob: Blob, mimeType: string) => {
    setAppState("processing");
    setProcessingStep("transcribing");

    try {
      // Step 1: Whisper transcription
      const ext = mimeType.includes("webm") ? "webm"
                : mimeType.includes("mp4")  ? "mp4"
                : mimeType.includes("ogg")  ? "ogg"
                : "wav";
      const audioFile = new File([blob], `recording.${ext}`, { type: mimeType });
      const formData = new FormData();
      formData.append("audio", audioFile);

      const transcribeRes = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });
      if (!transcribeRes.ok) throw new Error("transcribe");
      const { text } = await transcribeRes.json();

      // Step 2: Structure
      setProcessingStep("structuring");
      const structureRes = await fetch("/api/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text || "（音声なし）" }),
      });
      if (!structureRes.ok) throw new Error("structure");
      const data: StructuredMemo = await structureRes.json();

      setMemo(data);
      setAppState("result");
    } catch (e) {
      const msg = e instanceof Error && e.message === "transcribe"
        ? "文字起こしに失敗しました。"
        : "構造化に失敗しました。";
      setError(msg + "もう一度お試しください。");
      setAppState("idle");
    }
  }, []);

  // ── Start recording ──
  const startRecording = useCallback(async () => {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("マイクの使用を許可してください。");
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : "audio/mp4";

    const recorder = new MediaRecorder(stream, { mimeType });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunksRef.current, { type: mimeType });
      transcribeAndStructure(blob, mimeType);
    };

    recorder.start(500); // collect chunks every 500ms
    mediaRecorderRef.current = recorder;
    setAppState("recording");
  }, [transcribeAndStructure]);

  // ── Stop recording ──
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
  }, []);

  // ── Copy memo ──
  const copyMemo = useCallback(() => {
    if (!memo) return;
    const lines: string[] = [`# ${memo.title}`];
    if (memo.summary)              lines.push("", "## 要約",           memo.summary);
    if (memo.participants?.length) lines.push("", "## 相手",           memo.participants.join("、"));
    if (memo.topics?.length) {
      lines.push("", "## 話題");
      memo.topics.forEach(t => lines.push(`### ${t.topic}`, t.content));
    }
    if (memo.key_points?.length)   lines.push("", "## 課題",        ...memo.key_points.map(s => `・${s}`));
    if (memo.decisions?.length)    lines.push("", "## 決定事項",    ...memo.decisions.map(s => `・${s}`));
    if (memo.actions?.length)      lines.push("", "## アクション",  ...memo.actions.map(s => `・${s}`));
    if (memo.next_steps?.length)   lines.push("", "## ネクストステップ", ...memo.next_steps.map(s => `・${s}`));
    navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }, [memo]);

  const reset = useCallback(() => {
    setAppState("idle");
    setMemo(null);
    setTimer(0);
    setError(null);
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // IDLE
  // ═══════════════════════════════════════════════════════════════════════════
  if (appState === "idle") {
    return (
      <main className="min-h-screen bg-[#070c1a] flex flex-col items-center justify-center px-6">
        <p className="text-xs font-semibold tracking-[0.32em] uppercase mb-16" style={{ opacity: 0.35 }}>
          話メモ
        </p>

        <button
          onClick={startRecording}
          className="w-36 h-36 rounded-full flex items-center justify-center text-blue-300 active:scale-95 transition-transform animate-glow-blue"
          style={{ background: "rgba(15,30,61,0.9)", border: "1px solid rgba(59,130,246,0.35)" }}
          aria-label="録音開始"
        >
          <MicIcon size={52} />
        </button>

        <p className="mt-8 text-sm font-semibold tracking-[0.28em] uppercase" style={{ opacity: 0.4 }}>
          タップして録音
        </p>

        {error && (
          <p className="mt-6 text-xs text-red-400 text-center max-w-xs leading-relaxed">{error}</p>
        )}
      </main>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECORDING
  // ═══════════════════════════════════════════════════════════════════════════
  if (appState === "recording") {
    return (
      <main className="min-h-screen bg-[#070c1a] flex flex-col items-center justify-center px-5 gap-10">
        {/* Status */}
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-blink" />
          <span className="text-xs font-semibold tracking-[0.3em] uppercase" style={{ opacity: 0.55 }}>
            録音中
          </span>
        </div>

        {/* Timer */}
        <p
          className="font-bold tabular-nums"
          style={{ fontSize: "clamp(56px, 16vw, 80px)", letterSpacing: "0.05em", color: "#dce8ff" }}
        >
          {fmt(timer)}
        </p>

        {/* Sound wave */}
        <div className="flex items-end justify-center gap-1.5" style={{ height: 60 }}>
          {[...Array(8)].map((_, i) => (
            <div key={i} className="wave-bar" />
          ))}
        </div>

        {/* STOP button */}
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={stopRecording}
            className="w-24 h-24 rounded-full flex items-center justify-center text-red-400 active:scale-95 transition-transform animate-glow-red"
            style={{ background: "rgba(42,15,15,0.95)", border: "1px solid rgba(239,68,68,0.45)" }}
            aria-label="録音停止"
          >
            <StopIcon />
          </button>
          <p className="text-xs tracking-[0.28em] uppercase" style={{ opacity: 0.28 }}>
            タップして停止
          </p>
        </div>
      </main>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROCESSING
  // ═══════════════════════════════════════════════════════════════════════════
  if (appState === "processing") {
    const label = processingStep === "transcribing" ? "文字起こし中…" : "AIが解析中…";
    return (
      <main className="min-h-screen bg-[#070c1a] flex flex-col items-center justify-center gap-6">
        <div
          className="w-14 h-14 rounded-full animate-spin-slow"
          style={{ border: "2px solid rgba(59,130,246,0.18)", borderTopColor: "rgba(96,165,250,0.9)" }}
        />
        <p className="text-sm font-semibold tracking-[0.3em] uppercase" style={{ opacity: 0.45 }}>
          {label}
        </p>
      </main>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESULT
  // ═══════════════════════════════════════════════════════════════════════════
  const m = memo!;

  return (
    <main className="min-h-screen bg-[#070c1a] flex flex-col">
      {/* Sticky header */}
      <header
        className="sticky top-0 z-10 px-5 pt-12 pb-4"
        style={{
          background: "rgba(7,12,26,0.92)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <p className="text-[10px] font-semibold tracking-[0.35em] uppercase mb-1.5" style={{ opacity: 0.28 }}>
          話メモ
        </p>
        <h1 className="text-xl font-bold leading-snug" style={{ color: "#dce8ff" }}>
          {m.title}
        </h1>
        {m.summary && (
          <p className="mt-1.5 text-xs leading-relaxed" style={{ opacity: 0.48 }}>{m.summary}</p>
        )}
      </header>

      {/* Scrollable cards */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-36">

        {/* 相手 */}
        {m.participants && m.participants.length > 0 && (
          <SectionCard label="相手" emoji="👤" borderColor="rgba(59,130,246,0.22)">
            <div className="flex flex-wrap gap-2">
              {m.participants.map((p, i) => (
                <span
                  key={i}
                  className="px-3 py-1 rounded-full text-xs font-semibold"
                  style={{
                    background: "rgba(59,130,246,0.1)",
                    border: "1px solid rgba(59,130,246,0.25)",
                    color: "#93c5fd",
                  }}
                >
                  {p}
                </span>
              ))}
            </div>
          </SectionCard>
        )}

        {/* 話題 */}
        {m.topics && m.topics.length > 0 && (
          <SectionCard label="話題" emoji="💬" borderColor="rgba(139,92,246,0.22)">
            {m.topics.map((t, i) => (
              <div
                key={i}
                className={i > 0 ? "pt-2.5" : ""}
                style={i > 0 ? { borderTop: "1px solid rgba(255,255,255,0.06)" } : {}}
              >
                <p className="font-semibold text-xs mb-1" style={{ color: "#c4b5fd" }}>{t.topic}</p>
                <p style={{ opacity: 0.72 }}>{t.content}</p>
              </div>
            ))}
          </SectionCard>
        )}

        {/* 課題 */}
        {m.key_points && m.key_points.length > 0 && (
          <SectionCard label="課題" emoji="⚠️" borderColor="rgba(245,158,11,0.22)">
            {m.key_points.map((k, i) => (
              <div key={i} className="flex gap-2">
                <span style={{ opacity: 0.38, flexShrink: 0, marginTop: 1 }}>・</span>
                <span style={{ opacity: 0.80 }}>{k}</span>
              </div>
            ))}
          </SectionCard>
        )}

        {/* 決定事項 */}
        {m.decisions && m.decisions.length > 0 && (
          <SectionCard label="決定事項" emoji="✅" borderColor="rgba(16,185,129,0.22)">
            {m.decisions.map((d, i) => (
              <div key={i} className="flex gap-2">
                <span style={{ color: "#34d399", flexShrink: 0, marginTop: 1 }}>✓</span>
                <span style={{ opacity: 0.80 }}>{d}</span>
              </div>
            ))}
          </SectionCard>
        )}

        {/* アクション */}
        {m.actions && m.actions.length > 0 && (
          <SectionCard label="アクション" emoji="🎯" borderColor="rgba(6,182,212,0.22)">
            {m.actions.map((a, i) => (
              <div key={i} className="flex gap-2.5">
                <span className="text-xs font-bold tabular-nums" style={{ color: "#22d3ee", flexShrink: 0, marginTop: 2 }}>
                  {i + 1}.
                </span>
                <span style={{ opacity: 0.80 }}>{a}</span>
              </div>
            ))}
          </SectionCard>
        )}

        {/* ネクストステップ */}
        {m.next_steps && m.next_steps.length > 0 && (
          <SectionCard label="ネクストステップ" emoji="→" borderColor="rgba(99,102,241,0.22)">
            {m.next_steps.map((s, i) => (
              <div key={i} className="flex gap-2">
                <span style={{ opacity: 0.38, flexShrink: 0, marginTop: 1 }}>・</span>
                <span style={{ opacity: 0.80 }}>{s}</span>
              </div>
            ))}
          </SectionCard>
        )}
      </div>

      {/* Fixed bottom action bar */}
      <div
        className="fixed bottom-0 left-0 right-0 px-4 pt-3 pb-8 flex gap-3"
        style={{
          background: "rgba(7,12,26,0.95)",
          backdropFilter: "blur(16px)",
          borderTop: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        <button
          onClick={copyMemo}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-semibold active:scale-[0.97] transition-transform"
          style={{
            background: "#0d1424",
            border: "1px solid rgba(255,255,255,0.1)",
            color: copied ? "#34d399" : "#fff",
          }}
        >
          {copied ? <><CheckIcon /><span>コピーしました</span></> : <><CopyIcon /><span>コピー</span></>}
        </button>

        <button
          onClick={reset}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-semibold active:scale-[0.97] transition-transform"
          style={{
            background: "rgba(37,99,235,0.85)",
            boxShadow: "0 0 24px 4px rgba(59,130,246,0.22)",
          }}
        >
          <MicIcon size={18} />
          <span>新しく録音</span>
        </button>
      </div>
    </main>
  );
}
