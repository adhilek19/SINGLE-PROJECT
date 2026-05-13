const EmptyState = ({
  title = 'Nothing here yet',
  description = '',
  actionLabel = '',
  onAction,
  className = '',
}) => {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm ${className}`}
    >
      <h3 className="text-lg font-black text-slate-900">{title}</h3>
      {description ? <p className="mt-2 text-sm text-slate-500">{description}</p> : null}
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
};

export default EmptyState;
