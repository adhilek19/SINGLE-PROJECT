const toId = (value) =>
  (value && typeof value === 'object' ? value._id : value)?.toString?.() || '';

const formatTime = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const toPrettySize = (size = 0) => {
  const bytes = Number(size || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const MediaContent = ({ message, isOwn }) => {
  const tintClass = isOwn ? 'text-emerald-100' : 'text-slate-500';

  if (!message?.url) {
    return <p className="text-sm italic opacity-80">Media unavailable</p>;
  }

  if (message.type === 'image') {
    return (
      <a href={message.url} target="_blank" rel="noreferrer" className="block">
        <img
          src={message.url}
          alt={message.fileName || 'Image'}
          className="max-h-64 w-full rounded-xl object-cover"
        />
      </a>
    );
  }

  if (message.type === 'video') {
    return (
      <video
        src={message.url}
        controls
        className="max-h-72 w-full rounded-xl bg-black"
      />
    );
  }

  if (message.type === 'audio') {
    return <audio src={message.url} controls className="w-full" />;
  }

  return (
    <a
      href={message.url}
      target="_blank"
      rel="noreferrer"
      className={`block rounded-xl border px-3 py-2 ${isOwn ? 'border-emerald-300 bg-emerald-600' : 'border-slate-300 bg-slate-50'}`}
    >
      <p className="truncate text-sm font-semibold">
        {message.fileName || 'Document'}
      </p>
      <p className={`text-xs ${tintClass}`}>
        {message.mimeType || 'file'} • {toPrettySize(message.fileSize)}
      </p>
    </a>
  );
};

const ChatBubble = ({ message, isOwn, otherUserId, onDelete }) => {
  const seenBy = Array.isArray(message?.seenBy) ? message.seenBy : [];
  const deliveredTo = Array.isArray(message?.deliveredTo) ? message.deliveredTo : [];

  const isSeenByOther = Boolean(
    otherUserId && seenBy.some((entry) => toId(entry) === String(otherUserId))
  );
  const isDeliveredToOther = Boolean(
    otherUserId &&
      deliveredTo.some((entry) => toId(entry) === String(otherUserId))
  );

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 shadow-sm ${
          isOwn
            ? 'bg-emerald-500 text-white rounded-br-sm'
            : 'bg-white text-slate-900 border border-slate-200 rounded-bl-sm'
        }`}
      >
        {message?.isDeleted ? (
          <p className="text-sm italic opacity-80">This message was deleted</p>
        ) : message?.type === 'text' ? (
          <p className="text-sm leading-relaxed">{message?.text}</p>
        ) : (
          <MediaContent message={message} isOwn={isOwn} />
        )}

        <div className="mt-1 flex items-center justify-end gap-2 text-[11px]">
          <span className={isOwn ? 'text-emerald-100' : 'text-slate-500'}>
            {formatTime(message?.createdAt)}
          </span>
          {isOwn ? (
            <span className={isSeenByOther ? 'text-blue-100' : 'text-emerald-100'}>
              {isSeenByOther ? 'Seen' : isDeliveredToOther ? 'Delivered' : 'Sent'}
            </span>
          ) : null}
          {isOwn && !message?.isDeleted ? (
            <button
              type="button"
              onClick={() => onDelete?.(message)}
              className="text-[10px] font-semibold uppercase tracking-wide text-emerald-100 hover:text-white"
            >
              Delete
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default ChatBubble;
