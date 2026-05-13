export const DEFAULT_AVATAR_KEYS = Object.freeze([
  'avatar_1',
  'avatar_2',
  'avatar_3',
  'avatar_4',
  'avatar_5',
  'avatar_6',
  'avatar_7',
  'avatar_8',
]);

const avatarSeeds = {
  avatar_1: 'Aarav',
  avatar_2: 'Sana',
  avatar_3: 'Kabir',
  avatar_4: 'Isha',
  avatar_5: 'Dev',
  avatar_6: 'Naina',
  avatar_7: 'Ravi',
  avatar_8: 'Mira',
};

export const getDefaultAvatarUrl = (avatarKey) => {
  const safeKey = String(avatarKey || '').trim();
  if (!DEFAULT_AVATAR_KEYS.includes(safeKey)) return '';
  const seed = avatarSeeds[safeKey];
  return `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(seed)}`;
};
