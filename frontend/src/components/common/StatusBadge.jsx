const getLastSeenText = (value) => {
  if (!value) return 'Offline';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 'Offline';
  const diff = Math.max(0, Date.now() - time);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Last seen just now';
  if (mins < 60) return `Last seen ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Last seen ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Last seen ${days}d ago`;
};

const StatusBadge = ({ isOnline = false, lastSeenAt = '', className = '' }) => {
  const label = isOnline ? 'Online' : getLastSeenText(lastSeenAt);
  const tone = isOnline
    ? 'bg-emerald-100 text-emerald-700'
    : 'bg-slate-100 text-slate-500';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-slate-400'}`} />
      {label}
    </span>
  );
};

export default StatusBadge;
