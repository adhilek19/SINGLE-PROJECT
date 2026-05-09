import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useDispatch, useSelector } from 'react-redux';
import { Mic, MicOff, Phone, PhoneOff } from 'lucide-react';
import ChatBubble from '../components/chat/ChatBubble';
import MessageInput from '../components/chat/MessageInput';
import TypingIndicator from '../components/chat/TypingIndicator';
import {
  addOptimisticMessage,
  clearTypingForChat,
  deleteMessage,
  getMessages,
  getMyChats,
  markMessageSeen,
  removeLocalMessage,
  sendMediaMessage,
  sendMessage,
  setMessageReaction,
  setActiveChatId,
  setOptimisticMessageStatus,
} from '../redux/slices/chatSlice';
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
  sendStopTyping,
  sendTyping,
} from '../services/chatSocket';
import { callService } from '../services/api';

const toId = (value) =>
  (value && typeof value === 'object' ? value._id : value)?.toString?.() || '';

const createClientMessageId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const formatLastSeen = (value) => {
  if (!value) return '';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return '';
  const delta = Math.max(0, Date.now() - time);
  const mins = Math.floor(delta / (60 * 1000));
  if (mins < 1) return 'last seen just now';
  if (mins < 60) return `last seen ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `last seen ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `last seen ${days}d ago`;
};

const formatCallDuration = (seconds = 0) => {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds || 0)));
  const mins = String(Math.floor(safeSeconds / 60)).padStart(2, '0');
  const secs = String(safeSeconds % 60).padStart(2, '0');
  return `${mins}:${secs}`;
};

const ChatRoom = () => {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const scrollAnchorRef = useRef(null);
  const pendingSeenIdsRef = useRef(new Set());
  const resetProgressTimerRef = useRef(null);
  const pendingVoiceByClientIdRef = useRef(new Map());
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
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaUploadProgress, setMediaUploadProgress] = useState(0);
  const [callState, setCallState] = useState('idle');
  const [activeCall, setActiveCall] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [callSeconds, setCallSeconds] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [callActionLoading, setCallActionLoading] = useState(false);

  const user = useSelector((state) => state.auth.user);
  const chats = useSelector((state) => state.chat.chats);
  const chatsStatus = useSelector((state) => state.chat.chatsStatus);
  const messagesByChat = useSelector((state) => state.chat.messagesByChat);
  const messagesStatusByChat = useSelector((state) => state.chat.messagesStatusByChat);
  const typingByChat = useSelector((state) => state.chat.typingByChat);
  const onlineUsers = useSelector((state) => state.chat.onlineUsers);
  const lastSeenByUser = useSelector((state) => state.chat.lastSeenByUser);

  const currentUserId = toId(user?._id || user?.id);
  const safeChatId = toId(chatId);
  const messages = messagesByChat[safeChatId] || [];
  const messageLoadState = messagesStatusByChat[safeChatId] || 'idle';

  const chat = chats.find((entry) => toId(entry?._id) === safeChatId);
  const otherUser = (chat?.participants || []).find(
    (participant) => toId(participant) !== currentUserId
  );
  const otherUserId = toId(otherUser);
  const otherUserOnline = Boolean(otherUserId && onlineUsers[otherUserId]);
  const otherUserLastSeen = lastSeenByUser[otherUserId] || '';
  const typingMap = typingByChat[safeChatId] || {};
  const typingNames = Object.entries(typingMap)
    .filter(([typingUserId]) => typingUserId !== currentUserId)
    .map(([, name]) => name);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  useEffect(() => {
    incomingCallRef.current = incomingCall;
  }, [incomingCall]);

  useEffect(() => {
    if (!safeChatId) return undefined;
    dispatch(setActiveChatId(safeChatId));
    if (chatsStatus === 'idle') {
      dispatch(getMyChats());
    }
    dispatch(getMessages({ chatId: safeChatId }));

    return () => {
      sendStopTyping(safeChatId);
      dispatch(clearTypingForChat(safeChatId));
      dispatch(setActiveChatId(null));
    };
  }, [safeChatId, dispatch, chatsStatus]);

  useEffect(() => {
    if (!messages.length || !currentUserId) return;

    const unseenIncoming = messages.filter((message) => {
      const receiverId = toId(message.receiver);
      if (receiverId !== currentUserId) return false;
      const seenBy = Array.isArray(message.seenBy) ? message.seenBy : [];
      const alreadySeen = seenBy.some((entry) => toId(entry) === currentUserId);
      return !alreadySeen;
    });

    unseenIncoming.forEach((message) => {
      const messageId = toId(message?._id);
      if (!messageId || pendingSeenIdsRef.current.has(messageId)) return;

      pendingSeenIdsRef.current.add(messageId);
      dispatch(markMessageSeen({ messageId }))
        .catch(() => {})
        .finally(() => {
          pendingSeenIdsRef.current.delete(messageId);
        });
    });
  }, [messages, currentUserId, dispatch]);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, typingNames.length]);

  const rideSummary = useMemo(() => {
    const from = chat?.ride?.source?.name || 'Unknown source';
    const to = chat?.ride?.destination?.name || 'Unknown destination';
    return `${from} to ${to}`;
  }, [chat]);

  const stopCallTimer = () => {
    if (callTimerIntervalRef.current) {
      window.clearInterval(callTimerIntervalRef.current);
      callTimerIntervalRef.current = null;
    }
  };

  const startCallTimer = () => {
    stopCallTimer();
    callStartedAtRef.current = Date.now();
    setCallSeconds(0);
    callTimerIntervalRef.current = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - callStartedAtRef.current) / 1000);
      setCallSeconds(Math.max(0, elapsed));
    }, 1000);
  };

  const queueCallStateReset = (delayMs = 1800) => {
    if (callStateResetTimerRef.current) {
      window.clearTimeout(callStateResetTimerRef.current);
    }
    callStateResetTimerRef.current = window.setTimeout(() => {
      setCallState('idle');
      callStateResetTimerRef.current = null;
    }, delayMs);
  };

  const stopLocalAudioTracks = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
  };

  const cleanupCallMedia = () => {
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
  };

  const getIceServers = async () => {
    if (Array.isArray(iceServersRef.current)) return iceServersRef.current;
    const response = await callService.getIceServers();
    const list = Array.isArray(response?.data?.data?.iceServers)
      ? response.data.data.iceServers
      : [];
    iceServersRef.current = list;
    return list;
  };

  const getOrCreateLocalStream = async () => {
    if (localStreamRef.current) return localStreamRef.current;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Audio calling is not supported on this browser');
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      return stream;
    } catch (err) {
      if (err?.name === 'NotAllowedError') {
        throw new Error('Microphone permission denied');
      }
      throw new Error('Unable to access microphone');
    }
  };

  const createPeerConnection = async (callId) => {
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
        if (callStateRef.current === 'connected' || callStateRef.current === 'calling') {
          failActiveCall({
            callId,
            reason: `peer_connection_${currentState}`,
          }).catch(() => {});
          setCallState('failed');
          cleanupCallMedia();
          setActiveCall(null);
          setIncomingCall(null);
          queueCallStateReset();
        }
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  };

  const preparePeerForCall = async (callId) => {
    const pc = await createPeerConnection(callId);
    const stream = await getOrCreateLocalStream();
    const existingSenders = pc.getSenders().filter((sender) => sender.track);
    if (!existingSenders.length) {
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });
    }
    return pc;
  };

  const handleSend = async (text) => {
    const clientMessageId = createClientMessageId();
    const now = new Date().toISOString();
    const optimisticMessage = {
      _id: `temp:${clientMessageId}`,
      clientMessageId,
      chat: safeChatId,
      sender: user,
      receiver: otherUser || otherUserId,
      type: 'text',
      text,
      seenBy: currentUserId ? [currentUserId] : [],
      deliveredTo: currentUserId ? [currentUserId] : [],
      reactions: [],
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
      localStatus: 'sending',
      localError: null,
    };

    dispatch(addOptimisticMessage({ chatId: safeChatId, message: optimisticMessage }));

    try {
      await dispatch(sendMessage({ chatId: safeChatId, text, clientMessageId })).unwrap();
      sendStopTyping(safeChatId);
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'Failed to send message');
      dispatch(
        setOptimisticMessageStatus({
          chatId: safeChatId,
          clientMessageId,
          status: 'failed',
          error: typeof err === 'string' ? err : 'Failed to send message',
        })
      );
    }
  };

  const handleSendMedia = async (file) => {
    if (!safeChatId || !file) return;

    try {
      if (resetProgressTimerRef.current) {
        window.clearTimeout(resetProgressTimerRef.current);
        resetProgressTimerRef.current = null;
      }
      setMediaUploading(true);
      setMediaUploadProgress(0);

      await dispatch(
        sendMediaMessage({
          chatId: safeChatId,
          file,
          clientMessageId: createClientMessageId(),
          onUploadProgress: (event) => {
            const total = Number(event?.total || 0);
            const loaded = Number(event?.loaded || 0);
            if (!total) return;
            setMediaUploadProgress((loaded / total) * 100);
          },
        })
      ).unwrap();

      sendStopTyping(safeChatId);
      setMediaUploadProgress(100);
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'Failed to send media');
    } finally {
      setMediaUploading(false);
      resetProgressTimerRef.current = window.setTimeout(() => {
        setMediaUploadProgress(0);
        resetProgressTimerRef.current = null;
      }, 200);
    }
  };

  const handleSendVoice = async ({ file, duration, waveform, previewUrl }) => {
    if (!safeChatId || !file) return;

    const clientMessageId = createClientMessageId();
    const now = new Date().toISOString();
    const safeDuration = Math.max(1, Number(duration || 0));
    const safeWaveform = Array.isArray(waveform) ? waveform.slice(0, 64) : [];

    const optimisticMessage = {
      _id: `temp:${clientMessageId}`,
      clientMessageId,
      chat: safeChatId,
      sender: user,
      receiver: otherUser || otherUserId,
      type: 'voice',
      text: '',
      url: previewUrl || '',
      fileName: file.name || 'voice-note.webm',
      fileSize: Number(file.size || 0),
      mimeType: file.type || 'audio/webm',
      duration: safeDuration,
      waveform: safeWaveform,
      seenBy: currentUserId ? [currentUserId] : [],
      deliveredTo: currentUserId ? [currentUserId] : [],
      reactions: [],
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
      localStatus: 'sending',
      localError: null,
    };

    pendingVoiceByClientIdRef.current.set(clientMessageId, {
      file,
      duration: safeDuration,
      waveform: safeWaveform,
    });

    dispatch(addOptimisticMessage({ chatId: safeChatId, message: optimisticMessage }));

    try {
      if (resetProgressTimerRef.current) {
        window.clearTimeout(resetProgressTimerRef.current);
        resetProgressTimerRef.current = null;
      }
      setMediaUploading(true);
      setMediaUploadProgress(0);

      await dispatch(
        sendMediaMessage({
          chatId: safeChatId,
          file,
          type: 'voice',
          duration: safeDuration,
          waveform: safeWaveform,
          clientMessageId,
          onUploadProgress: (event) => {
            const total = Number(event?.total || 0);
            const loaded = Number(event?.loaded || 0);
            if (!total) return;
            setMediaUploadProgress((loaded / total) * 100);
          },
        })
      ).unwrap();

      pendingVoiceByClientIdRef.current.delete(clientMessageId);
      sendStopTyping(safeChatId);
      setMediaUploadProgress(100);
    } catch (err) {
      dispatch(
        setOptimisticMessageStatus({
          chatId: safeChatId,
          clientMessageId,
          status: 'failed',
          error: typeof err === 'string' ? err : 'Failed to send voice note',
        })
      );
      throw err;
    } finally {
      setMediaUploading(false);
      resetProgressTimerRef.current = window.setTimeout(() => {
        setMediaUploadProgress(0);
        resetProgressTimerRef.current = null;
      }, 200);
    }
  };

  useEffect(
    () => () => {
      if (resetProgressTimerRef.current) {
        window.clearTimeout(resetProgressTimerRef.current);
      }
      pendingVoiceByClientIdRef.current.clear();
    },
    []
  );

  const handleDelete = async (message) => {
    const messageId = toId(message?._id);
    const clientMessageId = String(message?.clientMessageId || '').trim();

    if (messageId.startsWith('temp:')) {
      if (clientMessageId) {
        pendingVoiceByClientIdRef.current.delete(clientMessageId);
      }
      dispatch(
        removeLocalMessage({
          chatId: safeChatId,
          messageId,
          clientMessageId,
        })
      );
      return;
    }

    try {
      await dispatch(deleteMessage({ messageId })).unwrap();
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'Failed to delete message');
    }
  };

  const handleRetry = async (message) => {
    const clientMessageId = String(message?.clientMessageId || '').trim();
    if (!clientMessageId || !safeChatId) return;

    if (message?.type === 'voice') {
      const pendingVoice = pendingVoiceByClientIdRef.current.get(clientMessageId);
      if (!pendingVoice?.file) {
        toast.error('Voice note source missing. Please record again.');
        return;
      }

      dispatch(
        setOptimisticMessageStatus({
          chatId: safeChatId,
          clientMessageId,
          status: 'sending',
          error: null,
        })
      );

      try {
        if (resetProgressTimerRef.current) {
          window.clearTimeout(resetProgressTimerRef.current);
          resetProgressTimerRef.current = null;
        }
        setMediaUploading(true);
        setMediaUploadProgress(0);

        await dispatch(
          sendMediaMessage({
            chatId: safeChatId,
            file: pendingVoice.file,
            type: 'voice',
            duration: pendingVoice.duration,
            waveform: pendingVoice.waveform,
            clientMessageId,
            onUploadProgress: (event) => {
              const total = Number(event?.total || 0);
              const loaded = Number(event?.loaded || 0);
              if (!total) return;
              setMediaUploadProgress((loaded / total) * 100);
            },
          })
        ).unwrap();

        pendingVoiceByClientIdRef.current.delete(clientMessageId);
        sendStopTyping(safeChatId);
        setMediaUploadProgress(100);
      } catch (err) {
        dispatch(
          setOptimisticMessageStatus({
            chatId: safeChatId,
            clientMessageId,
            status: 'failed',
            error: typeof err === 'string' ? err : 'Failed to send voice note',
          })
        );
      } finally {
        setMediaUploading(false);
        resetProgressTimerRef.current = window.setTimeout(() => {
          setMediaUploadProgress(0);
          resetProgressTimerRef.current = null;
        }, 200);
      }
      return;
    }

    const text = String(message?.text || '').trim();
    if (!text) return;

    dispatch(
      setOptimisticMessageStatus({
        chatId: safeChatId,
        clientMessageId,
        status: 'sending',
        error: null,
      })
    );

    try {
      await dispatch(sendMessage({ chatId: safeChatId, text, clientMessageId })).unwrap();
    } catch (err) {
      dispatch(
        setOptimisticMessageStatus({
          chatId: safeChatId,
          clientMessageId,
          status: 'failed',
          error: typeof err === 'string' ? err : 'Failed to send message',
        })
      );
    }
  };

  const handleReact = async (message, emoji) => {
    const messageId = toId(message?._id);
    if (!messageId || messageId.startsWith('temp:')) return;
    try {
      await dispatch(setMessageReaction({ messageId, emoji })).unwrap();
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'Failed to update reaction');
    }
  };

  const handleTypingStart = () => {
    if (!safeChatId) return;
    sendTyping(safeChatId);
  };

  const handleTypingStop = () => {
    if (!safeChatId) return;
    sendStopTyping(safeChatId);
  };

  const handleStartCall = async () => {
    if (!safeChatId || !otherUserId || callActionLoading) return;
    if (activeCallRef.current) {
      toast.error('Another call is already in progress');
      return;
    }

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
        otherUserId,
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
      const message = typeof err?.message === 'string' ? err.message : 'Failed to start call';
      setCallState('failed');
      cleanupCallMedia();
      setActiveCall(null);
      setIncomingCall(null);
      toast.error(message);
      queueCallStateReset();
    } finally {
      setCallActionLoading(false);
    }
  };

  const handleAcceptIncomingCall = async () => {
    if (!incomingCall?.callId || callActionLoading) return;
    setCallActionLoading(true);
    try {
      const callId = toId(incomingCall.callId);
      setActiveCall({
        callId,
        chatId: toId(incomingCall.chatId),
        otherUserId: toId(incomingCall?.from?._id),
        direction: 'incoming',
      });
      setCallState('calling');

      await preparePeerForCall(callId);
      await acceptIncomingCall({ callId });
      setIncomingCall(null);
    } catch (err) {
      const callId = toId(incomingCall?.callId);
      if (callId) {
        failActiveCall({
          callId,
          reason: err?.message || 'accept_failed',
        }).catch(() => {});
      }
      setCallState('failed');
      cleanupCallMedia();
      setActiveCall(null);
      setIncomingCall(null);
      toast.error(typeof err?.message === 'string' ? err.message : 'Failed to accept call');
      queueCallStateReset();
    } finally {
      setCallActionLoading(false);
    }
  };

  const handleRejectIncomingCall = async () => {
    if (!incomingCall?.callId || callActionLoading) return;
    setCallActionLoading(true);
    try {
      await rejectIncomingCall({
        callId: toId(incomingCall.callId),
        reason: 'callee_rejected',
      });
    } catch {
      // best effort reject
    } finally {
      setCallActionLoading(false);
      setIncomingCall(null);
      setActiveCall(null);
      cleanupCallMedia();
      setCallState('rejected');
      queueCallStateReset();
    }
  };

  const handleEndCall = async () => {
    const callId = toId(activeCallRef.current?.callId || incomingCall?.callId);
    if (!callId || callActionLoading) {
      cleanupCallMedia();
      setActiveCall(null);
      setIncomingCall(null);
      setCallState('idle');
      return;
    }

    setCallActionLoading(true);
    try {
      await endActiveCall({ callId });
    } catch {
      // best effort end
    } finally {
      setCallActionLoading(false);
      cleanupCallMedia();
      setActiveCall(null);
      setIncomingCall(null);
      setCallState('ended');
      queueCallStateReset();
    }
  };

  const toggleMute = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const tracks = stream.getAudioTracks();
    if (!tracks.length) return;
    const nextMuted = !isMuted;
    tracks.forEach((track) => {
      track.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);
  };

  useEffect(() => {
    const unsubscribers = [
      onIncomingCall((payload) => {
        const payloadChatId = toId(payload?.chatId);
        if (!payload?.callId) return;
        if (payloadChatId && payloadChatId !== safeChatId) {
          return;
        }
        if (activeCallRef.current?.callId) {
          rejectIncomingCall({
            callId: toId(payload.callId),
            reason: 'callee_busy',
          }).catch(() => {});
          return;
        }

        setIncomingCall(payload);
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
          cleanupCallMedia();
          setActiveCall(null);
          setIncomingCall(null);
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
        cleanupCallMedia();
        setActiveCall(null);
        setIncomingCall(null);
        setCallState('rejected');
        queueCallStateReset();
      }),
      onCallBusy((payload) => {
        if (!activeCallRef.current?.callId && !incomingCallRef.current?.callId) {
          return;
        }
        const callId = toId(payload?.callId || activeCallRef.current?.callId);
        if (
          callId &&
          activeCallRef.current?.callId &&
          activeCallRef.current.callId !== callId
        ) {
          return;
        }
        toast.error(payload?.reason || 'User is busy');
        cleanupCallMedia();
        setActiveCall(null);
        setIncomingCall(null);
        setCallState('busy');
        queueCallStateReset();
      }),
      onCallFailed((payload) => {
        if (!activeCallRef.current?.callId && !incomingCallRef.current?.callId) {
          return;
        }
        const callId = toId(payload?.callId || activeCallRef.current?.callId);
        if (
          callId &&
          activeCallRef.current?.callId &&
          activeCallRef.current.callId !== callId
        ) {
          return;
        }
        toast.error(payload?.reason || 'Call failed');
        cleanupCallMedia();
        setActiveCall(null);
        setIncomingCall(null);
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
        cleanupCallMedia();
        setActiveCall(null);
        setIncomingCall(null);
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
          cleanupCallMedia();
          setActiveCall(null);
          setIncomingCall(null);
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
          // ignore duplicate/late answer
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
          // ignore malformed/late candidates
        }
      }),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe?.());
    };
  }, [safeChatId]);

  useEffect(
    () => () => {
      const activeCallId = toId(
        activeCallRef.current?.callId || incomingCallRef.current?.callId
      );
      if (activeCallId) {
        endActiveCall({ callId: activeCallId }).catch(() => {});
      }
      cleanupCallMedia();
      if (callStateResetTimerRef.current) {
        window.clearTimeout(callStateResetTimerRef.current);
        callStateResetTimerRef.current = null;
      }
    },
    []
  );

  const callStateLabel = (() => {
    if (incomingCall && callState === 'ringing') return 'Incoming call';
    if (callState === 'calling') return 'Calling...';
    if (callState === 'ringing') return 'Ringing...';
    if (callState === 'connected') return `Connected ${formatCallDuration(callSeconds)}`;
    if (callState === 'busy') return 'User is busy';
    if (callState === 'missed') return 'Missed call';
    if (callState === 'rejected') return 'Call rejected';
    if (callState === 'failed') return 'Call failed';
    if (callState === 'ended') return 'Call ended';
    return '';
  })();

  if (!safeChatId) {
    return (
      <div className="flex-grow flex items-center justify-center bg-slate-100">
        <p className="text-sm font-semibold text-slate-600">Invalid chat id</p>
      </div>
    );
  }

  if (messageLoadState === 'loading' && !messages.length) {
    return (
      <div className="flex-grow flex items-center justify-center bg-slate-100">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-300 border-t-emerald-500" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-112px)] flex-col bg-slate-100 md:h-[calc(100vh-64px)]">
      <header className="border-b border-slate-200 bg-white px-3 py-3 shadow-sm">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/chats')}
            className="rounded-lg bg-slate-100 px-2 py-1 text-sm font-bold text-slate-700"
          >
            Back
          </button>

          <div className="relative h-10 w-10 overflow-hidden rounded-full bg-slate-200">
            {otherUser?.profilePic ? (
              <img
                src={otherUser.profilePic}
                alt={otherUser?.name || 'User'}
                className="h-full w-full object-cover"
              />
            ) : null}
            {otherUserOnline ? (
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-white bg-emerald-500" />
            ) : null}
          </div>

          <div className="min-w-0">
            <h1 className="truncate text-sm font-black text-slate-900">
              {otherUser?.name || 'Chat'}
            </h1>
            {chat?.chatKind === 'inquiry' ? (
              <p className="text-[11px] font-semibold text-amber-600">Inquiry chat</p>
            ) : null}
            <p className="truncate text-xs text-slate-500">
              {otherUserOnline ? 'online' : formatLastSeen(otherUserLastSeen) || 'offline'}
            </p>
            <p className="truncate text-[11px] text-slate-400">{rideSummary}</p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={handleStartCall}
              disabled={
                callActionLoading ||
                !otherUserId ||
                (callState !== 'idle' &&
                  !['ended', 'failed', 'rejected', 'missed', 'busy'].includes(callState))
              }
              className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
              title="Audio call"
            >
              <Phone className="h-3.5 w-3.5" />
              Call
            </button>

            {chat?.ride?._id ? (
              <Link
                to={`/ride/${chat.ride._id}`}
                className="rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700"
              >
                Open Ride
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-hidden">
        {(callStateLabel || incomingCall || activeCall) && (
          <div className="mx-3 mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-black text-emerald-800">{callStateLabel || 'Call'}</p>
                {incomingCall?.from?.name && callState === 'ringing' ? (
                  <p className="truncate text-xs font-semibold text-emerald-700">
                    {incomingCall.from.name} is calling...
                  </p>
                ) : null}
              </div>

              {incomingCall && callState === 'ringing' && !activeCall ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRejectIncomingCall}
                    disabled={callActionLoading}
                    className="inline-flex items-center gap-1 rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    <PhoneOff className="h-3.5 w-3.5" />
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={handleAcceptIncomingCall}
                    disabled={callActionLoading}
                    className="inline-flex items-center gap-1 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    Accept
                  </button>
                </div>
              ) : activeCall &&
                ['calling', 'ringing', 'connected'].includes(callState) ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleMute}
                    disabled={callActionLoading || !localStreamRef.current}
                    className="inline-flex items-center gap-1 rounded-xl bg-slate-200 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50"
                  >
                    {isMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                    {isMuted ? 'Unmute' : 'Mute'}
                  </button>
                  <button
                    type="button"
                    onClick={handleEndCall}
                    disabled={callActionLoading}
                    className="inline-flex items-center gap-1 rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    <PhoneOff className="h-3.5 w-3.5" />
                    End
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        )}

        <div className="flex-1 space-y-2 overflow-y-auto px-3 py-4">
          {!messages.length ? (
            <div className="mt-10 text-center">
              <p className="text-sm text-slate-500">No messages yet</p>
            </div>
          ) : (
            messages.map((message) => {
              const isOwn = toId(message.sender) === currentUserId;
              return (
                <ChatBubble
                  key={toId(message._id)}
                  message={message}
                  isOwn={isOwn}
                  otherUserId={otherUserId}
                  currentUserId={currentUserId}
                  onDelete={handleDelete}
                  onRetry={handleRetry}
                  onReact={handleReact}
                />
              );
            })
          )}

          {typingNames.length ? <TypingIndicator names={typingNames} /> : null}
          <div ref={scrollAnchorRef} />
        </div>

        <MessageInput
          onSend={handleSend}
          onSendMedia={handleSendMedia}
          onSendVoice={handleSendVoice}
          onTypingStart={handleTypingStart}
          onTypingStop={handleTypingStop}
          disabled={mediaUploading}
          mediaUploading={mediaUploading}
          mediaUploadProgress={mediaUploadProgress}
        />

        <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
      </main>
    </div>
  );
};

export default ChatRoom;
