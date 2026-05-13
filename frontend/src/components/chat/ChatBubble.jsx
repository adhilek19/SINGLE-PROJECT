import { memo, useMemo, useState } from 'react';
import { AlertCircle, Check, CheckCheck, Clock3, SmilePlus } from 'lucide-react';

const QUICK_REACTION_EMOJIS = [
  '\u{1F44D}',
  '\u{2764}\u{FE0F}',
  '\u{1F602}',
  '\u{1F525}',
  '\u{1F64F}',
  '\u{1F62E}',
];

const EMPTY_REACTIONS = [];

const toId = (value) =>
  (value && typeof value === 'object' ? value._id : value)?.toString?.() || '';

const formatTime = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDuration = (seconds = 0) => {
  const safeSeconds = Math.max(0, Math.round(Number(seconds || 0)));
  const mins = String(Math.floor(safeSeconds / 60)).padStart(2, '0');
  const secs = String(safeSeconds % 60).padStart(2, '0');
  return `${mins}:${secs}`;
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

  if (message.type === 'voice') {
    const waveform = Array.isArray(message.waveform) ? message.waveform : [];
    return (
      <div className="w-full space-y-2">
        {waveform.length ? (
          <div className="flex items-end gap-0.5 rounded-lg bg-black/10 px-2 py-1">
            {waveform.map((value, index) => (
              <span
                key={`${index}-${value}`}
                className={`w-1 rounded-full ${isOwn ? 'bg-emerald-200/90' : 'bg-emerald-500/80'}`}
                style={{ height: `${Math.max(3, Math.min(20, Number(value || 0) / 5))}px` }}
              />
            ))}
          </div>
        ) : null}
        <audio src={message.url} controls className="w-full" />
        <p className={`text-xs font-semibold ${tintClass}`}>
          Voice note {Number(message.duration || 0) > 0 ? `| ${formatDuration(message.duration)}` : ''}
        </p>
      </div>
    );
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
        {message.mimeType || 'file'} | {toPrettySize(message.fileSize)}
      </p>
    </a>
  );
};

const ChatBubble = ({
  message,
  isOwn,
  otherUserId,
  currentUserId,
  onDelete,
  onRetry,
  onReact,
}) => {
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const seenBy = Array.isArray(message?.seenBy) ? message.seenBy : [];
  const deliveredTo = Array.isArray(message?.deliveredTo) ? message.deliveredTo : [];
  const reactions = Array.isArray(message?.reactions)
    ? message.reactions
    : EMPTY_REACTIONS;
  const localStatus = String(message?.localStatus || 'sent');

  const isSeenByOther = Boolean(
    otherUserId && seenBy.some((entry) => toId(entry) === String(otherUserId))
  );
  const isDeliveredToOther = Boolean(
    otherUserId &&
      deliveredTo.some((entry) => toId(entry) === String(otherUserId))
  );

  const myReaction = reactions.find(
    (entry) => toId(entry?.user) === String(currentUserId || '')
  );

  const reactionSummary = useMemo(() => {
    const bucket = new Map();
    reactions.forEach((entry) => {
      const emoji = String(entry?.emoji || '').trim();
      if (!emoji) return;
      bucket.set(emoji, (bucket.get(emoji) || 0) + 1);
    });
    return Array.from(bucket.entries()).map(([emoji, count]) => ({ emoji, count }));
  }, [reactions]);

  const statusNode = () => {
    if (!isOwn) return null;

    if (localStatus === 'sending') {
      return <Clock3 className="h-3.5 w-3.5 text-emerald-100" title="Sending" />;
    }

    if (localStatus === 'failed') {
      return <AlertCircle className="h-3.5 w-3.5 text-rose-200" title="Failed" />;
    }

    if (isSeenByOther) {
      return <CheckCheck className="h-3.5 w-3.5 text-blue-200" title="Seen" />;
    }

    if (isDeliveredToOther) {
      return <CheckCheck className="h-3.5 w-3.5 text-emerald-100" title="Delivered" />;
    }

    return <Check className="h-3.5 w-3.5 text-emerald-100" title="Sent" />;
  };

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[85%] md:max-w-[75%]">
        <div
          className={`rounded-2xl px-3 py-2 shadow-sm ${
            isOwn
              ? 'bg-emerald-500 text-white rounded-br-sm'
              : 'bg-white text-slate-900 border border-slate-200 rounded-bl-sm'
          }`}
        >
          {message?.isDeleted ? (
            <p className="text-sm italic opacity-80">This message was deleted</p>
          ) : message?.type === 'text' ? (
            <p className="break-words text-sm leading-relaxed whitespace-pre-wrap">
              {message?.text}
            </p>
          ) : (
            <MediaContent message={message} isOwn={isOwn} />
          )}

          <div className="mt-1 flex min-h-4 items-center justify-end gap-2 text-[11px]">
            <span className={isOwn ? 'text-emerald-100' : 'text-slate-500'}>
              {formatTime(message?.createdAt)}
            </span>
            {statusNode()}
            {isOwn && localStatus === 'failed' ? (
              <button
                type="button"
                onClick={() => onRetry?.(message)}
                className="text-[10px] font-semibold uppercase tracking-wide text-rose-100 hover:text-white"
              >
                Retry
              </button>
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

        {!message?.isDeleted ? (
          <div className={`mt-1 flex items-center gap-2 ${isOwn ? 'justify-end' : 'justify-start'}`}>
            {reactionSummary.length ? (
              <div className="inline-flex flex-wrap items-center gap-1 rounded-full bg-white px-2 py-1 text-xs shadow-sm ring-1 ring-slate-200">
                {reactionSummary.map((entry) => (
                  <span key={entry.emoji} className="font-semibold text-slate-700">
                    {entry.emoji} {entry.count > 1 ? entry.count : ''}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="relative">
              <button
                type="button"
                onClick={() => setReactionPickerOpen((prev) => !prev)}
                className="h-6 w-6 rounded-full bg-white/80 p-1 text-slate-500 ring-1 ring-slate-200 hover:bg-white"
                title="React"
              >
                <SmilePlus className="h-3.5 w-3.5" />
              </button>
              {reactionPickerOpen ? (
                <div className="absolute z-20 mt-1 flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                  {QUICK_REACTION_EMOJIS.map((emoji) => {
                    const active = myReaction?.emoji === emoji;
                    return (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => {
                          setReactionPickerOpen(false);
                          onReact?.(message, active ? '' : emoji);
                        }}
                        className={`rounded-md px-1.5 py-1 text-sm ${active ? 'bg-emerald-100' : 'hover:bg-slate-100'}`}
                      >
                        {emoji}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default memo(ChatBubble);

