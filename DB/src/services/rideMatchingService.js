import { rideRepository } from '../repositories/rideRepository.js';
import { userRepository } from '../repositories/userRepository.js';
import {
  calculateMatchScore,
  calculateTimeDiffHours,
  getMatchLabel,
  haversineKm,
  hasValidCoords,
  normalizeDateRange,
  toNumber,
} from '../utils/matchUtils.js';
import { BadRequest } from '../utils/AppError.js';

const buildLocation = (lat, lng, name = '') => ({
  lat: Number(lat),
  lng: Number(lng),
  name,
});

export const rideMatchingService = {
  async nearby({
    lat,
    lng,
    radiusKm = 10,
    vehicleType,
    seats,
    page = 1,
    limit = 30,
    userId,
  }) {
    const source = buildLocation(lat, lng);

    if (!hasValidCoords(source)) {
      throw BadRequest('Valid lat and lng are required');
    }

    const radiusNum = toNumber(radiusKm, 10);
    if (!Number.isFinite(radiusNum) || radiusNum <= 0) {
      throw BadRequest('radiusKm must be a positive number');
    }
    if (radiusNum > 50) {
      throw BadRequest('radiusKm cannot be more than 50');
    }

    const blockedUserIds = userId ? await userRepository.getBlockedUserIds(userId) : [];

    const result = await rideRepository.findNearbyBySourcePoint({
      lat: source.lat,
      lng: source.lng,
      radiusKm: radiusNum,
      vehicleType,
      seats: toNumber(seats, null),
      page: toNumber(page, 1),
      limit: toNumber(limit, 30),
      excludeDriverId: userId,
      excludeDriverIds: blockedUserIds,
    });

    return {
      ...result,
      rides: (result.rides || []).map((ride) => ({
        ...ride,
        match: {
          score: Math.max(
            30,
            Math.round(100 - Math.min(100, (ride.sourceDistanceKm || 0) * 6))
          ),
          label:
            (ride.sourceDistanceKm || 0) <= 3
              ? 'Nearby'
              : 'Near your location',
          sourceDistanceKm: ride.sourceDistanceKm ?? null,
          destinationDistanceKm: null,
          timeDiffHours: null,
        },
      })),
    };
  },

  async match({
    sourceLat,
    sourceLng,
    destinationLat,
    destinationLng,
    departureTime,
    date,
    radiusKm = 10,
    destinationRadiusKm = 20,
    timeWindowHours = 3,
    limit = 40,
    userId,
  }) {
    const source = buildLocation(sourceLat, sourceLng);
    const destination = buildLocation(destinationLat, destinationLng);

    if (!hasValidCoords(source)) {
      throw BadRequest('Valid sourceLat and sourceLng are required');
    }

    const blockedUserIds = userId ? await userRepository.getBlockedUserIds(userId) : [];

    const nearbyResult = await rideRepository.findNearbyBySourcePoint({
      lat: source.lat,
      lng: source.lng,
      radiusKm: toNumber(radiusKm, 10),
      limit: Math.max(toNumber(limit, 40), 40),
      excludeDriverId: userId,
      excludeDriverIds: blockedUserIds,
    });
    const rides = nearbyResult?.rides || [];

    const hasDestination = hasValidCoords(destination);

    const selectedTime = departureTime || date || null;

    const { start, end } = normalizeDateRange({
      date,
      fromTime: null,
      toTime: null,
    });

    const filtered = rides
      .map((ride) => {
        const sourceDistanceKm =
          ride.sourceDistanceKm ??
          haversineKm(source, ride.source);

        const destinationDistanceKm = hasDestination
          ? haversineKm(destination, ride.destination)
          : null;

        const timeDiffHours = selectedTime
          ? calculateTimeDiffHours(ride.departureTime, selectedTime)
          : null;

        const matchScore = calculateMatchScore({
          sourceDistanceKm,
          destinationDistanceKm,
          timeDiffHours,
          sourceRadiusKm: toNumber(radiusKm, 10),
          destinationRadiusKm: toNumber(destinationRadiusKm, 20),
          timeWindowHours: toNumber(timeWindowHours, 3),
        });

        return {
          ...ride,
          match: {
            score: matchScore,
            label: getMatchLabel(matchScore),
            sourceDistanceKm:
              sourceDistanceKm !== null
                ? Number(sourceDistanceKm.toFixed(2))
                : null,
            destinationDistanceKm:
              destinationDistanceKm !== null
                ? Number(destinationDistanceKm.toFixed(2))
                : null,
            timeDiffHours:
              timeDiffHours !== null
                ? Number(timeDiffHours.toFixed(2))
                : null,
          },
        };
      })
      .filter((ride) => {
        const destinationOk =
          !hasDestination ||
          ride.match.destinationDistanceKm <=
            toNumber(destinationRadiusKm, 20);

        const timeOk =
          !selectedTime ||
          ride.match.timeDiffHours <= toNumber(timeWindowHours, 3);

        const dateOk =
          !date ||
          (new Date(ride.departureTime) >= start &&
            (!end || new Date(ride.departureTime) <= end));

        return destinationOk && timeOk && dateOk;
      })
      .sort((a, b) => {
        if (b.match.score !== a.match.score) {
          return b.match.score - a.match.score;
        }

        return new Date(a.departureTime) - new Date(b.departureTime);
      })
      .slice(0, toNumber(limit, 40));

    return filtered;
  },
};
