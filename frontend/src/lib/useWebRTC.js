import { useEffect, useRef, useState, useCallback } from "react";
import { api, getUser } from "./api";

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }];

/**
 * useWebRTC — global hook that:
 * - Polls /api/rtc/inbox every 1.2s while a user is logged in
 * - Handles incoming/outgoing calls (offer/answer/ice/hangup)
 * - Exposes { callState, remotePeer, startCall, acceptCall, rejectCall, hangup }
 * callState: idle | ringing_out | ringing_in | connecting | in_call
 */
export function useWebRTC() {
  const [user, setUser] = useState(getUser());
  const [callState, setCallState] = useState("idle");
  const [remotePeer, setRemotePeer] = useState(null); // {id, name, order_id}
  const [muted, setMuted] = useState(false);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const pendingIceRef = useRef([]);
  const isCallerRef = useRef(false);

  // Refresh user reference (login/logout can happen at any time)
  useEffect(() => {
    const handler = () => setUser(getUser());
    window.addEventListener("storage", handler);
    const t = setInterval(handler, 1500);
    return () => { window.removeEventListener("storage", handler); clearInterval(t); };
  }, []);

  const cleanup = useCallback(() => {
    try { pcRef.current?.close(); } catch {}
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    pendingIceRef.current = [];
    isCallerRef.current = false;
    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
    }
  }, []);

  const hangup = useCallback(async (silent = false) => {
    if (!silent && remotePeer) {
      try { await api.post("/rtc/signal", { to_id: remotePeer.id, order_id: remotePeer.order_id, type: "hangup" }); } catch {}
    }
    cleanup();
    setCallState("idle");
    setRemotePeer(null);
  }, [remotePeer, cleanup]);

  const buildPeer = useCallback((otherId, orderId) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        api.post("/rtc/signal", { to_id: otherId, order_id: orderId, type: "ice", payload: { candidate: e.candidate.toJSON() } }).catch(() => {});
      }
    };
    pc.ontrack = (e) => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = e.streams[0];
        remoteAudioRef.current.play().catch(() => {});
      }
    };
    pc.onconnectionstatechange = () => {
      if (["connected"].includes(pc.connectionState)) setCallState("in_call");
      if (["failed", "disconnected", "closed"].includes(pc.connectionState)) hangup(true);
    };
    pcRef.current = pc;
    return pc;
  }, [hangup]);

  const getLocalAudio = async () => {
    if (localStreamRef.current) return localStreamRef.current;
    const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    localStreamRef.current = s;
    return s;
  };

  const startCall = useCallback(async (orderId) => {
    try {
      const { data } = await api.post(`/rtc/call/${orderId}`);
      setRemotePeer({ id: data.to_id, name: "Ringing…", order_id: orderId });
      setCallState("ringing_out");
      isCallerRef.current = true;
    } catch (e) {
      throw e;
    }
  }, []);

  const acceptCall = useCallback(async () => {
    if (!remotePeer) return;
    try {
      setCallState("connecting");
      const stream = await getLocalAudio();
      const pc = buildPeer(remotePeer.id, remotePeer.order_id);
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await api.post("/rtc/signal", { to_id: remotePeer.id, order_id: remotePeer.order_id, type: "answer", payload: { sdp: pc.localDescription } });
    } catch (e) {
      hangup(true);
    }
  }, [remotePeer, buildPeer, hangup]);

  const rejectCall = useCallback(async () => {
    if (remotePeer) {
      try { await api.post("/rtc/signal", { to_id: remotePeer.id, order_id: remotePeer.order_id, type: "reject" }); } catch {}
    }
    cleanup();
    setCallState("idle");
    setRemotePeer(null);
  }, [remotePeer, cleanup]);

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const next = !muted;
    localStreamRef.current.getAudioTracks().forEach(t => t.enabled = !next);
    setMuted(next);
  }, [muted]);

  // Signal poller
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        const { data } = await api.get("/rtc/inbox");
        for (const s of data) await handleSignal(s);
      } catch {}
    };
    const t = setInterval(tick, 1200);
    tick();
    return () => { cancelled = true; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, remotePeer, callState]);

  const handleSignal = async (s) => {
    if (s.type === "call") {
      if (callState !== "idle") {
        api.post("/rtc/signal", { to_id: s.from_id, order_id: s.order_id, type: "busy" }).catch(() => {});
        return;
      }
      isCallerRef.current = false;
      setRemotePeer({ id: s.from_id, name: s.from_name || "Caller", order_id: s.order_id });
      setCallState("ringing_in");
      return;
    }
    if (s.type === "reject" || s.type === "busy") {
      hangup(true);
      return;
    }
    if (s.type === "hangup") {
      hangup(true);
      return;
    }
    if (s.type === "answer" && isCallerRef.current) {
      // Callee has produced an offer (in our model, callee sends offer via 'answer' type carrying SDP).
      // Caller side: build peer, add local audio, set remote description, respond with answer.
      try {
        const stream = await getLocalAudio();
        const pc = buildPeer(s.from_id, s.order_id);
        stream.getTracks().forEach(t => pc.addTrack(t, stream));
        await pc.setRemoteDescription(s.payload.sdp);
        // Drain queued ICE
        for (const c of pendingIceRef.current) { try { await pc.addIceCandidate(c); } catch {} }
        pendingIceRef.current = [];
        const localAnswer = await pc.createAnswer();
        await pc.setLocalDescription(localAnswer);
        await api.post("/rtc/signal", { to_id: s.from_id, order_id: s.order_id, type: "answer", payload: { sdp: pc.localDescription, final: true } });
      } catch (e) { hangup(true); }
      return;
    }
    if (s.type === "answer" && !isCallerRef.current) {
      // Callee received the caller's final answer SDP
      try {
        if (pcRef.current) {
          await pcRef.current.setRemoteDescription(s.payload.sdp);
          for (const c of pendingIceRef.current) { try { await pcRef.current.addIceCandidate(c); } catch {} }
          pendingIceRef.current = [];
        }
      } catch { hangup(true); }
      return;
    }
    if (s.type === "ice") {
      const cand = s.payload?.candidate;
      if (!cand) return;
      if (pcRef.current && pcRef.current.remoteDescription) {
        try { await pcRef.current.addIceCandidate(cand); } catch {}
      } else {
        pendingIceRef.current.push(cand);
      }
    }
  };

  return { callState, remotePeer, muted, remoteAudioRef, startCall, acceptCall, rejectCall, hangup, toggleMute };
}
