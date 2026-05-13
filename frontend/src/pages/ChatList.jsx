import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useDispatch, useSelector } from 'react-redux';
import { getMyChats } from '../redux/slices/chatSlice';
import UserAvatar from '../components/common/UserAvatar';
import StatusBadge from '../components/common/StatusBadge';
import EmptyState from '../components/common/EmptyState';
import Skeleton from '../components/common/Skeleton';

const toId = (value) =>
  (value && typeof value === 'object' ? value._id : value)?.toString?.() || '';

const formatTime = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
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
  if (message.type === 'voice') return 'Voice note';
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
  const token = useSelector((state) => state.auth.token);
  const isHydrated = useSelector((state) => state.auth.isHydrated);
  const isInitializing = useSelector((state) => state.auth.isInitializing);
  const onlineUsers = useSelector((state) => state.chat.onlineUsers);
  const lastSeenByUser = useSelector((state) => state.chat.lastSeenByUser);

  const currentUserId = toId(user?._id || user?.id);

  useEffect(() => {
    if (!isHydrated || isInitializing || !token) return;
    if (chatsStatus === 'idle') {
      dispatch(getMyChats());
    }
  }, [dispatch, chatsStatus, isHydrated, isInitializing, token]);

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
            <Skeleton key={index} className="h-24" />
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
    <div className="flex-grow bg-slate-50 px-3 py-4 md:px-6 md:py-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h1 className="text-xl font-black text-slate-900">Chats</h1>
          <p className="text-sm text-slate-500">Driver and passenger conversations</p>
        </div>

        {!chatItems.length ? (
          <EmptyState
            title="No chats yet"
            description="Open a ride and use Message Driver or Message Passenger."
          />
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
                  <UserAvatar user={item.otherUser} size="md" showOnline={item.isOnline} />

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="truncate text-sm font-black text-slate-900">
                        {item.otherUser?.name || 'User'}
                      </h2>
                      <span className="shrink-0 text-xs text-slate-500">{item.timeLabel}</span>
                    </div>

                    <p className="truncate text-sm text-slate-600">{item.lastMessage}</p>
                    <p className="truncate text-xs text-slate-400">
                      {item.from} to {item.to}
                    </p>

                    <div className="flex items-center gap-2">
                      <StatusBadge isOnline={item.isOnline} lastSeenAt={item.lastSeen} />
                      {item.chatKind === 'inquiry' ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                          Inquiry
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="min-h-10 w-9 text-right">
                    {item.unreadCount > 0 ? (
                      <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-emerald-600 px-2 text-xs font-black text-white">
                        {item.unreadCount}
                      </span>
                    ) : null}
                  </div>
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
