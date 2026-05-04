import React, { useEffect, useState } from 'react';
import {
  Calendar,
  Car,
  IndianRupee,
  LocateFixed,
  Search,
  Star,
  Users,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import LocationSearch from '../components/LocationSearch';
import { rideService } from '../services/api';

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

const formatDateTime = (value) => {
  if (!value) return 'Not set';

  return new Date(value).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const RideCard = ({ ride }) => {
  const driver = ride.driverInfo || ride.driver || {};
  const seatsLeft =
    ride.seatsLeft ??
    Math.max(0, Number(ride.seatsAvailable || 0) - Number(ride.bookedSeats || 0));

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

          <p className="mt-1 text-sm text-slate-500">
            by {driver.name || 'Unknown driver'}
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

          <div className="flex flex-wrap gap-2 pt-2">
            {ride.preferences?.womenOnly ? <span className="rounded-full bg-pink-100 px-2 py-1 text-xs font-bold text-pink-700">Women-only</span> : null}
            {ride.preferences?.verifiedOnly ? <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-bold text-blue-700">Verified-only</span> : null}
            {ride.preferences?.acAvailable ? <span className="rounded-full bg-cyan-100 px-2 py-1 text-xs font-bold text-cyan-700">AC</span> : null}
            {ride.preferences?.musicAllowed ? <span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-bold text-violet-700">Music</span> : null}
            {ride.preferences?.petsAllowed ? <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">Pets</span> : null}
          </div>

          {Number.isFinite(Number(ride.distanceMeters)) ? (
            <div className="text-xs font-semibold text-emerald-700">
              {(Number(ride.distanceMeters) / 1000).toFixed(1)} km away
            </div>
          ) : null}
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
        </div>
      </div>
    </div>
  );
};

const FindRide = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [dateTime, setDateTime] = useState(searchParams.get('date') || '');
  const [vehicleType, setVehicleType] = useState(searchParams.get('vehicleType') || '');
  const [minPrice, setMinPrice] = useState(searchParams.get('minPrice') || '');
  const [maxPrice, setMaxPrice] = useState(searchParams.get('maxPrice') || '');
  const [seats, setSeats] = useState(searchParams.get('seats') || '');
  const [radiusKm, setRadiusKm] = useState(searchParams.get('radiusKm') || '');
  const [sort, setSort] = useState(searchParams.get('sort') || 'departure_time');
  const [lat, setLat] = useState(searchParams.get('lat') || '');
  const [lng, setLng] = useState(searchParams.get('lng') || '');
  const [preferenceFilters, setPreferenceFilters] = useState({
    womenOnly: searchParams.get('womenOnly') === 'true',
    verifiedOnly: searchParams.get('verifiedOnly') === 'true',
    smokingAllowed: searchParams.get('smokingAllowed') === 'true',
    musicAllowed: searchParams.get('musicAllowed') === 'true',
    petsAllowed: searchParams.get('petsAllowed') === 'true',
    acAvailable: searchParams.get('acAvailable') === 'true',
    genderPreference: searchParams.get('genderPreference') || '',
  });

  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [nearbyMode, setNearbyMode] = useState(false);
  const [nearbyCount, setNearbyCount] = useState(0);

  const getSearchText = (place) => {
    if (!place) return '';
    if (typeof place === 'string') return place;
    return place.name || place.label || '';
  };

  const normalizeListResponse = (res) => {
    const data = res?.data?.data;
    if (Array.isArray(data?.rides)) return data.rides;
    if (Array.isArray(data)) return data;
    return [];
  };

  const fetchRides = async (params = {}) => {
    try {
      setLoading(true);
      const res = await rideService.getRides(params);
      setRides(normalizeListResponse(res));
      setNearbyMode(false);
      setNearbyCount(0);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to fetch rides');
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
    try {
      setLoading(true);
      const res = await rideService.nearbyRides({
        lat: latValue,
        lng: lngValue,
        radiusKm: radius,
        vehicleType: vehicleType || undefined,
        seats: seats || undefined,
        ...Object.fromEntries(Object.entries(preferenceFilters).filter(([, v]) => v !== false && v !== '')),
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
      toast.error(err?.response?.data?.message || 'Failed to fetch nearby rides');
    } finally {
      setLoading(false);
    }
  };

  const buildParamsFromState = () => {
    const params = {
      page: 1,
      limit: 30,
      sort,
    };

    const fromText = getSearchText(from);
    const toText = getSearchText(to);

    if (fromText) params.from = fromText;
    if (toText) params.to = toText;
    if (dateTime) params.date = dateTime;
    if (vehicleType) params.vehicleType = vehicleType;
    if (minPrice !== '') params.minPrice = Number(minPrice);
    if (maxPrice !== '') params.maxPrice = Number(maxPrice);
    if (seats !== '') params.seats = Number(seats);
    if (lat !== '' && lng !== '') {
      params.lat = Number(lat);
      params.lng = Number(lng);
    }
    if (radiusKm !== '') params.radiusKm = Number(radiusKm);
    Object.entries(preferenceFilters).forEach(([key, value]) => {
      if (value !== false && value !== '') params[key] = value;
    });

    return params;
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const params = buildParamsFromState();
    const next = new URLSearchParams();

    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        next.set(k, String(v));
      }
    });

    setSearchParams(next);
    fetchRides(params);
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation not supported');
      return;
    }

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
        toast.error('Location permission denied');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      }
    );
  };

  useEffect(() => {
    const fromText = searchParams.get('from') || searchParams.get('source') || '';
    const toText =
      searchParams.get('to') || searchParams.get('destination') || '';

    if (fromText) setFrom({ name: fromText });
    if (toText) setTo({ name: toText });

    const initialParams = {
      page: Number(searchParams.get('page') || 1),
      limit: Number(searchParams.get('limit') || 30),
      sort: searchParams.get('sort') || 'departure_time',
    };

    if (fromText) initialParams.from = fromText;
    if (toText) initialParams.to = toText;
    if (searchParams.get('date')) initialParams.date = searchParams.get('date');
    if (searchParams.get('vehicleType')) {
      initialParams.vehicleType = searchParams.get('vehicleType');
    }
    if (searchParams.get('minPrice')) initialParams.minPrice = searchParams.get('minPrice');
    if (searchParams.get('maxPrice')) initialParams.maxPrice = searchParams.get('maxPrice');
    if (searchParams.get('seats')) initialParams.seats = searchParams.get('seats');
    if (searchParams.get('lat')) initialParams.lat = searchParams.get('lat');
    if (searchParams.get('lng')) initialParams.lng = searchParams.get('lng');
    if (searchParams.get('radiusKm')) initialParams.radiusKm = searchParams.get('radiusKm');
    ['womenOnly', 'verifiedOnly', 'smokingAllowed', 'musicAllowed', 'petsAllowed', 'acAvailable', 'genderPreference'].forEach((key) => {
      if (searchParams.get(key)) initialParams[key] = searchParams.get(key);
    });

    fetchRides(initialParams);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;

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
          />

          <LocationSearch
            label="To"
            value={to}
            onChange={setTo}
            placeholder="Destination location"
          />

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Date/Time
            </label>
            <input
              type="datetime-local"
              value={dateTime}
              onChange={(e) => setDateTime(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Vehicle Type
            </label>
            <select
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
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
              onChange={(e) => setMinPrice(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
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
              onChange={(e) => setMaxPrice(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Available Seats
            </label>
            <input
              type="number"
              min="1"
              value={seats}
              onChange={(e) => setSeats(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Sort
            </label>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
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
                onChange={(e) => setRadiusKm(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                placeholder="e.g. 10"
              />
              <button
                type="button"
                onClick={useCurrentLocation}
                disabled={locating}
                className="whitespace-nowrap rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
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
                    onChange={(e) => setPreferenceFilters((prev) => ({ ...prev, [key]: e.target.checked }))}
                    className="h-4 w-4 accent-emerald-600"
                  />
                </label>
              ))}
              <select
                value={preferenceFilters.genderPreference}
                onChange={(e) => setPreferenceFilters((prev) => ({ ...prev, genderPreference: e.target.value }))}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold outline-none"
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
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 font-bold text-white transition hover:bg-slate-800"
            >
              <Search size={18} />
              Search Rides
            </button>
          </div>
        </form>

        {nearbyMode ? (
          <p className="mb-6 text-sm font-bold text-emerald-700">
            Near you {nearbyCount} rides available
          </p>
        ) : null}

        {loading ? (
          <div className="rounded-3xl bg-white p-10 text-center text-slate-600 shadow-sm ring-1 ring-slate-200">
            Loading rides...
          </div>
        ) : rides.length ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {rides.map((ride) => (
              <RideCard key={ride._id} ride={ride} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No rides found"
            message={
              nearbyMode
                ? 'No rides found near you. Try increasing distance or changing location.'
                : 'No rides found for your search. Try nearby locations.'
            }
          />
        )}
      </section>
    </main>
  );
};

export default FindRide;
