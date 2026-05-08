import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import {
  Calendar,
  Users,
  Shield,
  Clock,
  ArrowRight,
} from 'lucide-react';
import LocationSearch from '../components/LocationSearch';

const getLocationText = (place) => {
  if (!place) return '';
  if (typeof place === 'string') return place.trim();
  return String(place.name || place.label || '').trim();
};

const hasCoords = (place) => {
  if (!place || typeof place !== 'object') return false;
  return Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lng));
};

const Home = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [date, setDate] = useState('');
  const [activeLocationDropdown, setActiveLocationDropdown] = useState(null);
  const [closeSuggestionsSignal, setCloseSuggestionsSignal] = useState(0);

  const handleSearch = (e) => {
    e.preventDefault();
    setActiveLocationDropdown(null);
    setCloseSuggestionsSignal((prev) => prev + 1);

    const params = new URLSearchParams();
    const fromName = getLocationText(from);
    const toName = getLocationText(to);

    if (fromName) params.set('from', fromName);
    if (toName) params.set('to', toName);
    if (hasCoords(from)) {
      params.set('fromLat', String(Number(from.lat)));
      params.set('fromLng', String(Number(from.lng)));
    }
    if (hasCoords(to)) {
      params.set('toLat', String(Number(to.lat)));
      params.set('toLng', String(Number(to.lng)));
    }
    if (date) params.set('date', date);
    if (fromName || toName || date) params.set('autoSearch', '1');

    dispatch({
      type: 'search/setSearch',
      payload: {
        from,
        to,
        date,
      },
    });

    navigate(params.toString() ? `/find-ride?${params.toString()}` : '/find-ride');
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-emerald-400 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-80 w-80 rounded-full bg-blue-500 blur-3xl" />
        </div>

        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-16 md:grid-cols-2 md:px-8 md:py-24">
          <div className="flex flex-col justify-center">
            <p className="mb-4 inline-flex w-fit rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-emerald-200">
              Smart ride sharing for everyday travel
            </p>

            <h1 className="text-4xl font-black leading-tight md:text-6xl">
              Share rides.
              <br />
              Save money.
              <br />
              Travel safely.
            </h1>

            <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 md:text-lg">
              Find nearby rides, post your own ride, connect with trusted users,
              and make your daily travel easier.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                to="/post-ride"
                className="rounded-2xl bg-emerald-500 px-6 py-3 font-bold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-600"
              >
                Post a Ride
              </Link>

              <Link
                to="/find-ride"
                className="rounded-2xl border border-white/20 bg-white/10 px-6 py-3 font-bold text-white transition hover:bg-white/20"
              >
                Find a Ride
              </Link>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/10 p-5 shadow-2xl backdrop-blur">
            <div className="rounded-2xl bg-white p-5 text-slate-900 shadow-xl">
              <h2 className="mb-4 text-2xl font-black">Search rides</h2>

              <form onSubmit={handleSearch} className="space-y-4">
                <LocationSearch
                  label="From"
                  value={from}
                  onChange={setFrom}
                  placeholder="Enter starting location"
                  closeSignal={closeSuggestionsSignal}
                  isActive={activeLocationDropdown === 'from'}
                  onActivate={() => setActiveLocationDropdown('from')}
                  onCloseAll={() => setActiveLocationDropdown(null)}
                />

                <LocationSearch
                  label="To"
                  value={to}
                  onChange={setTo}
                  placeholder="Enter destination"
                  closeSignal={closeSuggestionsSignal}
                  isActive={activeLocationDropdown === 'to'}
                  onActivate={() => setActiveLocationDropdown('to')}
                  onCloseAll={() => setActiveLocationDropdown(null)}
                />

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Date
                  </label>

                  <input
                    type="date"
                    value={date}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  />
                </div>

                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 font-bold text-white transition hover:bg-slate-800"
                >
                  Search Ride
                  <ArrowRight size={18} />
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 md:px-8">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-black text-slate-900 md:text-4xl">
            Why RideShare Lite?
          </h2>

          <p className="mx-auto mt-3 max-w-2xl text-slate-600">
            A simple, safe, and practical platform for shared travel.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-4">
          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
              <Users />
            </div>

            <h3 className="text-lg font-black text-slate-900">
              Shared travel
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Connect with people travelling in the same direction.
            </p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
              <Calendar />
            </div>

            <h3 className="text-lg font-black text-slate-900">
              Scheduled rides
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Post and search rides based on your travel time.
            </p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <Shield />
            </div>

            <h3 className="text-lg font-black text-slate-900">
              Safer community
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Profiles, reviews, reports, and verified users improve trust.
            </p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-100 text-purple-700">
              <Clock />
            </div>

            <h3 className="text-lg font-black text-slate-900">
              Time saving
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Quickly discover active rides and travel smarter.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
};

export default Home;
