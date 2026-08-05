import React, { createContext, useContext, useEffect } from "react";
import { useWebRTC } from "../lib/useWebRTC";
import { Phone, PhoneOff, MicOff, Mic } from "lucide-react";
import { Button } from "./ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

const CallCtx = createContext(null);
export const useCall = () => useContext(CallCtx);

export const CallProvider = ({ children }) => {
  const rtc = useWebRTC();
  useEffect(() => {
    if (rtc.callState === "in_call") toast.success("Call connected");
  }, [rtc.callState]);
  return (
    <CallCtx.Provider value={rtc}>
      {children}
      <audio ref={rtc.remoteAudioRef} autoPlay playsInline data-testid="remote-audio" />
      <CallOverlay {...rtc} />
    </CallCtx.Provider>
  );
};

const stateLabel = {
  ringing_in: "Incoming call",
  ringing_out: "Calling…",
  connecting: "Connecting…",
  in_call: "In call",
};

const CallOverlay = ({ callState, remotePeer, muted, acceptCall, rejectCall, hangup, toggleMute }) => {
  const visible = callState !== "idle";
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center px-4"
          data-testid="call-overlay"
        >
          <motion.div
            initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }}
            className="w-full max-w-sm rounded-3xl border border-[#00FF66]/30 bg-[#0a0a0a] p-8 text-center"
          >
            <div className="relative mx-auto h-24 w-24 rounded-full bg-[#00FF66]/20 border-2 border-[#00FF66]/50 flex items-center justify-center mb-4">
              <Phone className="h-10 w-10 text-[#00FF66]"/>
              {callState !== "in_call" && (
                <span className="absolute inset-0 rounded-full border-2 border-[#00FF66]/60 animate-ping"></span>
              )}
            </div>
            <div className="text-xs uppercase tracking-[0.3em] text-[#00FF66]" data-testid="call-state">
              {stateLabel[callState] || "Call"}
            </div>
            <div className="font-display text-2xl font-bold text-white mt-1" data-testid="call-peer-name">
              {remotePeer?.name || "Unknown"}
            </div>
            <div className="text-xs text-white/40 mt-1">End-to-end WebRTC · encrypted</div>

            <div className="mt-8 flex items-center justify-center gap-3">
              {callState === "ringing_in" && (
                <>
                  <Button data-testid="call-reject-btn" onClick={rejectCall} className="h-14 w-14 rounded-full bg-red-600 hover:bg-red-700"><PhoneOff className="h-5 w-5"/></Button>
                  <Button data-testid="call-accept-btn" onClick={acceptCall} className="h-14 w-14 rounded-full bg-[#00FF66] text-black hover:bg-[#00E055]"><Phone className="h-5 w-5"/></Button>
                </>
              )}
              {callState !== "ringing_in" && (
                <>
                  {callState === "in_call" && (
                    <Button data-testid="call-mute-btn" onClick={toggleMute} variant="outline" className="h-14 w-14 rounded-full border-white/20 bg-white/5">
                      {muted ? <MicOff className="h-5 w-5 text-red-400"/> : <Mic className="h-5 w-5"/>}
                    </Button>
                  )}
                  <Button data-testid="call-hangup-btn" onClick={() => hangup(false)} className="h-14 w-14 rounded-full bg-red-600 hover:bg-red-700"><PhoneOff className="h-5 w-5"/></Button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
