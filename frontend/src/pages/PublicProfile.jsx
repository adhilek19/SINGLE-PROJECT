import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  BadgeCheck,
  Bike,
  CalendarDays,
  ChevronLeft,
  MapPin,
  Star,
  User,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { authService } from '../services/api';

const PublicProfile = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [reviews, setReviews] = useState([]);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const res = await authService.getPublicProfile(id);

        setProfile(res.data?.data?.user || null);
        setReviews(res.data?.data?.reviews || []);
      } catch (err) {
        toast.error(err.response?.data?.message || 'User not found');
        navigate('/find-ride');
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [id, navigate]);

  if (loading) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="flex-grow bg-slate-50 py-6 md:py-10 px-4">
      <div className="max-w-4xl mx-auto space-y-5">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-blue-600"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-900 px-5 md:px-8 py-8 md:py-10 text-white">
            <div className="flex flex-col sm:flex-row gap-5 sm:items-center">
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

                  <span>{profile.rideCount || 0} rides</span>

                  <span className="flex items-center gap-1">
                    <CalendarDays className="w-4 h-4" />
                    Joined {new Date(profile.createdAt).getFullYear()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-5 md:p-8 grid md:grid-cols-[1.5fr_1fr] gap-6">
            <div className="space-y-5">
              <section>
                <h2 className="text-lg font-black text-slate-900">About</h2>

                <p className="mt-2 text-slate-600 leading-relaxed">
                  {profile.bio || 'No bio added yet.'}
                </p>
              </section>

              <section>
                <h2 className="text-lg font-black text-slate-900">
                  Recent reviews
                </h2>

                <div className="mt-3 space-y-3">
                  {reviews.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
                      No reviews yet.
                    </div>
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

                <p className="text-sm text-slate-600 mt-2 capitalize">
                  {profile.vehicle?.type || 'Not added'}
                  {profile.vehicle?.model ? ` • ${profile.vehicle.model}` : ''}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4 bg-white">
                <h3 className="font-black text-slate-900 flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Location
                </h3>

                <p className="text-sm text-slate-600 mt-2">
                  {profile.currentLocation?.lat
                    ? 'Location available for matching'
                    : 'Location not shared'}
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