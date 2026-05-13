import { DEFAULT_AVATARS } from '../constants/avatars';

const AvatarPicker = ({ value = '', onChange, disabled = false }) => {
  return (
    <div>
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
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default AvatarPicker;
