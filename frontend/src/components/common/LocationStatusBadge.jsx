const formatUpdated = (value) => {
  if (!value) return '';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return '';
  return new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const LocationStatusBadge = ({ isActive = false, updatedAt = '', className = '' }) => {
  if (!isActive) {
    return (
      <span
        className={`inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 ${className}`}
      >
        Live location off
      </span>
    );
  }

  const updated = formatUpdated(updatedAt);
  return (
    <span
      className={`inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700 ${className}`}
    >
      Live location on{updated ? ` · ${updated}` : ''}
    </span>
  );
};

export default LocationStatusBadge;
