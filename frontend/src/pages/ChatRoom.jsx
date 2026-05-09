import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useDispatch, useSelector } from 'react-redux';
import ChatBubble from '../components/chat/ChatBubble';
import MessageInput from '../components/chat/MessageInput';
import TypingIndicator from '../components/chat/TypingIndicator';
import {
  deleteMessage,
  getMessages,
  getMyChats,
  markMessageSeen,
  sendMediaMessage,
  sendMessage,
  setActiveChatId,
  socketMessageDelivered,
  socketMessageReceived,
  socketMessageSeen,
  socketStopTyping,
  socketTyping,
  socketUserOffline,
  socketUserOnline,
} from '../redux/slices/chatSlice';
import {
  connectChatSocket,
  joinChat,
  leaveChat,
  onMessageDelivered,
  onMessageSeen,
  onReceiveMessage,
  onStopTyping,
  onTyping,
  onUserOffline,
  onUserOnline,
  sendStopTyping,
  sendTyping,
} from '../services/chatSocket';

const toId = (value) =>
  (value && typeof value === 'object' ? value._id : value)?.toString?.() || '';

const ChatRoom = () => {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const scrollAnchorRef = useRef(null);
  const pendingSeenIdsRef = useRef(new Set());
  const resetProgressTimerRef = useRef(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaUploadProgress, setMediaUploadProgress] = useState(0);

  const user = useSelector((state) => state.auth.user);
  const chats = useSelector((state) => state.chat.chats);
  const chatsStatus = useSelector((state) => state.chat.chatsStatus);
  const messagesByChat = useSelector((state) => state.chat.messagesByChat);
  const messagesStatusByChat = useSelector((state) => state.chat.messagesStatusByChat);
  const sendStatusByChat = useSelector((state) => state.chat.sendStatusByChat);
  const typingByChat = useSelector((state) => state.chat.typingByChat);
  const onlineUsers = useSelector((state) => state.chat.onlineUsers);

  const currentUserId = toId(user?._id || user?.id);
  const safeChatId = toId(chatId);
  const messages = messagesByChat[safeChatId] || [];
  const messageLoadState = messagesStatusByChat[safeChatId] || 'idle';
  const messageSendState = sendStatusByChat[safeChatId] || 'idle';

  const chat = chats.find((entry) => toId(entry?._id) === safeChatId);
  const otherUser = (chat?.participants || []).find(
    (participant) => toId(participant) !== currentUserId
  );
  const otherUserId = toId(otherUser);
  const otherUserOnline = Boolean(otherUserId && onlineUsers[otherUserId]);
  const typingMap = typingByChat[safeChatId] || {};
  const typingNames = Object.entries(typingMap)
    .filter(([typingUserId]) => typingUserId !== currentUserId)
    .map(([, name]) => name);

  useEffect(() => {
    if (!safeChatId) return undefined;
    connectChatSocket();
    dispatch(setActiveChatId(safeChatId));
    if (chatsStatus === 'idle') {
      dispatch(getMyChats());
    }
    dispatch(getMessages({ chatId: safeChatId }));
    joinChat(safeChatId).catch(() => {});

    return () => {
      dispatch(setActiveChatId(null));
      leaveChat(safeChatId).catch(() => {});
    };
  }, [safeChatId, dispatch, chatsStatus]);

  useEffect(() => {
    if (!currentUserId) return undefined;

    const unsubscribers = [
      onReceiveMessage((payload) =>
        dispatch(socketMessageReceived({ ...payload, currentUserId }))
      ),
      onMessageSeen((payload) => dispatch(socketMessageSeen(payload))),
      onMessageDelivered((payload) => dispatch(socketMessageDelivered(payload))),
      onTyping((payload) => dispatch(socketTyping(payload))),
      onStopTyping((payload) => dispatch(socketStopTyping(payload))),
      onUserOnline((payload) => dispatch(socketUserOnline(payload))),
      onUserOffline((payload) => dispatch(socketUserOffline(payload))),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe?.());
    };
  }, [currentUserId, dispatch]);

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

  const handleSend = async (text) => {
    try {
      await dispatch(sendMessage({ chatId: safeChatId, text })).unwrap();
      await sendStopTyping(safeChatId).catch(() => {});
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'Failed to send message');
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
          onUploadProgress: (event) => {
            const total = Number(event?.total || 0);
            const loaded = Number(event?.loaded || 0);
            if (!total) return;
            setMediaUploadProgress((loaded / total) * 100);
          },
        })
      ).unwrap();

      await sendStopTyping(safeChatId).catch(() => {});
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

  useEffect(
    () => () => {
      if (resetProgressTimerRef.current) {
        window.clearTimeout(resetProgressTimerRef.current);
      }
    },
    []
  );

  const handleDelete = async (message) => {
    try {
      await dispatch(deleteMessage({ messageId: message._id })).unwrap();
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'Failed to delete message');
    }
  };

  const handleTypingStart = () => {
    if (!safeChatId) return;
    sendTyping(safeChatId).catch(() => {});
  };

  const handleTypingStop = () => {
    if (!safeChatId) return;
    sendStopTyping(safeChatId).catch(() => {});
  };

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
            <p className="truncate text-xs text-slate-500">{rideSummary}</p>
          </div>

          {chat?.ride?._id ? (
            <Link
              to={`/ride/${chat.ride._id}`}
              className="ml-auto rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700"
            >
              Open Ride
            </Link>
          ) : null}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-hidden">
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
                  onDelete={handleDelete}
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
          onTypingStart={handleTypingStart}
          onTypingStop={handleTypingStop}
          disabled={messageSendState === 'loading' || mediaUploading}
          mediaUploading={mediaUploading}
          mediaUploadProgress={mediaUploadProgress}
        />
      </main>
    </div>
  );
};

export default ChatRoom;
