import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { useDispatch } from 'react-redux';
import { loginThunk } from '../redux/slices/authSlice';

const Login = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const backendBase = (
    import.meta.env.VITE_BACKEND_URL || 'https://sahayatri-p95g.onrender.com'
  ).replace(/\/$/, '');

  const oauthGoogleUrl = `${backendBase}/api/auth/google`;

  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  const [loading, setLoading] = useState(false);

  const getCurrentLocation = () =>
    new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);

      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            name: 'Current location',
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          }),
        () => resolve(null),
        {
          enableHighAccuracy: true,
          timeout: 3000,
          maximumAge: 5 * 60 * 1000,
        }
      );
    });

  const handleChange = (e) =>
    setFormData({
      ...formData,
      [e.target.id]: e.target.value,
    });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const currentLocation = await getCurrentLocation();

      await dispatch(
        loginThunk({
          ...formData,
          ...(currentLocation ? { currentLocation } : {}),
        })
      ).unwrap();

      toast.success('Logged in successfully!');
      navigate('/');
    } catch (error) {
      toast.error(typeof error === 'string' ? error : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-grow flex items-center justify-center px-4 py-12 relative overflow-hidden">
      <div className="w-full max-w-md bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/50 p-8 relative z-10">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">
            Welcome back
          </h1>
          <p className="text-slate-500">Please enter your details to sign in.</p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div>
            <label
              className="block text-sm font-medium text-slate-700 mb-1.5"
              htmlFor="email"
            >
              Email Address
            </label>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-5 w-5 text-slate-400" />
              </div>

              <input
                id="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                className="block w-full pl-10 px-3 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/50 transition-all placeholder:text-slate-400"
                placeholder="you@example.com"
                required
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="password"
              >
                Password
              </label>

              <Link
                to="/forgot-password"
                className="text-sm font-medium text-blue-600 hover:text-blue-500 transition-colors"
              >
                Forgot password?
              </Link>
            </div>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-slate-400" />
              </div>

              <input
                id="password"
                type="password"
                value={formData.password}
                onChange={handleChange}
                className="block w-full pl-10 px-3 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/50 transition-all placeholder:text-slate-400"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-md shadow-blue-500/20 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all active:scale-[0.98]"
          >
            {loading ? 'Signing in...' : 'Sign in'}
            {!loading && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>

        <div className="mt-8">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>

            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-slate-500">
                Or continue with
              </span>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3">
            <a
              href={oauthGoogleUrl}
              className="w-full inline-flex justify-center items-center gap-2 py-2.5 px-4 border border-slate-200 rounded-xl bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Continue with Google
            </a>
          </div>
        </div>

        <p className="mt-8 text-center text-sm text-slate-600">
          Don&apos;t have an account?{' '}
          <Link
            to="/register"
            className="font-semibold text-blue-600 hover:text-blue-500 transition-colors"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Login;