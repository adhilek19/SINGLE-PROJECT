import { User } from 'lucide-react';
import { getDefaultAvatarByKey } from '../../constants/avatars';

const sizeClassMap = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-base',
  xl: 'h-20 w-20 text-xl',
};

const getInitials = (name = '') => {
  const safe = String(name || '').trim();
  if (!safe) return 'U';
  const parts = safe.split(/\s+/).filter(Boolean);
  if (!parts.length) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

export const getUserAvatarUrl = (user) => {
  if (!user) return '';
  const uploaded = String(user?.profileImage?.url || '').trim();
  if (uploaded) return uploaded;
  const selected = getDefaultAvatarByKey(user?.selectedAvatar)?.url || '';
  if (selected) return selected;
  return String(user?.profilePic || user?.avatar || '').trim();
};

const UserAvatar = ({
  user,
  size = 'md',
  showOnline = null,
  className = '',
}) => {
  const avatarUrl = getUserAvatarUrl(user);
  const label = String(user?.name || user?.email || 'User');
  const initials = getInitials(label);
  const sizeClass = sizeClassMap[size] || sizeClassMap.md;

  return (
    <div className={`relative shrink-0 ${className}`}>
      <div
        className={`${sizeClass} overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-slate-700 shadow-sm`}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt={label} className="h-full w-full object-cover" />
        ) : label ? (
          <div className="flex h-full w-full items-center justify-center font-black uppercase">
            {initials}
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <User className="h-4 w-4" />
          </div>
        )}
      </div>
      {typeof showOnline === 'boolean' ? (
        <span
          className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white ${
            showOnline ? 'bg-emerald-500' : 'bg-slate-300'
          }`}
        />
      ) : null}
    </div>
  );
};

export default UserAvatar;
