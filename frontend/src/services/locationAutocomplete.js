const GEOAPIFY_AUTOCOMPLETE_URL = 'https://api.geoapify.com/v1/geocode/autocomplete';
const GEOAPIFY_SEARCH_URL = 'https://api.geoapify.com/v1/geocode/search';
const MIN_QUERY_LENGTH = 2;
let hasWarnedMissingApiKey = false;

const getGeoapifyKey = () => import.meta.env.VITE_GEOAPIFY_API_KEY;

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
    props.city ||
    props.town ||
    props.village ||
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

const fetchGeoapify = async ({ query, signal, mode = 'autocomplete' }) => {
  const trimmed = String(query || '').trim();
  if (trimmed.length < MIN_QUERY_LENGTH) return [];

  const apiKey = getGeoapifyKey();
  if (!apiKey) {
    if (import.meta.env.DEV && !hasWarnedMissingApiKey) {
      hasWarnedMissingApiKey = true;
      // eslint-disable-next-line no-console
      console.warn('VITE_GEOAPIFY_API_KEY is missing. Location suggestions are disabled.');
    }
    return [];
  }

  const baseUrl = mode === 'search' ? GEOAPIFY_SEARCH_URL : GEOAPIFY_AUTOCOMPLETE_URL;
  const url = `${baseUrl}?text=${encodeURIComponent(trimmed)}&limit=5&filter=countrycode:in&apiKey=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Geoapify ${mode} failed with status ${res.status}`);
  }

  const data = await res.json();
  const features = Array.isArray(data?.features) ? data.features : [];

  return features.map(normalizeFeature).filter(Boolean).slice(0, 5);
};

export const fetchGeoapifyLocations = async (query, signal) =>
  fetchGeoapify({ query, signal, mode: 'autocomplete' });

export const resolveGeoapifyBestLocation = async (query, signal) => {
  const autocompleteResults = await fetchGeoapify({ query, signal, mode: 'autocomplete' });
  const searchResults = autocompleteResults.length
    ? autocompleteResults
    : await fetchGeoapify({ query, signal, mode: 'search' });

  if (!searchResults.length) return null;

  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return null;

  const best = searchResults
    .map((item) => {
      const normalizedLabel = normalizeText(item.label || item.name || '');
      const normalizedName = normalizeText(item.name || item.label || '');
      const normalizedCity = normalizeText(item.city || '');
      const labelScore = diceCoefficient(normalizedQuery, normalizedLabel);
      const nameScore = diceCoefficient(normalizedQuery, normalizedName);
      const cityScore = diceCoefficient(normalizedQuery, normalizedCity);
      const includesBoost =
        normalizedLabel.includes(normalizedQuery) ||
        normalizedName.includes(normalizedQuery) ||
        normalizedCity.includes(normalizedQuery)
          ? 0.25
          : 0;
      return {
        item,
        score: Math.max(labelScore, nameScore, cityScore) + includesBoost,
      };
    })
    .sort((a, b) => b.score - a.score)[0];

  if (!best || best.score < 0.42) return searchResults[0];
  return best.item;
};
