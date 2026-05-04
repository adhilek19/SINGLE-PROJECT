import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Calendar, Clock, IndianRupee, MapPin, ShieldCheck, Car } from 'lucide-react';
import RouteMap from '../components/RouteMap';
import { rideService } from '../services/api';

const formatDate = (d) => (d ? new Date(d).toLocaleDateString() : '');
const formatTime = (d) => (d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

const TrackRide = () => {
  const { token } = useParams();
  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await rideService.getPublicTracking(token);
        setRide(res.data?.data?.ride || null);
      } catch (err) {
        setError(err?.response?.data?.message || 'Tracking link not found');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  if (loading) return <div className="p-8 text-center">Loading public tracking...</div>;
  if (error) return <div className="p-8 text-center text-red-600 font-bold">{error}</div>;
  if (!ride) return null;

  const liveLocations = ride.lastLiveLocations || [];

  return (
    <div className="flex-grow bg-slate-50 py-8 px-4">
      <div className="mx-auto max-w-5xl rounded-3xl border bg-white p-5 md:p-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black">SahaYatri Public Ride Tracking</h1>
            <p className="text-sm text-slate-500">Family/friends can see driver, vehicle, route, ETA and last live location.</p>
          </div>
          <span className="rounded-full bg-blue-100 px-4 py-2 text-sm font-black uppercase text-blue-700">{ride.status}</span>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="rounded-2xl border bg-slate-50 p-4 space-y-3">
            <p className="font-black flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-emerald-600" /> Driver</p>
            <div className="flex items-center gap-3">
              {ride.driver?.profilePic ? <img src={ride.driver.profilePic} alt="Driver" className="h-14 w-14 rounded-full object-cover" /> : <div className="h-14 w-14 rounded-full bg-slate-200" />}
              <div>
                <p className="font-black">{ride.driver?.name || 'Driver'}</p>
                <p className="text-sm text-slate-600">Rating: {ride.driver?.rating || 0}/5 · {ride.driver?.isVerified ? 'Verified' : 'Not verified'}</p>
              </div>
            </div>
            <div className="pt-2 text-sm">
              <p><Calendar className="inline w-4 h-4" /> {formatDate(ride.departureTime)}</p>
              <p><Clock className="inline w-4 h-4" /> {formatTime(ride.departureTime)}</p>
              <p><IndianRupee className="inline w-4 h-4" /> {ride.price}</p>
            </div>
          </div>

          <div className="rounded-2xl border bg-slate-50 p-4 space-y-3">
            <p className="font-black flex items-center gap-2"><Car className="w-5 h-5 text-blue-600" /> Vehicle</p>
            {ride.vehicle?.image ? <img src={ride.vehicle.image} alt="Vehicle" className="h-36 w-full rounded-xl object-cover" /> : null}
            <p className="capitalize">{ride.vehicle?.type || '-'} {ride.vehicle?.brand || ''} {ride.vehicle?.model || ''}</p>
            <p className="font-black uppercase">{ride.vehicle?.number || 'Number hidden/not added'}</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div className="rounded-2xl border p-4"><p className="font-black flex items-center gap-2"><MapPin className="w-4 h-4" /> From</p><p>{ride.source?.name}</p></div>
          <div className="rounded-2xl border p-4"><p className="font-black flex items-center gap-2"><MapPin className="w-4 h-4" /> To</p><p>{ride.destination?.name}</p></div>
        </div>

        <RouteMap source={ride.source} destination={ride.destination} liveLocations={liveLocations} />

        {liveLocations.length ? (
          <div className="rounded-2xl border bg-emerald-50 p-4 text-sm text-emerald-800">
            Last live update: {new Date(liveLocations[liveLocations.length - 1].updatedAt).toLocaleString()}
          </div>
        ) : (
          <div className="rounded-2xl border bg-amber-50 p-4 text-sm text-amber-800">Live location will appear after driver/passenger opens ride details and allows location permission.</div>
        )}
      </div>
    </div>
  );
};

export default TrackRide;
