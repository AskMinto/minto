"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Mic, MicOff, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface TranscriptLine {
  role: "user" | "agent";
  text: string;
  done?: boolean;
}

export function VoiceChatModal({ isOpen, onClose }: Props) {
  const [status, setStatus] = useState<
    "idle" | "connecting" | "connected" | "error" | "listening" | "speaking" | "thinking"
  >("idle");
  // Single array of transcript lines — we always display the last two
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (isOpen) {
      startSession();
    } else {
      stopSession();
    }
    return () => stopSession();
  }, [isOpen]);

  const stopSession = () => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (dcRef.current) {
      dcRef.current.close();
      dcRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioElRef.current) {
      audioElRef.current.srcObject = null;
    }
    setStatus("idle");
    setLines([]);
    setErrorMessage("");
  };

  const startSession = async () => {
    try {
      setStatus("connecting");
      setLines([]);
      setErrorMessage("");

      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error("You must be logged in to use voice chat.");
      }

      // 1. Fetch ephemeral token from our backend
      const tokenRes = await fetch("/api/proxy/chat/voice/token", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!tokenRes.ok) {
        throw new Error("Failed to get voice token");
      }

      const tokenData = await tokenRes.json();
      const ephemeralKey = tokenData.client_secret.value;

      // 2. Create RTCPeerConnection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // 3. Play incoming audio
      audioElRef.current = document.createElement("audio");
      audioElRef.current.autoplay = true;
      pc.ontrack = (e) => {
        if (audioElRef.current) {
          audioElRef.current.srcObject = e.streams[0];
        }
      };

      // 4. Add local microphone
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // 5. Setup data channel for events
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.addEventListener("message", (e) => {
        try {
          const event = JSON.parse(e.data);
          
          if (event.type === "response.audio_transcript.delta" || event.type === "response.output_audio_transcript.delta") {
            // Agent speaking — append delta to current agent line (or start one)
            setLines((prev) => {
              const last = prev[prev.length - 1];
              if (last && !last.done && last.role === "agent") {
                // Append to existing agent line
                return [...prev.slice(0, -1), { ...last, text: last.text + event.delta }];
              }
              // Start a new agent line
              return [...prev, { role: "agent", text: event.delta }];
            });
            setStatus("speaking");
          } else if (event.type === "response.audio_transcript.done" || event.type === "response.output_audio_transcript.done") {
            // Agent finished — mark current line done
            setLines((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === "agent") {
                return [...prev.slice(0, -1), { ...last, done: true }];
              }
              return prev;
            });
            setStatus("listening");
          } else if (event.type === "input_audio_buffer.speech_started") {
            // User started speaking — start a new user line
            setLines((prev) => [...prev, { role: "user", text: "" }]);
            setStatus("listening");
          } else if (event.type === "conversation.item.input_audio_transcription.completed") {
            // User finished — fill in the final transcript text
            const finalText = (event.transcript ?? "").trim();
            if (!finalText) return;
            setLines((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === "user") {
                return [...prev.slice(0, -1), { ...last, text: finalText, done: true }];
              }
              return [...prev, { role: "user", text: finalText, done: true }];
            });
          } else if (event.type === "response.done") {
            // Canonical handler for tool calls — inspect all output items
            const outputs: any[] = event.response?.output ?? [];
            const functionCalls = outputs.filter((o: any) => o.type === "function_call");

            if (functionCalls.length === 0) return;

            setStatus("thinking");

            (async () => {
              // Execute all tool calls in parallel, then send a single response.create
              await Promise.all(
                functionCalls.map(async (fc: any) => {
                  const callId = fc.call_id;
                  const name = fc.name;
                  let args: any = {};
                  try { args = JSON.parse(fc.arguments); } catch {}

                  let result = "";
                  try {
                    const res = await fetch(`/api/proxy/chat/voice/tool`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${session.access_token}`,
                      },
                      body: JSON.stringify({ name, arguments: args }),
                    });
                    const data = await res.json();
                    result = JSON.stringify(data);
                  } catch (err: any) {
                    result = JSON.stringify({ error: err.message });
                  }

                  dc.send(JSON.stringify({
                    type: "conversation.item.create",
                    item: {
                      type: "function_call_output",
                      call_id: callId,
                      output: result,
                    },
                  }));
                })
              );

              // One response.create after all tool outputs have been sent
              dc.send(JSON.stringify({ type: "response.create" }));
              setStatus("listening");
            })();
          }
        } catch (err) {
          console.error("Data channel parse error:", err);
        }
      });

      // 6. Create and send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const baseUrl = "https://api.openai.com/v1/realtime";
      const model = "gpt-4o-realtime-preview-2024-12-17";
      
      const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          "Content-Type": "application/sdp",
        },
      });

      if (!sdpResponse.ok) {
        throw new Error("Failed to connect to OpenAI Realtime API");
      }

      const answer: RTCSessionDescriptionInit = {
        type: "answer",
        sdp: await sdpResponse.text(),
      };
      await pc.setRemoteDescription(answer);

      // Successfully connected
      setStatus("listening");

      dc.onopen = () => {
        // Re-confirm VAD and enable input transcription so user speech events fire
        dc.send(JSON.stringify({
          type: "session.update",
          session: {
            input_audio_transcription: { model: "whisper-1" },
            turn_detection: { type: "server_vad" },
          },
        }));

        // Inject recent chat history as context
        if (tokenData.recent_history && Array.isArray(tokenData.recent_history)) {
          for (const msg of tokenData.recent_history) {
            if (!msg.content) continue;
            const role = msg.role === "user" ? "user" : "assistant";
            dc.send(JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "message",
                role: role,
                content: [{
                  type: role === "user" ? "input_text" : "text",
                  text: msg.content,
                }],
              },
            }));
          }
        }
      };

    } catch (err: any) {
      console.error(err);
      setStatus("error");
      setErrorMessage(err.message || "An unknown error occurred.");
    }
  };

  if (!isOpen) return null;

  const isActive = status === "listening" || status === "speaking" || status === "thinking";

  const modal = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/25 backdrop-blur-xl animate-in fade-in duration-300">
      {/* Backdrop click to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Floating card — compact, centered, not anchored to any edge */}
      <div className="glass-elevated relative z-10 rounded-[2rem] w-[360px] flex flex-col items-center shadow-2xl border border-white/40 overflow-hidden">

        {/* Close button — top right */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/50 hover:bg-white/80 border border-white/60 flex items-center justify-center text-minto-text-muted hover:text-minto-text transition-all"
        >
          <X size={15} />
        </button>

        {/* Label */}
        <div className="flex items-center gap-2 mt-6 mb-0">
          <Mic className="w-3.5 h-3.5 text-minto-accent" />
          <span className="text-minto-text-muted text-xs font-medium tracking-wider uppercase">Voice Chat</span>
        </div>

        {/* Orb area with rings */}
        <div className="relative flex items-center justify-center w-full" style={{ height: 260 }}>

          {/* Ambient rings */}
          {isActive && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className={`absolute rounded-full border border-minto-accent/20 ${
                status === "speaking" ? "w-44 h-44 animate-ping" : status === "thinking" ? "w-44 h-44 animate-ping" : "w-44 h-44 animate-ping"
              }`} style={{ animationDuration: status === "speaking" ? "900ms" : status === "thinking" ? "1800ms" : "2800ms" }} />
              <div className={`absolute rounded-full border border-minto-accent/12 ${
                status === "speaking" ? "w-60 h-60 animate-ping" : "w-60 h-60 animate-ping"
              }`} style={{ animationDuration: status === "speaking" ? "900ms" : status === "thinking" ? "1800ms" : "2800ms", animationDelay: "150ms" }} />
              <div className="absolute rounded-full border border-minto-accent/6 w-72 h-72 animate-ping"
                style={{ animationDuration: status === "speaking" ? "900ms" : status === "thinking" ? "1800ms" : "2800ms", animationDelay: "300ms" }} />
            </div>
          )}

          {/* Central orb */}
          {status === "connecting" ? (
            <div className="w-28 h-28 rounded-full bg-white/40 border border-white/60 flex items-center justify-center shadow-lg">
              <Loader2 className="w-10 h-10 text-minto-accent animate-spin" />
            </div>
          ) : status === "error" ? (
            <div className="w-28 h-28 rounded-full bg-red-50/60 border border-red-200/50 flex items-center justify-center shadow-lg">
              <MicOff className="w-10 h-10 text-minto-negative" />
            </div>
          ) : (
            <div className={`w-28 h-28 rounded-full flex items-center justify-center transition-all duration-500 ${
              status === "speaking"
                ? "bg-minto-accent text-white scale-110 shadow-[0_0_60px_rgba(75,172,130,0.5)]"
                : status === "thinking"
                ? "bg-minto-accent/20 text-minto-accent scale-105 border-2 border-minto-accent/40 shadow-[0_0_40px_rgba(75,172,130,0.25)]"
                : "bg-white/50 text-minto-text-muted border border-white/70 shadow-lg"
            }`}>
              <Mic className={`transition-all duration-500 ${status === "speaking" ? "w-12 h-12" : "w-10 h-10"}`} />
            </div>
          )}
        </div>

        {/* Two-line rolling transcript */}
        {(() => {
          const prevLine = lines.length >= 2 ? lines[lines.length - 2] : null;
          const currentLine = lines.length >= 1 ? lines[lines.length - 1] : null;
          return (
            <div className="w-full px-6 pb-1" style={{ minHeight: 48 }}>
              {status === "connecting" ? (
                <p className="text-center text-minto-text-secondary text-sm">Connecting to Minto...</p>
              ) : status === "error" ? (
                <p className="text-center text-minto-negative text-sm">{errorMessage}</p>
              ) : status === "thinking" ? (
                <>
                  <p className="text-center text-minto-text-muted text-sm opacity-50 truncate">&nbsp;</p>
                  <p className="text-center text-minto-accent text-sm font-medium animate-pulse">Researching...</p>
                </>
              ) : (
                <>
                  {/* Prev line — dimmed */}
                  <p className={`text-center text-sm truncate transition-colors duration-300 ${
                    prevLine?.role === "user" ? "text-minto-accent/50" : "text-minto-text-muted/50"
                  }`}>
                    {prevLine?.text || "\u00A0"}
                  </p>
                  {/* Current live line */}
                  <p className={`text-center text-sm font-medium truncate transition-colors duration-150 ${
                    currentLine?.role === "user"
                      ? "text-minto-accent"
                      : currentLine?.role === "agent"
                      ? "text-minto-text"
                      : "text-minto-text-muted animate-pulse"
                  }`}>
                    {currentLine?.text || (status === "listening" ? "Listening..." : status === "speaking" ? "Speaking..." : "\u00A0")}
                  </p>
                </>
              )}
            </div>
          );
        })()}

        {/* End call / retry button */}
        <div className="flex justify-center py-5">
          {status === "error" ? (
            <button
              onClick={startSession}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-minto-negative/10 hover:bg-minto-negative/20 border border-minto-negative/20 text-minto-negative text-sm font-medium transition-all"
            >
              Try Again
            </button>
          ) : isActive ? (
            <button
              onClick={onClose}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-minto-negative/10 hover:bg-minto-negative/20 border border-minto-negative/20 text-minto-negative text-sm font-medium transition-all hover:scale-105"
            >
              <MicOff size={15} />
              End call
            </button>
          ) : (
            <div className="h-10" />
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
