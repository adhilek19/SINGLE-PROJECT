import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Marker,
  Popup,
  useMap,
} from 'react-leaflet';
import { MapPin, Navigation, Route } from 'lucide-react';

const isValidLocation = (location) => {
  const lat = Number(location?.lat);
  const lng = Number(location?.lng);

  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
};

const FitBounds = ({ source, destination, liveLocations = [] }) => {
  const map = useMap();

  useEffect(() => {
    const points = [];

    if (isValidLocation(source)) points.push([Number(source.lat), Number(source.lng)]);
    if (isValidLocation(destination)) points.push([Number(destination.lat), Number(destination.lng)]);

    liveLocations.filter(isValidLocation).forEach((loc) => {
      points.push([Number(loc.lat), Number(loc.lng)]);
    });

    if (points.length < 2) return;

    map.fitBounds(points, { padding: [40, 40] });
  }, [map, source, destination, liveLocations]);

  return null;
};

const decodePolyline = (encoded) => {
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;
  const coordinates = [];

  while (index < len) {
    let b;
    let shift = 0;
    let result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    shift = 0;
    result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    coordinates.push([lat / 1e5, lng / 1e5]);
  }

  return coordinates;
};

const formatDuration = (seconds) => {
  if (!seconds) return 'N/A';

  const minutes = Math.round(seconds / 60);

  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  return mins ? `${hours} hr ${mins} min` : `${hours} hr`;
};

const getSpeedKmh = (loc = {}) => {
  const direct = Number(loc.speedKmh);
  if (Number.isFinite(direct) && direct >= 0) return direct;

  const speedMps = Number(loc.speed);
  if (Number.isFinite(speedMps) && speedMps >= 0) return speedMps * 3.6;

  return null;
};

const formatSpeedKmh = (loc = {}) => {
  const speed = getSpeedKmh(loc);
  if (!Number.isFinite(speed)) return 'Speed N/A';
  return `${Math.round(speed)} km/h`;
};

const getLocationUser = (loc = {}) => {
  const user = loc.user && typeof loc.user === 'object' ? loc.user : {};

  return {
    id: loc.userId || user._id || loc.user || `${loc.role || 'user'}-${loc.updatedAt || Math.random()}`,
    name: loc.name || loc.displayName || user.name || (loc.role === 'driver' ? 'Driver' : 'Passenger'),
    photo:
      loc.profilePic ||
      loc.profilePhoto ||
      user.profilePic ||
      user.profilePhoto ||
      '',
  };
};

const getLocationKey = (loc = {}) => {
  const user = loc.user && typeof loc.user === 'object' ? loc.user : {};
  return (
    loc.userId ||
    user._id ||
    loc.user ||
    `${loc.role || 'user'}-${loc.name || ''}`
  );
};

const getInitials = (name = 'User') =>
  String(name)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() || '')
    .join('') || 'U';

const createUserPhotoIcon = ({ photo, name, role, speedText }) => {
  const initials = getInitials(name);
  const roleClass = role === 'driver' ? 'driver' : 'passenger';
  const safeName = String(name || 'User').replace(/"/g, '&quot;');
  const hasPhoto = Boolean(photo);

  return L.divIcon({
    className: 'custom-user-photo-marker',
    html: `
      <div class="user-photo-pin user-photo-pin--${roleClass}" title="${safeName}">
        ${
          hasPhoto
            ? `<img src="${photo}" alt="${safeName}" loading="lazy" />`
            : `<span>${initials}</span>`
        }
      </div>
      <div class="user-photo-label user-photo-label--${roleClass}">${role === 'driver' ? 'Driver' : 'Passenger'}${speedText ? ` • ${speedText}` : ''}</div>
    `,
    iconSize: [92, 78],
    iconAnchor: [46, 60],
    popupAnchor: [0, -58],
  });
};

const LiveLocationMarkers = ({ locations = [] }) => {
  const validLocations = locations.filter(isValidLocation);

  return (
    <>
      {validLocations.map((loc) => {
        const user = getLocationUser(loc);
        const role = loc.role === 'driver' ? 'driver' : 'passenger';
        const speedText = formatSpeedKmh(loc);

        return (
          <Marker
            key={`${user.id}-${role}`}
            position={[Number(loc.lat), Number(loc.lng)]}
            icon={createUserPhotoIcon({ photo: user.photo, name: user.name, role, speedText })}
          >
            <Popup>
              <strong>{user.name}</strong>
              <br />
              {role === 'driver' ? 'Driver live location' : 'Passenger live location'}
              <br />
              <strong>{speedText}</strong>
              <br />
              <span>
                {Number(loc.lat).toFixed(5)}, {Number(loc.lng).toFixed(5)}
              </span>
              {loc.updatedAt ? (
                <>
                  <br />
                  <small>Updated: {new Date(loc.updatedAt).toLocaleTimeString()}</small>
                </>
              ) : null}
            </Popup>
          </Marker>
        );
      })}
    </>
  );
};

const RouteMap = ({ source, destination, liveLocations = [], height = '360px' }) => {
  const [routeCoords, setRouteCoords] = useState([]);
  const [distanceKm, setDistanceKm] = useState(null);
  const [durationText, setDurationText] = useState('');
  const [routeError, setRouteError] = useState('');
  const [loading, setLoading] = useState(false);
  const [smoothedLiveLocations, setSmoothedLiveLocations] = useState([]);
  const [liveRouteCoords, setLiveRouteCoords] = useState([]);
  const [liveDistanceKm, setLiveDistanceKm] = useState(null);
  const [liveEtaText, setLiveEtaText] = useState('');
  const [liveRouteError, setLiveRouteError] = useState('');
  const liveLocationMapRef = useRef(new Map());
  const liveAnimationFrameRef = useRef(new Map());

  const isValid = isValidLocation(source) && isValidLocation(destination);

  const center = useMemo(() => {
    if (!isValid) return [10.8505, 76.2711];

    return [
      (Number(source.lat) + Number(destination.lat)) / 2,
      (Number(source.lng) + Number(destination.lng)) / 2,
    ];
  }, [isValid, source, destination]);

  useEffect(
    () => () => {
      liveAnimationFrameRef.current.forEach((frameId) =>
        cancelAnimationFrame(frameId)
      );
      liveAnimationFrameRef.current.clear();
    },
    []
  );

  useEffect(() => {
    const validIncoming = liveLocations
      .filter(isValidLocation)
      .map((loc) => ({
        ...loc,
        _locationKey: getLocationKey(loc),
      }));

    const incomingKeys = new Set(validIncoming.map((loc) => loc._locationKey));

    // Remove users that are no longer present in incoming live data.
    Array.from(liveLocationMapRef.current.keys()).forEach((key) => {
      if (!incomingKeys.has(key)) {
        const activeFrame = liveAnimationFrameRef.current.get(key);
        if (activeFrame) cancelAnimationFrame(activeFrame);
        liveAnimationFrameRef.current.delete(key);
        liveLocationMapRef.current.delete(key);
      }
    });

    validIncoming.forEach((incoming) => {
      const key = incoming._locationKey;
      const previous = liveLocationMapRef.current.get(key);
      const targetLat = Number(incoming.lat);
      const targetLng = Number(incoming.lng);

      if (!previous || !isValidLocation(previous)) {
        liveLocationMapRef.current.set(key, incoming);
        return;
      }

      const startLat = Number(previous.lat);
      const startLng = Number(previous.lng);
      const hasMoved =
        Math.abs(targetLat - startLat) > 0.00001 ||
        Math.abs(targetLng - startLng) > 0.00001;

      if (!hasMoved) {
        liveLocationMapRef.current.set(key, { ...previous, ...incoming });
        return;
      }

      const runningFrame = liveAnimationFrameRef.current.get(key);
      if (runningFrame) {
        cancelAnimationFrame(runningFrame);
        liveAnimationFrameRef.current.delete(key);
      }

      const durationMs = 900;
      const startedAt = performance.now();

      const animate = (now) => {
        const progress = Math.min(1, (now - startedAt) / durationMs);
        const eased =
          progress < 0.5
            ? 2 * progress * progress
            : 1 - ((-2 * progress + 2) ** 2) / 2;

        const nextLat = startLat + (targetLat - startLat) * eased;
        const nextLng = startLng + (targetLng - startLng) * eased;

        liveLocationMapRef.current.set(key, {
          ...incoming,
          lat: nextLat,
          lng: nextLng,
        });
        setSmoothedLiveLocations(Array.from(liveLocationMapRef.current.values()));

        if (progress < 1) {
          const frameId = requestAnimationFrame(animate);
          liveAnimationFrameRef.current.set(key, frameId);
        } else {
          liveAnimationFrameRef.current.delete(key);
        }
      };

      const frameId = requestAnimationFrame(animate);
      liveAnimationFrameRef.current.set(key, frameId);
    });

    setSmoothedLiveLocations(Array.from(liveLocationMapRef.current.values()));
  }, [liveLocations]);

  const driverLiveLocation = useMemo(
    () => smoothedLiveLocations.find((loc) => loc.role === 'driver'),
    [smoothedLiveLocations]
  );

  useEffect(() => {
    if (!isValid || !isValidLocation(driverLiveLocation)) {
      setLiveRouteCoords([]);
      setLiveDistanceKm(null);
      setLiveEtaText('');
      setLiveRouteError('');
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const srcLng = Number(driverLiveLocation.lng);
        const srcLat = Number(driverLiveLocation.lat);
        const destLng = Number(destination.lng);
        const destLat = Number(destination.lat);

        const url = `https://router.project-osrm.org/route/v1/driving/${srcLng},${srcLat};${destLng},${destLat}?overview=full&geometries=polyline`;
        const res = await fetch(url, { signal: controller.signal });
        const data = await res.json();
        const route = data?.routes?.[0];

        if (!route) {
          setLiveRouteCoords([]);
          setLiveDistanceKm(null);
          setLiveEtaText('');
          setLiveRouteError('Live route is currently unavailable.');
          return;
        }

        setLiveRouteCoords(decodePolyline(route.geometry));
        setLiveDistanceKm((route.distance / 1000).toFixed(1));
        setLiveEtaText(formatDuration(route.duration));
        setLiveRouteError('');
      } catch {
        setLiveRouteCoords([]);
        setLiveDistanceKm(null);
        setLiveEtaText('');
        setLiveRouteError('Live ETA is currently unavailable.');
      }
    }, 200);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [driverLiveLocation, destination, isValid]);

  useEffect(() => {
    const fetchRoute = async () => {
      if (!isValid) return;

      try {
        setLoading(true);
        setRouteError('');

        const srcLng = Number(source.lng);
        const srcLat = Number(source.lat);
        const destLng = Number(destination.lng);
        const destLat = Number(destination.lat);

        const url = `https://router.project-osrm.org/route/v1/driving/${srcLng},${srcLat};${destLng},${destLat}?overview=full&geometries=polyline`;

        const res = await fetch(url);
        const data = await res.json();

        const route = data?.routes?.[0];

        if (!route) {
          setRouteCoords([
            [srcLat, srcLng],
            [destLat, destLng],
          ]);
          setDistanceKm(null);
          setDurationText('');
          setRouteError('Route provider returned no path. Showing straight line.');
          return;
        }

        setRouteCoords(decodePolyline(route.geometry));
        setDistanceKm((route.distance / 1000).toFixed(1));
        setDurationText(formatDuration(route.duration));
        setRouteError('');
      } catch {
        setRouteCoords([
          [Number(source.lat), Number(source.lng)],
          [Number(destination.lat), Number(destination.lng)],
        ]);
        setRouteError('Unable to load route details. Showing straight line.');
      } finally {
        setLoading(false);
      }
    };

    fetchRoute();
  }, [isValid, source, destination]);

  if (!isValid) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
        <MapPin className="w-10 h-10 mx-auto text-slate-400" />
        <p className="mt-3 font-bold text-slate-700">Map not available</p>
        <p className="text-sm text-slate-500">
          Source and destination coordinates are missing.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl overflow-hidden border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border-b border-slate-200">
        <div>
          <h3 className="font-black text-slate-900 flex items-center gap-2">
            <Route className="w-5 h-5 text-blue-600" />
            Route Map
          </h3>

          <p className="text-sm text-slate-500">
            {loading
              ? 'Calculating route...'
              : 'Source, destination, live route, profile markers and speed'}
          </p>
          {!loading && (routeError || liveRouteError) ? (
            <p className="mt-1 text-xs font-semibold text-rose-600">
              {[routeError, liveRouteError].filter(Boolean).join(' ')}
            </p>
          ) : null}
        </div>

        <div className="flex gap-2 text-xs font-bold">
          <span className="px-3 py-1.5 rounded-full bg-blue-50 text-blue-700">
            {liveDistanceKm
              ? `${liveDistanceKm} km remaining`
              : distanceKm
                ? `${distanceKm} km`
                : 'Distance N/A'}
          </span>

          <span className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700">
            {liveEtaText ? `ETA ${liveEtaText}` : durationText || 'ETA N/A'}
          </span>
        </div>
      </div>

      <div style={{ height }} className="w-full">
        <MapContainer
          center={center}
          zoom={11}
          scrollWheelZoom={false}
          className="w-full h-full z-0"
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <FitBounds
            source={source}
            destination={destination}
            liveLocations={smoothedLiveLocations}
          />

          <CircleMarker
            center={[Number(source.lat), Number(source.lng)]}
            radius={9}
            pathOptions={{
              color: '#2563eb',
              fillColor: '#2563eb',
              fillOpacity: 1,
            }}
          >
            <Popup>
              <strong>Source</strong>
              <br />
              {source.name}
            </Popup>
          </CircleMarker>

          <CircleMarker
            center={[Number(destination.lat), Number(destination.lng)]}
            radius={9}
            pathOptions={{
              color: '#dc2626',
              fillColor: '#dc2626',
              fillOpacity: 1,
            }}
          >
            <Popup>
              <strong>Destination</strong>
              <br />
              {destination.name}
            </Popup>
          </CircleMarker>

          {routeCoords.length > 0 && (
            <Polyline
              positions={routeCoords}
              pathOptions={{
                color: '#2563eb',
                weight: 5,
                opacity: 0.85,
              }}
            />
          )}

          {liveRouteCoords.length > 0 && (
            <Polyline
              positions={liveRouteCoords}
              pathOptions={{
                color: '#10b981',
                weight: 4,
                opacity: 0.95,
                dashArray: '8 8',
              }}
            />
          )}

          {smoothedLiveLocations.some(isValidLocation) && (
            <LiveLocationMarkers locations={smoothedLiveLocations} />
          )}
        </MapContainer>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 p-4 bg-slate-50">
        <div className="flex items-start gap-2">
          <MapPin className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-500">From</p>
            <p className="text-sm font-semibold text-slate-800 truncate">
              {source.name}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <Navigation className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-500">To</p>
            <p className="text-sm font-semibold text-slate-800 truncate">
              {destination.name}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RouteMap;
