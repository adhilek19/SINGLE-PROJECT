import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { rideService } from '../../services/api';

// FIX #9 – pagination metadata (totalCount, totalPages, currentPage) was being
//           discarded; now stored in state.pagination.
// FIX #8 – ratePassengerThunk, submitReviewThunk, reportRideThunk had no
//           extraReducers cases; loading/error states were completely invisible.

const initialState = {
  list:       [],
  selected:   null,
  my:         { createdRides: [], joinedRides: [] },
  // FIX #9 – new pagination sub-state
  pagination: { totalCount: 0, totalPages: 0, currentPage: 1 },
  status:     'idle',
  error:      null,
  // Per-action loading flags for UI feedback
  actionStatus: {
    ratePassenger:  'idle',
    submitReview:   'idle',
    reportRide:     'idle',
  },
  actionError: {
    ratePassenger:  null,
    submitReview:   null,
    reportRide:     null,
  },
};

const toId = (value) =>
  (value && typeof value === 'object' ? value._id : value)?.toString?.() || '';

const sortByDeparture = (rides = []) =>
  [...rides].sort(
    (a, b) =>
      new Date(b?.departureTime || b?.createdAt || 0).getTime() -
      new Date(a?.departureTime || a?.createdAt || 0).getTime()
  );

const upsertRide = (rides = [], incomingRide) => {
  if (!incomingRide) return rides;
  const incomingId = toId(incomingRide);
  if (!incomingId) return rides;
  const next = rides.filter((ride) => toId(ride) !== incomingId);
  next.unshift(incomingRide);
  return sortByDeparture(next);
};

// ─── Thunks ─────────────────────────────────────────────────────

export const fetchRidesThunk = createAsyncThunk(
  'rides/fetchAll',
  async (params, { rejectWithValue }) => {
    try {
      const res = await rideService.getRides(params);
      // FIX #9 – return full paginated result, not just rides[]
      return res.data?.data || { rides: [], totalCount: 0, totalPages: 0, currentPage: 1 };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to load rides');
    }
  }
);

export const fetchRideByIdThunk = createAsyncThunk(
  'rides/fetchById',
  async (id, { rejectWithValue }) => {
    try {
      const res = await rideService.getRideById(id);
      return res.data?.data || null;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to load ride');
    }
  }
);

export const joinRideThunk = createAsyncThunk(
  'rides/join',
  async ({ id, seats }, { rejectWithValue }) => {
    try {
      const res = await rideService.joinRide(id, seats);
      return res.data?.data || null;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to join ride');
    }
  }
);

export const leaveRideThunk = createAsyncThunk(
  'rides/leave',
  async (id, { rejectWithValue }) => {
    try {
      const res = await rideService.leaveRide(id);
      return res.data?.data || null;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to leave ride');
    }
  }
);

export const fetchMyRidesThunk = createAsyncThunk(
  'rides/fetchMine',
  async (_, { rejectWithValue }) => {
    try {
      const res = await rideService.getUserRides();
      return res.data?.data || { createdRides: [], joinedRides: [] };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to load your rides');
    }
  }
);

export const createRideThunk = createAsyncThunk(
  'rides/create',
  async (data, { rejectWithValue }) => {
    try {
      const res = await rideService.createRide(data);
      return res.data?.data || null;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to create ride');
    }
  }
);

export const updateRideThunk = createAsyncThunk(
  'rides/update',
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const res = await rideService.updateRide(id, data);
      return res.data?.data || null;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to update ride');
    }
  }
);

export const cancelRideThunk = createAsyncThunk(
  'rides/cancel',
  async ({ id, reason }, { rejectWithValue }) => {
    try {
      const res = await rideService.cancelRide(id, reason);
      return res.data?.data || null;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to cancel ride');
    }
  }
);

export const startRideThunk = createAsyncThunk(
  'rides/start',
  async (payload, { rejectWithValue }) => {
    try {
      const id = typeof payload === 'object' ? payload.id : payload;
      const startPin = typeof payload === 'object' ? payload.startPin : undefined;
      const res = await rideService.startRide(id, startPin);
      return res.data?.data || null;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to start ride');
    }
  }
);

export const endRideThunk = createAsyncThunk(
  'rides/end',
  async (id, { rejectWithValue }) => {
    try {
      const res = await rideService.endRide(id);
      return res.data?.data || null;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to end ride');
    }
  }
);

export const completeRideThunk = createAsyncThunk(
  'rides/complete',
  async (id, { rejectWithValue }) => {
    try {
      const res = await rideService.completeRide(id);
      return res.data?.data || null;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to complete ride');
    }
  }
);

// FIX #8 – these three thunks existed but had zero extraReducers cases
export const ratePassengerThunk = createAsyncThunk(
  'rides/ratePassenger',
  async ({ id, passengerId, rating, comment }, { rejectWithValue }) => {
    try {
      const res = await rideService.ratePassenger(id, { passengerId, rating, comment });
      return res.data?.data || null;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to rate passenger');
    }
  }
);

export const submitReviewThunk = createAsyncThunk(
  'rides/submitReview',
  async ({ id, rating, comment }, { rejectWithValue }) => {
    try {
      const res = await rideService.reviewRide(id, { rating, comment });
      return res.data?.data || null;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to submit review');
    }
  }
);

export const reportRideThunk = createAsyncThunk(
  'rides/report',
  async ({ id, reason, description, reportedUserId }, { rejectWithValue }) => {
    try {
      const res = await rideService.reportRide(id, { reason, description, reportedUserId });
      return res.data?.data || null;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to submit report');
    }
  }
);

// ─── Slice ──────────────────────────────────────────────────────

const rideSlice = createSlice({
  name: 'rides',
  initialState,
  reducers: {
    clearSelected(state) {
      state.selected = null;
    },
    clearActionStatus(state, action) {
      const key = action.payload; // 'ratePassenger' | 'submitReview' | 'reportRide'
      if (key in state.actionStatus) {
        state.actionStatus[key] = 'idle';
        state.actionError[key]  = null;
      }
    },
    socketRideCreated(state, action) {
      const ride = action.payload?.ride || action.payload || null;
      if (!ride || typeof ride !== 'object') return;
      state.list = upsertRide(state.list, ride);
    },
    socketRideUpdated(state, action) {
      const ride = action.payload?.ride || action.payload || null;
      if (!ride || typeof ride !== 'object') return;
      state.list = upsertRide(state.list, ride);
      if (toId(state.selected) === toId(ride)) {
        state.selected = {
          ...(state.selected || {}),
          ...ride,
        };
      }
    },
    socketRideCancelled(state, action) {
      const ride = action.payload?.ride || action.payload || null;
      if (!ride || typeof ride !== 'object') return;
      state.list = upsertRide(state.list, ride);
      if (toId(state.selected) === toId(ride)) {
        state.selected = {
          ...(state.selected || {}),
          ...ride,
        };
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // ── Fetch list ──
      .addCase(fetchRidesThunk.pending, (state) => {
        state.status = 'loading';
        state.error  = null;
      })
      .addCase(fetchRidesThunk.fulfilled, (state, action) => {
        state.status          = 'succeeded';
        // FIX #9 – store rides and pagination separately
        state.list            = action.payload.rides ?? action.payload; // fallback for safety
        state.pagination      = {
          totalCount:  action.payload.totalCount ?? action.payload.total ?? 0,
          totalPages:  action.payload.totalPages ?? 0,
          currentPage: action.payload.currentPage ?? action.payload.page ?? 1,
        };
      })
      .addCase(fetchRidesThunk.rejected, (state, action) => {
        state.status = 'failed';
        state.error  = action.payload;
      })

      // ── Fetch single ──
      .addCase(fetchRideByIdThunk.fulfilled, (state, action) => {
        state.selected = action.payload;
      })

      // ── Join / Leave ──
      .addCase(joinRideThunk.fulfilled, (state, action) => {
        if (action.payload) state.selected = action.payload;
      })
      .addCase(leaveRideThunk.fulfilled, (state, action) => {
        if (action.payload) state.selected = action.payload;
      })

      // ── My rides ──
      .addCase(fetchMyRidesThunk.fulfilled, (state, action) => {
        state.my = action.payload;
      })
      .addCase(fetchMyRidesThunk.rejected, (state, action) => {
        state.error = action.payload;
      })

      // ── Create ──
      .addCase(createRideThunk.fulfilled, (state, action) => {
        if (action.payload) state.list.push(action.payload);
      })

      // ── Update ──
      .addCase(updateRideThunk.fulfilled, (state, action) => {
        if (action.payload) {
          state.selected = action.payload;
          const index    = state.list.findIndex((r) => r._id === action.payload._id);
          if (index !== -1) state.list[index] = action.payload;
        }
      })

      // ── Cancel ──
      .addCase(cancelRideThunk.fulfilled, (state, action) => {
        if (action.payload) {
          state.selected = action.payload;
          const index    = state.list.findIndex((r) => r._id === action.payload._id);
          if (index !== -1) state.list[index] = action.payload;
        }
      })

      // ── Lifecycle ──
      .addCase(startRideThunk.fulfilled,    (state, action) => { if (action.payload) state.selected = action.payload; })
      .addCase(endRideThunk.fulfilled,      (state, action) => { if (action.payload) state.selected = action.payload; })
      .addCase(completeRideThunk.fulfilled, (state, action) => { if (action.payload) state.selected = action.payload; })

      // ── FIX #8 – ratePassenger ──
      .addCase(ratePassengerThunk.pending, (state) => {
        state.actionStatus.ratePassenger = 'loading';
        state.actionError.ratePassenger  = null;
      })
      .addCase(ratePassengerThunk.fulfilled, (state) => {
        state.actionStatus.ratePassenger = 'succeeded';
      })
      .addCase(ratePassengerThunk.rejected, (state, action) => {
        state.actionStatus.ratePassenger = 'failed';
        state.actionError.ratePassenger  = action.payload;
      })

      // ── FIX #8 – submitReview ──
      .addCase(submitReviewThunk.pending, (state) => {
        state.actionStatus.submitReview = 'loading';
        state.actionError.submitReview  = null;
      })
      .addCase(submitReviewThunk.fulfilled, (state) => {
        state.actionStatus.submitReview = 'succeeded';
      })
      .addCase(submitReviewThunk.rejected, (state, action) => {
        state.actionStatus.submitReview = 'failed';
        state.actionError.submitReview  = action.payload;
      })

      // ── FIX #8 – reportRide ──
      .addCase(reportRideThunk.pending, (state) => {
        state.actionStatus.reportRide = 'loading';
        state.actionError.reportRide  = null;
      })
      .addCase(reportRideThunk.fulfilled, (state) => {
        state.actionStatus.reportRide = 'succeeded';
      })
      .addCase(reportRideThunk.rejected, (state, action) => {
        state.actionStatus.reportRide = 'failed';
        state.actionError.reportRide  = action.payload;
      });
  },
});

export const {
  clearSelected,
  clearActionStatus,
  socketRideCreated,
  socketRideUpdated,
  socketRideCancelled,
} = rideSlice.actions;
export default rideSlice.reducer;
