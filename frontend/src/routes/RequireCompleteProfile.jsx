import { Navigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';

const RequireCompleteProfile = ({ children }) => {
  const location = useLocation();
  const { token, user, isHydrated, isInitializing } = useSelector((state) => state.auth);

  if (!isHydrated || isInitializing) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-slate-700" />
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (!user?.isProfileCompleted) {
    return (
      <Navigate
        to="/complete-profile"
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  return children;
};

export default RequireCompleteProfile;
