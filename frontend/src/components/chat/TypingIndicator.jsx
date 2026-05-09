const TypingIndicator = ({ names = [] }) => {
  const label = names.length > 1 ? 'people are typing...' : 'is typing...';

  return (
    <div className="px-4 pb-2">
      <div className="inline-flex items-center gap-2 rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">
        <span>{names.length ? `${names.join(', ')} ${label}` : 'Typing...'}</span>
        <span className="inline-flex gap-1">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-600 [animation-delay:-0.2s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-600 [animation-delay:-0.1s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-600" />
        </span>
      </div>
    </div>
  );
};

export default TypingIndicator;
