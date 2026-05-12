import RideRequest from '../models/RideRequest.js';

const populateRequest = (query) =>
  query
    .populate('passenger', 'name email phone profilePic rating rideCount isVerified verification safetyPreferences')
    .populate('driver', 'name email phone profilePic rating rideCount isVerified verification safetyPreferences')
    .populate('ride', 'source destination departureTime status vehicle shareToken preferences');

export const rideRequestRepository = {
  create(data) {
    return RideRequest.create(data);
  },

  findById(id) {
    return populateRequest(
      RideRequest.findById(id).select('+startPin +startPinHash')
    );
  },

  findRawById(id) {
    return RideRequest.findById(id).select('+startPin +startPinHash');
  },

  findAcceptedByRide(rideId) {
    return RideRequest.find({ ride: rideId, status: 'accepted' }).select('+startPin +startPinHash');
  },

  findAcceptedByRideAndPassenger({ rideId, passengerId }) {
    return RideRequest.findOne({
      ride: rideId,
      passenger: passengerId,
      status: 'accepted',
    }).select('+startPin +startPinHash');
  },

  findByRide(rideId) {
    return populateRequest(
      RideRequest.find({ ride: rideId }).select('+startPin +startPinHash')
    ).sort('-createdAt');
  },

  findByRideAndPassenger({ rideId, passengerId }) {
    return populateRequest(
      RideRequest.find({ ride: rideId, passenger: passengerId }).select('+startPin +startPinHash')
    ).sort('-createdAt');
  },

  findPassengerRequests(passengerId) {
    return populateRequest(
      RideRequest.find({ passenger: passengerId }).select('+startPin +startPinHash')
    ).sort('-createdAt');
  },

  findPendingOrAccepted({ rideId, passengerId }) {
    return RideRequest.findOne({
      ride: rideId,
      passenger: passengerId,
      status: { $in: ['pending', 'accepted'] },
    });
  },

  findAcceptedOrCompletedByRideAndPassenger({ rideId, passengerId }) {
    return RideRequest.findOne({
      ride: rideId,
      passenger: passengerId,
      status: { $in: ['accepted', 'completed'] },
    }).select('_id');
  },

  save(request) {
    return request.save();
  },
};
