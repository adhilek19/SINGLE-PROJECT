import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import GlobalCallModal from '../components/GlobalCallModal';
import CallContext from './callContext';
import { callService } from '../services/api';
import {
  acceptIncomingCall,
  callUser,
  endActiveCall,
  failActiveCall,
  onCallAccepted,
  onCallBusy,
  onCallEnded,
  onCallFailed,
  onCallRejected,
  onIncomingCall,
  onWebrtcAnswer,
  onWebrtcIceCandidate,
  onWebrtcOffer,
  rejectIncomingCall,
  sendWebrtcAnswer,
  sendWebrtcIceCandidate,
  sendWebrtcOffer,
} from '../services/chatSocket';

const toId = (value) =>
  (value && typeof value === 'object' ? value._id : value)?.toString?.() || '';

const formatCallDuration = (seconds = 0) => {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds || 0)));
  const mins = String(Math.floor(safeSeconds / 60)).padStart(2, '0');
  const secs = String(safeSeconds % 60).padStart(2, '0');
  return `${mins}:${secs}`;
};

const initialCallUiState = {
  callState: 'idle',
  activeCall: null,
  incomingCall: null,
  callSeconds: 0,
  isMuted: false,
  hasLocalStream: false,
  callActionLoading: false,
};

const isCallBusyState = (state) =>
  state !== 'idle' && !['ended', 'failed', 'rejected', 'missed', 'busy'].includes(state);

export const CallProvider = ({ children }) => {
  const token = useSelector((state) => state.auth.token);
  const chats = useSelector((state) => state.chat.chats);
  const navigate = useNavigate();
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const callStateRef = useRef('idle');
  const activeCallRef = useRef(null);
  const incomingCallRef = useRef(null);
  const callTimerIntervalRef = useRef(null);
  const callStartedAtRef = useRef(0);
  const callStateResetTimerRef = useRef(null);
  const iceServersRef = useRef(null);
  const [callUiState, setCallUiState] = useState(initialCallUiState);

  const {
    callState,
    activeCall,
    incomingCall,
    callSeconds,
    isMuted,
    hasLocalStream,
    callActionLoading,
  } = callUiState;

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  useEffect(() => {
    incomingCallRef.current = incomingCall;
  }, [incomingCall]);

  const setCallState = useCallback((value) => {
    setCallUiState((prev) => ({ ...prev, callState: value }));
  }, []);

  const setActiveCall = useCallback((value) => {
    setCallUiState((prev) => ({ ...prev, activeCall: value }));
  }, []);

  const setIncomingCall = useCallback((value) => {
    setCallUiState((prev) => ({ ...prev, incomingCall: value }));
  }, []);

  const setCallSeconds = useCallback((value) => {
    setCallUiState((prev) => ({ ...prev, callSeconds: value }));
  }, []);

  const setIsMuted = useCallback((value) => {
    setCallUiState((prev) => ({ ...prev, isMuted: value }));
  }, []);

  const setHasLocalStream = useCallback((value) => {
    setCallUiState((prev) => ({ ...prev, hasLocalStream: value }));
  }, []);

  const setCallActionLoading = useCallback((value) => {
    setCallUiState((prev) => ({ ...prev, callActionLoading: value }));
  }, []);

  const clearCallResetTimer = useCallback(() => {
    if (callStateResetTimerRef.current) {
      window.clearTimeout(callStateResetTimerRef.current);
      callStateResetTimerRef.current = null;
    }
  }, []);

  const stopCallTimer = useCallback(() => {
    if (callTimerIntervalRef.current) {
      window.clearInterval(callTimerIntervalRef.current);
      callTimerIntervalRef.current = null;
    }
  }, []);

  const startCallTimer = useCallback(() => {
    stopCallTimer();
    callStartedAtRef.current = Date.now();
    setCallSeconds(0);
    callTimerIntervalRef.current = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - callStartedAtRef.current) / 1000);
      setCallSeconds(Math.max(0, elapsed));
    }, 1000);
  }, [setCallSeconds, stopCallTimer]);

  const queueCallStateReset = useCallback(
    (delayMs = 1800) => {
      clearCallResetTimer();
      callStateResetTimerRef.current = window.setTimeout(() => {
        setCallState('idle');
        callStateResetTimerRef.current = null;
      }, delayMs);
    },
    [clearCallResetTimer, setCallState]
  );

  const stopLocalAudioTracks = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    setHasLocalStream(false);
  }, [setHasLocalStream]);

  const cleanupCallMedia = useCallback(() => {
    stopCallTimer();
    callStartedAtRef.current = 0;
    setCallSeconds(0);
    setIsMuted(false);

    if (peerConnectionRef.current) {
      try {
        peerConnectionRef.current.onicecandidate = null;
        peerConnectionRef.current.ontrack = null;
        peerConnectionRef.current.onconnectionstatechange = null;
        peerConnectionRef.current.close();
      } catch {
        // ignore cleanup errors
      } finally {
        peerConnectionRef.current = null;
      }
    }

    stopLocalAudioTracks();
    remoteStreamRef.current = null;

    if (remoteAudioRef.current) {
      try {
        remoteAudioRef.current.srcObject = null;
      } catch {
        // ignore cleanup errors
      }
    }
  }, [setCallSeconds, setIsMuted, stopCallTimer, stopLocalAudioTracks]);

  const resetCallUi = useCallback(() => {
    setActiveCall(null);
    setIncomingCall(null);
    cleanupCallMedia();
  }, [cleanupCallMedia, setActiveCall, setIncomingCall]);

  const getIceServers = useCallback(async () => {
    if (Array.isArray(iceServersRef.current)) return iceServersRef.current;
    const response = await callService.getIceServers();
    const list = Array.isArray(response?.data?.data?.iceServers)
      ? response.data.data.iceServers
      : [];
    iceServersRef.current = list;
    return list;
  }, []);

  const getOrCreateLocalStream = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Audio calling is not supported on this browser');
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      setHasLocalStream(true);
      return stream;
    } catch (err) {
      if (err?.name === 'NotAllowedError') {
        throw new Error('Microphone permission denied', { cause: err });
      }
      throw new Error('Unable to access microphone', { cause: err });
    }
  }, [setHasLocalStream]);

  const createPeerConnection = useCallback(
    async (callId) => {
      if (peerConnectionRef.current) return peerConnectionRef.current;
      if (typeof RTCPeerConnection === 'undefined') {
        throw new Error('WebRTC audio calling is not supported in this browser');
      }

      const iceServers = await getIceServers();
      const pc = new RTCPeerConnection({ iceServers });

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        const current = activeCallRef.current;
        if (!current?.callId || current.callId !== callId) return;
        sendWebrtcIceCandidate({
          callId,
          candidate: event.candidate,
        }).catch(() => {});
      };

      pc.ontrack = (event) => {
        const [stream] = event.streams || [];
        if (!stream) return;
        remoteStreamRef.current = stream;
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = stream;
          remoteAudioRef.current.play().catch(() => {});
        }
      };

      pc.onconnectionstatechange = () => {
        const currentState = pc.connectionState;
        const currentCall = activeCallRef.current;
        if (!currentCall || currentCall.callId !== callId) return;

        if (currentState === 'connected') {
          setCallState('connected');
          startCallTimer();
          return;
        }

        if (['failed', 'disconnected'].includes(currentState)) {
          if (['connected', 'calling'].includes(callStateRef.current)) {
            failActiveCall({
              callId,
              reason: `peer_connection_${currentState}`,
            }).catch(() => {});
            setCallState('failed');
            resetCallUi();
            queueCallStateReset();
          }
        }
      };

      peerConnectionRef.current = pc;
      return pc;
    },
    [getIceServers, queueCallStateReset, resetCallUi, setCallState, startCallTimer]
  );

  const preparePeerForCall = useCallback(
    async (callId) => {
      const pc = await createPeerConnection(callId);
      const stream = await getOrCreateLocalStream();
      const existingSenders = pc.getSenders().filter((sender) => sender.track);
      if (!existingSenders.length) {
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });
      }
      return pc;
    },
    [createPeerConnection, getOrCreateLocalStream]
  );

  const startCall = useCallback(
    async ({ chatId, otherUserId, otherUserName = '', otherUserAvatar = '' }) => {
      const safeChatId = toId(chatId);
      const safeOtherUserId = toId(otherUserId);
      if (!safeChatId || !safeOtherUserId || callActionLoading) return;
      if (
        activeCallRef.current?.callId ||
        incomingCallRef.current?.callId ||
        isCallBusyState(callStateRef.current)
      ) {
        toast.error('Another call is already in progress');
        return;
      }

      clearCallResetTimer();
      setCallActionLoading(true);
      let createdCallId = '';

      try {
        setCallState('calling');
        const response = await callUser({ chatId: safeChatId });
        const callId = toId(response?.callId);
        if (!callId) throw new Error('Unable to create call session');
        createdCallId = callId;

        setActiveCall({
          callId,
          chatId: safeChatId,
          otherUserId: safeOtherUserId,
          otherUserName,
          otherUserAvatar,
          direction: 'outgoing',
        });
        setIncomingCall(null);
        setCallState('ringing');

        await preparePeerForCall(callId);
      } catch (err) {
        if (createdCallId) {
          failActiveCall({
            callId: createdCallId,
            reason: err?.message || 'caller_setup_failed',
          }).catch(() => {});
        }
        setCallState('failed');
        resetCallUi();
        toast.error(typeof err?.message === 'string' ? err.message : 'Failed to start call');
        queueCallStateReset();
      } finally {
        setCallActionLoading(false);
      }
    },
    [
      callActionLoading,
      clearCallResetTimer,
      preparePeerForCall,
      queueCallStateReset,
      resetCallUi,
      setActiveCall,
      setCallActionLoading,
      setCallState,
      setIncomingCall,
    ]
  );

  const acceptCall = useCallback(async () => {
    const currentIncomingCall = incomingCallRef.current;
    if (!currentIncomingCall?.callId || callActionLoading) return;

    clearCallResetTimer();
    setCallActionLoading(true);
    try {
      const callId = toId(currentIncomingCall.callId);
      setActiveCall({
        callId,
        chatId: toId(currentIncomingCall.chatId),
        otherUserId: toId(currentIncomingCall?.from?._id),
        otherUserName: currentIncomingCall?.from?.name || 'User',
        otherUserAvatar: currentIncomingCall?.from?.profilePic || '',
        direction: 'incoming',
      });
      setCallState('calling');

      await preparePeerForCall(callId);
      await acceptIncomingCall({ callId });
      setIncomingCall(null);
    } catch (err) {
      const callId = toId(currentIncomingCall?.callId);
      if (callId) {
        failActiveCall({
          callId,
          reason: err?.message || 'accept_failed',
        }).catch(() => {});
      }
      setCallState('failed');
      resetCallUi();
      toast.error(typeof err?.message === 'string' ? err.message : 'Failed to accept call');
      queueCallStateReset();
    } finally {
      setCallActionLoading(false);
    }
  }, [
    callActionLoading,
    clearCallResetTimer,
    preparePeerForCall,
    queueCallStateReset,
    resetCallUi,
    setActiveCall,
    setCallActionLoading,
    setCallState,
    setIncomingCall,
  ]);

  const rejectCall = useCallback(async () => {
    const currentIncomingCall = incomingCallRef.current;
    if (!currentIncomingCall?.callId || callActionLoading) return;

    clearCallResetTimer();
    setCallActionLoading(true);
    try {
      await rejectIncomingCall({
        callId: toId(currentIncomingCall.callId),
        reason: 'callee_rejected',
      });
    } catch {
      // best effort reject
    } finally {
      setCallActionLoading(false);
      resetCallUi();
      setCallState('rejected');
      queueCallStateReset();
    }
  }, [
    callActionLoading,
    clearCallResetTimer,
    queueCallStateReset,
    resetCallUi,
    setCallActionLoading,
    setCallState,
  ]);

  const endCall = useCallback(async () => {
    const callId = toId(activeCallRef.current?.callId || incomingCallRef.current?.callId);
    if (!callId || callActionLoading) {
      resetCallUi();
      setCallState('idle');
      return;
    }

    clearCallResetTimer();
    setCallActionLoading(true);
    try {
      await endActiveCall({ callId });
    } catch {
      // best effort end
    } finally {
      setCallActionLoading(false);
      resetCallUi();
      setCallState('ended');
      queueCallStateReset();
    }
  }, [
    callActionLoading,
    clearCallResetTimer,
    queueCallStateReset,
    resetCallUi,
    setCallActionLoading,
    setCallState,
  ]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const tracks = stream.getAudioTracks();
    if (!tracks.length) return;
    const nextMuted = !isMuted;
    tracks.forEach((track) => {
      track.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);
  }, [isMuted, setIsMuted]);

  const openRelatedChat = useCallback(() => {
    const chatId = toId(activeCallRef.current?.chatId || incomingCallRef.current?.chatId);
    if (!chatId) return;
    navigate(`/chats/${chatId}`);
  }, [navigate]);

  useEffect(() => {
    if (!token) {
      clearCallResetTimer();
      stopCallTimer();
      const resetTimer = window.setTimeout(() => {
        resetCallUi();
        setCallUiState(initialCallUiState);
      }, 0);

      return () => window.clearTimeout(resetTimer);
    }
    return undefined;
  }, [clearCallResetTimer, resetCallUi, stopCallTimer, token]);

  useEffect(() => {
    if (!token) return undefined;

    const unsubscribers = [
      onIncomingCall((payload) => {
        if (!payload?.callId) return;

        if (activeCallRef.current?.callId) {
          rejectIncomingCall({
            callId: toId(payload.callId),
            reason: 'callee_busy',
          }).catch(() => {});
          return;
        }

        clearCallResetTimer();
        setIncomingCall(payload);
        setActiveCall(null);
        setCallState('ringing');
      }),
      onCallAccepted(async (payload) => {
        const callId = toId(payload?.callId);
        if (!callId || activeCallRef.current?.callId !== callId) return;

        try {
          const pc = await preparePeerForCall(callId);
          if (activeCallRef.current?.direction === 'outgoing') {
            const offer = await pc.createOffer({
              offerToReceiveAudio: true,
            });
            await pc.setLocalDescription(offer);
            await sendWebrtcOffer({ callId, sdp: offer });
          }
          setCallState('calling');
        } catch (err) {
          failActiveCall({
            callId,
            reason: err?.message || 'offer_failed',
          }).catch(() => {});
          setCallState('failed');
          resetCallUi();
          queueCallStateReset();
        }
      }),
      onCallRejected((payload) => {
        const callId = toId(payload?.callId);
        if (!callId) return;
        if (
          activeCallRef.current?.callId !== callId &&
          toId(incomingCallRef.current?.callId) !== callId
        ) {
          return;
        }

        resetCallUi();
        setCallState('rejected');
        queueCallStateReset();
      }),
      onCallBusy((payload) => {
        if (!activeCallRef.current?.callId && !incomingCallRef.current?.callId) return;

        const callId = toId(payload?.callId || activeCallRef.current?.callId);
        if (
          callId &&
          activeCallRef.current?.callId &&
          activeCallRef.current.callId !== callId
        ) {
          return;
        }

        toast.error(payload?.reason || 'User is busy');
        resetCallUi();
        setCallState('busy');
        queueCallStateReset();
      }),
      onCallFailed((payload) => {
        if (!activeCallRef.current?.callId && !incomingCallRef.current?.callId) return;

        const callId = toId(payload?.callId || activeCallRef.current?.callId);
        if (
          callId &&
          activeCallRef.current?.callId &&
          activeCallRef.current.callId !== callId
        ) {
          return;
        }

        toast.error(payload?.reason || 'Call failed');
        resetCallUi();
        setCallState(payload?.status === 'missed' ? 'missed' : 'failed');
        queueCallStateReset();
      }),
      onCallEnded((payload) => {
        const callId = toId(payload?.callId);
        if (!callId) return;
        if (
          activeCallRef.current?.callId !== callId &&
          toId(incomingCallRef.current?.callId) !== callId
        ) {
          return;
        }

        resetCallUi();
        setCallState(payload?.status === 'missed' ? 'missed' : 'ended');
        queueCallStateReset();
      }),
      onWebrtcOffer(async (payload) => {
        const callId = toId(payload?.callId);
        const sdp = payload?.sdp;
        if (!callId || !sdp) return;
        if (!activeCallRef.current?.callId || activeCallRef.current.callId !== callId) {
          return;
        }

        try {
          const pc = await preparePeerForCall(callId);
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendWebrtcAnswer({ callId, sdp: answer });
          setCallState('calling');
        } catch (err) {
          failActiveCall({
            callId,
            reason: err?.message || 'answer_failed',
          }).catch(() => {});
          setCallState('failed');
          resetCallUi();
          queueCallStateReset();
        }
      }),
      onWebrtcAnswer(async (payload) => {
        const callId = toId(payload?.callId);
        const sdp = payload?.sdp;
        if (!callId || !sdp) return;
        if (!activeCallRef.current?.callId || activeCallRef.current.callId !== callId) {
          return;
        }

        const pc = peerConnectionRef.current;
        if (!pc) return;

        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        } catch {
          // ignore duplicate or late answers
        }
      }),
      onWebrtcIceCandidate(async (payload) => {
        const callId = toId(payload?.callId);
        if (!callId) return;
        if (!activeCallRef.current?.callId || activeCallRef.current.callId !== callId) {
          return;
        }

        const candidate = payload?.candidate;
        const pc = peerConnectionRef.current;
        if (!pc || !candidate) return;

        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {
          // ignore malformed or late candidates
        }
      }),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe?.());
    };
  }, [
    clearCallResetTimer,
    preparePeerForCall,
    queueCallStateReset,
    resetCallUi,
    setActiveCall,
    setCallState,
    setIncomingCall,
    token,
  ]);

  useEffect(
    () => () => {
      const activeCallId = toId(
        activeCallRef.current?.callId || incomingCallRef.current?.callId
      );
      if (activeCallId) {
        endActiveCall({ callId: activeCallId }).catch(() => {});
      }
      clearCallResetTimer();
      cleanupCallMedia();
    },
    [cleanupCallMedia, clearCallResetTimer]
  );

  const relatedChat = useMemo(() => {
    const relatedChatId = toId(activeCall?.chatId || incomingCall?.chatId);
    return chats.find((entry) => toId(entry?._id) === relatedChatId) || null;
  }, [activeCall?.chatId, chats, incomingCall?.chatId]);

  const callStateLabel = useMemo(() => {
    if (incomingCall && callState === 'ringing') return 'Incoming audio call';
    if (callState === 'calling') return 'Calling...';
    if (callState === 'ringing') return 'Ringing...';
    if (callState === 'connected') return `Connected ${formatCallDuration(callSeconds)}`;
    if (callState === 'busy') return 'User is busy';
    if (callState === 'missed') return 'Missed call';
    if (callState === 'rejected') return 'Call rejected';
    if (callState === 'failed') return 'Call failed';
    if (callState === 'ended') return 'Call ended';
    return '';
  }, [callSeconds, callState, incomingCall]);

  const relatedPeer =
    relatedChat?.participants?.find(
      (participant) => toId(participant) === toId(activeCall?.otherUserId)
    ) || null;

  const currentPeer = incomingCall?.from || {
    _id: activeCall?.otherUserId || '',
    name: activeCall?.otherUserName || relatedPeer?.name || 'User',
    profilePic: activeCall?.otherUserAvatar || relatedPeer?.profilePic || '',
  };

  const value = useMemo(
    () => ({
      callState,
      activeCall,
      incomingCall,
      callSeconds,
      isMuted,
      hasLocalStream,
      callActionLoading,
      callStateLabel,
      hasBusyCall: Boolean(activeCall || incomingCall || isCallBusyState(callState)),
      startCall,
      acceptCall,
      rejectCall,
      endCall,
      toggleMute,
      openRelatedChat,
      isCallForChat: (chatId) => {
        const safeChatId = toId(chatId);
        if (!safeChatId) return false;
        return (
          toId(activeCall?.chatId) === safeChatId || toId(incomingCall?.chatId) === safeChatId
        );
      },
    }),
    [
      acceptCall,
      activeCall,
      callActionLoading,
      callSeconds,
      callState,
      callStateLabel,
      endCall,
      hasLocalStream,
      incomingCall,
      isMuted,
      openRelatedChat,
      rejectCall,
      startCall,
      toggleMute,
    ]
  );

  return (
    <CallContext.Provider value={value}>
      {children}
      <GlobalCallModal
        callState={callState}
        callStateLabel={callStateLabel}
        activeCall={activeCall}
        incomingCall={incomingCall}
        peer={currentPeer}
        callActionLoading={callActionLoading}
        hasLocalStream={hasLocalStream}
        isMuted={isMuted}
        onAccept={acceptCall}
        onReject={rejectCall}
        onEnd={endCall}
        onToggleMute={toggleMute}
        onOpenChat={openRelatedChat}
      />
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
    </CallContext.Provider>
  );
};

export default CallProvider;
