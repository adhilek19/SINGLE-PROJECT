import CallLog from '../models/CallLog.js';

const CALL_PARTICIPANT_FIELDS = 'name profilePic isVerified rating rideCount';

const populateCallLog = (query) =>
  query
    .populate('caller', CALL_PARTICIPANT_FIELDS)
    .populate('callee', CALL_PARTICIPANT_FIELDS)
    .populate('chat', 'ride participants chatKind')
    .populate('ride', 'driver source destination departureTime status');

export const callLogRepository = {
  create(data) {
    return CallLog.create(data);
  },

  findRawById(id) {
    return CallLog.findById(id);
  },

  findById(id) {
    return populateCallLog(CallLog.findById(id));
  },

  updateById(id, updates = {}) {
    return populateCallLog(
      CallLog.findByIdAndUpdate(id, updates, { returnDocument: 'after' })
    );
  },

  save(callLog) {
    return callLog.save();
  },
};
