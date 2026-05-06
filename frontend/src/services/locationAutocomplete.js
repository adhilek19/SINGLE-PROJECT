const GEOAPIFY_BASE_URL = 'https://api.geoapify.com/v1/geocode/autocomplete';

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
  if (!apiKey) return [];

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
