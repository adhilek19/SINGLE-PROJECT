import { useEffect, useRef } from 'react';

const toRad = (value) => (Number(value) * Math.PI) / 180;

const distanceMeters = (a, b) => {
  if (!a || !b) return 0;

  const lat1 = Number(a.lat);
  const lng1 = Number(a.lng);
  const lat2 = Number(b.lat);
  const lng2 = Number(b.lng);

  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return 0;

  const earthRadius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  return earthRadius * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

const getSpeedKmh = ({ coords, previous }) => {
  const browserSpeedMps = Number(coords.speed);

  if (Number.isFinite(browserSpeedMps) && browserSpeedMps >= 0) {
    return Number((browserSpeedMps * 3.6).toFixed(1));
  }

  if (!previous) return 0;

  const current = {
    lat: coords.latitude,
    lng: coords.longitude,
    timestamp: Date.now(),
  };

  const seconds = Math.max(0, (current.timestamp - previous.timestamp) / 1000);
  const meters = distanceMeters(previous, current);

  // Avoid noisy GPS jumps / instant zero-time calculations.
  if (seconds < 2 || meters < 3) return 0;

  const kmh = (meters / seconds) * 3.6;
  return Number(Math.min(kmh, 250).toFixed(1));
};

export const useLiveLocation = ({
  socket,
  rideId,
  enabled = true,
  onPosition,
}) => {
  const watchIdRef = useRef(null);
  const previousPositionRef = useRef(null);
  const onPositionRef = useRef(onPosition);

  useEffect(() => {
    onPositionRef.current = onPosition;
  }, [onPosition]);

  useEffect(() => {
    if (!enabled || !socket || !rideId || !navigator.geolocation) return undefined;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const speedKmh = getSpeedKmh({
          coords: position.coords,
          previous: previousPositionRef.current,
        });

        const payload = {
          rideId,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy:
            position.coords.accuracy === null || position.coords.accuracy === undefined
              ? null
              : Number(position.coords.accuracy),
          heading:
            position.coords.heading === null || position.coords.heading === undefined
              ? null
              : Number(position.coords.heading),
          // Browser Geolocation speed is meters/second. Backend also receives speedKmh for UI.
          speed:
            position.coords.speed === null || position.coords.speed === undefined
              ? null
              : Number(position.coords.speed),
          speedKmh,
        };

        previousPositionRef.current = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          timestamp: Date.now(),
        };

        socket.emit('location:update', payload);
        if (onPositionRef.current) onPositionRef.current(payload);
      },
      () => {},
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 10000,
      }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [enabled, rideId, socket]);
};
