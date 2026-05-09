import { createAsyncThunk, createSelector, createSlice } from '@reduxjs/toolkit';
import { chatService } from '../../services/api';

const toId = (value) =>
  (value && typeof value === 'object' ? value._id : value)?.toString?.() || '';

const messageTimeValue = (message) =>
  new Date(message?.createdAt || message?.updatedAt || 0).getTime() || 0;

const chatTimeValue = (chat) =>
  new Date(chat?.lastMessageAt || chat?.updatedAt || chat?.createdAt || 0).getTime() || 0;

const getClientMessageId = (message) => String(message?.clientMessageId || '').trim();

const normalizeUnreadCounts = (unreadCounts) => {
  if (!unreadCounts) return {};
  if (unreadCounts instanceof Map) {
    return Object.fromEntries(unreadCounts.entries());
  }
  return { ...unreadCounts };
};

const normalizeChat = (chat) => {
  if (!chat) return chat;
  return {
    ...chat,
    unreadCounts: normalizeUnreadCounts(chat.unreadCounts),
    unreadCount: Number(chat.unreadCount || 0),
  };
};

const mergeChatList = (chats = [], incomingChat) => {
  const normalized = normalizeChat(incomingChat);
  const incomingId = toId(normalized?._id);
  if (!incomingId) return chats;

  const filtered = chats.filter((chat) => toId(chat?._id) !== incomingId);
  return [normalized, ...filtered].sort((a, b) => chatTimeValue(b) - chatTimeValue(a));
};

const mergeMessages = (currentMessages = [], incomingMessages = []) => {
  const byId = new Map();

  currentMessages.forEach((message) => {
    const id = toId(message?._id);
    if (!id) return;
    byId.set(id, message);
  });

  incomingMessages.forEach((incomingRaw) => {
    const incoming = incomingRaw ? { ...incomingRaw } : null;
    const incomingId = toId(incoming?._id);
    if (!incoming || !incomingId) return;

    const incomingClientId = getClientMessageId(incoming);
    if (incomingClientId) {
      Array.from(byId.entries()).forEach(([id, existing]) => {
        const existingClientId = getClientMessageId(existing);
        if (
          existingClientId &&
          existingClientId === incomingClientId &&
          id !== incomingId
        ) {
          byId.delete(id);
        }
      });
    }

    const existing = byId.get(incomingId);
    byId.set(incomingId, {
      ...(existing || {}),
      ...incoming,
      localStatus:
        incoming.localStatus ||
        (incomingId.startsWith('temp:') ? existing?.localStatus || 'sending' : 'sent'),
      localError: incoming.localError || null,
    });
  });

  return Array.from(byId.values()).sort((a, b) => messageTimeValue(a) - messageTimeValue(b));
};

const markIdInArray = (arrayValue = [], targetId) => {
  const target = String(targetId || '');
  if (!target) return arrayValue;
  const list = Array.isArray(arrayValue) ? [...arrayValue] : [];
  const hasValue = list.some((entry) => toId(entry) === target);
  if (!hasValue) list.push(target);
  return list;
};

const applyMessagePatch = (messages = [], messagePatch) => {
  const patchId = toId(messagePatch?._id);
  if (!patchId) return messages;

  return messages.map((message) => {
    if (toId(message?._id) !== patchId) return message;
    return {
      ...message,
      ...messagePatch,
      localStatus: messagePatch?.localStatus || message.localStatus || 'sent',
      localError: messagePatch?.localError || null,
    };
  });
};

const patchOptimisticByClientId = (messages = [], clientMessageId, patch = {}) => {
  const target = String(clientMessageId || '').trim();
  if (!target) return messages;

  return messages.map((message) => {
    if (getClientMessageId(message) !== target) return message;
    return { ...message, ...patch };
  });
};

const applyReactionPatch = (messages = [], messageId, userId, emoji) => {
  const safeMessageId = toId(messageId);
  const safeUserId = toId(userId);
  if (!safeMessageId || !safeUserId) return messages;

  return messages.map((message) => {
    if (toId(message?._id) !== safeMessageId) return message;

    const nextReactions = Array.isArray(message.reactions) ? [...message.reactions] : [];
    const index = nextReactions.findIndex(
      (entry) => toId(entry?.user) === safeUserId
    );

    if (!String(emoji || '').trim()) {
      if (index >= 0) nextReactions.splice(index, 1);
    } else if (index >= 0) {
      nextReactions[index] = {
        ...nextReactions[index],
        emoji: String(emoji).trim(),
        createdAt: new Date().toISOString(),
      };
    } else {
      nextReactions.push({
        user: safeUserId,
        emoji: String(emoji).trim(),
        createdAt: new Date().toISOString(),
      });
    }

    return {
      ...message,
      reactions: nextReactions,
    };
  });
};

const initialState = {
  chats: [],
  chatsStatus: 'idle',
  chatsError: null,
  messagesByChat: {},
  messagesStatusByChat: {},
  messagesErrorByChat: {},
  sendStatusByChat: {},
  sendErrorByChat: {},
  activeChatId: null,
  typingByChat: {},
  onlineUsers: {},
  lastSeenByUser: {},
};

export const getMyChats = createAsyncThunk(
  'chat/getMyChats',
  async (_, { rejectWithValue }) => {
    try {
      const response = await chatService.getMyChats();
      return response.data?.data?.chats || [];
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch chats');
    }
  }
);

export const createOrGetChat = createAsyncThunk(
  'chat/createOrGetChat',
  async ({ rideId, userId }, { rejectWithValue }) => {
    try {
      const response = await chatService.createOrGetRideChat(rideId, userId);
      return response.data?.data?.chat || null;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to open chat');
    }
  }
);

export const getMessages = createAsyncThunk(
  'chat/getMessages',
  async ({ chatId, page = 1, limit = 50 } = {}, { rejectWithValue }) => {
    try {
      const response = await chatService.getChatMessages(chatId, { page, limit });
      return {
        chatId,
        ...response.data?.data,
      };
    } catch (err) {
      return rejectWithValue({
        chatId,
        message: err.response?.data?.message || 'Failed to fetch messages',
      });
    }
  }
);

export const sendMessage = createAsyncThunk(
  'chat/sendMessage',
  async ({ chatId, text, clientMessageId = '' }, { rejectWithValue }) => {
    try {
      const response = await chatService.sendMessage({ chatId, text, clientMessageId });
      return {
        chatId,
        clientMessageId,
        message: response.data?.data?.message || null,
      };
    } catch (err) {
      return rejectWithValue({
        chatId,
        clientMessageId,
        message: err.response?.data?.message || 'Failed to send message',
      });
    }
  }
);

export const sendMediaMessage = createAsyncThunk(
  'chat/sendMediaMessage',
  async ({ chatId, file, onUploadProgress, clientMessageId = '' }, { rejectWithValue }) => {
    try {
      const response = await chatService.sendMediaMessage({
        chatId,
        file,
        onUploadProgress,
        clientMessageId,
      });
      return {
        chatId,
        clientMessageId,
        message: response.data?.data?.message || null,
      };
    } catch (err) {
      return rejectWithValue({
        chatId,
        clientMessageId,
        message: err.response?.data?.message || 'Failed to send media',
      });
    }
  }
);

export const markMessageSeen = createAsyncThunk(
  'chat/markMessageSeen',
  async ({ messageId }, { rejectWithValue }) => {
    try {
      const response = await chatService.markMessageSeen(messageId);
      return response.data?.data?.message || null;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to mark message as seen');
    }
  }
);

export const setMessageReaction = createAsyncThunk(
  'chat/setMessageReaction',
  async ({ messageId, emoji }, { rejectWithValue }) => {
    try {
      const response = await chatService.setMessageReaction(messageId, emoji);
      return response.data?.data?.message || null;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to update reaction');
    }
  }
);

export const deleteMessage = createAsyncThunk(
  'chat/deleteMessage',
  async ({ messageId }, { rejectWithValue }) => {
    try {
      const response = await chatService.deleteMessage(messageId);
      return response.data?.data?.message || null;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to delete message');
    }
  }
);

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    setActiveChatId(state, action) {
      state.activeChatId = action.payload || null;
    },

    clearTypingForChat(state, action) {
      const chatId = toId(action.payload);
      if (!chatId) return;
      delete state.typingByChat[chatId];
    },

    addOptimisticMessage(state, action) {
      const { chatId, message } = action.payload || {};
      const safeChatId = toId(chatId || message?.chat);
      if (!safeChatId || !message) return;

      state.messagesByChat[safeChatId] = mergeMessages(
        state.messagesByChat[safeChatId] || [],
        [{ ...message, localStatus: message.localStatus || 'sending' }]
      );

      const chat = state.chats.find((entry) => toId(entry?._id) === safeChatId);
      if (chat) {
        chat.lastMessage = message;
        chat.lastMessageAt = message.createdAt || new Date().toISOString();
      }

      state.chats = [...state.chats].sort((a, b) => chatTimeValue(b) - chatTimeValue(a));
    },

    setOptimisticMessageStatus(state, action) {
      const { chatId, clientMessageId, status, error = null } = action.payload || {};
      const safeChatId = toId(chatId);
      const safeClientId = String(clientMessageId || '').trim();
      if (!safeChatId || !safeClientId) return;

      state.messagesByChat[safeChatId] = patchOptimisticByClientId(
        state.messagesByChat[safeChatId] || [],
        safeClientId,
        {
          localStatus: status || 'failed',
          localError: error,
        }
      );
    },

    socketMessageReceived(state, action) {
      const { chatId, message, currentUserId } = action.payload || {};
      const safeChatId = toId(chatId || message?.chat);
      if (!safeChatId || !message) return;

      state.messagesByChat[safeChatId] = mergeMessages(
        state.messagesByChat[safeChatId] || [],
        [{ ...message, localStatus: 'sent', localError: null }]
      );

      const chat = state.chats.find((entry) => toId(entry?._id) === safeChatId);
      const senderId = toId(message.sender);
      const receiverId = toId(message.receiver);
      const currentUser = String(currentUserId || '');

      if (chat) {
        chat.lastMessage = message;
        chat.lastMessageAt = message.createdAt || message.updatedAt || new Date().toISOString();

        if (currentUser && senderId && senderId !== currentUser && receiverId === currentUser) {
          const isActive = state.activeChatId === safeChatId;
          if (!isActive) {
            chat.unreadCount = Number(chat.unreadCount || 0) + 1;
          }
        }
      }

      if (state.typingByChat[safeChatId] && senderId) {
        delete state.typingByChat[safeChatId][senderId];
      }

      state.chats = [...state.chats].sort((a, b) => chatTimeValue(b) - chatTimeValue(a));
    },

    socketMessageSeen(state, action) {
      const { chatId, messageId, userId } = action.payload || {};
      const safeChatId = toId(chatId);
      const safeMessageId = toId(messageId);
      if (!safeChatId || !safeMessageId || !userId) return;

      const existing = state.messagesByChat[safeChatId] || [];
      state.messagesByChat[safeChatId] = existing.map((message) => {
        if (toId(message._id) !== safeMessageId) return message;
        return {
          ...message,
          seenBy: markIdInArray(message.seenBy, userId),
          deliveredTo: markIdInArray(message.deliveredTo, userId),
          localStatus: message.localStatus === 'failed' ? 'failed' : 'sent',
        };
      });
    },

    socketMessageDelivered(state, action) {
      const { chatId, messageId, userId } = action.payload || {};
      const safeChatId = toId(chatId);
      const safeMessageId = toId(messageId);
      if (!safeChatId || !safeMessageId || !userId) return;

      const existing = state.messagesByChat[safeChatId] || [];
      state.messagesByChat[safeChatId] = existing.map((message) => {
        if (toId(message._id) !== safeMessageId) return message;
        return {
          ...message,
          deliveredTo: markIdInArray(message.deliveredTo, userId),
          localStatus: message.localStatus === 'failed' ? 'failed' : 'sent',
        };
      });
    },

    socketMessageReaction(state, action) {
      const { chatId, message, messageId, userId, emoji } = action.payload || {};
      const safeChatId = toId(chatId || message?.chat);
      if (!safeChatId) return;

      if (message) {
        state.messagesByChat[safeChatId] = applyMessagePatch(
          state.messagesByChat[safeChatId] || [],
          message
        );
        return;
      }

      state.messagesByChat[safeChatId] = applyReactionPatch(
        state.messagesByChat[safeChatId] || [],
        messageId,
        userId,
        emoji
      );
    },

    socketTyping(state, action) {
      const { chatId, userId, name } = action.payload || {};
      const safeChatId = toId(chatId);
      const safeUserId = toId(userId);
      if (!safeChatId || !safeUserId) return;

      state.typingByChat[safeChatId] = state.typingByChat[safeChatId] || {};
      state.typingByChat[safeChatId][safeUserId] = name || 'Typing...';
    },

    socketStopTyping(state, action) {
      const { chatId, userId } = action.payload || {};
      const safeChatId = toId(chatId);
      const safeUserId = toId(userId);
      if (!safeChatId || !safeUserId) return;

      if (state.typingByChat[safeChatId]) {
        delete state.typingByChat[safeChatId][safeUserId];
      }
    },

    socketOnlineUsers(state, action) {
      const ids = Array.isArray(action.payload?.userIds) ? action.payload.userIds : [];
      const incomingLastSeen = action.payload?.lastSeenByUser || {};

      state.onlineUsers = {};
      ids.forEach((id) => {
        const safeId = toId(id);
        if (safeId) {
          state.onlineUsers[safeId] = true;
        }
      });

      state.lastSeenByUser = {
        ...state.lastSeenByUser,
        ...incomingLastSeen,
      };
    },

    socketUserOnline(state, action) {
      const safeUserId = toId(action.payload?.userId);
      if (!safeUserId) return;
      state.onlineUsers[safeUserId] = true;
      delete state.lastSeenByUser[safeUserId];
    },

    socketUserOffline(state, action) {
      const safeUserId = toId(action.payload?.userId);
      if (!safeUserId) return;
      state.onlineUsers[safeUserId] = false;
      const lastSeenAt = action.payload?.lastSeenAt || action.payload?.at;
      if (lastSeenAt) {
        state.lastSeenByUser[safeUserId] = lastSeenAt;
      }

      Object.keys(state.typingByChat).forEach((chatId) => {
        if (state.typingByChat[chatId]?.[safeUserId]) {
          delete state.typingByChat[chatId][safeUserId];
        }
      });
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(getMyChats.pending, (state) => {
        state.chatsStatus = 'loading';
        state.chatsError = null;
      })
      .addCase(getMyChats.fulfilled, (state, action) => {
        state.chatsStatus = 'succeeded';
        state.chats = (action.payload || [])
          .map((chat) => normalizeChat(chat))
          .sort((a, b) => chatTimeValue(b) - chatTimeValue(a));
      })
      .addCase(getMyChats.rejected, (state, action) => {
        state.chatsStatus = 'failed';
        state.chatsError = action.payload || 'Failed to fetch chats';
      })
      .addCase(createOrGetChat.fulfilled, (state, action) => {
        if (!action.payload) return;
        state.chats = mergeChatList(state.chats, action.payload);
      })
      .addCase(getMessages.pending, (state, action) => {
        const chatId = toId(action.meta.arg?.chatId);
        if (!chatId) return;
        state.messagesStatusByChat[chatId] = 'loading';
        state.messagesErrorByChat[chatId] = null;
      })
      .addCase(getMessages.fulfilled, (state, action) => {
        const chatId = toId(action.payload?.chatId);
        if (!chatId) return;
        state.messagesStatusByChat[chatId] = 'succeeded';
        state.messagesByChat[chatId] = mergeMessages(
          state.messagesByChat[chatId] || [],
          action.payload?.messages || []
        );
      })
      .addCase(getMessages.rejected, (state, action) => {
        const chatId = toId(action.payload?.chatId || action.meta.arg?.chatId);
        if (!chatId) return;
        state.messagesStatusByChat[chatId] = 'failed';
        state.messagesErrorByChat[chatId] =
          action.payload?.message || 'Failed to fetch messages';
      })
      .addCase(sendMessage.pending, (state, action) => {
        const chatId = toId(action.meta.arg?.chatId);
        if (!chatId) return;
        state.sendStatusByChat[chatId] = 'loading';
        state.sendErrorByChat[chatId] = null;
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        const chatId = toId(action.payload?.chatId);
        const message = action.payload?.message;
        if (!chatId || !message) return;

        state.sendStatusByChat[chatId] = 'succeeded';
        state.messagesByChat[chatId] = mergeMessages(
          state.messagesByChat[chatId] || [],
          [{ ...message, localStatus: 'sent', localError: null }]
        );

        const chat = state.chats.find((entry) => toId(entry._id) === chatId);
        if (chat) {
          chat.lastMessage = message;
          chat.lastMessageAt = message.createdAt || message.updatedAt || new Date().toISOString();
        }
        state.chats = [...state.chats].sort((a, b) => chatTimeValue(b) - chatTimeValue(a));
      })
      .addCase(sendMessage.rejected, (state, action) => {
        const chatId = toId(action.payload?.chatId || action.meta.arg?.chatId);
        if (!chatId) return;

        state.sendStatusByChat[chatId] = 'failed';
        state.sendErrorByChat[chatId] =
          action.payload?.message || 'Failed to send message';

        const clientMessageId = String(
          action.payload?.clientMessageId || action.meta.arg?.clientMessageId || ''
        ).trim();
        if (clientMessageId) {
          state.messagesByChat[chatId] = patchOptimisticByClientId(
            state.messagesByChat[chatId] || [],
            clientMessageId,
            {
              localStatus: 'failed',
              localError: state.sendErrorByChat[chatId],
            }
          );
        }
      })
      .addCase(sendMediaMessage.pending, (state, action) => {
        const chatId = toId(action.meta.arg?.chatId);
        if (!chatId) return;
        state.sendStatusByChat[chatId] = 'loading';
        state.sendErrorByChat[chatId] = null;
      })
      .addCase(sendMediaMessage.fulfilled, (state, action) => {
        const chatId = toId(action.payload?.chatId);
        const message = action.payload?.message;
        if (!chatId || !message) return;

        state.sendStatusByChat[chatId] = 'succeeded';
        state.messagesByChat[chatId] = mergeMessages(
          state.messagesByChat[chatId] || [],
          [{ ...message, localStatus: 'sent', localError: null }]
        );

        const chat = state.chats.find((entry) => toId(entry._id) === chatId);
        if (chat) {
          chat.lastMessage = message;
          chat.lastMessageAt = message.createdAt || message.updatedAt || new Date().toISOString();
        }
        state.chats = [...state.chats].sort((a, b) => chatTimeValue(b) - chatTimeValue(a));
      })
      .addCase(sendMediaMessage.rejected, (state, action) => {
        const chatId = toId(action.payload?.chatId || action.meta.arg?.chatId);
        if (!chatId) return;
        state.sendStatusByChat[chatId] = 'failed';
        state.sendErrorByChat[chatId] =
          action.payload?.message || 'Failed to send media';
      })
      .addCase(markMessageSeen.fulfilled, (state, action) => {
        const message = action.payload;
        const chatId = toId(message?.chat);
        if (!chatId || !message) return;

        state.messagesByChat[chatId] = applyMessagePatch(
          state.messagesByChat[chatId] || [],
          message
        );

        const chat = state.chats.find((entry) => toId(entry._id) === chatId);
        if (chat) {
          chat.unreadCount = 0;
        }
      })
      .addCase(setMessageReaction.fulfilled, (state, action) => {
        const message = action.payload;
        const chatId = toId(message?.chat);
        if (!chatId || !message) return;

        state.messagesByChat[chatId] = applyMessagePatch(
          state.messagesByChat[chatId] || [],
          message
        );
      })
      .addCase(deleteMessage.fulfilled, (state, action) => {
        const message = action.payload;
        const chatId = toId(message?.chat);
        if (!chatId || !message) return;

        state.messagesByChat[chatId] = applyMessagePatch(
          state.messagesByChat[chatId] || [],
          message
        );

        const chat = state.chats.find((entry) => toId(entry._id) === chatId);
        if (chat && toId(chat.lastMessage?._id) === toId(message._id)) {
          chat.lastMessage = message;
        }
      });
  },
});

export const {
  setActiveChatId,
  clearTypingForChat,
  addOptimisticMessage,
  setOptimisticMessageStatus,
  socketMessageReceived,
  socketMessageSeen,
  socketMessageDelivered,
  socketMessageReaction,
  socketTyping,
  socketStopTyping,
  socketOnlineUsers,
  socketUserOnline,
  socketUserOffline,
} = chatSlice.actions;

export const selectChatUnreadCount = createSelector(
  [(state) => state.chat.chats, (state) => toId(state.auth.user?._id || state.auth.user?.id)],
  (chats, currentUserId) =>
    (chats || []).reduce((sum, chat) => {
      if (Number.isFinite(Number(chat?.unreadCount))) {
        return sum + Number(chat.unreadCount || 0);
      }
      const unreadObj = normalizeUnreadCounts(chat?.unreadCounts);
      return sum + Number(unreadObj[currentUserId] || 0);
    }, 0)
);

export default chatSlice.reducer;
