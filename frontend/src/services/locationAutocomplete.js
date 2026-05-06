const GEOAPIFY_BASE_URL = 'https://api.geoapify.com/v1/geocode/autocomplete';
let hasWarnedMissingApiKey = false;

const normalizeText = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const diceCoefficient = (a, b) => {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;

  const aBigrams = new Map();
  for (let i = 0; i < a.length - 1; i += 1) {
    const bg = a.slice(i, i + 2);
    aBigrams.set(bg, (aBigrams.get(bg) || 0) + 1);
  }

  let overlap = 0;
  for (let i = 0; i < b.length - 1; i += 1) {
    const bg = b.slice(i, i + 2);
    const count = aBigrams.get(bg) || 0;
    if (count > 0) {
      aBigrams.set(bg, count - 1);
      overlap += 1;
    }
  }

  return (2 * overlap) / (a.length + b.length - 2);
};

const normalizeFeature = (feature) => {
  const props = feature?.properties || {};
  const lat = Number(props.lat);
  const lng = Number(props.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const name =
    props.name ||
    props.address_line1 ||
    props.formatted ||
    '';

  const label = props.formatted || name || '';

  return {
    label,
    name: name || label,
    address: props.address_line1 || props.formatted || '',
    lat,
    lng,
    city: props.city || props.town || props.village || '',
    state: props.state || '',
    country: props.country || '',
  };
};

export const fetchGeoapifyLocations = async (query, signal) => {
  const trimmed = String(query || '').trim();
  if (trimmed.length < 3) return [];

  const apiKey = import.meta.env.VITE_GEOAPIFY_API_KEY;
  if (!apiKey) {
    if (import.meta.env.DEV && !hasWarnedMissingApiKey) {
      hasWarnedMissingApiKey = true;
      // eslint-disable-next-line no-console
      console.warn('VITE_GEOAPIFY_API_KEY is missing. Location suggestions are disabled.');
    }
    return [];
  }

  const url = `${GEOAPIFY_BASE_URL}?text=${encodeURIComponent(
    trimmed
  )}&limit=5&filter=countrycode:in&apiKey=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Autocomplete failed with status ${res.status}`);
  }

  const data = await res.json();
  const features = Array.isArray(data?.features) ? data.features : [];

  return features.map(normalizeFeature).filter(Boolean).slice(0, 5);
};

export const resolveGeoapifyBestLocation = async (query, signal) => {
  const results = await fetchGeoapifyLocations(query, signal);
  if (!results.length) return null;

  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return null;

  const best = results
    .map((item) => {
      const normalizedLabel = normalizeText(item.label || item.name || '');
      const normalizedName = normalizeText(item.name || item.label || '');
      const labelScore = diceCoefficient(normalizedQuery, normalizedLabel);
      const nameScore = diceCoefficient(normalizedQuery, normalizedName);
      const includesBoost =
        normalizedLabel.includes(normalizedQuery) || normalizedQuery.includes(normalizedName)
          ? 0.2
          : 0;
      return {
        item,
        score: Math.max(labelScore, nameScore) + includesBoost,
      };
    })
    .sort((a, b) => b.score - a.score)[0];

  if (!best || best.score < 0.48) return null;
  return best.item;
};
