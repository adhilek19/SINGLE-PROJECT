const EARTH_RADIUS_KM = 6371;

export const toNumber = (value, fallback = null) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const hasValidCoords = (location) =>
  location &&
  Number.isFinite(Number(location.lat)) &&
  Number.isFinite(Number(location.lng));

export const haversineKm = (a, b) => {
  if (!hasValidCoords(a) || !hasValidCoords(b)) return null;

  const lat1 = Number(a.lat);
  const lng1 = Number(a.lng);
  const lat2 = Number(b.lat);
  const lng2 = Number(b.lng);

  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const rLat1 = (lat1 * Math.PI) / 180;
  const rLat2 = (lat2 * Math.PI) / 180;

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);

  const h =
    sinLat * sinLat +
    Math.cos(rLat1) * Math.cos(rLat2) * sinLng * sinLng;

  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

export const normalizeDateRange = ({ date, fromTime, toTime }) => {
  if (!date && !fromTime && !toTime) {
    return {
      start: new Date(),
      end: null,
    };
  }

  if (fromTime || toTime) {
    return {
      start: fromTime ? new Date(fromTime) : new Date(),
      end: toTime ? new Date(toTime) : null,
    };
  }

  const selected = new Date(date);
  const start = new Date(selected);
  start.setHours(0, 0, 0, 0);

  const end = new Date(selected);
  end.setHours(23, 59, 59, 999);

  return { start, end };
};

export const calculateTimeDiffHours = (rideTime, targetTime) => {
  if (!rideTime || !targetTime) return null;

  const a = new Date(rideTime).getTime();
  const b = new Date(targetTime).getTime();

  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

  return Math.abs(a - b) / (1000 * 60 * 60);
};

export const calculateMatchScore = ({
  sourceDistanceKm,
  destinationDistanceKm,
  timeDiffHours,
  sourceRadiusKm = 10,
  destinationRadiusKm = 15,
  timeWindowHours = 3,
}) => {
  let score = 0;

  if (sourceDistanceKm !== null && sourceDistanceKm !== undefined) {
    const sourceScore = Math.max(
      0,
      45 - (sourceDistanceKm / sourceRadiusKm) * 45
    );
    score += sourceScore;
  }

  if (
    destinationDistanceKm !== null &&
    destinationDistanceKm !== undefined
  ) {
    const destinationScore = Math.max(
      0,
      35 - (destinationDistanceKm / destinationRadiusKm) * 35
    );
    score += destinationScore;
  }

  if (timeDiffHours !== null && timeDiffHours !== undefined) {
    const timeScore = Math.max(
      0,
      20 - (timeDiffHours / timeWindowHours) * 20
    );
    score += timeScore;
  } else {
    score += 10;
  }

  return Math.round(Math.min(100, Math.max(0, score)));
};

export const getMatchLabel = (score) => {
  if (score >= 80) return 'Best Match';
  if (score >= 60) return 'Good Match';
  if (score >= 40) return 'Possible Match';
  return 'Low Match';
};