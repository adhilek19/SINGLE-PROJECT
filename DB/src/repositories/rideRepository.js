import mongoose from 'mongoose';
import Ride from '../models/Ride.js';

const toObjectId = (id) => new mongoose.Types.ObjectId(id);

const EARTH_RADIUS_KM = 6378.1;
const DEFAULT_SOURCE_RADIUS_KM = 25;
const DEFAULT_DESTINATION_RADIUS_KM = 35;

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeSearchText = (value = '') =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const buildLooseRegex = (value = '') => {
  const normalized = normalizeSearchText(value);
  if (!normalized) return null;

  const compact = normalized.replace(/\s+/g, '');
  if (compact.length >= 3 && compact.length <= 40) {
    return compact.split('').map(escapeRegex).join('[\\s\\S]*');
  }

  return escapeRegex(normalized);
};

const buildTextCondition = (field, value) => {
  const normalized = normalizeSearchText(value);
  if (!normalized) return null;

  const escaped = escapeRegex(normalized);
  const loose = buildLooseRegex(normalized);

  return {
    $or: [
      { [field]: { $regex: escaped, $options: 'i' } },
      ...(loose && loose !== escaped
        ? [{ [field]: { $regex: loose, $options: 'i' } }]
        : []),
    ],
  };
};

const hasValidLatLng = (lat, lng) =>
  Number.isFinite(Number(lat)) &&
  Number.isFinite(Number(lng)) &&
  Math.abs(Number(lat)) <= 90 &&
  Math.abs(Number(lng)) <= 180;

const addGeoWithinCircle = (match, field, lat, lng, radiusKm) => {
  if (!hasValidLatLng(lat, lng)) return;

  const safeRadiusKm = Math.min(
    100,
    Math.max(1, Number(radiusKm) || DEFAULT_DESTINATION_RADIUS_KM)
  );

  match[field] = {
    $geoWithin: {
      $centerSphere: [[Number(lng), Number(lat)], safeRadiusKm / EARTH_RADIUS_KM],
    },
  };
};


const lookupDriver = [
  {
    $lookup: {
      from: 'users',
      localField: 'driver',
      foreignField: '_id',
      as: 'driverInfo',
      pipeline: [
        {
          $project: {
            name: 1,
            email: 1,
            phone: 1,
            profilePic: 1,
            bio: 1,
            rating: 1,
            rideCount: 1,
            isVerified: 1,
            verification: 1,
            safetyPreferences: 1,
          },
        },
      ],
    },
  },
  {
    $unwind: {
      path: '$driverInfo',
      preserveNullAndEmptyArrays: true,
    },
  },
];

const addSeatsLeft = [
  {
    $addFields: {
      seatsLeft: {
        $max: [
          0,
          {
            $subtract: [
              { $ifNull: ['$seatsAvailable', 0] },
              { $ifNull: ['$bookedSeats', 0] },
            ],
          },
        ],
      },
    },
  },
];

const lookupPassengers = [
  {
    $lookup: {
      from: 'users',
      localField: 'passengers.user',
      foreignField: '_id',
      as: 'passengerDetails',
      pipeline: [
        {
          $project: {
            name: 1,
            profilePic: 1,
            rating: 1,
            isVerified: 1,
          },
        },
      ],
    },
  },
];

const lookupReviews = [
  {
    $lookup: {
      from: 'reviews',
      localField: 'reviews',
      foreignField: '_id',
      as: 'reviewDetails',
    },
  },
  {
    $lookup: {
      from: 'users',
      localField: 'reviewDetails.reviewer',
      foreignField: '_id',
      as: 'reviewerUsers',
      pipeline: [
        {
          $project: {
            name: 1,
            profilePic: 1,
            rating: 1,
            isVerified: 1,
          },
        },
      ],
    },
  },
  {
    $addFields: {
      reviewDetails: {
        $map: {
          input: { $ifNull: ['$reviewDetails', []] },
          as: 'review',
          in: {
            $mergeObjects: [
              '$$review',
              {
                reviewerInfo: {
                  $first: {
                    $filter: {
                      input: '$reviewerUsers',
                      as: 'u',
                      cond: { $eq: ['$$u._id', '$$review.reviewer'] },
                    },
                  },
                },
              },
            ],
          },
        },
      },
    },
  },
  {
    $project: {
      reviewerUsers: 0,
    },
  },
];

const lookupReports = [
  {
    $lookup: {
      from: 'reports',
      localField: 'reports',
      foreignField: '_id',
      as: 'reportDetails',
    },
  },
  {
    $addFields: {
      reportCount: {
        $size: {
          $ifNull: ['$reportDetails', []],
        },
      },
    },
  },
];

const getRideAggregateById = (id) =>
  Ride.aggregate([
    {
      $match: {
        _id: toObjectId(id),
      },
    },
    ...lookupDriver,
    ...lookupPassengers,
    ...lookupReviews,
    ...lookupReports,
    ...addSeatsLeft,
  ]).then((items) => items[0] || null);

const buildListMatch = (filters = {}) => {
  const match = {
    departureTime: { $gte: new Date() },
    status: { $in: ['scheduled', 'started'] },
  };

  if (filters.status) {
    match.status = filters.status;
  }

  const hasSourceCoords = hasValidLatLng(
    filters.fromLat ?? filters.sourceLat ?? filters.lat,
    filters.fromLng ?? filters.sourceLng ?? filters.lng
  );
  const hasDestinationCoords = hasValidLatLng(
    filters.toLat ?? filters.destinationLat,
    filters.toLng ?? filters.destinationLng
  );
  const textConditions = [];

  if (filters.sourceText && !hasSourceCoords) {
    const condition = buildTextCondition('source.name', filters.sourceText);
    if (condition) textConditions.push(condition);
  }

  if (filters.destinationText && !hasDestinationCoords) {
    const condition = buildTextCondition('destination.name', filters.destinationText);
    if (condition) textConditions.push(condition);
  }

  if (textConditions.length) {
    match.$and = [...(match.$and || []), ...textConditions];
  }

  if (hasDestinationCoords) {
    addGeoWithinCircle(
      match,
      'destinationPoint',
      filters.toLat ?? filters.destinationLat,
      filters.toLng ?? filters.destinationLng,
      filters.destinationRadiusKm ?? filters.routeRadiusKm ?? DEFAULT_DESTINATION_RADIUS_KM
    );
  }

  if (filters.date) {
    const parsedDate = new Date(filters.date);
    if (!Number.isNaN(parsedDate.getTime())) {
      // If query includes time (e.g. datetime-local), treat it as "from this time onward".
      if (String(filters.date).includes('T')) {
        match.departureTime = {
          $gte: parsedDate,
        };
      } else {
        const start = new Date(parsedDate);
        start.setHours(0, 0, 0, 0);

        const end = new Date(parsedDate);
        end.setHours(23, 59, 59, 999);

        match.departureTime = {
          $gte: start,
          $lte: end,
        };
      }
    }
  }

  if (filters.timeFrom || filters.timeTo) {
    const timeMatch = {};
    if (filters.timeFrom) {
      const fromDate = new Date(filters.timeFrom);
      if (!Number.isNaN(fromDate.getTime())) {
        timeMatch.$gte = fromDate;
      }
    }
    if (filters.timeTo) {
      const toDate = new Date(filters.timeTo);
      if (!Number.isNaN(toDate.getTime())) {
        timeMatch.$lte = toDate;
      }
    }
    if (Object.keys(timeMatch).length > 0) {
      match.departureTime = timeMatch;
    }
  }

  if (filters.minPrice || filters.maxPrice) {
    match.price = {};

    if (filters.minPrice) {
      match.price.$gte = Number(filters.minPrice);
    }

    if (filters.maxPrice) {
      match.price.$lte = Number(filters.maxPrice);
    }
  }

  if (filters.vehicleType) {
    match['vehicle.type'] = filters.vehicleType;
  }

  if (filters.womenOnly !== undefined) {
    match['preferences.womenOnly'] = filters.womenOnly === true || filters.womenOnly === 'true';
  }

  if (filters.verifiedOnly !== undefined) {
    match['preferences.verifiedOnly'] = filters.verifiedOnly === true || filters.verifiedOnly === 'true';
  }

  if (filters.smokingAllowed !== undefined) {
    match['preferences.smokingAllowed'] = filters.smokingAllowed === true || filters.smokingAllowed === 'true';
  }

  if (filters.musicAllowed !== undefined) {
    match['preferences.musicAllowed'] = filters.musicAllowed === true || filters.musicAllowed === 'true';
  }

  if (filters.petsAllowed !== undefined) {
    match['preferences.petsAllowed'] = filters.petsAllowed === true || filters.petsAllowed === 'true';
  }

  if (filters.acAvailable !== undefined) {
    match['preferences.acAvailable'] = filters.acAvailable === true || filters.acAvailable === 'true';
  }

  if (filters.genderPreference) {
    match['preferences.genderPreference'] = { $in: ['any', filters.genderPreference] };
  }

  if (filters.excludeDriverId) {
    match.driver = { $ne: toObjectId(filters.excludeDriverId) };
  }

  if (filters.excludeDriverIds?.length) {
    match.driver = {
      ...(match.driver || {}),
      $nin: filters.excludeDriverIds.map(toObjectId),
    };
  }

  return match;
};

const getSort = (sortBy = 'time') => {
  if (sortBy === 'nearest') return { distanceMeters: 1, departureTime: 1 };
  if (sortBy === 'price_low' || sortBy === 'price') return { price: 1, departureTime: 1 };
  if (sortBy === 'price_high') return { price: -1, departureTime: 1 };
  if (sortBy === 'newest' || sortBy === 'latest') return { createdAt: -1 };
  if (sortBy === 'seats') return { seatsLeft: -1, departureTime: 1 };
  if (sortBy === 'departure_time' || sortBy === 'time') return { departureTime: 1, createdAt: -1 };

  return { departureTime: 1, createdAt: -1 };
};

const listPaginated = async ({
  filters = {},
  page = 1,
  limit = 10,
  sortBy = 'time',
} = {}) => {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(50, Math.max(1, Number(limit) || 10));
  const skip = (pageNum - 1) * limitNum;

  const match = buildListMatch(filters);
  const sourceLat = Number(filters.fromLat ?? filters.sourceLat ?? filters.lat);
  const sourceLng = Number(filters.fromLng ?? filters.sourceLng ?? filters.lng);
  const hasGeo = hasValidLatLng(sourceLat, sourceLng);
  const radiusKm = Number(filters.sourceRadiusKm ?? filters.radiusKm ?? DEFAULT_SOURCE_RADIUS_KM);
  const hasRadius = Number.isFinite(radiusKm) && radiusKm > 0;

  const pipeline = [];

  if (hasGeo) {
    const geoNear = {
      $geoNear: {
        near: {
          type: 'Point',
          coordinates: [sourceLng, sourceLat],
        },
        key: 'sourcePoint',
        distanceField: 'distanceMeters',
        spherical: true,
        query: match,
      },
    };

    if (hasRadius) {
      geoNear.$geoNear.maxDistance = radiusKm * 1000;
    }

    pipeline.push(geoNear);
  } else {
    pipeline.push({ $match: match });
  }

  pipeline.push(...lookupDriver);
  pipeline.push(...addSeatsLeft);
  pipeline.push({
    $match: {
      seatsLeft: { $gt: 0 },
    },
  });

  if (filters.minSeats) {
    pipeline.push({
      $match: {
        seatsLeft: { $gte: Number(filters.minSeats) },
      },
    });
  }

  const [data] = await Ride.aggregate([
    ...pipeline,
    {
      $facet: {
        rides: [
          { $sort: getSort(sortBy) },
          { $skip: skip },
          { $limit: limitNum },
        ],
        total: [{ $count: 'count' }],
      },
    },
  ]);

  const rides = data?.rides || [];
  const total = data?.total?.[0]?.count || 0;

  return {
    rides,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum),
  };
};

const searchRides = async ({
  sourceText,
  destinationText,
  date,
  timeFrom,
  timeTo,
  vehicleType,
  minPrice,
  maxPrice,
  minSeats,
  fromLat,
  fromLng,
  toLat,
  toLng,
  sourceRadiusKm,
  destinationRadiusKm,
  page = 1,
  limit = 20,
} = {}) => {
  const filters = {};

  if (sourceText) filters.sourceText = sourceText;
  if (destinationText) filters.destinationText = destinationText;
  if (date) filters.date = date;
  if (timeFrom) filters.timeFrom = timeFrom;
  if (timeTo) filters.timeTo = timeTo;
  if (vehicleType) filters.vehicleType = vehicleType;
  if (minPrice) filters.minPrice = minPrice;
  if (maxPrice) filters.maxPrice = maxPrice;
  if (minSeats) filters.minSeats = minSeats;
  if (fromLat !== undefined && fromLng !== undefined) {
    filters.fromLat = fromLat;
    filters.fromLng = fromLng;
  }
  if (toLat !== undefined && toLng !== undefined) {
    filters.toLat = toLat;
    filters.toLng = toLng;
  }
  if (sourceRadiusKm) filters.sourceRadiusKm = sourceRadiusKm;
  if (destinationRadiusKm) filters.destinationRadiusKm = destinationRadiusKm;

  return listPaginated({
    filters,
    page,
    limit,
    sortBy: 'time',
  });
};

const findNearbyBySourcePoint = async ({
  lat,
  lng,
  radiusKm = 10,
  limit = 20,
  page = 1,
  vehicleType,
  seats,
  excludeDriverId,
  excludeDriverIds = [],
} = {}) => {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(50, Math.max(1, Number(limit) || 20));
  const skip = (pageNum - 1) * limitNum;

  const radiusMeters = Math.max(1, Number(radiusKm || 10)) * 1000;

  const query = {
    status: 'scheduled',
    departureTime: { $gte: new Date() },
  };

  if (vehicleType) {
    query['vehicle.type'] = vehicleType;
  }

  if (excludeDriverId) {
    query.driver = { $ne: toObjectId(excludeDriverId) };
  }

  if (excludeDriverIds?.length) {
    query.driver = {
      ...(query.driver || {}),
      $nin: excludeDriverIds.map(toObjectId),
    };
  }

  const basePipeline = [
    {
      $geoNear: {
        near: {
          type: 'Point',
          coordinates: [Number(lng), Number(lat)],
        },
        key: 'sourcePoint',
        distanceField: 'distanceMeters',
        maxDistance: radiusMeters,
        spherical: true,
        query,
      },
    },
    ...lookupDriver,
    ...addSeatsLeft,
    {
      $match: {
        seatsLeft: { $gt: 0 },
      },
    },
  ];

  if (seats) {
    basePipeline.push({
      $match: {
        seatsLeft: { $gte: Number(seats) },
      },
    });
  }

  const [data] = await Ride.aggregate([
    ...basePipeline,
    {
      $facet: {
        rides: [
          { $sort: { distanceMeters: 1, departureTime: 1 } },
          { $skip: skip },
          { $limit: limitNum },
        ],
        total: [{ $count: 'count' }],
      },
    },
  ]);

  const rides = (data?.rides || []).map((ride) => ({
    ...ride,
    sourceDistanceKm: Number((Number(ride.distanceMeters || 0) / 1000).toFixed(2)),
  }));

  const total = data?.total?.[0]?.count || 0;

  return {
    rides,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum),
  };
};

const findUserRides = async (userId) => {
  const uid = toObjectId(userId);

  const createdRides = await Ride.aggregate([
    {
      $match: {
        driver: uid,
      },
    },
    ...lookupDriver,
    ...addSeatsLeft,
    {
      $sort: {
        createdAt: -1,
      },
    },
  ]);

  const joinedRides = await Ride.aggregate([
    {
      $match: {
        'passengers.user': uid,
      },
    },
    ...lookupDriver,
    ...addSeatsLeft,
    {
      $sort: {
        departureTime: -1,
      },
    },
  ]);

  return {
    createdRides,
    joinedRides,
  };
};

export const rideRepository = {
  create(data) {
    return Ride.create(data);
  },

  findById(id) {
    return Ride.findById(id);
  },

  findDetailedById(id) {
    return getRideAggregateById(id);
  },

  findPublicByShareToken(token) {
    return Ride.findOne({ shareToken: token, shareEnabled: true })
      .populate('driver', 'name profilePic rating rideCount isVerified verification vehicle safetyPreferences')
      .select('driver source destination departureTime estimatedEndTime duration price vehicle status shareToken preferences lastLiveLocations anomalyFlags seatsAvailable bookedSeats createdAt');
  },

  save(ride) {
    return ride.save();
  },

  deleteById(id) {
    return Ride.findByIdAndDelete(id);
  },

  listPaginated,

  searchRides,

  findNearbyBySourcePoint,

  findUserRides,

  updateLiveLocation({ rideId, userId, role, lat, lng, heading = null, speed = null, speedKmh = null, name = '', profilePic = '', updatedAt = new Date() }) {
    return Ride.findById(rideId).then(async (ride) => {
      if (!ride) return null;
      ride.lastLiveLocations = (ride.lastLiveLocations || []).filter(
        (loc) => loc.user?.toString() !== userId.toString()
      );
      ride.lastLiveLocations.push({ user: userId, role, name, profilePic, lat, lng, heading, speed, speedKmh, updatedAt });
      if (ride.lastLiveLocations.length > 10) {
        ride.lastLiveLocations = ride.lastLiveLocations.slice(-10);
      }
      return ride.save();
    });
  },

  atomicJoin({ rideId, userId, seats = 1 }) {
    const requestedSeats = Math.max(1, Number(seats) || 1);

    return Ride.findOneAndUpdate(
      {
        _id: rideId,
        status: 'scheduled',
        driver: { $ne: userId },
        'passengers.user': { $ne: userId },
        $expr: {
          $gte: [
            {
              $subtract: [
                '$seatsAvailable',
                { $ifNull: ['$bookedSeats', 0] },
              ],
            },
            requestedSeats,
          ],
        },
      },
      {
        $push: {
          passengers: {
            user: userId,
            seats: requestedSeats,
            joinedAt: new Date(),
          },
        },
        $inc: {
          bookedSeats: requestedSeats,
        },
      },
      {
        returnDocument: 'after',
      }
    );
  },

  atomicLeave({ rideId, userId, seats = 1 }) {
    const seatsToRemove = Math.max(1, Number(seats) || 1);

    return Ride.findOneAndUpdate(
      {
        _id: rideId,
        status: 'scheduled',
        'passengers.user': userId,
      },
      {
        $pull: {
          passengers: {
            user: userId,
          },
        },
        $inc: {
          bookedSeats: -seatsToRemove,
        },
      },
      {
        returnDocument: 'after',
      }
    );
  },

  atomicAttachPassengerFromRequest({
    rideId,
    passengerId,
    seats = 1,
    pickupLocation = null,
    pickupConfirmed = false,
  }) {
    const requestedSeats = Math.max(1, Number(seats) || 1);

    return Ride.findOneAndUpdate(
      {
        _id: rideId,
        status: 'scheduled',
        'passengers.user': { $ne: passengerId },
        $expr: {
          $gte: [
            {
              $subtract: [
                '$seatsAvailable',
                { $ifNull: ['$bookedSeats', 0] },
              ],
            },
            requestedSeats,
          ],
        },
      },
      {
        $push: {
          passengers: {
            user: passengerId,
            seats: requestedSeats,
            pickupLocation: pickupLocation || null,
            pickupConfirmed: Boolean(pickupConfirmed),
            joinedAt: new Date(),
          },
        },
        $inc: {
          bookedSeats: requestedSeats,
        },
      },
      {
        returnDocument: 'after',
      }
    );
  },

  atomicRemovePassenger({
    rideId,
    passengerId,
    seats = 1,
  }) {
    const seatsToRemove = Math.max(1, Number(seats) || 1);

    return Ride.findOneAndUpdate(
      {
        _id: rideId,
        'passengers.user': passengerId,
        bookedSeats: { $gte: seatsToRemove },
      },
      {
        $pull: {
          passengers: {
            user: passengerId,
          },
        },
        $inc: {
          bookedSeats: -seatsToRemove,
        },
      },
      {
        returnDocument: 'after',
      }
    );
  },
};
