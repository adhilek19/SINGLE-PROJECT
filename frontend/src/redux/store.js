import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import rideReducer from './slices/rideSlice';
import { searchReducer } from './slices/searchSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    rides: rideReducer,
    search: searchReducer,
  },
});
