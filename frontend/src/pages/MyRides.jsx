import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  Clock,
  Navigation,
  CheckCircle2,
  Car,
  UserRound,
  ArrowRight,
  PlusCircle,
  Search,
  MapPin,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useDispatch, useSelector } from 'react-redux';
import { fetchMyRidesThunk } from '../redux/slices/rideSlice';

const statusStyles = {
  scheduled: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  started: 'bg-amber-100 text-amber-700 border-amber-200',
  ended: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  completed: 'bg-slate-900 text-white border-slate-900',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
};

const formatDate = (value) => {
  if (!value) return 'N/A';
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const formatTime = (value) => {
  if (!value) return 'N/A';
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const MyRides = () => {
  const dispatch = useDispatch();
  const { createdRides = [], joinedRides = [] } = useSelector(
    (s) => s.rides.my || { createdRides: [], joinedRides: [] }
  );

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('active');

  useEffect(() => {
    const fetchRides = async () => {
      try {
        await dispatch(fetchMyRidesThunk()).unwrap();
      } catch (error) {
        toast.error(typeof error === 'string' ? error : 'Failed to load your rides');
      } finally {
        setLoading(false);
      }
    };

    fetchRides();
  }, [dispatch]);

  const allRides = useMemo(() => {
    const ownerRides = createdRides.map((ride) => ({ ...ride, isOwner: true }));
    const passengerRides = joinedRides.map((ride) => ({ ...ride, isOwner: false }));

    return [...ownerRides, ...passengerRides].sort(
      (a, b) => new Date(a.departureTime || 0) - new Date(b.departureTime || 0)
    );
  }, [createdRides, joinedRides]);

  const activeRides = allRides.filter((ride) =>
    ['scheduled', 'started', 'ended'].includes(ride.status)
  );
  const completedRides = allRides.filter((ride) => ride.status === 'completed');
  const cancelledRides = allRides.filter((ride) => ride.status === 'cancelled');

  const tabs = [
    { key: 'active', label: 'Active', count: activeRides.length },
    { key: 'completed', label: 'Done', count: completedRides.length },
    { key: 'cancelled', label: 'Cancelled', count: cancelledRides.length },
  ];

  const ridesToDisplay =
    activeTab === 'completed'
      ? completedRides
      : activeTab === 'cancelled'
        ? cancelledRides
        : activeRides;

  const renderRideCard = (ride) => {
    const statusClass = statusStyles[ride.status] || 'bg-slate-100 text-slate-700 border-slate-200';
    const roleLabel = ride.isOwner ? 'Owner' : 'Joined';
    const RoleIcon = ride.isOwner ? Car : CheckCircle2;
    const seats = ride.seatsAvailable ?? ride.availableSeats ?? ride.seats;

    return (
      <article
        key={`${ride._id}-${ride.isOwner ? 'owner' : 'joined'}`}
        className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 overflow-hidden"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex flex-wrap items-center gap-2">
            <span className={`text-[10px] sm:text-xs font-black px-2.5 py-1 rounded-full border uppercase ${statusClass}`}>
              {ride.status || 'ride'}
            </span>

            <span
              className={`inline-flex items-center gap-1 text-[10px] sm:text-xs font-black px-2.5 py-1 rounded-full border ${
                ride.isOwner
                  ? 'bg-blue-50 text-blue-700 border-blue-100'
                  : 'bg-violet-50 text-violet-700 border-violet-100'
              }`}
            >
              <RoleIcon className="w-3 h-3" />
              {roleLabel}
            </span>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-lg sm:text-xl font-black text-blue-600 leading-none">
              ₹{ride.price ?? 0}
            </p>
            <p className="text-[10px] text-slate-400 font-bold mt-1">per seat</p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl bg-slate-50 p-4">
          <div className="relative pl-7">
            <div className="absolute left-[5px] top-3 bottom-3 w-0.5 bg-slate-200" />

            <div className="relative pb-4">
              <div className="absolute -left-[26px] top-1 w-3 h-3 rounded-full bg-slate-900 ring-4 ring-white" />
              <p className="text-[11px] uppercase tracking-wide text-slate-400 font-black">From</p>
              <p className="text-sm sm:text-base font-black text-slate-900 break-words">
                {ride.source?.name || 'Source not added'}
              </p>
            </div>

            <div className="relative">
              <div className="absolute -left-[26px] top-1 w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-white" />
              <p className="text-[11px] uppercase tracking-wide text-slate-400 font-black">To</p>
              <p className="text-sm sm:text-base font-black text-slate-900 break-words">
                {ride.destination?.name || 'Destination not added'}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs sm:text-sm text-slate-600 font-bold min-w-0">
            <Calendar className="w-4 h-4 shrink-0 text-slate-400" />
            <span className="truncate">{formatDate(ride.departureTime)}</span>
          </div>

          <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs sm:text-sm text-slate-600 font-bold min-w-0">
            <Clock className="w-4 h-4 shrink-0 text-slate-400" />
            <span className="truncate">{formatTime(ride.departureTime)}</span>
          </div>

          {seats !== undefined && seats !== null && (
            <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs sm:text-sm text-slate-600 font-bold min-w-0">
              <UserRound className="w-4 h-4 shrink-0 text-slate-400" />
              <span className="truncate">{seats} seats</span>
            </div>
          )}

          {ride.vehicle?.vehicleType && (
            <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs sm:text-sm text-slate-600 font-bold min-w-0">
              <MapPin className="w-4 h-4 shrink-0 text-slate-400" />
              <span className="truncate capitalize">{ride.vehicle.vehicleType}</span>
            </div>
          )}
        </div>

        <Link
          to={`/ride/${ride._id}`}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 sm:w-fit sm:ml-auto"
        >
          View Details
          <ArrowRight className="w-4 h-4" />
        </Link>
      </article>
    );
  };

  if (loading) {
    return (
      <div className="flex-grow flex items-center justify-center min-h-[70vh]">
        <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-grow bg-slate-50 px-4 py-6 sm:py-10 pb-28 md:pb-10">
      <div className="max-w-4xl mx-auto">
        <div className="mb-5 sm:mb-8">
          <p className="text-sm font-black text-blue-600 uppercase tracking-wide">Ride history</p>
          <h1 className="text-2xl sm:text-4xl font-black text-slate-900">My Rides</h1>
        </div>

        <div className="sticky top-14 md:top-20 z-20 -mx-4 px-4 py-3 bg-slate-50/95 backdrop-blur sm:static sm:bg-transparent sm:px-0 sm:py-0 sm:mx-0 sm:mb-8">
          <div className="grid grid-cols-3 gap-2 rounded-2xl bg-white p-1.5 shadow-sm border border-slate-200">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.key;

              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`rounded-xl px-2 py-2.5 text-xs sm:text-sm font-black transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  <span className="block leading-tight">{tab.label}</span>
                  <span className={`block text-[10px] sm:text-xs ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-4 sm:space-y-5 mt-4 sm:mt-0">
          {ridesToDisplay.length > 0 ? (
            ridesToDisplay.map((ride) => renderRideCard(ride))
          ) : (
            <div className="bg-white p-6 sm:p-10 rounded-2xl border border-slate-200 text-center shadow-sm">
              <Navigation className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-black text-slate-900 mb-2">
                No {activeTab} rides
              </h3>
              <p className="text-sm sm:text-base text-slate-500 mb-6">
                You don't have any {activeTab} rides right now.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md mx-auto">
                <Link
                  to="/post-ride"
                  className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white font-black py-3 px-5 rounded-xl hover:bg-blue-700 transition"
                >
                  <PlusCircle className="w-4 h-4" />
                  Post Ride
                </Link>

                <Link
                  to="/find-ride"
                  className="inline-flex items-center justify-center gap-2 bg-emerald-600 text-white font-black py-3 px-5 rounded-xl hover:bg-emerald-700 transition"
                >
                  <Search className="w-4 h-4" />
                  Find Ride
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MyRides;
