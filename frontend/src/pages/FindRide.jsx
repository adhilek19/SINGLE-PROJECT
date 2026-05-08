import { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Car,
  IndianRupee,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Star,
  Users,
  X,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import LocationSearch from '../components/LocationSearch';
import RouteMap from '../components/RouteMap';
import { getErrorMessage, rideService } from '../services/api';
import { resolveGeoapifyBestLocation } from '../services/locationAutocomplete';

const SEARCH_HISTORY_KEY = 'rideSearchHistory';
const SEARCH_STATE_KEY = 'sahayatri_find_ride_search_v3';
const HISTORY_LIMIT = 3;
const SEARCH_WINDOW_HOURS = 6;

const DEFAULT_PREFERENCE_FILTERS = {
  womenOnly: false,
  verifiedOnly: false,
  smokingAllowed: false,
  musicAllowed: false,
  petsAllowed: false,
  acAvailable: false,
  genderPreference: '',
};

const PRICE_PRESET_TO_RANGE = {
  any: { min: '', max: '' },
  free: { min: '0', max: '0' },
  under_50: { min: '', max: '50' },
  between_50_100: { min: '50', max: '100' },
  over_100: { min: '100', max: '' },
};

const RANGE_TO_PRICE_PRESET = {
  '|': 'any',
  '0|0': 'free',
  '|50': 'under_50',
  '50|100': 'between_50_100',
  '100|': 'over_100',
};

const DEFAULT_UI_FILTERS = {
  vehicleType: '',
  seats: '',
  pricePreset: 'any',
  timeWindow: 'any',
  sortUi: 'recommended',
};

const DEFAULT_LIST_QUERY = {
  page: 1,
  limit: 30,
  sort: 'departure_time',
};

const EmptyState = ({ title, message }) => (
  <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
      <Search />
    </div>
    <h3 className="text-xl font-black text-slate-900">{title}</h3>
    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">{message}</p>
  </div>
);

const ErrorState = ({ message, onRetry }) => (
  <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center">
    <h3 className="text-xl font-black text-rose-900">Search failed</h3>
    <p className="mx-auto mt-2 max-w-md text-sm text-rose-700">{message}</p>
    <button
      type="button"
      onClick={onRetry}
      className="mt-5 inline-flex items-center gap-2 rounded-xl bg-rose-700 px-4 py-2 text-sm font-bold text-white hover:bg-rose-800"
    >
      <RefreshCw size={16} />
      Retry search
    </button>
  </div>
);

const formatDateTime = (value) => {
  if (!value) return 'Not set';
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};

const formatHistoryDateTime = (date, time) => {
  if (!date && !time) return 'Any time';
  if (date && !time) return date;
  if (!date && time) return time;
  return `${date} ${time}`;
};

const parseNumberIfValid = (value) => {
  if (value === '' || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const getSearchText = (place) => {
  if (!place) return '';
  if (typeof place === 'string') return place;
  return place.name || place.label || '';
};

const hasLocationCoords = (place) => {
  if (!place || typeof place !== 'object') return false;
  const lat = Number(place.lat);
  const lng = Number(place.lng);
  return Number.isFinite(lat) && Number.isFinite(lng);
};

const getLocationFromParams = (name, lat, lng) => {
  const trimmedName = String(name || '').trim();
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  if (!trimmedName) return null;
  if (Number.isFinite(parsedLat) && Number.isFinite(parsedLng)) {
    return { name: trimmedName, label: trimmedName, lat: parsedLat, lng: parsedLng };
  }
  return { name: trimmedName };
};

const normalizeListResponse = (res) => {
  const data = res?.data?.data;
  if (Array.isArray(data?.rides)) return data.rides;
  if (Array.isArray(data)) return data;
  return [];
};

const mapLegacySortToUi = (value) => {
  if (value === 'price_low') return 'lowest_price';
  if (value === 'departure_time') return 'earliest';
  return 'recommended';
};

const mapUiSortToQuery = (value) => {
  if (value === 'earliest') return 'departure_time';
  if (value === 'lowest_price') return 'price_low';
  return 'departure_time';
};

const mapMinMaxToPricePreset = (minPrice, maxPrice) => RANGE_TO_PRICE_PRESET[`${minPrice || ''}|${maxPrice || ''}`] || 'any';

const getRideSeatsLeft = (ride) =>
  ride.seatsLeft ?? Math.max(0, Number(ride.seatsAvailable || 0) - Number(ride.bookedSeats || 0));

const rideMatchesTimeWindow = (ride, timeWindow) => {
  if (!timeWindow || timeWindow === 'any') return true;
  const date = new Date(ride.departureTime);
  if (Number.isNaN(date.getTime())) return false;
  const hour = date.getHours();
  if (timeWindow === 'morning') return hour >= 5 && hour < 12;
  if (timeWindow === 'afternoon') return hour >= 12 && hour < 17;
  if (timeWindow === 'evening') return hour >= 17 && hour < 21;
  if (timeWindow === 'night') return hour >= 21 || hour < 5;
  return true;
};

const makeHistoryItem = ({ fromText, toText, fromLocation, toLocation, dateTime, filters }) => {
  const dt = dateTime ? new Date(dateTime) : null;
  const date = dt && !Number.isNaN(dt.getTime()) ? dt.toISOString().slice(0, 10) : '';
  const time = dt && !Number.isNaN(dt.getTime()) ? dt.toTimeString().slice(0, 5) : '';

  return {
    source: fromText,
    destination: toText,
    fromLat: hasLocationCoords(fromLocation) ? Number(fromLocation.lat) : null,
    fromLng: hasLocationCoords(fromLocation) ? Number(fromLocation.lng) : null,
    toLat: hasLocationCoords(toLocation) ? Number(toLocation.lat) : null,
    toLng: hasLocationCoords(toLocation) ? Number(toLocation.lng) : null,
    date,
    time,
    dateTime: dateTime || '',
    filters,
  };
};

const historyEquals = (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {});

const RideCard = ({ ride, currentUserId }) => {
  const driver = ride.driverInfo || ride.driver || {};
  const seatsLeft = getRideSeatsLeft(ride);
  const isOwner = Boolean(currentUserId && String(driver._id || ride.driver) === String(currentUserId));
  const isFull = seatsLeft <= 0;

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md">
      {ride.vehicle?.image ? (
        <img src={ride.vehicle.image} alt={ride.vehicle?.model || 'Vehicle'} className="h-40 w-full object-cover" />
      ) : (
        <div className="flex h-40 w-full items-center justify-center bg-slate-100 text-slate-400">
          <Car size={40} />
        </div>
      )}

      <div className="p-5">
        <div className="mb-3">
          <h3 className="text-lg font-black text-slate-900">
            {ride.source?.name || 'Source'} to {ride.destination?.name || 'Destination'}
          </h3>
          <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
            {driver.profilePic ? <img src={driver.profilePic} alt={driver.name || 'Driver'} className="h-6 w-6 rounded-full object-cover" /> : null}
            by{' '}
            {driver._id ? (
              <Link to={`/profile/${driver._id}`} className="font-bold text-blue-600 hover:text-blue-700">
                {driver.name || 'Driver'}
              </Link>
            ) : (
              driver.name || 'Unknown driver'
            )}
          </p>
        </div>

        <div className="grid gap-2 text-sm text-slate-600">
          <div className="flex items-center gap-2"><Calendar size={16} />{formatDateTime(ride.departureTime)}</div>
          <div className="flex items-center gap-2"><Users size={16} />{seatsLeft} seat(s) left</div>
          <div className="flex items-center gap-2"><IndianRupee size={16} />Rs {ride.price || 0} per seat</div>
          <div className="flex items-center gap-2"><Car size={16} />{ride.vehicle?.type || 'Vehicle'}{ride.vehicle?.model ? ` - ${ride.vehicle.model}` : ''}</div>
        </div>

        {driver.rating ? (
          <div className="mt-4 flex items-center gap-1 text-sm font-semibold text-amber-600">
            <Star size={16} fill="currentColor" />
            {driver.rating}
          </div>
        ) : null}

        <div className="mt-5 flex gap-3">
          <Link to={`/ride/${ride._id}`} className="flex-1 rounded-xl bg-slate-950 px-4 py-3 text-center text-sm font-bold text-white transition hover:bg-slate-800">
            View Details
          </Link>

          {!isOwner ? (
            <Link
              to={`/ride/${ride._id}`}
              aria-disabled={isFull}
              className={`flex-1 rounded-xl px-4 py-3 text-center text-sm font-bold transition ${
                isFull ? 'pointer-events-none bg-slate-200 text-slate-500' : 'bg-emerald-600 text-white hover:bg-emerald-700'
              }`}
            >
              {isFull ? 'Ride Full' : 'Request Seat'}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
};

const FilterGroup = ({ title, value, onChange, options, name }) => (
  <div>
    <p className="mb-3 text-sm font-bold text-slate-800">{title}</p>
    <div className="space-y-2">
      {options.map((option) => (
        <label key={option.value} className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
          <input
            type="radio"
            name={name}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-200"
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  </div>
);

const FindRide = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentUserId = useSelector((s) => s.auth.user?._id || s.auth.user?.id);

  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [dateTime, setDateTime] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [seats, setSeats] = useState('');
  const [sort, setSort] = useState('departure_time');
  const [preferenceFilters, setPreferenceFilters] = useState(DEFAULT_PREFERENCE_FILTERS);

  const [draftFilters, setDraftFilters] = useState(DEFAULT_UI_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(DEFAULT_UI_FILTERS);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [nearbyMode, setNearbyMode] = useState(false);
  const [nearbyCount, setNearbyCount] = useState(0);
  const [searchError, setSearchError] = useState('');
  const [lastSearchParams, setLastSearchParams] = useState(null);
  const [recentSearches, setRecentSearches] = useState([]);
  const [closeSuggestionsSignal, setCloseSuggestionsSignal] = useState(0);
  const [fromCorrectionHint, setFromCorrectionHint] = useState('');
  const [toCorrectionHint, setToCorrectionHint] = useState('');
  const [searchStateReady, setSearchStateReady] = useState(false);

  const fromText = getSearchText(from);
  const toText = getSearchText(to);
  const noQueryTyped = !fromText && !toText;
  const hasFromCoords = hasLocationCoords(from);
  const hasToCoords = hasLocationCoords(to);
  const showMapPreview = Boolean(fromText || toText);
  const mapPreviewSource = hasFromCoords
    ? { name: fromText || 'From', lat: Number(from.lat), lng: Number(from.lng) }
    : null;
  const mapPreviewDestination = hasToCoords
    ? { name: toText || 'To', lat: Number(to.lat), lng: Number(to.lng) }
    : null;

  const closeAllDropdowns = () => {
    setCloseSuggestionsSignal((prev) => prev + 1);
  };

  const meaningfulSearchExists = useMemo(() => {
    return Boolean(
      fromText ||
      toText ||
      dateTime ||
      vehicleType ||
      minPrice !== '' ||
      maxPrice !== '' ||
      seats !== '' ||
      Object.values(preferenceFilters).some((value) => value !== '' && value !== false)
    );
  }, [fromText, toText, dateTime, vehicleType, minPrice, maxPrice, seats, preferenceFilters]);

  const saveSearchState = () => {
    if (!searchStateReady) return;
    const payload = {
      fromText,
      toText,
      fromLat: hasLocationCoords(from) ? Number(from.lat) : null,
      fromLng: hasLocationCoords(from) ? Number(from.lng) : null,
      toLat: hasLocationCoords(to) ? Number(to.lat) : null,
      toLng: hasLocationCoords(to) ? Number(to.lng) : null,
      dateTime,
      vehicleType,
      minPrice,
      maxPrice,
      seats,
      sort,
      preferenceFilters,
      uiFilters: appliedFilters,
    };
    localStorage.setItem(SEARCH_STATE_KEY, JSON.stringify(payload));
  };

  const saveSearchHistory = () => {
    const historyItem = makeHistoryItem({
      fromText,
      toText,
      fromLocation: from,
      toLocation: to,
      dateTime,
      filters: { vehicleType, minPrice, maxPrice, seats, sort, preferenceFilters },
    });

    if (!historyItem.source && !historyItem.destination) return;

    setRecentSearches((prev) => {
      const deduped = prev.filter((item) => !historyEquals(item, historyItem));
      const next = [historyItem, ...deduped].slice(0, HISTORY_LIMIT);
      localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    saveSearchState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchStateReady, fromText, toText, from?.lat, from?.lng, to?.lat, to?.lng, dateTime, vehicleType, minPrice, maxPrice, seats, sort, preferenceFilters, appliedFilters]);

  const buildTimeWindow = (rawDateTime) => {
    if (!rawDateTime) return {};
    const selected = new Date(rawDateTime);
    if (Number.isNaN(selected.getTime())) throw new Error('Invalid date/time selected for search');
    const toWindow = new Date(selected.getTime() + SEARCH_WINDOW_HOURS * 60 * 60 * 1000);
    return {
      timeFrom: selected.toISOString(),
      timeTo: toWindow.toISOString(),
      date: selected.toISOString().slice(0, 10),
    };
  };

  const resolveLocationForSearch = async (place) => {
    const rawText = getSearchText(place).trim();
    if (!rawText) return { location: null, correctedLabel: '' };
    if (hasLocationCoords(place)) return { location: { ...place, name: rawText }, correctedLabel: '' };

    try {
      const resolved = await resolveGeoapifyBestLocation(rawText);
      if (resolved) {
        const normalized = {
          ...resolved,
          name: resolved.name || resolved.label || rawText,
          label: resolved.label || resolved.name || rawText,
        };
        const correctedText = normalized.label || normalized.name || '';
        const shouldHint = correctedText.toLowerCase().trim() !== rawText.toLowerCase().trim();
        return { location: normalized, correctedLabel: shouldHint ? correctedText : '' };
      }
    } catch {
      // fallback
    }

    return { location: { name: rawText }, correctedLabel: '' };
  };

  const buildParamsFromState = async () => {
    const resolvedFrom = await resolveLocationForSearch(from);
    const resolvedTo = await resolveLocationForSearch(to);

    const params = { ...DEFAULT_LIST_QUERY, sort };

    const resolvedFromText = getSearchText(resolvedFrom.location);
    const resolvedToText = getSearchText(resolvedTo.location);

    if (resolvedFromText) {
      params.from = resolvedFromText;
      params.sourceText = resolvedFromText;
    }
    if (resolvedToText) {
      params.to = resolvedToText;
      params.destinationText = resolvedToText;
    }

    if (hasLocationCoords(resolvedFrom.location)) {
      params.fromLat = Number(resolvedFrom.location.lat);
      params.fromLng = Number(resolvedFrom.location.lng);
      params.sourceLat = params.fromLat;
      params.sourceLng = params.fromLng;
    }

    if (hasLocationCoords(resolvedTo.location)) {
      params.toLat = Number(resolvedTo.location.lat);
      params.toLng = Number(resolvedTo.location.lng);
      params.destinationLat = params.toLat;
      params.destinationLng = params.toLng;
    }

    Object.assign(params, buildTimeWindow(dateTime));
    if (dateTime) params.dateTime = dateTime;
    if (vehicleType) params.vehicleType = vehicleType;

    const parsedMinPrice = parseNumberIfValid(minPrice);
    const parsedMaxPrice = parseNumberIfValid(maxPrice);
    const parsedSeats = parseNumberIfValid(seats);

    if (parsedMinPrice !== undefined) params.minPrice = parsedMinPrice;
    if (parsedMaxPrice !== undefined) params.maxPrice = parsedMaxPrice;
    if (parsedSeats !== undefined) params.seats = parsedSeats;

    Object.entries(preferenceFilters).forEach(([key, value]) => {
      if (value !== false && value !== '') params[key] = value;
    });

    return { params, resolvedFrom, resolvedTo };
  };

  const applySearchParamsToUrl = (params) => {
    const next = new URLSearchParams();
    const internalOnlyKeys = new Set([
      'sourceText',
      'destinationText',
      'sourceLat',
      'sourceLng',
      'destinationLat',
      'destinationLng',
    ]);

    Object.entries(params).forEach(([k, v]) => {
      if (internalOnlyKeys.has(k)) return;
      if (v !== undefined && v !== null && v !== '') next.set(k, String(v));
    });
    setSearchParams(next);
  };

  const stripCoordinateFilters = (params = {}) => {
    const next = { ...params };
    delete next.fromLat;
    delete next.fromLng;
    delete next.toLat;
    delete next.toLng;
    delete next.sourceLat;
    delete next.sourceLng;
    delete next.destinationLat;
    delete next.destinationLng;
    return next;
  };

  const fetchRides = async (
    params = {},
    { mode = 'list', relaxCoordinateFilterOnEmpty = false, persistSearch = true } = {}
  ) => {
    if (loading) return;

    try {
      setLoading(true);
      setSearchError('');
      setLastSearchParams({ params, mode, relaxCoordinateFilterOnEmpty, persistSearch });

      const requestFn = mode === 'search' ? rideService.searchRides : rideService.getRides;
      let effectiveParams = { ...params };
      let response = await requestFn(effectiveParams);
      let list = normalizeListResponse(response);

      const canRelaxCoords =
        mode === 'search' &&
        relaxCoordinateFilterOnEmpty &&
        list.length === 0 &&
        (effectiveParams.from || effectiveParams.to) &&
        (effectiveParams.fromLat !== undefined || effectiveParams.toLat !== undefined);

      if (canRelaxCoords) {
        const relaxedParams = stripCoordinateFilters(effectiveParams);
        response = await requestFn(relaxedParams);
        const relaxedList = normalizeListResponse(response);
        if (relaxedList.length > 0) {
          toast('No exact coordinate match. Showing broader route results.');
          list = relaxedList;
          effectiveParams = relaxedParams;
        }
      }

      setRides(list);
      setNearbyMode(false);
      setNearbyCount(0);
      if (persistSearch) {
        saveSearchState();
        saveSearchHistory();
      }
      return { rides: list, effectiveParams };
    } catch (err) {
      setSearchError(getErrorMessage(err, 'Failed to fetch rides'));
      setRides([]);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const fetchNearbyRides = async ({ lat: latValue, lng: lngValue, radius = 10, extra = {} }) => {
    if (loading) return;

    try {
      setLoading(true);
      setSearchError('');
      const res = await rideService.nearbyRides({
        lat: latValue,
        lng: lngValue,
        radiusKm: radius,
        vehicleType: vehicleType || undefined,
        seats: parseNumberIfValid(seats),
        page: 1,
        limit: 30,
        ...extra,
      });

      const data = res?.data?.data || {};
      const nearbyList = Array.isArray(data.rides) ? data.rides : [];
      setRides(nearbyList);
      setNearbyMode(true);
      setNearbyCount(Number(data.count || nearbyList.length || 0));
      return nearbyList;
    } catch (err) {
      setNearbyMode(false);
      setNearbyCount(0);
      setSearchError(getErrorMessage(err, 'Failed to fetch nearby rides'));
      return [];
    } finally {
      setLoading(false);
    }
  };

  const runSearch = async () => {
    if (loading) return;
    closeAllDropdowns();
    setFromCorrectionHint('');
    setToCorrectionHint('');

    try {
      const { params, resolvedFrom, resolvedTo } = await buildParamsFromState();

      if (resolvedFrom.location) {
        setFrom(resolvedFrom.location);
        if (resolvedFrom.correctedLabel) setFromCorrectionHint(`Showing results for ${resolvedFrom.correctedLabel}`);
      }
      if (resolvedTo.location) {
        setTo(resolvedTo.location);
        if (resolvedTo.correctedLabel) setToCorrectionHint(`Showing results for ${resolvedTo.correctedLabel}`);
      }

      const result = await fetchRides(params, {
        mode: 'search',
        relaxCoordinateFilterOnEmpty: true,
      });
      if (result?.effectiveParams) {
        applySearchParamsToUrl(result.effectiveParams);
      }
    } catch (err) {
      setSearchError(err?.message || 'Invalid search inputs');
      toast.error(err?.message || 'Invalid search inputs');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await runSearch();
  };

  const handleFindNearby = async () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported in this browser.');
      return;
    }

    closeAllDropdowns();
    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const detectedLat = position.coords.latitude;
        const detectedLng = position.coords.longitude;
        await fetchNearbyRides({
          lat: detectedLat,
          lng: detectedLng,
          radius: 10,
        });
        setLocating(false);
      },
      () => {
        toast.error('Unable to access your location.');
        setLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 2 * 60 * 1000,
      }
    );
  };

  const handleClearSearch = async () => {
    closeAllDropdowns();
    setFrom(null);
    setTo(null);
    setDateTime('');
    setVehicleType('');
    setMinPrice('');
    setMaxPrice('');
    setSeats('');
    setSort('departure_time');
    setPreferenceFilters({ ...DEFAULT_PREFERENCE_FILTERS });
    setDraftFilters(DEFAULT_UI_FILTERS);
    setAppliedFilters(DEFAULT_UI_FILTERS);
    setFromCorrectionHint('');
    setToCorrectionHint('');
    setSearchError('');
    setLastSearchParams(null);
    setNearbyMode(false);
    setNearbyCount(0);
    localStorage.removeItem(SEARCH_STATE_KEY);
    setSearchParams(new URLSearchParams());
    await fetchRides(DEFAULT_LIST_QUERY, { mode: 'list', persistSearch: false });
  };

  const handleRetry = async () => {
    if (!lastSearchParams) return;
    const result = await fetchRides(lastSearchParams.params, {
      mode: lastSearchParams.mode,
      relaxCoordinateFilterOnEmpty: lastSearchParams.relaxCoordinateFilterOnEmpty,
      persistSearch: lastSearchParams.persistSearch,
    });
    if (result?.effectiveParams) {
      applySearchParamsToUrl(result.effectiveParams);
    }
  };

  const applyHistoryItem = (item) => {
    setFrom(getLocationFromParams(item?.source, item?.fromLat, item?.fromLng));
    setTo(getLocationFromParams(item?.destination, item?.toLat, item?.toLng));
    setDateTime(item?.dateTime || '');

    const filters = item?.filters || {};
    const restoredUi = {
      vehicleType: filters.vehicleType || '',
      seats: filters.seats || '',
      pricePreset: mapMinMaxToPricePreset(filters.minPrice || '', filters.maxPrice || ''),
      timeWindow: 'any',
      sortUi: mapLegacySortToUi(filters.sort || 'departure_time'),
    };

    setVehicleType(filters.vehicleType || '');
    setMinPrice(filters.minPrice || '');
    setMaxPrice(filters.maxPrice || '');
    setSeats(filters.seats || '');
    setSort(filters.sort || 'departure_time');
    setPreferenceFilters(filters.preferenceFilters || DEFAULT_PREFERENCE_FILTERS);
    setDraftFilters(restoredUi);
    setAppliedFilters(restoredUi);
    setFromCorrectionHint('');
    setToCorrectionHint('');
    closeAllDropdowns();
  };

  const applyFiltersAndSearch = async () => {
    const range = PRICE_PRESET_TO_RANGE[draftFilters.pricePreset] || PRICE_PRESET_TO_RANGE.any;
    setVehicleType(draftFilters.vehicleType);
    setSeats(draftFilters.seats);
    setMinPrice(range.min);
    setMaxPrice(range.max);
    setSort(mapUiSortToQuery(draftFilters.sortUi));
    setAppliedFilters(draftFilters);
    setMobileFiltersOpen(false);
    await runSearch();
  };

  const clearDraftFilters = () => setDraftFilters(DEFAULT_UI_FILTERS);

  const clearAppliedFilters = () => {
    setDraftFilters(DEFAULT_UI_FILTERS);
    setAppliedFilters(DEFAULT_UI_FILTERS);
    setVehicleType('');
    setSeats('');
    setMinPrice('');
    setMaxPrice('');
    setSort('departure_time');
  };

  const activeFilterChips = useMemo(() => {
    const chips = [];
    if (appliedFilters.vehicleType) chips.push({ key: 'vehicleType', label: appliedFilters.vehicleType === 'car' ? 'Car' : 'Bike' });
    if (appliedFilters.seats) chips.push({ key: 'seats', label: `${appliedFilters.seats}+ seats` });
    if (appliedFilters.pricePreset !== 'any') {
      const labelMap = {
        free: 'Free',
        under_50: 'Under ₹50',
        between_50_100: '₹50 - ₹100',
        over_100: '₹100+',
      };
      chips.push({ key: 'pricePreset', label: labelMap[appliedFilters.pricePreset] || appliedFilters.pricePreset });
    }
    if (appliedFilters.timeWindow !== 'any') {
      const label = appliedFilters.timeWindow.charAt(0).toUpperCase() + appliedFilters.timeWindow.slice(1);
      chips.push({ key: 'timeWindow', label });
    }
    return chips;
  }, [appliedFilters]);

  const displayedRides = useMemo(() => {
    let result = rides.filter((ride) => rideMatchesTimeWindow(ride, appliedFilters.timeWindow));
    if (appliedFilters.sortUi === 'most_seats') {
      result = [...result].sort((a, b) => getRideSeatsLeft(b) - getRideSeatsLeft(a));
    }
    return result;
  }, [rides, appliedFilters]);

  const removeChip = async (key) => {
    const next = { ...appliedFilters };
    if (key === 'pricePreset') next.pricePreset = 'any';
    else if (key === 'timeWindow') next.timeWindow = 'any';
    else next[key] = '';
    setDraftFilters(next);
    setAppliedFilters(next);

    const range = PRICE_PRESET_TO_RANGE[next.pricePreset] || PRICE_PRESET_TO_RANGE.any;
    setVehicleType(next.vehicleType);
    setSeats(next.seats);
    setMinPrice(range.min);
    setMaxPrice(range.max);
    setSort(mapUiSortToQuery(next.sortUi));
    await runSearch();
  };

  useEffect(() => {
    const savedHistory = localStorage.getItem(SEARCH_HISTORY_KEY);
    if (savedHistory) {
      try {
        const parsed = JSON.parse(savedHistory);
        if (Array.isArray(parsed)) setRecentSearches(parsed.slice(0, HISTORY_LIMIT));
      } catch {
        // ignore corrupt history
      }
    }

    const paramsFromUrl = {
      from: searchParams.get('from') || searchParams.get('source') || '',
      to: searchParams.get('to') || searchParams.get('destination') || '',
      fromLat: searchParams.get('fromLat') || '',
      fromLng: searchParams.get('fromLng') || '',
      toLat: searchParams.get('toLat') || '',
      toLng: searchParams.get('toLng') || '',
      dateTime: searchParams.get('dateTime') || '',
      date: searchParams.get('date') || '',
      vehicleType: searchParams.get('vehicleType') || '',
      minPrice: searchParams.get('minPrice') || '',
      maxPrice: searchParams.get('maxPrice') || '',
      seats: searchParams.get('seats') || '',
      sort: searchParams.get('sort') || 'departure_time',
      preferenceFilters: {
        womenOnly: searchParams.get('womenOnly') === 'true',
        verifiedOnly: searchParams.get('verifiedOnly') === 'true',
        smokingAllowed: searchParams.get('smokingAllowed') === 'true',
        musicAllowed: searchParams.get('musicAllowed') === 'true',
        petsAllowed: searchParams.get('petsAllowed') === 'true',
        acAvailable: searchParams.get('acAvailable') === 'true',
        genderPreference: searchParams.get('genderPreference') || '',
      },
    };

    const hasUrlState =
      Boolean(paramsFromUrl.from || paramsFromUrl.to || paramsFromUrl.dateTime || paramsFromUrl.date) ||
      Boolean(paramsFromUrl.vehicleType || paramsFromUrl.minPrice || paramsFromUrl.maxPrice || paramsFromUrl.seats) ||
      Boolean(paramsFromUrl.fromLat || paramsFromUrl.fromLng || paramsFromUrl.toLat || paramsFromUrl.toLng) ||
      Object.values(paramsFromUrl.preferenceFilters).some((v) => v !== '' && v !== false);

    if (hasUrlState) {
      const restoredFrom = getLocationFromParams(paramsFromUrl.from, paramsFromUrl.fromLat, paramsFromUrl.fromLng);
      const restoredTo = getLocationFromParams(paramsFromUrl.to, paramsFromUrl.toLat, paramsFromUrl.toLng);

      setFrom(restoredFrom);
      setTo(restoredTo);
      setDateTime(paramsFromUrl.dateTime || '');
      setVehicleType(paramsFromUrl.vehicleType);
      setMinPrice(paramsFromUrl.minPrice);
      setMaxPrice(paramsFromUrl.maxPrice);
      setSeats(paramsFromUrl.seats);
      setSort(paramsFromUrl.sort);
      setPreferenceFilters(paramsFromUrl.preferenceFilters);

      const uiFromUrl = {
        vehicleType: paramsFromUrl.vehicleType || '',
        seats: paramsFromUrl.seats || '',
        pricePreset: mapMinMaxToPricePreset(paramsFromUrl.minPrice, paramsFromUrl.maxPrice),
        timeWindow: 'any',
        sortUi: mapLegacySortToUi(paramsFromUrl.sort),
      };
      setDraftFilters(uiFromUrl);
      setAppliedFilters(uiFromUrl);

      setFromCorrectionHint('');
      setToCorrectionHint('');
      closeAllDropdowns();
      setSearchStateReady(true);

      const initialParams = { page: Number(searchParams.get('page') || 1), limit: Number(searchParams.get('limit') || 30), sort: paramsFromUrl.sort };
      if (paramsFromUrl.from) {
        initialParams.from = paramsFromUrl.from;
        initialParams.sourceText = paramsFromUrl.from;
      }
      if (paramsFromUrl.to) {
        initialParams.to = paramsFromUrl.to;
        initialParams.destinationText = paramsFromUrl.to;
      }
      if (paramsFromUrl.fromLat !== '' && paramsFromUrl.fromLng !== '') {
        initialParams.fromLat = Number(paramsFromUrl.fromLat);
        initialParams.fromLng = Number(paramsFromUrl.fromLng);
        initialParams.sourceLat = initialParams.fromLat;
        initialParams.sourceLng = initialParams.fromLng;
      }
      if (paramsFromUrl.toLat !== '' && paramsFromUrl.toLng !== '') {
        initialParams.toLat = Number(paramsFromUrl.toLat);
        initialParams.toLng = Number(paramsFromUrl.toLng);
        initialParams.destinationLat = initialParams.toLat;
        initialParams.destinationLng = initialParams.toLng;
      }
      if (paramsFromUrl.dateTime) {
        const selected = new Date(paramsFromUrl.dateTime);
        if (!Number.isNaN(selected.getTime())) {
          initialParams.timeFrom = selected.toISOString();
          initialParams.timeTo = new Date(selected.getTime() + SEARCH_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
          initialParams.date = selected.toISOString().slice(0, 10);
        }
      } else if (paramsFromUrl.date) {
        initialParams.date = paramsFromUrl.date;
      }
      if (paramsFromUrl.vehicleType) initialParams.vehicleType = paramsFromUrl.vehicleType;
      if (paramsFromUrl.minPrice !== '') initialParams.minPrice = Number(paramsFromUrl.minPrice);
      if (paramsFromUrl.maxPrice !== '') initialParams.maxPrice = Number(paramsFromUrl.maxPrice);
      if (paramsFromUrl.seats !== '') initialParams.seats = Number(paramsFromUrl.seats);
      Object.entries(paramsFromUrl.preferenceFilters).forEach(([key, value]) => {
        if (value !== '' && value !== false) initialParams[key] = value;
      });

      const shouldAutoSearchFromUrl =
        Boolean(paramsFromUrl.from || paramsFromUrl.to || paramsFromUrl.date || paramsFromUrl.dateTime) ||
        Boolean(paramsFromUrl.vehicleType || paramsFromUrl.minPrice || paramsFromUrl.maxPrice || paramsFromUrl.seats) ||
        Object.values(paramsFromUrl.preferenceFilters).some((v) => v !== '' && v !== false);

      if (shouldAutoSearchFromUrl) {
        void fetchRides(initialParams, {
          mode: 'search',
          relaxCoordinateFilterOnEmpty: true,
        });
      } else {
        void fetchRides(DEFAULT_LIST_QUERY, { mode: 'list', persistSearch: false });
      }
      return;
    }

    const savedState = localStorage.getItem(SEARCH_STATE_KEY);
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        const restoredFrom = getLocationFromParams(parsed?.fromText, parsed?.fromLat, parsed?.fromLng);
        const restoredTo = getLocationFromParams(parsed?.toText, parsed?.toLat, parsed?.toLng);

        setFrom(restoredFrom);
        setTo(restoredTo);
        setDateTime(parsed?.dateTime || '');
        setVehicleType(parsed?.vehicleType || '');
        setMinPrice(parsed?.minPrice || '');
        setMaxPrice(parsed?.maxPrice || '');
        setSeats(parsed?.seats || '');
        setSort(parsed?.sort || 'departure_time');
        setPreferenceFilters(parsed?.preferenceFilters || DEFAULT_PREFERENCE_FILTERS);

        const restoredUi = parsed?.uiFilters || {
          vehicleType: parsed?.vehicleType || '',
          seats: parsed?.seats || '',
          pricePreset: mapMinMaxToPricePreset(parsed?.minPrice || '', parsed?.maxPrice || ''),
          timeWindow: 'any',
          sortUi: mapLegacySortToUi(parsed?.sort || 'departure_time'),
        };

        setDraftFilters(restoredUi);
        setAppliedFilters(restoredUi);
        setFromCorrectionHint('');
        setToCorrectionHint('');
        closeAllDropdowns();
        setSearchStateReady(true);

        const hasMeaningfulSavedState =
          Boolean(restoredFrom || restoredTo || parsed?.dateTime) ||
          Boolean(parsed?.vehicleType || parsed?.minPrice || parsed?.maxPrice || parsed?.seats) ||
          Object.values(parsed?.preferenceFilters || {}).some((v) => v !== '' && v !== false);

        if (hasMeaningfulSavedState) {
          const initialParams = { page: 1, limit: 30, sort: parsed?.sort || 'departure_time' };
          if (parsed?.fromText) {
            initialParams.from = parsed.fromText;
            initialParams.sourceText = parsed.fromText;
          }
          if (parsed?.toText) {
            initialParams.to = parsed.toText;
            initialParams.destinationText = parsed.toText;
          }
          if (parsed?.fromLat !== null && parsed?.fromLat !== undefined && parsed?.fromLng !== null && parsed?.fromLng !== undefined) {
            initialParams.fromLat = Number(parsed.fromLat);
            initialParams.fromLng = Number(parsed.fromLng);
            initialParams.sourceLat = initialParams.fromLat;
            initialParams.sourceLng = initialParams.fromLng;
          }
          if (parsed?.toLat !== null && parsed?.toLat !== undefined && parsed?.toLng !== null && parsed?.toLng !== undefined) {
            initialParams.toLat = Number(parsed.toLat);
            initialParams.toLng = Number(parsed.toLng);
            initialParams.destinationLat = initialParams.toLat;
            initialParams.destinationLng = initialParams.toLng;
          }
          if (parsed?.dateTime) {
            const selected = new Date(parsed.dateTime);
            if (!Number.isNaN(selected.getTime())) {
              initialParams.timeFrom = selected.toISOString();
              initialParams.timeTo = new Date(selected.getTime() + SEARCH_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
              initialParams.date = selected.toISOString().slice(0, 10);
            }
          }
          if (parsed?.vehicleType) initialParams.vehicleType = parsed.vehicleType;
          if (parsed?.minPrice !== '') initialParams.minPrice = Number(parsed.minPrice);
          if (parsed?.maxPrice !== '') initialParams.maxPrice = Number(parsed.maxPrice);
          if (parsed?.seats !== '') initialParams.seats = Number(parsed.seats);
          Object.entries(parsed?.preferenceFilters || {}).forEach(([key, value]) => {
            if (value !== '' && value !== false) initialParams[key] = value;
          });

          void fetchRides(initialParams, {
            mode: 'search',
            relaxCoordinateFilterOnEmpty: true,
          });
          return;
        }
      } catch {
        // ignore invalid state
      }
    }

    setSearchStateReady(true);
    void fetchRides(DEFAULT_LIST_QUERY, { mode: 'list', persistSearch: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const FiltersPanel = (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
        <h2 className="text-lg font-black text-slate-900">Filters</h2>
        <button type="button" onClick={clearDraftFilters} className="text-sm font-semibold text-slate-500 hover:text-slate-700">Clear</button>
      </div>

      <div className="space-y-6">
        <FilterGroup
          title="Vehicle Type"
          name="vehicle-type"
          value={draftFilters.vehicleType}
          onChange={(value) => setDraftFilters((prev) => ({ ...prev, vehicleType: value }))}
          options={[{ label: 'Any', value: '' }, { label: 'Car', value: 'car' }, { label: 'Bike', value: 'bike' }]}
        />

        <FilterGroup
          title="Seats"
          name="seats"
          value={draftFilters.seats}
          onChange={(value) => setDraftFilters((prev) => ({ ...prev, seats: value }))}
          options={[{ label: 'Any', value: '' }, { label: '1+', value: '1' }, { label: '2+', value: '2' }, { label: '3+', value: '3' }]}
        />

        <FilterGroup
          title="Price Range"
          name="price-range"
          value={draftFilters.pricePreset}
          onChange={(value) => setDraftFilters((prev) => ({ ...prev, pricePreset: value }))}
          options={[
            { label: 'Any', value: 'any' },
            { label: 'Free', value: 'free' },
            { label: 'Under ₹50', value: 'under_50' },
            { label: '₹50 - ₹100', value: 'between_50_100' },
            { label: '₹100+', value: 'over_100' },
          ]}
        />

        <FilterGroup
          title="Time Window"
          name="time-window"
          value={draftFilters.timeWindow}
          onChange={(value) => setDraftFilters((prev) => ({ ...prev, timeWindow: value }))}
          options={[
            { label: 'Any', value: 'any' },
            { label: 'Morning', value: 'morning' },
            { label: 'Afternoon', value: 'afternoon' },
            { label: 'Evening', value: 'evening' },
            { label: 'Night', value: 'night' },
          ]}
        />

        <FilterGroup
          title="Sort By"
          name="sort"
          value={draftFilters.sortUi}
          onChange={(value) => setDraftFilters((prev) => ({ ...prev, sortUi: value }))}
          options={[
            { label: 'Recommended', value: 'recommended' },
            { label: 'Earliest', value: 'earliest' },
            { label: 'Lowest Price', value: 'lowest_price' },
            { label: 'Most Seats', value: 'most_seats' },
          ]}
        />
      </div>

      <div className="mt-6 grid gap-2">
        <button type="button" onClick={clearAppliedFilters} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">
          Clear Filters
        </button>
        <button type="button" onClick={applyFiltersAndSearch} disabled={loading} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">
          Apply Filters
        </button>
      </div>
    </div>
  );

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 md:px-8">
      <section className="mx-auto max-w-7xl">
        <form onSubmit={handleSubmit} className="relative z-[1000] mb-6 overflow-visible rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="mb-4 text-2xl font-black text-slate-900">Find a Ride</h1>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-[1fr_1fr_180px_160px_120px_110px_130px]">
            <LocationSearch
              label="From"
              value={from}
              onChange={setFrom}
              placeholder="Source location"
              disabled={loading}
              closeSignal={closeSuggestionsSignal}
            />

            <LocationSearch
              label="To"
              value={to}
              onChange={setTo}
              placeholder="Destination location"
              disabled={loading}
              closeSignal={closeSuggestionsSignal}
            />

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Date</label>
              <input
                type="date"
                value={dateTime ? dateTime.slice(0, 10) : ''}
                disabled={loading}
                onChange={(e) => {
                  const date = e.target.value;
                  const existingTime = dateTime && dateTime.includes('T') ? dateTime.split('T')[1] : '12:00';
                  setDateTime(date ? `${date}T${existingTime.slice(0, 5)}` : '');
                }}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Time</label>
              <input
                type="time"
                value={dateTime && dateTime.includes('T') ? dateTime.split('T')[1].slice(0, 5) : ''}
                disabled={loading}
                onChange={(e) => {
                  const time = e.target.value;
                  const existingDate = dateTime ? dateTime.slice(0, 10) : '';
                  setDateTime(existingDate && time ? `${existingDate}T${time}` : existingDate ? `${existingDate}T12:00` : '');
                }}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            <button type="submit" disabled={loading} className="mt-7 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">
              <Search size={16} />
              Search
            </button>

            <button type="button" onClick={handleClearSearch} disabled={loading} className="mt-7 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
              <X size={16} />
              Clear
            </button>

            <button
              type="button"
              onClick={handleFindNearby}
              disabled={loading || locating}
              className="mt-7 inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
            >
              {locating ? 'Locating...' : 'Near Me'}
            </button>
          </div>
        </form>

        {fromCorrectionHint || toCorrectionHint ? (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
            {[fromCorrectionHint, toCorrectionHint].filter(Boolean).join(' | ')}
          </div>
        ) : null}

        {showMapPreview ? (
          <div className="relative z-10 mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-base font-black text-slate-900">Route Preview</h2>
            {mapPreviewSource && mapPreviewDestination ? (
              <RouteMap source={mapPreviewSource} destination={mapPreviewDestination} height="280px" />
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm font-semibold text-slate-600">
                Select a suggestion for both From and To to preview route on map.
              </div>
            )}
          </div>
        ) : null}

        {recentSearches.length > 0 && noQueryTyped ? (
          <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="mb-3 text-sm font-black text-slate-700">Recent Searches</p>
            <div className="grid gap-2 md:grid-cols-3">
              {recentSearches.map((item, index) => (
                <button
                  type="button"
                  key={`${item.source}-${item.destination}-${index}`}
                  onClick={() => applyHistoryItem(item)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <p className="font-bold text-slate-900">{item.source || 'Any source'} to {item.destination || 'Any destination'}</p>
                  <p className="text-xs text-slate-500">{formatHistoryDateTime(item.date, item.time)}</p>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid items-start gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="hidden lg:sticky lg:top-24 lg:block lg:self-start">{FiltersPanel}</aside>

          <div>
            <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="text-base font-black text-slate-900">
                  {loading ? 'Searching rides...' : displayedRides.length ? `${displayedRides.length} rides found` : 'No rides found'}
                </p>
                <button
                  type="button"
                  onClick={() => setMobileFiltersOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 lg:hidden"
                >
                  <SlidersHorizontal size={16} />
                  Filters
                </button>
              </div>

              {activeFilterChips.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {activeFilterChips.map((chip) => (
                    <button
                      type="button"
                      key={chip.key}
                      onClick={() => removeChip(chip.key)}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700"
                    >
                      {chip.label}
                      <X size={12} />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {nearbyMode ? <p className="mb-6 text-sm font-bold text-emerald-700">Near you {nearbyCount} rides available</p> : null}

            {loading ? (
              <div className="rounded-2xl bg-white p-10 text-center text-slate-600 shadow-sm ring-1 ring-slate-200">Searching rides...</div>
            ) : searchError ? (
              <ErrorState message={searchError} onRetry={handleRetry} />
            ) : displayedRides.length ? (
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-2">
                {displayedRides.map((ride) => (
                  <RideCard key={ride._id} ride={ride} currentUserId={currentUserId} />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No rides found"
                message={
                  nearbyMode
                    ? 'No rides found near you. Try increasing distance or changing location.'
                    : meaningfulSearchExists
                      ? 'No rides found for your search. Try broadening filters.'
                      : 'No rides available right now. Try searching by source and destination.'
                }
              />
            )}
          </div>
        </div>
      </section>

      {mobileFiltersOpen ? (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setMobileFiltersOpen(false)}>
          <div className="absolute bottom-0 left-0 right-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-900">Filters</h2>
              <button type="button" onClick={() => setMobileFiltersOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
            </div>
            {FiltersPanel}
          </div>
        </div>
      ) : null}
    </main>
  );
};

export default FindRide;
