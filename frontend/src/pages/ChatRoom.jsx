import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useDispatch, useSelector } from 'react-redux';
import { Phone } from 'lucide-react';
import ChatBubble from '../components/chat/ChatBubble';
import MessageInput from '../components/chat/MessageInput';
import TypingIndicator from '../components/chat/TypingIndicator';
import useAudioCall from '../hooks/useAudioCall';
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
  setActiveChatId,
  setMessageReaction,
  setOptimisticMessageStatus,
} from '../redux/slices/chatSlice';
import {
  onSocketConnect,
  sendStopTyping,
  sendTyping,
  setActiveChatFocus,
} from '../services/chatSocket';
import UserAvatar, { getUserAvatarUrl } from '../components/common/UserAvatar';
import StatusBadge from '../components/common/StatusBadge';

const toId = (value) =>
  (value && typeof value === 'object' ? value._id : value)?.toString?.() || '';

const createClientMessageId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const ChatRoom = () => {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const scrollAnchorRef = useRef(null);
  const pendingSeenIdsRef = useRef(new Set());
  const resetProgressTimerRef = useRef(null);
  const pendingVoiceByClientIdRef = useRef(new Map());
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaUploadProgress, setMediaUploadProgress] = useState(0);

  const token = useSelector((state) => state.auth.token);
  const user = useSelector((state) => state.auth.user);
  const isHydrated = useSelector((state) => state.auth.isHydrated);
  const isInitializing = useSelector((state) => state.auth.isInitializing);
  const chats = useSelector((state) => state.chat.chats);
  const chatsStatus = useSelector((state) => state.chat.chatsStatus);
  const messagesByChat = useSelector((state) => state.chat.messagesByChat);
  const messagesStatusByChat = useSelector((state) => state.chat.messagesStatusByChat);
  const messagesErrorByChat = useSelector((state) => state.chat.messagesErrorByChat);
  const typingByChat = useSelector((state) => state.chat.typingByChat);
  const onlineUsers = useSelector((state) => state.chat.onlineUsers);
  const lastSeenByUser = useSelector((state) => state.chat.lastSeenByUser);
  const {
    callActionLoading,
    callStateLabel,
    hasBusyCall,
    isCallForChat,
    startCall,
  } = useAudioCall();

  const currentUserId = toId(user?._id || user?.id);
  const safeChatId = toId(chatId);
  const messages = useMemo(
    () => messagesByChat[safeChatId] || [],
    [messagesByChat, safeChatId]
  );
  const messageLoadState = messagesStatusByChat[safeChatId] || 'idle';
  const messageLoadError = messagesErrorByChat[safeChatId] || '';
  const authReady = isHydrated && !isInitializing && Boolean(token) && Boolean(currentUserId);

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
  const callInThisChat = isCallForChat(safeChatId);

  useEffect(() => {
    if (!safeChatId || !authReady) return undefined;
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
  }, [authReady, chatsStatus, dispatch, safeChatId]);

  useEffect(() => {
    if (!safeChatId || !authReady) return undefined;

    const syncChatFocus = () => {
      const visible = document.visibilityState === 'visible' && document.hasFocus();
      setActiveChatFocus(safeChatId, visible);
    };

    syncChatFocus();
    document.addEventListener('visibilitychange', syncChatFocus);
    window.addEventListener('focus', syncChatFocus);
    window.addEventListener('blur', syncChatFocus);
    const unsubscribeConnect = onSocketConnect(syncChatFocus);

    return () => {
      setActiveChatFocus(safeChatId, false);
      document.removeEventListener('visibilitychange', syncChatFocus);
      window.removeEventListener('focus', syncChatFocus);
      window.removeEventListener('blur', syncChatFocus);
      unsubscribeConnect?.();
    };
  }, [authReady, safeChatId]);

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
  }, [currentUserId, dispatch, messages]);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, typingNames.length]);

  useEffect(
    () => () => {
      if (resetProgressTimerRef.current) {
        window.clearTimeout(resetProgressTimerRef.current);
      }
      pendingVoiceByClientIdRef.current.clear();
    },
    []
  );

  const rideSummary = useMemo(() => {
    const from = chat?.ride?.source?.name || 'Unknown source';
    const to = chat?.ride?.destination?.name || 'Unknown destination';
    return `${from} to ${to}`;
  }, [chat]);

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

    await startCall({
      chatId: safeChatId,
      otherUserId,
      otherUserName: otherUser?.name || 'User',
      otherUserAvatar: getUserAvatarUrl(otherUser),
    });
  };

  if (!safeChatId) {
    return (
      <div className="flex-grow flex items-center justify-center bg-slate-100">
        <p className="text-sm font-semibold text-slate-600">Invalid chat id</p>
      </div>
    );
  }

  if (!isHydrated || isInitializing) {
    return (
      <div className="flex-grow flex items-center justify-center bg-slate-100">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-300 border-t-emerald-500" />
      </div>
    );
  }

  if (!authReady) {
    return (
      <div className="flex-grow flex items-center justify-center bg-slate-100">
        <p className="text-sm font-semibold text-slate-600">Preparing your chat session...</p>
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

  if (messageLoadState === 'failed' && !messages.length) {
    const safeMessage = String(messageLoadError || 'Unable to load chat messages');
    const sessionExpired = /(token|session|unauthoriz|expired|forbidden|access denied|log in)/i.test(
      safeMessage
    );

    return (
      <div className="flex-grow bg-slate-100 px-4 py-6">
        <div className="mx-auto max-w-xl rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
          <h2 className="text-lg font-black text-rose-900">
            {sessionExpired ? 'Session expired' : 'Could not load messages'}
          </h2>
          <p className="mt-2 text-sm text-rose-700">{safeMessage}</p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => dispatch(getMessages({ chatId: safeChatId }))}
              className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-bold text-white"
            >
              Retry
            </button>
            {sessionExpired ? (
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-bold text-rose-700"
              >
                Go to Login
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-112px)] flex-col overflow-x-hidden bg-slate-100 md:h-[calc(100vh-64px)]">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white px-3 py-3 shadow-sm">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-2 md:gap-3">
          <button
            type="button"
            onClick={() => navigate('/chats')}
            className="rounded-lg bg-slate-100 px-2 py-1 text-sm font-bold text-slate-700"
          >
            Back
          </button>

          <UserAvatar user={otherUser} size="md" showOnline={otherUserOnline} />

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-black text-slate-900">
              {otherUser?.name || 'Chat'}
            </h1>
            <div className="mt-0.5 flex items-center gap-2">
              <StatusBadge isOnline={otherUserOnline} lastSeenAt={otherUserLastSeen} />
              {chat?.chatKind === 'inquiry' ? (
                <p className="text-[11px] font-semibold text-amber-600">Inquiry chat</p>
              ) : null}
            </div>
            <p className="truncate text-[11px] text-slate-400">{rideSummary}</p>
          </div>

          <div className="ml-1 flex shrink-0 flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleStartCall}
              disabled={
                callActionLoading ||
                !otherUserId ||
                hasBusyCall
              }
              className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-50"
              title="Audio call"
            >
              <Phone className="h-3.5 w-3.5" />
              {callInThisChat && callStateLabel ? callStateLabel : 'Call'}
            </button>

            {chat?.chatKind === 'inquiry' ? (
              <p className="hidden text-[11px] font-semibold text-amber-600 md:block">Inquiry</p>
            ) : null}
            {chat?.ride?._id ? (
              <Link
                to={`/ride/${chat.ride._id}`}
                className="rounded-xl bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700"
              >
                Open Ride
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-hidden">
        <div className="flex-1 space-y-2 overflow-y-auto overflow-x-hidden px-3 py-4">
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

        <div className="sticky bottom-0 bg-white">
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
        </div>
      </main>
    </div>
  );
};

export default ChatRoom;
