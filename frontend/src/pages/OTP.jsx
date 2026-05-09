import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ShieldCheck, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { authService, getErrorMessage } from '../services/api';

const OTP = () => {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const inputRefs = useRef([]);
  const navigate = useNavigate();
  const location = useLocation();

  const email = location.state?.email || '';
  const type = location.state?.type || 'register';
  const [devOtp, setDevOtp] = useState(location.state?.devOtp || '');

  useEffect(() => {
    if (!email) {
      navigate('/login');
    }
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [email, navigate]);

  const handleChange = (index, value) => {
    if (isNaN(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Move to next input
    if (value !== '' && index < 5) {
      inputRefs.current[index + 1].focus();
    }
  };

  const handleKeyDown = (index, e) => {
    // Move to previous input on backspace
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1].focus();
    }
  };

  const handleResend = async () => {
    if (resendLoading) return;
    setResendLoading(true);
    try {
      const response =
        type === 'forgot_password'
          ? await authService.forgotPassword({ email })
          : await authService.resendOtp({ email });
      const newDevOtp = response.data?.data?.devOtp;

      if (newDevOtp) {
        setDevOtp(newDevOtp);
        toast.success(`Email delivery failed. Development OTP: ${newDevOtp}`);
      } else {
        setDevOtp('');
        toast.success(
          type === 'forgot_password'
            ? 'Password reset OTP resent successfully!'
            : 'OTP resent successfully!'
        );
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to resend OTP'));
    } finally {
      setResendLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    const otpValue = otp.join('');
    if (otpValue.length === 6) {
      if (type === 'register') {
        setLoading(true);
        try {
          await authService.verifyOtp({ email, otp: otpValue });
          toast.success('Email verified! You can now login.');
          navigate('/login');
        } catch (error) {
          toast.error(getErrorMessage(error, 'Verification failed'));
        } finally {
          setLoading(false);
        }
      } else if (type === 'forgot_password') {
        // Proceed to reset password, pass email and otp
        navigate('/reset-password', { state: { email, otp: otpValue } });
      }
    }
  };

  return (
    <div className="flex-grow flex items-center justify-center px-4 py-12 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-emerald-300 rounded-full mix-blend-multiply filter blur-[128px] opacity-10 pointer-events-none"></div>

      <div className="w-full max-w-md bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/50 p-8 relative z-10 text-center">
        <div className="mx-auto w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
          <ShieldCheck className="w-8 h-8 text-emerald-600" />
        </div>
        
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">Check your email</h1>
          <p className="text-slate-500">
            We sent a verification code to {email}. Enter it below.
          </p>

          {devOtp && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                Development OTP
              </p>
              <p className="mt-1 text-2xl font-extrabold tracking-[0.35em] text-amber-900">
                {devOtp}
              </p>
              <p className="mt-1 text-xs text-amber-700">
                Email delivery failed, so backend returned this OTP for testing. Disable EMAIL_FAIL_OPEN in production.
              </p>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="flex justify-center gap-2 sm:gap-4">
            {otp.map((digit, index) => (
              <input
                key={index}
                type="text"
                maxLength={1}
                ref={(el) => (inputRefs.current[index] = el)}
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                className="w-12 h-14 sm:w-14 sm:h-16 text-center text-2xl font-bold text-slate-900 bg-white/50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
              />
            ))}
          </div>

          <button
            type="submit"
            disabled={otp.join('').length !== 6 || loading}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-md shadow-blue-500/20 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all active:scale-[0.98]"
          >
            {loading ? 'Verifying...' : 'Verify code'}
            {!loading && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>

        <p className="mt-8 text-sm text-slate-600">
          Didn't receive the email?{' '}
          <button
            onClick={handleResend}
            disabled={resendLoading}
            className="font-semibold text-blue-600 hover:text-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {resendLoading ? 'Resending...' : 'Click to resend'}
          </button>
        </p>
      </div>
    </div>
  );
};

export default OTP;
