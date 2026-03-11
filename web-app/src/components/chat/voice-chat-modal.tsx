"use client";

import { useEffect, useRef, useState } from "react";
import { X, Mic, MicOff, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function VoiceChatModal({ isOpen, onClose }: Props) {
  const [status, setStatus] = useState<
    "idle" | "connecting" | "connected" | "error" | "listening" | "speaking" | "thinking"
  >("idle");
  const [transcript, setTranscript] = useState<string>("");
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
    setTranscript("");
    setErrorMessage("");
  };

  const startSession = async () => {
    try {
      setStatus("connecting");
      setTranscript("");
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
          
          if (event.type === "response.output_audio_transcript.delta") {
            setTranscript((prev) => prev + event.delta);
            setStatus("speaking");
          } else if (event.type === "response.output_audio_transcript.done") {
            // Model finished speaking
            setStatus("listening");
            setTranscript("");
          } else if (event.type === "conversation.item.input_audio_transcription.completed") {
            // User finished speaking
            setTranscript("");
          } else if (event.type === "input_audio_buffer.speech_started") {
            setStatus("listening");
            setTranscript("");
          } else if (event.type === "response.done") {
            // Canonical handler for tool calls — inspect all output items
            const outputs: any[] = event.response?.output ?? [];
            const functionCalls = outputs.filter((o: any) => o.type === "function_call");

            if (functionCalls.length === 0) return;

            setStatus("thinking");
            setTranscript("");

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-xl animate-in fade-in duration-300">
      {/* Backdrop click to close */}
      <div className="absolute inset-0" onClick={onClose} />

      <div className="glass-elevated relative z-10 rounded-[2.5rem] w-full max-w-lg mx-4 flex flex-col overflow-hidden shadow-2xl border border-white/40"
        style={{ minHeight: 520 }}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-7 pt-7 pb-2">
          <div className="flex items-center gap-2">
            <Mic className="w-4 h-4 text-minto-accent" />
            <span className="text-minto-text text-sm font-medium tracking-wide">Voice Chat</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/50 hover:bg-white/80 border border-white/60 flex items-center justify-center text-minto-text-muted hover:text-minto-text transition-all"
          >
            <X size={15} />
          </button>
        </div>

        {/* Main body — orb + rings + status */}
        <div className="flex-1 flex flex-col items-center justify-center px-8 py-10 relative overflow-hidden">

          {/* Layered ambient rings — always render, opacity driven by state */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {/* Ring 1 */}
            <div className={`absolute rounded-full border transition-all duration-700 ${
              isActive
                ? `border-minto-accent/25 ${status === "speaking" ? "w-52 h-52 animate-ping duration-[900ms]" : status === "thinking" ? "w-52 h-52 animate-ping duration-[1800ms]" : "w-52 h-52 animate-ping duration-[2800ms]"}`
                : "w-40 h-40 border-minto-accent/5 opacity-0"
            }`} />
            {/* Ring 2 */}
            <div className={`absolute rounded-full border transition-all duration-700 ${
              isActive
                ? `border-minto-accent/15 ${status === "speaking" ? "w-72 h-72 animate-ping duration-[900ms] delay-100" : status === "thinking" ? "w-72 h-72 animate-ping duration-[1800ms] delay-150" : "w-72 h-72 animate-ping duration-[2800ms] delay-200"}`
                : "w-56 h-56 border-minto-accent/5 opacity-0"
            }`} />
            {/* Ring 3 — outermost, very faint */}
            <div className={`absolute rounded-full border transition-all duration-700 ${
              isActive
                ? `border-minto-accent/8 ${status === "speaking" ? "w-96 h-96 animate-ping duration-[900ms] delay-200" : status === "thinking" ? "w-96 h-96 animate-ping duration-[1800ms] delay-300" : "w-96 h-96 animate-ping duration-[2800ms] delay-500"}`
                : "opacity-0"
            }`} />
          </div>

          {/* Central orb */}
          <div className="z-10 flex flex-col items-center gap-8 w-full">
            {status === "connecting" ? (
              <>
                <div className="w-32 h-32 rounded-full bg-white/40 border border-white/60 flex items-center justify-center shadow-lg">
                  <Loader2 className="w-12 h-12 text-minto-accent animate-spin" />
                </div>
                <p className="text-minto-text-secondary text-base">Connecting to Minto...</p>
              </>
            ) : status === "error" ? (
              <>
                <div className="w-32 h-32 rounded-full bg-red-50/60 border border-red-200/50 flex items-center justify-center shadow-lg">
                  <MicOff className="w-12 h-12 text-minto-negative" />
                </div>
                <div className="text-center space-y-3">
                  <p className="text-minto-negative text-sm max-w-xs">{errorMessage}</p>
                  <button
                    onClick={startSession}
                    className="px-5 py-2 bg-minto-negative/10 hover:bg-minto-negative/20 rounded-full text-minto-negative text-sm transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* The main mic orb */}
                <div
                  className={`w-32 h-32 rounded-full flex items-center justify-center transition-all duration-500 ${
                    status === "speaking"
                      ? "bg-minto-accent text-white scale-110 shadow-[0_0_60px_rgba(75,172,130,0.45)]"
                      : status === "thinking"
                      ? "bg-minto-accent/20 text-minto-accent scale-105 border-2 border-minto-accent/40 shadow-[0_0_40px_rgba(75,172,130,0.2)]"
                      : "bg-white/50 text-minto-text-muted border border-white/70 shadow-lg"
                  }`}
                >
                  <Mic className={`transition-all duration-500 ${status === "speaking" ? "w-14 h-14" : "w-12 h-12"}`} />
                </div>

                {/* Status label + transcript */}
                <div className="text-center w-full space-y-2 min-h-[64px] flex flex-col items-center justify-center">
                  {status === "thinking" && (
                    <>
                      <p className="text-minto-accent font-medium text-base animate-pulse">Researching...</p>
                      <p className="text-minto-text-muted text-xs">Looking that up for you</p>
                    </>
                  )}
                  {status === "speaking" && transcript && (
                    <p className="text-minto-text text-base font-medium leading-snug max-w-xs">
                      {transcript}
                    </p>
                  )}
                  {status === "speaking" && !transcript && (
                    <p className="text-minto-accent font-medium text-base animate-pulse">Speaking...</p>
                  )}
                  {status === "listening" && !transcript && (
                    <p className="text-minto-text-muted text-base animate-pulse">Listening...</p>
                  )}
                  {status === "listening" && transcript && (
                    <p className="text-minto-text text-base font-medium leading-snug max-w-xs">
                      {transcript}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Bottom — end call button */}
        {(status === "listening" || status === "speaking" || status === "thinking") && (
          <div className="flex justify-center pb-8 pt-2">
            <button
              onClick={onClose}
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-minto-negative/10 hover:bg-minto-negative/20 border border-minto-negative/20 text-minto-negative text-sm font-medium transition-all hover:scale-105"
            >
              <MicOff size={16} />
              End call
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
