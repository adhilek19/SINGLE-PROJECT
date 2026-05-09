import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { authService, tokenStore } from '../../services/api';

const userFromStorageRaw = localStorage.getItem('authUser');
const userFromStorage = userFromStorageRaw ? JSON.parse(userFromStorageRaw) : null;

const initialState = {
  token: null,
  user: userFromStorage,
  status: 'idle',
  error: null,
  isHydrated: false,
  isInitializing: true,
};


const normalizeLocation = (location) => {
  if (!location) return null;

  if (location.lat !== undefined && location.lng !== undefined) {
    return {
      name: location.name || 'Current location',
      lat: Number(location.lat),
      lng: Number(location.lng),
      updatedAt: location.updatedAt,
    };
  }

  const coords = location.coordinates || [];
  if (Array.isArray(coords) && coords.length >= 2) {
    return {
      name: location.name || 'Current location',
      lat: Number(coords[1]),
      lng: Number(coords[0]),
      updatedAt: location.updatedAt,
    };
  }

  return null;
};

const parseJwtPayload = (token) => {
  try {
    const base64Payload = token.split('.')[1];
    if (!base64Payload) return null;
    return JSON.parse(atob(base64Payload));
  } catch {
    return null;
  }
};

const normalizeUser = (user, token) => {
  const payload = token ? parseJwtPayload(token) : null;

  return {
    id: user?.id || user?._id || payload?.id,
    _id: user?._id || user?.id || payload?.id,
    name: user?.name || 'User',
    email: user?.email || '',
    profilePic: user?.profilePic || '',
    bio: user?.bio || '',
    rating: user?.rating ?? 0,
    rideCount: user?.rideCount ?? 0,
    isVerified: user?.isVerified ?? false,
    role: user?.role || 'user',
    currentLocation: normalizeLocation(user?.currentLocation),
  };
};

export const initAuthThunk = createAsyncThunk(
  'auth/init',
  async (_, { rejectWithValue }) => {
    try {
      const res = await authService.refreshToken({ silent: true });
      const token = res.data?.data?.accessToken;

      if (!token) throw new Error('No access token returned');

      tokenStore.set(token);

      const me = await authService.getProfile();
      const user = me.data?.data?.user || null;

      return { token, user };
    } catch {
      tokenStore.clear();
      localStorage.removeItem('authUser');
      return rejectWithValue(null);
    }
  }
);

export const loginThunk = createAsyncThunk(
  'auth/login',
  async (credentials, { rejectWithValue }) => {
    try {
      const response = await authService.login(credentials);

      const token = response.data?.data?.accessToken || response.data?.accessToken;
      const user = response.data?.data?.user || response.data?.user || null;

      if (!token) return rejectWithValue('Missing access token from server');

      tokenStore.set(token);

      return { token, user };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Login failed');
    }
  }
);

export const logoutThunk = createAsyncThunk('auth/logout', async () => {
  try {
    await authService.logout();
  } catch {
    // ignore
  }

  tokenStore.clear();

  return true;
});

const authSlice = createSlice({
  name: 'auth',
  initialState,

  reducers: {
    setSessionFromOAuth(state, action) {
      const { token, name, profilePic } = action.payload || {};

      if (!token) return;

      tokenStore.set(token);

      state.token = token;
      state.user = normalizeUser(
        {
          name: name || 'User',
          profilePic: profilePic || '',
        },
        token
      );
      state.isHydrated = true;
      state.isInitializing = false;
      state.status = 'succeeded';

      localStorage.setItem('authUser', JSON.stringify(state.user));
    },

    clearSession(state) {
      tokenStore.clear();

      state.token = null;
      state.user = null;
      state.status = 'idle';
      state.error = null;
      state.isHydrated = true;
      state.isInitializing = false;

      localStorage.removeItem('authUser');
    },

    setUser(state, action) {
      state.user = normalizeUser(action.payload, state.token);
      localStorage.setItem('authUser', JSON.stringify(state.user));
    },
  },

  extraReducers: (builder) => {
    builder
      .addCase(initAuthThunk.pending, (state) => {
        state.status = 'refreshing';
        state.isInitializing = true;
      })

      .addCase(initAuthThunk.fulfilled, (state, action) => {
        state.status = 'idle';
        state.token = action.payload.token;
        state.user = normalizeUser(action.payload.user, action.payload.token);
        state.isHydrated = true;
        state.isInitializing = false;
        localStorage.setItem('authUser', JSON.stringify(state.user));
      })

      .addCase(initAuthThunk.rejected, (state) => {
        state.status = 'idle';
        state.token = null;
        state.user = null;
        state.isHydrated = true;
        state.isInitializing = false;
      })

      .addCase(loginThunk.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })

      .addCase(loginThunk.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.token = action.payload.token;
        state.isHydrated = true;
        state.isInitializing = false;
        state.user = normalizeUser(action.payload.user, action.payload.token);

        localStorage.setItem('authUser', JSON.stringify(state.user));
      })

      .addCase(loginThunk.rejected, (state, action) => {
        state.status = 'failed';
        state.isInitializing = false;
        state.error = action.payload || 'Login failed';
      })

      .addCase(logoutThunk.fulfilled, (state) => {
        state.status = 'idle';
        state.error = null;
        state.token = null;
        state.user = null;
        state.isHydrated = true;
        state.isInitializing = false;

        localStorage.removeItem('authUser');
      });
  },
});

export const {
  setSessionFromOAuth,
  clearSession,
  setUser,
} = authSlice.actions;

export default authSlice.reducer;
