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

export const DEFAULT_AVATARS = Object.keys(avatarSeeds).map((key) => ({
  key,
  label: key.replace('_', ' ').toUpperCase(),
  url: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(avatarSeeds[key])}`,
}));

export const getDefaultAvatarByKey = (key) =>
  DEFAULT_AVATARS.find((avatar) => avatar.key === String(key || '').trim()) || null;
