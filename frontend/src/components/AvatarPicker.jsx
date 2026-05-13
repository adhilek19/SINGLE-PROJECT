import { DEFAULT_AVATARS } from '../constants/avatars';

const AvatarPicker = ({ value = '', onChange, disabled = false }) => {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
        {DEFAULT_AVATARS.map((avatar) => {
          const selected = avatar.key === value;
          return (
            <button
              key={avatar.key}
              type="button"
              disabled={disabled}
              onClick={() => onChange?.(avatar.key)}
              className={`group relative overflow-hidden rounded-2xl border-2 bg-white p-1 transition ${
                selected
                  ? 'border-blue-500 ring-2 ring-blue-200'
                  : 'border-slate-200 hover:border-blue-300'
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <img
                src={avatar.url}
                alt={avatar.label}
                className="h-16 w-full rounded-xl object-cover"
              />
              <span
                className={`absolute left-2 top-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  selected
                    ? 'bg-blue-600 text-white'
                    : 'bg-white/90 text-slate-500'
                }`}
              >
                {selected ? 'Selected' : 'Choose'}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs font-semibold text-slate-500">
        Pick one default avatar if you do not want to upload a profile image.
      </p>
    </div>
  );
};

export default AvatarPicker;
