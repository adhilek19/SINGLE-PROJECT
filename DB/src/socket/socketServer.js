import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import User from '../models/User.js';
import Ride from '../models/Ride.js';
import RideRequest from '../models/RideRequest.js';

const ROOM_PREFIX = 'ride:';
const roomName = (rideId) => `${ROOM_PREFIX}${rideId}`;

const validLat = (lat) => Number.isFinite(lat) && lat >= -90 && lat <= 90;
const validLng = (lng) => Number.isFinite(lng) && lng >= -180 && lng <= 180;

const isAcceptedPassenger = async ({ rideId, userId }) => {
  const accepted = await RideRequest.findOne({
    ride: rideId,
    passenger: userId,
    status: 'accepted',
  }).select('_id');

  if (accepted) return true;

  const ride = await Ride.findById(rideId).select('passengers.user');
  if (!ride) return false;
  return (ride.passengers || []).some((p) => p.user?.toString() === userId.toString());
};

const resolveRideRole = async ({ rideId, user }) => {
  if (user.role === 'admin') return 'admin';

  const ride = await Ride.findById(rideId).select('driver');
  if (!ride) return null;

  if (ride.driver?.toString() === user._id.toString()) return 'driver';

  const accepted = await isAcceptedPassenger({ rideId, userId: user._id });
  if (accepted) return 'passenger';

  return null;
};

export const initSocket = ({ httpServer }) => {
  const io = new Server(httpServer, {
    cors: {
      origin: env.CLIENT_URL,
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        (socket.handshake.headers.authorization || '').replace(/^Bearer\s+/i, '');

      if (!token) {
        return next(new Error('Unauthorized'));
      }

      const decoded = jwt.verify(token, env.ACCESS_SECRET);
      const user = await User.findById(decoded.id).select('_id role name profilePic');

      if (!user) {
        return next(new Error('Unauthorized'));
      }

      socket.user = user;
      return next();
    } catch {
      return next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('joinRide', async (payload = {}, ack) => {
      try {
        const rideId = String(payload.rideId || '').trim();
        if (!rideId) throw new Error('rideId is required');

        const role = await resolveRideRole({ rideId, user: socket.user });
        if (!role) throw new Error('Not allowed to join this ride');

        await socket.join(roomName(rideId));
        if (typeof ack === 'function') ack({ ok: true, rideId, role });
      } catch (err) {
        if (typeof ack === 'function') ack({ ok: false, message: err.message || 'joinRide failed' });
      }
    });

    socket.on('leaveRide', async (payload = {}, ack) => {
      const rideId = String(payload.rideId || '').trim();
      if (rideId) {
        await socket.leave(roomName(rideId));
      }
      if (typeof ack === 'function') ack({ ok: true });
    });

    socket.on('location:update', async (payload = {}, ack) => {
      try {
        const rideId = String(payload.rideId || '').trim();
        const lat = Number(payload.lat);
        const lng = Number(payload.lng);
        const heading =
          payload.heading === undefined || payload.heading === null
            ? null
            : Number(payload.heading);
        const speed =
          payload.speed === undefined || payload.speed === null
            ? null
            : Number(payload.speed);

        if (!rideId) throw new Error('rideId is required');
        if (!validLat(lat) || !validLng(lng)) {
          throw new Error('Valid lat and lng are required');
        }

        const role = await resolveRideRole({ rideId, user: socket.user });
        if (!role) throw new Error('Not allowed to update location for this ride');

        const updatedAt = new Date();

        await User.findByIdAndUpdate(socket.user._id, {
          currentLocation: {
            type: 'Point',
            coordinates: [lng, lat],
            updatedAt,
          },
        });

        const rideDoc = await Ride.findById(rideId).select('lastLiveLocations anomalyFlags status');
        if (rideDoc) {
          rideDoc.lastLiveLocations = (rideDoc.lastLiveLocations || []).filter(
            (loc) => loc.user?.toString() !== socket.user._id.toString()
          );
          rideDoc.lastLiveLocations.push({
            user: socket.user._id,
            role: role === 'driver' ? 'driver' : 'passenger',
            name: socket.user.name || '',
            profilePic: socket.user.profilePic || '',
            lat,
            lng,
            heading: Number.isFinite(heading) ? heading : null,
            speed: Number.isFinite(speed) ? speed : null,
            updatedAt,
          });
          if (rideDoc.lastLiveLocations.length > 10) {
            rideDoc.lastLiveLocations = rideDoc.lastLiveLocations.slice(-10);
          }
          if (rideDoc.status === 'started' && !Number.isFinite(speed)) {
            rideDoc.anomalyFlags = Array.from(new Set([...(rideDoc.anomalyFlags || []), 'location_missing']));
          }
          await rideDoc.save();
        }

        const broadcast = {
          rideId,
          userId: socket.user._id.toString(),
          role: role === 'admin' ? 'passenger' : role,
          name: socket.user.name || '',
          profilePic: socket.user.profilePic || '',
          lat,
          lng,
          heading: Number.isFinite(heading) ? heading : null,
          speed: Number.isFinite(speed) ? speed : null,
          updatedAt,
        };

        io.to(roomName(rideId)).emit('location:broadcast', broadcast);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        if (typeof ack === 'function') ack({ ok: false, message: err.message || 'location:update failed' });
      }
    });
  });

  return io;
};
