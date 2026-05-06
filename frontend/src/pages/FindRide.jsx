import { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Car,
  IndianRupee,
  LocateFixed,
  RefreshCw,
  Search,
  Star,
  Users,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import LocationSearch from '../components/LocationSearch';
import { getErrorMessage, rideService } from '../services/api';
import { resolveGeoapifyBestLocation } from '../services/locationAutocomplete';

const SEARCH_HISTORY_KEY = 'rideSearchHistory';
const SEARCH_STATE_KEY = 'sahayatri_find_ride_search_v3';
const HISTORY_LIMIT = 3;
const SEARCH_WINDOW_HOURS = 6;

const EmptyState = ({ title, message }) => (
  <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
      <Search />
    </div>

    <h3 className="text-xl font-black text-slate-900">{title}</h3>

    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
      {message}
    </p>
  </div>
);

const ErrorState = ({ message, onRetry }) => (
  <div className="rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center">
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

  return new Date(value).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
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

const historyEquals = (a, b) =>
  JSON.stringify(a || {}) === JSON.stringify(b || {});

const RideCard = ({ ride, currentUserId }) => {
  const driver = ride.driverInfo || ride.driver || {};
  const seatsLeft =
    ride.seatsLeft ??
    Math.max(0, Number(ride.seatsAvailable || 0) - Number(ride.bookedSeats || 0));
  const isOwner = Boolean(currentUserId && String(driver._id || ride.driver) === String(currentUserId));
  const isFull = seatsLeft <= 0;

  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-1 hover:shadow-xl">
      {ride.vehicle?.image ? (
        <img
          src={ride.vehicle.image}
          alt={ride.vehicle?.model || 'Vehicle'}
          className="h-44 w-full object-cover"
        />
      ) : (
        <div className="flex h-44 w-full items-center justify-center bg-slate-100 text-slate-400">
          <Car size={42} />
        </div>
      )}

      <div className="p-5">
        <div className="mb-3">
          <h3 className="text-xl font-black text-slate-900">
            {ride.source?.name || 'Source'} to {ride.destination?.name || 'Destination'}
          </h3>

          <p className="mt-1 text-sm text-slate-500 flex items-center gap-2">
            {driver.profilePic ? (
              <img src={driver.profilePic} alt={driver.name || 'Driver'} className="h-6 w-6 rounded-full object-cover" />
            ) : null}
            by{' '}
            {driver._id ? (
              <Link
                to={`/users/${driver._id}`}
                className="font-bold text-blue-600 hover:text-blue-700"
              >
                {driver.name || 'Driver'}
              </Link>
            ) : (
              driver.name || 'Unknown driver'
            )}
          </p>
        </div>

        <div className="grid gap-3 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <Calendar size={16} />
            {formatDateTime(ride.departureTime)}
          </div>

          <div className="flex items-center gap-2">
            <Users size={16} />
            {seatsLeft} seat(s) left
          </div>

          <div className="flex items-center gap-2">
            <IndianRupee size={16} />
            Rs {ride.price || 0} per seat
          </div>

          <div className="flex items-center gap-2">
            <Car size={16} />
            {ride.vehicle?.type || 'Vehicle'}
            {ride.vehicle?.model ? ` - ${ride.vehicle.model}` : ''}
          </div>
        </div>

        {driver.rating ? (
          <div className="mt-4 flex items-center gap-1 text-sm font-semibold text-amber-600">
            <Star size={16} fill="currentColor" />
            {driver.rating}
          </div>
        ) : null}

        <div className="mt-5 flex gap-3">
          <Link
            to={`/ride/${ride._id}`}
            className="flex-1 rounded-2xl bg-slate-950 px-4 py-3 text-center text-sm font-bold text-white transition hover:bg-slate-800"
          >
            View Details
          </Link>

          {!isOwner ? (
            <Link
              to={`/ride/${ride._id}`}
              aria-disabled={isFull}
              className={`flex-1 rounded-2xl px-4 py-3 text-center text-sm font-bold transition ${
                isFull
                  ? 'bg-slate-200 text-slate-500 pointer-events-none'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
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
  const [radiusKm, setRadiusKm] = useState('');
  const [sort, setSort] = useState('departure_time');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [preferenceFilters, setPreferenceFilters] = useState({
    womenOnly: false,
    verifiedOnly: false,
    smokingAllowed: false,
    musicAllowed: false,
    petsAllowed: false,
    acAvailable: false,
    genderPreference: '',
  });

  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [nearbyMode, setNearbyMode] = useState(false);
  const [nearbyCount, setNearbyCount] = useState(0);
  const [searchError, setSearchError] = useState('');
  const [lastSearchParams, setLastSearchParams] = useState(null);
  const [recentSearches, setRecentSearches] = useState([]);
  const [closeSuggestionsSignal, setCloseSuggestionsSignal] = useState(0);
  const [activeLocationDropdown, setActiveLocationDropdown] = useState(null);
  const [fromCorrectionHint, setFromCorrectionHint] = useState('');
  const [toCorrectionHint, setToCorrectionHint] = useState('');

  const fromText = getSearchText(from);
  const toText = getSearchText(to);

  const noQueryTyped = !fromText && !toText;

  const closeAllDropdowns = () => {
    setActiveLocationDropdown(null);
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
      radiusKm !== '' ||
      Object.values(preferenceFilters).some((value) => value !== '' && value !== false)
    );
  }, [
    fromText,
    toText,
    dateTime,
    vehicleType,
    minPrice,
    maxPrice,
    seats,
    radiusKm,
    preferenceFilters,
  ]);

  const saveSearchState = () => {
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
      radiusKm,
      sort,
      lat,
      lng,
      preferenceFilters,
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
      filters: {
        vehicleType,
        minPrice,
        maxPrice,
        seats,
        radiusKm,
        sort,
        preferenceFilters,
      },
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
  }, [
    fromText,
    toText,
    from?.lat,
    from?.lng,
    to?.lat,
    to?.lng,
    dateTime,
    vehicleType,
    minPrice,
    maxPrice,
    seats,
    radiusKm,
    sort,
    lat,
    lng,
    preferenceFilters,
  ]);

  const buildTimeWindow = (rawDateTime) => {
    if (!rawDateTime) return {};

    const selected = new Date(rawDateTime);
    if (Number.isNaN(selected.getTime())) {
      throw new Error('Invalid date/time selected for search');
    }

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
    if (hasLocationCoords(place)) {
      return { location: { ...place, name: rawText }, correctedLabel: '' };
    }

    try {
      const resolved = await resolveGeoapifyBestLocation(rawText);
      if (resolved) {
        const normalized = {
          ...resolved,
          name: resolved.name || resolved.label || rawText,
          label: resolved.label || resolved.name || rawText,
        };
        const correctedText = normalized.label || normalized.name || '';
        const normalizedRaw = rawText.toLowerCase().trim();
        const normalizedCorrected = correctedText.toLowerCase().trim();
        const shouldHint = normalizedCorrected && normalizedCorrected !== normalizedRaw;
        return {
          location: normalized,
          correctedLabel: shouldHint ? correctedText : '',
        };
      }
    } catch {
      // Manual text search fallback stays active when autocomplete/geocode fails.
    }

    return {
      location: { name: rawText },
      correctedLabel: '',
    };
  };

  const buildParamsFromState = async () => {
    const resolvedFrom = await resolveLocationForSearch(from);
    const resolvedTo = await resolveLocationForSearch(to);

    const params = {
      page: 1,
      limit: 30,
      sort,
    };

    const resolvedFromText = getSearchText(resolvedFrom.location);
    const resolvedToText = getSearchText(resolvedTo.location);

    if (resolvedFromText) params.from = resolvedFromText;
    if (resolvedToText) params.to = resolvedToText;

    if (hasLocationCoords(resolvedFrom.location)) {
      params.fromLat = Number(resolvedFrom.location.lat);
      params.fromLng = Number(resolvedFrom.location.lng);
    }

    if (hasLocationCoords(resolvedTo.location)) {
      params.toLat = Number(resolvedTo.location.lat);
      params.toLng = Number(resolvedTo.location.lng);
    }

    const timeWindow = buildTimeWindow(dateTime);
    Object.assign(params, timeWindow);
    if (dateTime) params.dateTime = dateTime;

    if (vehicleType) params.vehicleType = vehicleType;

    const parsedMinPrice = parseNumberIfValid(minPrice);
    const parsedMaxPrice = parseNumberIfValid(maxPrice);
    const parsedSeats = parseNumberIfValid(seats);
    const parsedLat = parseNumberIfValid(lat);
    const parsedLng = parseNumberIfValid(lng);
    const parsedRadius = parseNumberIfValid(radiusKm);

    if (parsedMinPrice !== undefined) params.minPrice = parsedMinPrice;
    if (parsedMaxPrice !== undefined) params.maxPrice = parsedMaxPrice;
    if (parsedSeats !== undefined) params.seats = parsedSeats;
    if (parsedLat !== undefined && parsedLng !== undefined) {
      params.lat = parsedLat;
      params.lng = parsedLng;
    }
    if (parsedRadius !== undefined) params.radiusKm = parsedRadius;

    Object.entries(preferenceFilters).forEach(([key, value]) => {
      if (value !== false && value !== '') params[key] = value;
    });

    return {
      params,
      resolvedFrom,
      resolvedTo,
    };
  };

  const applySearchParamsToUrl = (params) => {
    const next = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') next.set(k, String(v));
    });
    setSearchParams(next);
  };

  const fetchRides = async (params = {}) => {
    if (loading) return;

    try {
      setLoading(true);
      setSearchError('');
      setLastSearchParams(params);
      const res = await rideService.getRides(params);
      setRides(normalizeListResponse(res));
      setNearbyMode(false);
      setNearbyCount(0);
      saveSearchState();
      saveSearchHistory();
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to fetch rides');
      setSearchError(message);
      setRides([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchNearbyRides = async ({
    lat: latValue,
    lng: lngValue,
    radius = 10,
    extra = {},
  }) => {
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
    } catch (err) {
      setNearbyMode(false);
      setNearbyCount(0);
      setSearchError(getErrorMessage(err, 'Failed to fetch nearby rides'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    closeAllDropdowns();
    setFromCorrectionHint('');
    setToCorrectionHint('');

    try {
      const { params, resolvedFrom, resolvedTo } = await buildParamsFromState();

      if (resolvedFrom.location) {
        setFrom(resolvedFrom.location);
        if (resolvedFrom.correctedLabel) {
          setFromCorrectionHint(`Showing results for ${resolvedFrom.correctedLabel}`);
        }
      }

      if (resolvedTo.location) {
        setTo(resolvedTo.location);
        if (resolvedTo.correctedLabel) {
          setToCorrectionHint(`Showing results for ${resolvedTo.correctedLabel}`);
        }
      }

      applySearchParamsToUrl(params);
      await fetchRides(params);
    } catch (err) {
      setSearchError(err?.message || 'Invalid search inputs');
      toast.error(err?.message || 'Invalid search inputs');
    }
  };

  const handleRetry = () => {
    if (!lastSearchParams) return;
    fetchRides(lastSearchParams);
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation not supported');
      return;
    }

    if (locating) return;

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(String(position.coords.latitude));
        setLng(String(position.coords.longitude));
        if (!radiusKm) setRadiusKm('10');
        setLocating(false);
        toast.success('Current location added');
      },
      () => {
        setLocating(false);
        toast.error('Location permission denied. You can still search manually.');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      }
    );
  };

  const applyHistoryItem = (item) => {
    setFrom(getLocationFromParams(item?.source, item?.fromLat, item?.fromLng));
    setTo(getLocationFromParams(item?.destination, item?.toLat, item?.toLng));
    setDateTime(item?.dateTime || '');

    const filters = item?.filters || {};
    setVehicleType(filters.vehicleType || '');
    setMinPrice(filters.minPrice || '');
    setMaxPrice(filters.maxPrice || '');
    setSeats(filters.seats || '');
    setRadiusKm(filters.radiusKm || '');
    setSort(filters.sort || 'departure_time');
    setPreferenceFilters(filters.preferenceFilters || {
      womenOnly: false,
      verifiedOnly: false,
      smokingAllowed: false,
      musicAllowed: false,
      petsAllowed: false,
      acAvailable: false,
      genderPreference: '',
    });
    setFromCorrectionHint('');
    setToCorrectionHint('');
    closeAllDropdowns();
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

    const defaultFilters = {
      womenOnly: false,
      verifiedOnly: false,
      smokingAllowed: false,
      musicAllowed: false,
      petsAllowed: false,
      acAvailable: false,
      genderPreference: '',
    };

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
      radiusKm: searchParams.get('radiusKm') || '',
      sort: searchParams.get('sort') || 'departure_time',
      lat: searchParams.get('lat') || '',
      lng: searchParams.get('lng') || '',
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
      Boolean(paramsFromUrl.vehicleType || paramsFromUrl.minPrice || paramsFromUrl.maxPrice || paramsFromUrl.seats || paramsFromUrl.radiusKm) ||
      Boolean(paramsFromUrl.lat || paramsFromUrl.lng || paramsFromUrl.fromLat || paramsFromUrl.fromLng || paramsFromUrl.toLat || paramsFromUrl.toLng) ||
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
      setRadiusKm(paramsFromUrl.radiusKm);
      setSort(paramsFromUrl.sort);
      setLat(paramsFromUrl.lat);
      setLng(paramsFromUrl.lng);
      setPreferenceFilters(paramsFromUrl.preferenceFilters);
      setFromCorrectionHint('');
      setToCorrectionHint('');
      closeAllDropdowns();

      const initialParams = {
        page: Number(searchParams.get('page') || 1),
        limit: Number(searchParams.get('limit') || 30),
        sort: paramsFromUrl.sort,
      };
      if (paramsFromUrl.from) initialParams.from = paramsFromUrl.from;
      if (paramsFromUrl.to) initialParams.to = paramsFromUrl.to;
      if (paramsFromUrl.fromLat !== '' && paramsFromUrl.fromLng !== '') {
        initialParams.fromLat = Number(paramsFromUrl.fromLat);
        initialParams.fromLng = Number(paramsFromUrl.fromLng);
      }
      if (paramsFromUrl.toLat !== '' && paramsFromUrl.toLng !== '') {
        initialParams.toLat = Number(paramsFromUrl.toLat);
        initialParams.toLng = Number(paramsFromUrl.toLng);
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
      if (paramsFromUrl.lat !== '' && paramsFromUrl.lng !== '') {
        initialParams.lat = Number(paramsFromUrl.lat);
        initialParams.lng = Number(paramsFromUrl.lng);
      }
      if (paramsFromUrl.radiusKm !== '') initialParams.radiusKm = Number(paramsFromUrl.radiusKm);
      Object.entries(paramsFromUrl.preferenceFilters).forEach(([key, value]) => {
        if (value !== '' && value !== false) initialParams[key] = value;
      });

      const shouldAutoSearchFromUrl =
        Boolean(paramsFromUrl.from || paramsFromUrl.to || paramsFromUrl.date || paramsFromUrl.dateTime) ||
        Boolean(paramsFromUrl.vehicleType || paramsFromUrl.minPrice || paramsFromUrl.maxPrice || paramsFromUrl.seats || paramsFromUrl.radiusKm) ||
        Object.values(paramsFromUrl.preferenceFilters).some((v) => v !== '' && v !== false);

      if (shouldAutoSearchFromUrl) {
        fetchRides(initialParams);
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
        setRadiusKm(parsed?.radiusKm || '');
        setSort(parsed?.sort || 'departure_time');
        setLat(parsed?.lat || '');
        setLng(parsed?.lng || '');
        setPreferenceFilters(parsed?.preferenceFilters || defaultFilters);
        setFromCorrectionHint('');
        setToCorrectionHint('');
        closeAllDropdowns();

        const hasMeaningfulSavedState =
          Boolean(restoredFrom || restoredTo || parsed?.dateTime) ||
          Boolean(parsed?.vehicleType || parsed?.minPrice || parsed?.maxPrice || parsed?.seats || parsed?.radiusKm) ||
          Object.values(parsed?.preferenceFilters || {}).some((v) => v !== '' && v !== false);

        if (hasMeaningfulSavedState) {
          const initialParams = {
            page: 1,
            limit: 30,
            sort: parsed?.sort || 'departure_time',
          };
          if (parsed?.fromText) initialParams.from = parsed.fromText;
          if (parsed?.toText) initialParams.to = parsed.toText;
          if (parsed?.fromLat !== null && parsed?.fromLng !== null) {
            initialParams.fromLat = Number(parsed.fromLat);
            initialParams.fromLng = Number(parsed.fromLng);
          }
          if (parsed?.toLat !== null && parsed?.toLng !== null) {
            initialParams.toLat = Number(parsed.toLat);
            initialParams.toLng = Number(parsed.toLng);
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
          if (parsed?.lat !== '' && parsed?.lng !== '') {
            initialParams.lat = Number(parsed.lat);
            initialParams.lng = Number(parsed.lng);
          }
          if (parsed?.radiusKm !== '') initialParams.radiusKm = Number(parsed.radiusKm);
          Object.entries(parsed?.preferenceFilters || {}).forEach(([key, value]) => {
            if (value !== '' && value !== false) initialParams[key] = value;
          });

          fetchRides(initialParams);
          return;
        }
      } catch {
        // ignore invalid state
      }
    }

    if (!navigator.geolocation) {
      fetchRides({ page: 1, limit: 30, sort: 'departure_time' });
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const detectedLat = position.coords.latitude;
        const detectedLng = position.coords.longitude;
        const detectedRadius = Number(radiusKm) > 0 ? Number(radiusKm) : 10;

        setLat(String(detectedLat));
        setLng(String(detectedLng));
        if (!radiusKm) setRadiusKm(String(detectedRadius));

        fetchNearbyRides({
          lat: detectedLat,
          lng: detectedLng,
          radius: Math.min(50, Math.max(1, detectedRadius)),
        });
        setLocating(false);
      },
      () => {
        setLocating(false);
        fetchRides({ page: 1, limit: 30, sort: 'departure_time' });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 2 * 60 * 1000,
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 md:px-8">
      <section className="mx-auto max-w-7xl">
        <div className="mb-8">
          <p className="font-semibold text-emerald-600">Find rides</p>
          <h1 className="mt-1 text-3xl font-black text-slate-900 md:text-5xl">
            Search available rides
          </h1>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mb-8 grid gap-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 md:grid-cols-2 lg:grid-cols-4"
        >
          <LocationSearch
            label="From"
            value={from}
            onChange={setFrom}
            placeholder="Source location"
            disabled={loading}
            closeSignal={closeSuggestionsSignal}
            isActive={activeLocationDropdown === 'from'}
            onActivate={() => setActiveLocationDropdown('from')}
            onCloseAll={() => setActiveLocationDropdown(null)}
          />

          <LocationSearch
            label="To"
            value={to}
            onChange={setTo}
            placeholder="Destination location"
            disabled={loading}
            closeSignal={closeSuggestionsSignal}
            isActive={activeLocationDropdown === 'to'}
            onActivate={() => setActiveLocationDropdown('to')}
            onCloseAll={() => setActiveLocationDropdown(null)}
          />

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Date/Time
            </label>
            <input
              type="datetime-local"
              value={dateTime}
              disabled={loading}
              onChange={(e) => setDateTime(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Vehicle Type
            </label>
            <select
              value={vehicleType}
              disabled={loading}
              onChange={(e) => setVehicleType(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">Any</option>
              <option value="bike">Bike</option>
              <option value="car">Car</option>
              <option value="auto">Auto</option>
              <option value="van">Van</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Min Price
            </label>
            <input
              type="number"
              min="0"
              value={minPrice}
              disabled={loading}
              onChange={(e) => setMinPrice(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="Any"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Max Price
            </label>
            <input
              type="number"
              min="0"
              value={maxPrice}
              disabled={loading}
              onChange={(e) => setMaxPrice(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="Any"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Available Seats
            </label>
            <select
              value={seats}
              disabled={loading}
              onChange={(e) => setSeats(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">Any</option>
              <option value="1">1+</option>
              <option value="2">2+</option>
              <option value="3">3+</option>
              <option value="4">4+</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Sort
            </label>
            <select
              value={sort}
              disabled={loading}
              onChange={(e) => setSort(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="departure_time">Departure Time</option>
              <option value="nearest">Nearest</option>
              <option value="price_low">Price Low</option>
              <option value="price_high">Price High</option>
              <option value="newest">Newest</option>
            </select>
          </div>

          <div className="lg:col-span-2">
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Distance Near Me (km)
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                min="1"
                value={radiusKm}
                disabled={loading}
                onChange={(e) => setRadiusKm(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="Any"
              />
              <button
                type="button"
                onClick={useCurrentLocation}
                disabled={locating || loading}
                className="whitespace-nowrap rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="inline-flex items-center gap-2">
                  <LocateFixed size={16} />
                  {locating ? 'Locating...' : 'Use my location'}
                </span>
              </button>
            </div>
          </div>

          <div className="lg:col-span-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-3 text-sm font-black text-slate-700">Safety & Comfort Filters</p>
            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
              {[
                ['womenOnly', 'Women-only'],
                ['verifiedOnly', 'Verified-only'],
                ['smokingAllowed', 'Smoking allowed'],
                ['musicAllowed', 'Music allowed'],
                ['petsAllowed', 'Pets allowed'],
                ['acAvailable', 'AC available'],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm font-semibold">
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(preferenceFilters[key])}
                    disabled={loading}
                    onChange={(e) => setPreferenceFilters((prev) => ({ ...prev, [key]: e.target.checked }))}
                    className="h-4 w-4 accent-emerald-600"
                  />
                </label>
              ))}
              <select
                value={preferenceFilters.genderPreference}
                disabled={loading}
                onChange={(e) => setPreferenceFilters((prev) => ({ ...prev, genderPreference: e.target.value }))}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">Any gender preference</option>
                <option value="male">Male preference</option>
                <option value="female">Female preference</option>
              </select>
            </div>
          </div>

          <div className="lg:col-span-2 flex items-end">
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Search size={18} />
              {loading ? 'Searching rides...' : 'Search Rides'}
            </button>
          </div>
        </form>

        {fromCorrectionHint || toCorrectionHint ? (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
            {[fromCorrectionHint, toCorrectionHint].filter(Boolean).join(' | ')}
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

        {nearbyMode ? (
          <p className="mb-6 text-sm font-bold text-emerald-700">
            Near you {nearbyCount} rides available
          </p>
        ) : null}

        {loading ? (
          <div className="rounded-3xl bg-white p-10 text-center text-slate-600 shadow-sm ring-1 ring-slate-200">
            Searching rides...
          </div>
        ) : searchError ? (
          <ErrorState message={searchError} onRetry={handleRetry} />
        ) : rides.length ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {rides.map((ride) => (
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
      </section>
    </main>
  );
};

export default FindRide;
