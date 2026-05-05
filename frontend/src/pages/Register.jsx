import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { authService } from '../services/api';

const Register = () => {
  const navigate = useNavigate();

  const backendBase = (
    import.meta.env.VITE_BACKEND_URL || 'https://sahayatri-p95g.onrender.com'
  ).replace(/\/$/, '');

  const oauthGoogleUrl = `${backendBase}/api/auth/google`;

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
  });

  const [loading, setLoading] = useState(false);

  const handleChange = (e) =>
    setFormData({
      ...formData,
      [e.target.id]: e.target.value,
    });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await authService.register(formData);
      const devOtp = response.data?.data?.devOtp;

      if (devOtp) {
        toast.success(`SMTP failed. Development OTP: ${devOtp}`);
      } else {
        toast.success('Registration successful! Please verify your email.');
      }

      navigate('/otp', {
        state: {
          email: formData.email,
          type: 'register',
          devOtp,
        },
      });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-grow flex items-center justify-center px-4 py-12 relative overflow-hidden">
      <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-purple-400 rounded-full mix-blend-multiply filter blur-[128px] opacity-20 animate-blob"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-96 h-96 bg-pink-400 rounded-full mix-blend-multiply filter blur-[128px] opacity-20 animate-blob animation-delay-2000"></div>

      <div className="w-full max-w-md bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/50 p-8 relative z-10">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">
            Create an account
          </h1>
          <p className="text-slate-500">
            Join SahaYatri and start your journey.
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label
              className="block text-sm font-medium text-slate-700 mb-1.5"
              htmlFor="name"
            >
              Full Name
            </label>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User className="h-5 w-5 text-slate-400" />
              </div>

              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={handleChange}
                className="block w-full pl-10 px-3 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/50 transition-all placeholder:text-slate-400"
                placeholder="John Doe"
                required
              />
            </div>
          </div>

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
            <label
              className="block text-sm font-medium text-slate-700 mb-1.5"
              htmlFor="password"
            >
              Password
            </label>

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

            <p className="mt-2 text-xs text-slate-500">
              Must be at least 8 chars, 1 uppercase, 1 number, 1 special char.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-md shadow-blue-500/20 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all active:scale-[0.98]"
          >
            {loading ? 'Creating...' : 'Create account'}
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
                Or sign up with
              </span>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3">
            <a
              href={oauthGoogleUrl}
              className="w-full inline-flex justify-center items-center gap-2 py-2.5 px-4 border border-slate-200 rounded-xl bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Google
            </a>
          </div>
        </div>

        <p className="mt-8 text-center text-sm text-slate-600">
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-semibold text-blue-600 hover:text-blue-500 transition-colors"
          >
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Register;