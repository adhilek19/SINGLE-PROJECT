import axios from 'axios';

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const apiUrlFromEnv = import.meta.env.VITE_API_URL;

const API_URL = apiUrlFromEnv
  || (backendUrl
    ? `${backendUrl.replace(/\/$/, '')}/api`
    : 'https://sahayatri-p95g.onrender.com/api');

let _accessToken = null;

export const tokenStore = {
  get: () => _accessToken,
  set: (t) => {
    _accessToken = t;
  },
  clear: () => {
    _accessToken = null;
  },
};

let refreshPromise = null;
let onAuthFailure = null;

export const setAuthFailureHandler = (handler) => {
  onAuthFailure = typeof handler === 'function' ? handler : null;
};

export const getErrorMessage = (error, fallback = 'Something went wrong') => {
  if (!error) return fallback;
  if (!navigator.onLine) return 'You are offline. Some actions may not work.';
  if (error?.code === 'ECONNABORTED') return 'Request timed out. Network seems slow, please try again.';

  const serverMessage =
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message;

  if (typeof serverMessage === 'string' && serverMessage.trim()) {
    return serverMessage;
  }

  return fallback;
};

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 20000,
});

api.interceptors.request.use((config) => {
  const token = tokenStore.get();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (!error.response || !originalRequest) {
      return Promise.reject(error);
    }

    const url = originalRequest.url || '';
    const shouldSkipAuthFailureRedirect = Boolean(
      originalRequest._skipAuthFailureRedirect
    );

    // Do not try refresh-token for auth endpoints or public discovery endpoints.
    // Otherwise login/register/forgot failures create extra /refresh-token 401 spam.
    const skipRefreshFor = [
      '/auth/login',
      '/auth/register',
      '/auth/verify-otp',
      '/auth/resend-verification-otp',
      '/auth/forgot-password',
      '/auth/reset-password',
      '/auth/refresh-token',
      '/rides/nearby',
      '/rides/search',
      '/rides/match',
    ];

    const shouldSkipRefresh = skipRefreshFor.some((path) => url.includes(path));

    if (
      error.response.status !== 401 ||
      shouldSkipRefresh ||
      originalRequest._retry
    ) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      if (!refreshPromise) {
        refreshPromise = api
          .post('/auth/refresh-token', null, {
            withCredentials: true,
            _skipAuthFailureRedirect: true,
            _isRefreshProbe: true,
          })
          .then((res) => res.data?.data?.accessToken)
          .finally(() => {
            refreshPromise = null;
          });
      }

      const newToken = await refreshPromise;

      if (!newToken) throw new Error('No access token returned');

      tokenStore.set(newToken);

      originalRequest.headers = originalRequest.headers || {};
      originalRequest.headers.Authorization = `Bearer ${newToken}`;

      return api(originalRequest);
    } catch {
      tokenStore.clear();
      localStorage.removeItem('authUser');
      if (onAuthFailure) onAuthFailure();
      if (
        !shouldSkipAuthFailureRedirect &&
        window.location.pathname !== '/login'
      ) {
        window.location.assign('/login');
      }
      return Promise.reject(error);
    }
  }
);

const requestWithFallback = async (primaryRequest, fallbackRequest) => {
  try {
    return await primaryRequest();
  } catch (err) {
    const status = err?.response?.status;
    if ((status === 404 || status === 405) && fallbackRequest) {
      return fallbackRequest();
    }
    throw err;
  }
};

export const authService = {
  register: (userData) => api.post('/auth/register', userData),
  verifyOtp: (data) => api.post('/auth/verify-otp', data),
  resendOtp: (data) => api.post('/auth/resend-verification-otp', data),
  login: (creds) => api.post('/auth/login', creds),
  forgotPassword: (data) => api.post('/auth/forgot-password', data),
  resetPassword: (data) => api.post('/auth/reset-password', data),
  logout: () => api.post('/auth/logout'),
  refreshToken: ({ silent = false } = {}) =>
    api.post('/auth/refresh-token', null, {
      withCredentials: true,
      _skipAuthFailureRedirect: Boolean(silent),
    }),
  getProfile: () => api.get('/auth/me'),
  updateProfile: (data) => api.put('/auth/me', data),
  updateLocation: (data) => api.put('/auth/me/location', data),
  getPublicProfile: (id) => api.get(`/auth/users/${id}/public`),
  blockUser: (userId) => api.post(`/auth/me/block/${userId}`),
  unblockUser: (userId) => api.delete(`/auth/me/block/${userId}`),
};

export const rideService = {
  createRide: (data) => {
    if (data instanceof FormData) {
      return api.post('/rides', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    }

    return api.post('/rides', data);
  },

  getRides: (params) => api.get('/rides', { params }),

  searchRides: (params) => api.get('/rides/search', { params }),

  // ✅ NEW: Nearby ride discovery
  nearbyRides: (params) => api.get('/rides/nearby', { params }),

  // ✅ NEW: Ride matching
  matchRides: (params) => api.get('/rides/match', { params }),

  getRideById: (id) => api.get(`/rides/${id}`),
  getPublicTracking: (token) => api.get(`/rides/track/${token}`),

  updateRide: (id, data) => {
    if (data instanceof FormData) {
      return api.put(`/rides/${id}`, data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    }

    return api.put(`/rides/${id}`, data);
  },

  deleteRide: (id) => api.delete(`/rides/${id}`),
  updateStatus: (id, status) => api.put(`/rides/${id}/status`, { status }),
  startRide: (id, startPin) => api.put(`/rides/${id}/start`, { startPin }),
  endRide: (id) => api.put(`/rides/${id}/end`),
  completeRide: (id) => api.put(`/rides/${id}/complete`),
  cancelRide: (id, reason) => api.post(`/rides/${id}/cancel`, { reason }),
  ratePassenger: (id, data) => api.post(`/rides/${id}/rate-passenger`, data),
  reviewRide: (id, data) => api.post(`/rides/${id}/review`, data),
  reportRide: (id, data) => api.post(`/rides/${id}/report`, data),
  joinRide: (id, seats = 1) => api.post(`/rides/${id}/join`, { seats }),
  leaveRide: (id) => api.post(`/rides/${id}/leave`),
  getUserRides: () => api.get('/rides/user/me'),
  createRideRequest: (rideId, data) => api.post(`/rides/${rideId}/requests`, data),
  getRideRequests: (rideId) => api.get(`/rides/${rideId}/requests`),
  getMyRideRequests: () => api.get('/me/ride-requests'),
  acceptRideRequest: (requestId) =>
    requestWithFallback(
      () => api.patch(`/rides/requests/${requestId}/accept`),
      () => api.patch(`/ride-requests/${requestId}/accept`)
    ),
  rejectRideRequest: (requestId) =>
    requestWithFallback(
      () => api.patch(`/rides/requests/${requestId}/reject`),
      () => api.patch(`/ride-requests/${requestId}/reject`)
    ),
  cancelRideRequest: (requestId) =>
    requestWithFallback(
      () => api.patch(`/rides/requests/${requestId}/cancel`),
      () => api.patch(`/ride-requests/${requestId}/cancel`)
    ),
  confirmPickup: (requestId, data) =>
    requestWithFallback(
      () => api.patch(`/rides/requests/${requestId}/confirm-pickup`, data),
      () => api.patch(`/ride-requests/${requestId}/confirm-pickup`, data)
    ),
  markNoShow: (requestId, reason) =>
    requestWithFallback(
      () => api.patch(`/rides/requests/${requestId}/no-show`, { reason }),
      () => api.patch(`/ride-requests/${requestId}/no-show`, { reason })
    ),
};

export const chatService = {
  createOrGetRideChat: (rideId, userId) =>
    api.post(`/chats/ride/${rideId}/user/${userId}`),

  getMyChats: () => api.get('/chats'),

  getChatMessages: (chatId, params = {}) =>
    api.get(`/chats/${chatId}/messages`, { params }),

  sendMessage: (payload) => api.post('/messages', payload),

  sendMediaMessage: ({ chatId, file, onUploadProgress }) => {
    const formData = new FormData();
    formData.append('chatId', chatId);
    formData.append('media', file);

    return api.post('/messages/media', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
    });
  },

  markMessageSeen: (messageId) => api.patch(`/messages/${messageId}/seen`),

  deleteMessage: (messageId) => api.delete(`/messages/${messageId}`),
};

export const reviewService = {
  createReview: (data) => api.post('/reviews', data),
  getUserReviews: (userId) => api.get(`/reviews/user/${userId}`),
};

export const reportService = {
  createReport: (data) => api.post('/reports', data),
};

export const postService = {
  createPost: rideService.createRide,
  getFeed: rideService.getRides,
  getPost: rideService.getRideById,
  joinRide: rideService.joinRide,
  deletePost: rideService.deleteRide,
};

export default api;
