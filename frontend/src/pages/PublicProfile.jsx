import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  BadgeCheck,
  Bike,
  CalendarDays,
  Car,
  ChevronLeft,
  IndianRupee,
  MapPin,
  Route,
  Star,
  User,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { authService, getErrorMessage } from '../services/api';

const formatDateTime = (value) => {
  if (!value) return 'Date not set';

  return new Date(value).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const toId = (value) =>
  (value && typeof value === 'object' ? value._id : value)?.toString?.() || '';

const StatCard = ({ label, value }) => (
  <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
    <p className="text-2xl font-black text-white">{value}</p>
    <p className="text-xs font-bold uppercase tracking-wide text-slate-300">
      {label}
    </p>
  </div>
);

const EmptyBox = ({ children }) => (
  <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
    {children}
  </div>
);

const RideMiniCard = ({ ride, showDriver = false }) => {
  const driverId = toId(ride.driver);

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-blue-200 hover:bg-blue-50/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-black text-slate-900 line-clamp-1">
            {ride.source?.name || 'Source'} to {ride.destination?.name || 'Destination'}
          </p>

          <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-slate-500">
            <CalendarDays className="h-3.5 w-3.5" />
            {formatDateTime(ride.departureTime)}
          </p>
        </div>

        <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-black uppercase text-slate-700 ring-1 ring-slate-200">
          {ride.status || 'ride'}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-bold text-slate-600">
        <span className="flex items-center gap-1 capitalize">
          <Car className="h-3.5 w-3.5" />
          {ride.vehicle?.type || 'vehicle'}
          {ride.vehicle?.model ? ` - ${ride.vehicle.model}` : ''}
        </span>

        {ride.price !== undefined && ride.price !== null ? (
          <span className="flex items-center gap-1">
            <IndianRupee className="h-3.5 w-3.5" />
            {ride.price}
          </span>
        ) : null}
      </div>

      {showDriver && ride.driver?.name ? (
        <Link
          to={`/profile/${driverId}`}
          className="mt-3 inline-flex items-center gap-2 text-xs font-black text-blue-700 hover:text-blue-900"
        >
          <User className="h-3.5 w-3.5" />
          Driver: {ride.driver.name}
        </Link>
      ) : null}

      <Link
        to={`/ride/${ride._id}`}
        className="mt-4 inline-flex rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white hover:bg-slate-800"
      >
        View ride
      </Link>
    </div>
  );
};

const PublicProfile = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [profile, setProfile] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [recentDriverRides, setRecentDriverRides] = useState([]);
  const [recentPassengerRides, setRecentPassengerRides] = useState([]);
  const [stats, setStats] = useState({});

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError('');
      const res = await authService.getPublicProfile(id);
      const data = res.data?.data || {};

        setProfile(data.user || null);
        setReviews(data.reviews || []);
        setRecentDriverRides(data.recentDriverRides || []);
        setRecentPassengerRides(data.recentPassengerRides || []);
        setStats(data.stats || {});
    } catch (err) {
      const message = getErrorMessage(err, 'User not found');
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadProfile();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadProfile]);

  if (loading) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex-grow flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
          <h3 className="text-lg font-black text-rose-900">Unable to load public profile</h3>
          <p className="mt-2 text-sm text-rose-700">{loadError}</p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={loadProfile}
              className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-bold text-white hover:bg-rose-800"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => navigate('/find-ride')}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white"
            >
              Back to rides
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  const verification = profile.verification || {};

  return (
    <div className="flex-grow bg-slate-50 py-6 md:py-10 px-4">
      <div className="max-w-5xl mx-auto space-y-5">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-blue-600"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-slate-950 px-5 py-8 text-white md:px-8 md:py-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                <div className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center overflow-hidden border-4 border-white/10 shrink-0">
                  {profile.profilePic ? (
                    <img
                      src={profile.profilePic}
                      alt={profile.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-12 h-12" />
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-3xl font-black truncate">
                      {profile.name}
                    </h1>

                    {profile.isVerified && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-3 py-1 text-xs font-black">
                        <BadgeCheck className="w-4 h-4" />
                        Verified
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-4 mt-3 text-sm text-slate-200">
                    <span className="flex items-center gap-1">
                      <Star className="w-4 h-4" />
                      {Number(profile.rating || 0).toFixed(1)} rating
                    </span>

                    <span className="flex items-center gap-1">
                      <CalendarDays className="w-4 h-4" />
                      Joined {new Date(profile.createdAt).getFullYear()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 sm:min-w-[360px]">
                <StatCard
                  label="Ride count"
                  value={
                    profile.rideCount ??
                    ((stats.driverRideCount || 0) + (stats.passengerRideCount || 0))
                  }
                />
                <StatCard label="Driver rides" value={stats.driverRideCount ?? 0} />
                <StatCard label="Passenger trips" value={stats.passengerRideCount ?? 0} />
              </div>
            </div>
          </div>

          <div className="grid gap-6 p-5 md:grid-cols-[1.6fr_1fr] md:p-8">
            <div className="space-y-6">
              <section>
                <h2 className="text-lg font-black text-slate-900">About</h2>

                <p className="mt-2 text-slate-600 leading-relaxed">
                  {profile.bio || 'No bio added yet.'}
                </p>
              </section>

              <section>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
                    <Route className="h-5 w-5 text-blue-600" />
                    Recent rides as driver
                  </h2>
                </div>

                <div className="mt-3 grid gap-3">
                  {recentDriverRides.length === 0 ? (
                    <EmptyBox>No public driver rides yet.</EmptyBox>
                  ) : (
                    recentDriverRides.map((ride) => (
                      <RideMiniCard key={ride._id} ride={ride} />
                    ))
                  )}
                </div>
              </section>

              <section>
                <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
                  <Users className="h-5 w-5 text-blue-600" />
                  Recent completed trips as passenger
                </h2>

                <div className="mt-3 grid gap-3">
                  {recentPassengerRides.length === 0 ? (
                    <EmptyBox>No completed passenger trips yet.</EmptyBox>
                  ) : (
                    recentPassengerRides.map((ride) => (
                      <RideMiniCard key={ride._id} ride={ride} showDriver />
                    ))
                  )}
                </div>
              </section>

              <section>
                <h2 className="text-lg font-black text-slate-900">
                  Recent reviews
                </h2>

                <div className="mt-3 space-y-3">
                  {reviews.length === 0 ? (
                    <EmptyBox>No reviews yet.</EmptyBox>
                  ) : (
                    reviews.map((review) => (
                      <div
                        key={review._id}
                        className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-9 h-9 rounded-full bg-white overflow-hidden flex items-center justify-center shrink-0">
                              {review.reviewer?.profilePic ? (
                                <img
                                  src={review.reviewer.profilePic}
                                  alt="Reviewer"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <User className="w-4 h-4 text-slate-500" />
                              )}
                            </div>

                            <div className="min-w-0">
                              <p className="font-bold text-sm truncate">
                                {review.reviewer?.name || 'User'}
                              </p>

                              <p className="text-xs text-slate-500">
                                {new Date(review.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>

                          <span className="font-black text-amber-600">
                            {review.rating}/5
                          </span>
                        </div>

                        <p className="text-sm text-slate-700 mt-3">
                          {review.comment || 'No comment'}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>

            <aside className="space-y-4">
              <div className="rounded-2xl border border-slate-200 p-4 bg-white">
                <h3 className="font-black text-slate-900 flex items-center gap-2">
                  <Bike className="w-4 h-4" />
                  Vehicle
                </h3>

                {profile.vehicle?.image ? (
                  <img
                    src={profile.vehicle.image}
                    alt="Vehicle"
                    className="mt-3 h-32 w-full rounded-xl object-cover"
                  />
                ) : null}

                <p className="text-sm text-slate-600 mt-2 capitalize">
                  {profile.vehicle?.type || 'Not added'}
                  {profile.vehicle?.model ? ` - ${profile.vehicle.model}` : ''}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4 bg-white">
                <h3 className="font-black text-slate-900 flex items-center gap-2">
                  <BadgeCheck className="w-4 h-4" />
                  Trust badges
                </h3>

                <div className="mt-3 flex flex-wrap gap-2 text-xs font-black">
                  <span className={`rounded-full px-3 py-1 ${profile.isVerified ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                    Email {profile.isVerified ? 'verified' : 'pending'}
                  </span>

                  <span className={`rounded-full px-3 py-1 ${verification.profilePhoto || profile.profilePic ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                    Photo
                  </span>

                  <span className={`rounded-full px-3 py-1 ${verification.vehicle || profile.vehicle?.type ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                    Vehicle
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4 bg-white">
                <h3 className="font-black text-slate-900 flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Privacy
                </h3>

                <p className="text-sm text-slate-600 mt-2">
                  Exact live location and phone number are hidden from public profile.
                </p>
              </div>

              <Link
                to="/find-ride"
                className="block text-center rounded-xl bg-blue-600 text-white font-bold px-5 py-3 hover:bg-blue-700"
              >
                Find rides
              </Link>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublicProfile;
