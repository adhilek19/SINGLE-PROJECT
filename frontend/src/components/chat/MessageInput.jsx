import { useEffect, useRef, useState } from 'react';
import { Paperclip, Smile, X } from 'lucide-react';
import VoiceRecorder from './VoiceRecorder';

const QUICK_EMOJIS = [
  '\u{1F600}',
  '\u{1F602}',
  '\u{1F60D}',
  '\u{1F44D}',
  '\u{1F64F}',
  '\u{1F525}',
  '\u{1F389}',
  '\u{2764}\u{FE0F}',
  '\u{1F605}',
  '\u{1F60E}',
];

const toPrettySize = (size = 0) => {
  const bytes = Number(size || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let index = 0;
  let value = bytes;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const getFileKind = (file) => {
  const mimeType = String(file?.type || '');
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'file';
};

const MessageInput = ({
  onSend,
  onSendMedia,
  onSendVoice,
  onTypingStart,
  onTypingStop,
  disabled = false,
  mediaUploading = false,
  mediaUploadProgress = 0,
}) => {
  const [value, setValue] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const typingTimerRef = useRef(null);
  const typingActiveRef = useRef(false);
  const fileInputRef = useRef(null);
  const emojiPanelRef = useRef(null);

  const clearTypingTimer = () => {
    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
  };

  const stopTyping = () => {
    clearTypingTimer();
    if (typingActiveRef.current) {
      typingActiveRef.current = false;
      onTypingStop?.();
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const text = String(value || '').trim();
    if (!text || disabled) return;

    await onSend?.(text);
    setValue('');
    stopTyping();
  };

  const handleChange = (event) => {
    const nextValue = event.target.value;
    setValue(nextValue);

    if (!nextValue.trim()) {
      stopTyping();
      return;
    }

    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      onTypingStart?.();
    }

    clearTypingTimer();
    typingTimerRef.current = window.setTimeout(() => {
      typingActiveRef.current = false;
      onTypingStop?.();
    }, 1200);
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    setPreviewUrl('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePickFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
  };

  const handleSendSelectedFile = async () => {
    if (!selectedFile || disabled || mediaUploading) return;
    try {
      await onSendMedia?.(selectedFile);
      clearSelectedFile();
    } catch {
      // keep selected file for retry on failure
    }
  };

  const handleEmojiPick = (emoji) => {
    setValue((prev) => `${prev}${emoji}`);
    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      onTypingStart?.();
    }
    clearTypingTimer();
    typingTimerRef.current = window.setTimeout(() => {
      typingActiveRef.current = false;
      onTypingStop?.();
    }, 1200);
    setEmojiOpen(false);
  };

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl('');
      return undefined;
    }

    const kind = getFileKind(selectedFile);
    if (!['image', 'video', 'audio'].includes(kind)) {
      setPreviewUrl('');
      return undefined;
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedFile]);

  useEffect(() => () => clearTypingTimer(), []);

  useEffect(() => {
    if (!emojiOpen) return undefined;

    const onDocClick = (event) => {
      if (!emojiPanelRef.current?.contains(event.target)) {
        setEmojiOpen(false);
      }
    };

    window.addEventListener('pointerdown', onDocClick);
    return () => window.removeEventListener('pointerdown', onDocClick);
  }, [emojiOpen]);

  const selectedKind = getFileKind(selectedFile);

  return (
    <div className="bg-white border-t border-slate-200">
      {selectedFile ? (
        <div className="mx-3 mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-800">{selectedFile.name}</p>
              <p className="text-xs text-slate-500">
                {selectedFile.type || 'application/octet-stream'} • {toPrettySize(selectedFile.size)}
              </p>
            </div>
            <button
              type="button"
              onClick={clearSelectedFile}
              disabled={mediaUploading}
              className="rounded-full p-1 text-slate-500 hover:bg-slate-200 disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {previewUrl && selectedKind === 'image' ? (
            <img src={previewUrl} alt="Preview" className="mb-2 max-h-52 rounded-xl object-cover" />
          ) : null}
          {previewUrl && selectedKind === 'video' ? (
            <video src={previewUrl} controls className="mb-2 max-h-52 rounded-xl" />
          ) : null}
          {previewUrl && selectedKind === 'audio' ? (
            <audio src={previewUrl} controls className="mb-2 w-full" />
          ) : null}

          {mediaUploading ? (
            <div className="mb-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${Math.max(0, Math.min(100, Number(mediaUploadProgress || 0)))}%` }}
                />
              </div>
              <p className="mt-1 text-xs font-semibold text-slate-600">
                Uploading... {Math.round(Number(mediaUploadProgress || 0))}%
              </p>
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleSendSelectedFile}
            disabled={disabled || mediaUploading}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            Send Media
          </button>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="flex items-end gap-2 p-3">
        <input
          ref={fileInputRef}
          type="file"
          onChange={handlePickFile}
          className="hidden"
          accept="image/*,video/*,audio/*,.pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || mediaUploading}
          className="h-11 rounded-2xl border border-slate-300 px-3 text-slate-700 disabled:opacity-50"
          title="Attach media"
        >
          <Paperclip className="h-5 w-5" />
        </button>
        <div className="relative" ref={emojiPanelRef}>
          <button
            type="button"
            onClick={() => setEmojiOpen((prev) => !prev)}
            disabled={disabled || mediaUploading}
            className="h-11 rounded-2xl border border-slate-300 px-3 text-slate-700 disabled:opacity-50"
            title="Emoji"
          >
            <Smile className="h-5 w-5" />
          </button>
          {emojiOpen ? (
            <div className="absolute bottom-12 left-0 z-20 grid grid-cols-5 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleEmojiPick(emoji)}
                  className="h-8 w-8 rounded-lg text-lg hover:bg-slate-100"
                >
                  {emoji}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <textarea
          value={value}
          onChange={handleChange}
          onBlur={stopTyping}
          rows={1}
          placeholder="Type a message"
          disabled={disabled || mediaUploading}
          className="max-h-32 min-h-[44px] flex-1 resize-none rounded-2xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:opacity-60"
        />
        {String(value || '').trim() ? (
          <button
            type="submit"
            disabled={disabled || mediaUploading || !String(value || '').trim()}
            className="h-11 rounded-2xl bg-emerald-600 px-5 text-sm font-bold text-white disabled:opacity-50"
          >
            Send
          </button>
        ) : selectedFile ? (
          <span className="h-11 w-11" />
        ) : (
          <VoiceRecorder
            onSendVoice={onSendVoice}
            disabled={disabled}
            uploading={mediaUploading}
          />
        )}
      </form>
    </div>
  );
};

export default MessageInput;

