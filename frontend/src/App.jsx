import React, { Suspense, lazy, useEffect } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useNavigate,
  Navigate,
  useLocation,
} from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useDispatch, useSelector } from 'react-redux';
import { setSessionFromOAuth, initAuthThunk } from './redux/slices/authSlice';

import Navbar from './components/Navbar';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import FindRide from './pages/FindRide';
import PostRide from './pages/PostRide';
import RideDetails from './pages/RideDetails';
import MyRides from './pages/MyRides';
import Profile from './pages/Profile';

const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const OTP = lazy(() => import('./pages/OTP'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const EditRide = lazy(() => import('./pages/EditRide'));
const PublicProfile = lazy(() => import('./pages/PublicProfile'));
const TrackRide = lazy(() => import('./pages/TrackRide'));

const LoadingScreen = () => (
  <div className="flex-grow flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-300 border-t-slate-800 rounded-full animate-spin" />
  </div>
);

function AuthHandler() {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();

  useEffect(() => {
    if (!location.search) return;

    const params = new URLSearchParams(location.search);
    const token = params.get('token');
    const name = params.get('name');
    const profilePic = params.get('profilePic');

    if (!token) return;

    dispatch(
      setSessionFromOAuth({
        token,
        name: name || 'User',
        profilePic: profilePic || '',
      })
    );

    navigate(location.pathname || '/', { replace: true });
  }, [location.search, location.pathname, navigate, dispatch]);

  return null;
}

function TokenHydrator() {
  const dispatch = useDispatch();
  const { user, token, isHydrated } = useSelector((s) => s.auth);

  useEffect(() => {
    if (user && !token && !isHydrated) {
      dispatch(initAuthThunk());
    }
  }, [user, token, isHydrated, dispatch]);

  return null;
}

const GuestRoute = ({ children }) => {
  const { token, isHydrated } = useSelector((s) => s.auth);

  if (!isHydrated) return <LoadingScreen />;

  return token ? <Navigate to="/" replace /> : children;
};

const ProtectedRoute = ({ children }) => {
  const { token, isHydrated } = useSelector((s) => s.auth);

  if (!isHydrated) return <LoadingScreen />;

  return token ? children : <Navigate to="/login" replace />;
};

const LazyPage = ({ children }) => (
  <Suspense fallback={<LoadingScreen />}>{children}</Suspense>
);

function App() {
  return (
    <Router>
      <AuthHandler />
      <TokenHydrator />

      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
        <Toaster position="top-center" />
        <Navbar />

        <main className="flex-grow flex flex-col pb-20 md:pb-0">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/find-ride" element={<FindRide />} />
            <Route path="/ride/:id" element={<RideDetails />} />
            <Route path="/rides/:id" element={<RideDetails />} />
            <Route path="/track/:token" element={<LazyPage><TrackRide /></LazyPage>} />

            <Route
              path="/users/:id"
              element={
                <LazyPage>
                  <PublicProfile />
                </LazyPage>
              }
            />

            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />

            <Route
              path="/post-ride"
              element={
                <ProtectedRoute>
                  <PostRide />
                </ProtectedRoute>
              }
            />

            <Route
              path="/my-rides"
              element={
                <ProtectedRoute>
                  <MyRides />
                </ProtectedRoute>
              }
            />

            <Route
              path="/edit-ride/:id"
              element={
                <ProtectedRoute>
                  <LazyPage>
                    <EditRide />
                  </LazyPage>
                </ProtectedRoute>
              }
            />

            <Route
              path="/login"
              element={
                <GuestRoute>
                  <Login />
                </GuestRoute>
              }
            />

            <Route
              path="/register"
              element={
                <GuestRoute>
                  <Register />
                </GuestRoute>
              }
            />

            <Route
              path="/forgot-password"
              element={
                <GuestRoute>
                  <LazyPage>
                    <ForgotPassword />
                  </LazyPage>
                </GuestRoute>
              }
            />

            <Route
              path="/otp"
              element={
                <GuestRoute>
                  <LazyPage>
                    <OTP />
                  </LazyPage>
                </GuestRoute>
              }
            />

            <Route
              path="/reset-password"
              element={
                <GuestRoute>
                  <LazyPage>
                    <ResetPassword />
                  </LazyPage>
                </GuestRoute>
              }
            />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;