import { useEffect, useRef } from 'react';

export const useLiveLocation = ({
  socket,
  rideId,
  enabled = true,
  onPosition,
}) => {
  const watchIdRef = useRef(null);

  useEffect(() => {
    if (!enabled || !socket || !rideId || !navigator.geolocation) return undefined;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const payload = {
          rideId,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          heading:
            position.coords.heading === null || position.coords.heading === undefined
              ? null
              : Number(position.coords.heading),
          speed:
            position.coords.speed === null || position.coords.speed === undefined
              ? null
              : Number(position.coords.speed),
        };

        socket.emit('location:update', payload);
        if (onPosition) onPosition(payload);
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
  }, [enabled, onPosition, rideId, socket]);
};
