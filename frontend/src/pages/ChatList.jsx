import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useDispatch, useSelector } from 'react-redux';
import { getMyChats } from '../redux/slices/chatSlice';

const toId = (value) =>
  (value && typeof value === 'object' ? value._id : value)?.toString?.() || '';

const formatTime = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
};

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

const getOtherParticipant = (chat, currentUserId) =>
  (chat?.participants || []).find((participant) => toId(participant) !== currentUserId) || null;

const getUnreadCount = (chat, currentUserId) => {
  if (Number.isFinite(Number(chat?.unreadCount))) {
    return Number(chat.unreadCount);
  }
  const unreadCounts = chat?.unreadCounts || {};
  return Number(unreadCounts[currentUserId] || 0);
};

const buildLastMessage = (chat) => {
  const message = chat?.lastMessage;
  if (!message) return 'No messages yet';
  if (message.isDeleted) return 'Message deleted';
  if (message.type === 'image') return 'Photo';
  if (message.type === 'video') return 'Video';
  if (message.type === 'audio') return 'Audio';
  if (message.type === 'file') return message.fileName || 'Document';
  return message.text || 'Text message';
};

const ChatList = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const user = useSelector((state) => state.auth.user);
  const chats = useSelector((state) => state.chat.chats);
  const chatsStatus = useSelector((state) => state.chat.chatsStatus);
  const chatsError = useSelector((state) => state.chat.chatsError);
  const onlineUsers = useSelector((state) => state.chat.onlineUsers);
  const lastSeenByUser = useSelector((state) => state.chat.lastSeenByUser);

  const currentUserId = toId(user?._id || user?.id);

  useEffect(() => {
    if (chatsStatus === 'idle') {
      dispatch(getMyChats());
    }
  }, [dispatch, chatsStatus]);

  const chatItems = useMemo(
    () =>
      chats.map((chat) => {
        const chatId = toId(chat?._id);
        const otherUser = getOtherParticipant(chat, currentUserId);
        const otherUserId = toId(otherUser);
        const unreadCount = getUnreadCount(chat, currentUserId);
        const lastMessage = buildLastMessage(chat);
        const from = chat?.ride?.source?.name || 'Unknown source';
        const to = chat?.ride?.destination?.name || 'Unknown destination';

        return {
          chatId,
          otherUser,
          otherUserId,
          unreadCount,
          lastMessage,
          from,
          to,
          timeLabel: formatTime(chat?.lastMessageAt || chat?.updatedAt),
          isOnline: Boolean(onlineUsers[otherUserId]),
          lastSeen: lastSeenByUser[otherUserId] || '',
          chatKind: chat?.chatKind || 'ride',
        };
      }),
    [chats, currentUserId, onlineUsers, lastSeenByUser]
  );

  if (chatsStatus === 'loading') {
    return (
      <div className="flex-grow bg-slate-100 px-4 py-6">
        <div className="mx-auto max-w-3xl space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-2xl bg-slate-200" />
          ))}
        </div>
      </div>
    );
  }

  if (chatsStatus === 'failed') {
    return (
      <div className="flex-grow bg-slate-100 px-4 py-6">
        <div className="mx-auto max-w-xl rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
          <h2 className="text-lg font-black text-rose-900">Could not load chats</h2>
          <p className="mt-2 text-sm text-rose-700">{chatsError || 'Unknown error'}</p>
          <button
            type="button"
            onClick={() => dispatch(getMyChats())}
            className="mt-4 rounded-xl bg-rose-700 px-4 py-2 text-sm font-bold text-white"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-grow bg-slate-100 px-3 py-4 md:px-6 md:py-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm border border-slate-200">
          <h1 className="text-xl font-black text-slate-900">Chats</h1>
          <p className="text-sm text-slate-500">Driver and passenger conversations</p>
        </div>

        {!chatItems.length ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <h2 className="text-lg font-black text-slate-900">No chats yet</h2>
            <p className="mt-2 text-sm text-slate-500">
              Open a ride and use Message Driver or Message Passenger.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {chatItems.map((item) => (
              <button
                key={item.chatId}
                type="button"
                onClick={() => {
                  if (!item.chatId) {
                    toast.error('Chat unavailable right now');
                    return;
                  }
                  navigate(`/chats/${item.chatId}`);
                }}
                className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:bg-slate-50"
              >
                <div className="flex items-start gap-3">
                  <div className="relative">
                    <div className="h-12 w-12 overflow-hidden rounded-full bg-slate-200">
                      {item.otherUser?.profilePic ? (
                        <img
                          src={item.otherUser.profilePic}
                          alt={item.otherUser?.name || 'User'}
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                    {item.isOnline ? (
                      <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
                    ) : null}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="truncate text-sm font-black text-slate-900">
                        {item.otherUser?.name || 'User'}
                      </h2>
                      <span className="shrink-0 text-xs text-slate-500">{item.timeLabel}</span>
                    </div>
                    <p className="mt-1 truncate text-sm text-slate-600">{item.lastMessage}</p>
                    <p className="mt-1 truncate text-xs text-slate-400">
                      {item.from} to {item.to}
                    </p>
                    {item.chatKind === 'inquiry' ? (
                      <p className="mt-1 text-[11px] font-semibold text-amber-600">
                        Inquiry chat
                      </p>
                    ) : null}
                    <p className="mt-1 text-[11px] font-semibold text-slate-400">
                      {item.isOnline ? 'online' : formatLastSeen(item.lastSeen) || 'offline'}
                    </p>
                  </div>

                  {item.unreadCount > 0 ? (
                    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-emerald-600 px-2 text-xs font-black text-white">
                      {item.unreadCount}
                    </span>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatList;
