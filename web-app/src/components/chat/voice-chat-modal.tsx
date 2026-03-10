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
    "idle" | "connecting" | "connected" | "error" | "listening" | "speaking"
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
          
          if (event.type === "response.audio_transcript.delta") {
            setTranscript((prev) => prev + event.delta);
            setStatus("speaking");
          } else if (event.type === "response.audio_transcript.done") {
             // Response completed
             setStatus("listening");
          } else if (event.type === "conversation.item.input_audio_transcription.completed") {
            // User finished speaking
            setTranscript("");
          } else if (event.type === "input_audio_buffer.speech_started") {
             setStatus("listening");
             setTranscript("");
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
      
      // Send initial instructions via data channel when open
      dc.onopen = () => {
         const sysMessage = {
           type: "session.update",
           session: {
             instructions: "You are Minto, a conversational financial assistant. Be concise, friendly, and helpful. Always give answers under 3-4 sentences. Do not format with markdown, speak naturally.",
             voice: "verse",
           }
         };
         dc.send(JSON.stringify(sysMessage));
      };

    } catch (err: any) {
      console.error(err);
      setStatus("error");
      setErrorMessage(err.message || "An unknown error occurred.");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#121413] border border-white/10 shadow-xl rounded-3xl w-full max-w-md overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h3 className="text-white font-medium flex items-center gap-2">
            <Mic className="w-5 h-5 text-minto-accent" />
            Voice Chat
          </h3>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white transition-colors p-1"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col items-center justify-center min-h-[300px] p-8 relative overflow-hidden">
          
          {/* Animated rings for active state */}
          {(status === "listening" || status === "speaking") && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className={`w-32 h-32 rounded-full border-2 border-minto-accent/30 animate-ping absolute ${status === "speaking" ? 'duration-1000' : 'duration-3000'}`} />
              <div className={`w-48 h-48 rounded-full border-2 border-minto-accent/10 animate-ping absolute ${status === "speaking" ? 'duration-1000 delay-150' : 'duration-3000 delay-300'}`} />
            </div>
          )}

          <div className="z-10 flex flex-col items-center w-full">
            {status === "connecting" ? (
              <div className="flex flex-col items-center gap-4 text-minto-accent">
                <Loader2 className="w-12 h-12 animate-spin" />
                <p className="text-white/70 text-sm">Connecting to AI...</p>
              </div>
            ) : status === "error" ? (
              <div className="flex flex-col items-center gap-4 text-red-400 text-center">
                <MicOff className="w-12 h-12" />
                <p className="text-sm">{errorMessage}</p>
                <button 
                  onClick={startSession}
                  className="mt-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-full text-white text-sm transition-colors"
                >
                  Try Again
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center w-full">
                <div 
                  className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 ${
                    status === "speaking" 
                      ? "bg-minto-accent text-white scale-110 shadow-[0_0_30px_rgba(75,172,130,0.4)]" 
                      : "bg-white/5 text-white/50 scale-100"
                  }`}
                >
                  <Mic className="w-10 h-10" />
                </div>
                
                <div className="mt-8 text-center h-20 w-full flex items-center justify-center">
                  {status === "listening" && !transcript && (
                    <p className="text-white/50 text-lg animate-pulse">Listening...</p>
                  )}
                  {transcript && (
                    <p className="text-white/90 text-lg font-medium tracking-wide">
                      {transcript}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
