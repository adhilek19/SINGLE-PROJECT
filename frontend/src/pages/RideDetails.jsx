import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Calendar,
  Clock,
  Users,
  IndianRupee,
  Edit,
  ShieldAlert,
  Share2,
  Copy,
  MapPin,
  BadgeCheck,
  Car,
} from 'lucide-react';
import toast from 'react-hot-toast';
import RouteMap from '../components/RouteMap';
import { useDispatch, useSelector } from 'react-redux';
import { fetchRideByIdThunk, cancelRideThunk } from '../redux/slices/rideSlice';
import { authService, rideService } from '../services/api';
import { connectSocket, getSocket } from '../services/socket';
import { useLiveLocation } from '../hooks/useLiveLocation';

const getBrowserLocation = () =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          name: 'Current pickup location',
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      reject,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 }
    );
  });

const toId = (val) => (val && typeof val === 'object' ? val._id : val)?.toString?.() || '';
const formatDate = (d) => (d ? new Date(d).toLocaleDateString() : '');
const formatTime = (d) => (d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

const Badge = ({ children, tone = 'slate' }) => {
  const styles = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-emerald-100 text-emerald-700',
    red: 'bg-red-100 text-red-700',
    blue: 'bg-blue-100 text-blue-700',
    amber: 'bg-amber-100 text-amber-700',
  };
  return <span className={`rounded-full px-3 py-1 text-xs font-black ${styles[tone]}`}>{children}</span>;
};

const Timeline = ({ status }) => {
  const steps = ['scheduled', 'accepted', 'started', 'ended', 'completed'];
  const current = status === 'cancelled' ? -1 : steps.indexOf(status === 'scheduled' ? 'scheduled' : status);
  return (
    <div className="rounded-2xl border bg-slate-50 p-4">
      <h3 className="font-black mb-3">Ride Status Timeline</h3>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {steps.map((step, index) => (
          <div key={step} className={`rounded-xl px-3 py-2 text-center text-xs font-black ${index <= current ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 border'}`}>
            {step === 'scheduled' ? 'Scheduled' : step === 'accepted' ? 'Passenger Joined' : step[0].toUpperCase() + step.slice(1)}
          </div>
        ))}
      </div>
      {status === 'cancelled' && <p className="mt-2 text-sm font-semibold text-red-600">Ride cancelled</p>}
    </div>
  );
};

const PreferencePill = ({ active, children }) => (
  <span className={`rounded-full px-3 py-1 text-xs font-bold ${active ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{children}</span>
);

const RideDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);
  const token = useSelector((s) => s.auth.token);
  const ride = useSelector((s) => s.rides.selected);

  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [startPin, setStartPin] = useState('');
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [rideRequests, setRideRequests] = useState([]);
  const [requestSeats, setRequestSeats] = useState(1);
  const [pickupLocation, setPickupLocation] = useState({ name: '', lat: '', lng: '' });
  const [dropLocation, setDropLocation] = useState('');
  const [liveLocationsByUser, setLiveLocationsByUser] = useState({});
  const [reportForm, setReportForm] = useState({ reason: '', description: '' });

  const uid = toId(user?.id || user?._id);
  const driverId = ride ? toId(ride.driver || ride.driverInfo?._id) : '';
  const isDriver = Boolean(ride && driverId === uid);
  const isPassenger = ride ? ride.passengers?.some((p) => toId(p.user) === uid) : false;
  const isScheduled = ride?.status === 'scheduled';
  const isStarted = ride?.status === 'started';
  const isEnded = ride?.status === 'ended';
  const isCompleted = ride?.status === 'completed';
  const seatsLeft = ride ? Number(ride.seatsLeft ?? (ride.seatsAvailable || 0) - (ride.bookedSeats || 0)) : 0;

  const myLatestRequest = useMemo(() => {
    if (!uid) return null;
    const mine = (rideRequests || []).filter((r) => toId(r.passenger) === uid || toId(r.passenger?._id) === uid);
    return mine[0] || null;
  }, [rideRequests, uid]);

  const pendingRequests = useMemo(() => (rideRequests || []).filter((r) => r.status === 'pending'), [rideRequests]);
  const acceptedRequests = useMemo(() => (rideRequests || []).filter((r) => r.status === 'accepted'), [rideRequests]);
  const liveLocations = useMemo(() => Object.values(liveLocationsByUser || {}), [liveLocationsByUser]);
  const shareUrl = ride?.shareToken ? `${window.location.origin}/track/${ride.shareToken}` : '';

  const refreshRide = async () => dispatch(fetchRideByIdThunk(id)).unwrap();

  const refreshRequests = async () => {
    if (!token) return;
    try {
      setRequestsLoading(true);
      const res = await rideService.getRideRequests(id);
      setRideRequests(res.data?.data?.requests || []);
    } catch (e) {
      if (e?.response?.status !== 401 && e?.response?.status !== 403) {
        toast.error(e?.response?.data?.message || 'Failed to fetch ride requests');
      }
    } finally {
      setRequestsLoading(false);
    }
  };

  useEffect(() => {
    const fetchRide = async () => {
      try {
        await refreshRide();
      } catch (error) {
        toast.error(typeof error === 'string' ? error : 'Failed to load ride details');
        navigate('/find-ride');
      } finally {
        setLoading(false);
      }
    };
    fetchRide();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (ride?._id && token) refreshRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ride?._id, token]);

  const canTrackLive = Boolean(token && ride?._id && (isDriver || isPassenger || myLatestRequest?.status === 'accepted'));

  useEffect(() => {
    if (!token || !ride?._id) return undefined;
    const socket = connectSocket();
    const onBroadcast = (payload) => {
      if (!payload?.userId || String(payload.rideId) !== String(ride._id)) return;
      setLiveLocationsByUser((prev) => ({ ...prev, [payload.userId]: payload }));
    };
    socket.on('location:broadcast', onBroadcast);
    socket.emit('joinRide', { rideId: ride._id });
    return () => {
      socket.emit('leaveRide', { rideId: ride._id });
      socket.off('location:broadcast', onBroadcast);
    };
  }, [ride?._id, token]);

  useLiveLocation({
    socket: canTrackLive ? getSocket() : null,
    rideId: ride?._id,
    enabled: canTrackLive,
    onPosition: (payload) => {
      setLiveLocationsByUser((prev) => ({
        ...prev,
        [uid]: {
          rideId: ride?._id,
          userId: uid,
          role: isDriver ? 'driver' : 'passenger',
          name: user?.name || (isDriver ? 'Driver' : 'Passenger'),
          profilePic: user?.profilePic || user?.avatar || '',
          lat: payload.lat,
          lng: payload.lng,
          heading: payload.heading ?? null,
          speed: payload.speed ?? null,
          updatedAt: new Date().toISOString(),
        },
      }));
    },
  });

  const handleUsePickupLocation = async () => {
    try {
      const loc = await getBrowserLocation();
      setPickupLocation(loc);
      toast.success('Pickup location confirmed from GPS');
    } catch (err) {
      toast.error(err?.message || 'Location permission denied');
    }
  };

  const handleCreateRequest = async () => {
    if (!token) return navigate('/login');
    try {
      const payload = {
        seatsRequested: Number(requestSeats || 1),
        pickupLocation: pickupLocation?.name || pickupLocation?.lat ? pickupLocation : undefined,
        dropLocation: dropLocation ? { name: dropLocation } : undefined,
      };
      await rideService.createRideRequest(id, payload);
      toast.success('Ride request sent');
      await refreshRequests();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to create ride request');
    }
  };

  const handleConfirmPickup = async (requestId) => {
    try {
      const loc = await getBrowserLocation();
      await rideService.confirmPickup(requestId, { pickupLocation: loc });
      toast.success('Pickup confirmed with current GPS location');
      await refreshRequests();
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || 'Failed to confirm pickup');
    }
  };

  const handleAcceptRequest = async (requestId) => {
    try {
      await rideService.acceptRideRequest(requestId);
      toast.success('Request accepted. Passenger can now see 4-digit PIN.');
      await Promise.all([refreshRequests(), refreshRide()]);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to accept request');
    }
  };

  const handleRejectRequest = async (requestId) => {
    try {
      await rideService.rejectRideRequest(requestId);
      toast.success('Request rejected');
      await refreshRequests();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to reject request');
    }
  };

  const handleCancelRequest = async (requestId) => {
    try {
      await rideService.cancelRideRequest(requestId);
      toast.success('Request cancelled');
      await Promise.all([refreshRequests(), refreshRide()]);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to cancel request');
    }
  };

  const handleMarkNoShow = async (requestId) => {
    const reason = window.prompt('No-show reason?', 'Passenger not reached');
    if (reason === null) return;
    try {
      await rideService.markNoShow(requestId, reason);
      toast.success('No-show marked');
      await Promise.all([refreshRequests(), refreshRide()]);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to mark no-show');
    }
  };

  const handleStart = async () => {
    if ((ride?.passengers?.length || acceptedRequests.length) && !/^\d{4}$/.test(startPin)) {
      toast.error('Enter passenger 4-digit PIN before starting ride');
      return;
    }
    setActionBusy(true);
    try {
      await rideService.startRide(id, startPin);
      toast.success('Ride started after PIN verification');
      setStartPin('');
      await refreshRide();
      await refreshRequests();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to start ride');
    } finally {
      setActionBusy(false);
    }
  };

  const handleEnd = async () => {
    setActionBusy(true);
    try {
      await rideService.endRide(id);
      toast.success('Ride ended');
      await refreshRide();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to end ride');
    } finally {
      setActionBusy(false);
    }
  };

  const handleComplete = async () => {
    setActionBusy(true);
    try {
      await rideService.completeRide(id);
      toast.success('Ride completed');
      await refreshRide();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to complete ride');
    } finally {
      setActionBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) return toast.error('Cancellation reason required');
    setActionBusy(true);
    try {
      await dispatch(cancelRideThunk({ id, reason: cancelReason.trim() })).unwrap();
      toast.success('Ride cancelled');
      setCancelReason('');
    } catch (e) {
      toast.error(typeof e === 'string' ? e : 'Failed to cancel ride');
    } finally {
      setActionBusy(false);
    }
  };

  const handleCopyShare = async () => {
    if (!shareUrl) return toast.error('Share link not ready');
    await navigator.clipboard.writeText(shareUrl);
    toast.success('Tracking link copied');
  };

  const handleWhatsAppShare = () => {
    if (!shareUrl) return toast.error('Share link not ready');
    const text = encodeURIComponent(`Track my SahaYatri ride: ${shareUrl}`);
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  const handleSOS = async () => {
    let current = liveLocationsByUser[uid];
    try {
      if (!current?.lat) current = await getBrowserLocation();
    } catch {
      // still copy ride info without exact GPS
    }
    const locationLine = current?.lat ? `Location: https://maps.google.com/?q=${current.lat},${current.lng}` : 'Location: not available';
    const message = `SOS - SahaYatri Ride\nRide ID: ${ride._id}\nDriver: ${ride.driverInfo?.name || ride.driver?.name || 'Unknown'}\nVehicle: ${ride.vehicle?.type || ''} ${ride.vehicle?.model || ''} ${ride.vehicle?.number || ''}\n${locationLine}`;
    await navigator.clipboard.writeText(message);
    toast.success('SOS details copied. Calling 112...');
    window.location.href = 'tel:112';
  };

  const handleReportAndBlock = async () => {
    if (!reportForm.reason.trim() || !reportForm.description.trim()) {
      return toast.error('Reason and description are required');
    }
    try {
      const reportedUserId = isDriver ? toId(myLatestRequest?.passenger) : driverId;
      await rideService.reportRide(id, {
        reason: reportForm.reason.trim(),
        description: reportForm.description.trim(),
        reportedUserId: reportedUserId || undefined,
      });
      if (reportedUserId) await authService.blockUser(reportedUserId);
      toast.success('Report submitted and user blocked');
      setReportForm({ reason: '', description: '' });
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to report/block');
    }
  };

  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (!ride) return null;

  const driver = ride.driverInfo || ride.driver || {};
  const vehicle = ride.vehicle || {};
  const preferences = ride.preferences || {};
  const verified = driver.verification || {};

  return (
    <div className="flex-grow bg-slate-50 py-8 px-4">
      <div className="max-w-5xl mx-auto bg-white rounded-3xl border p-5 md:p-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={ride.status === 'cancelled' ? 'red' : ride.status === 'started' ? 'green' : 'blue'}>{ride.status}</Badge>
            <span className="text-sm text-slate-600"><Calendar className="inline w-4 h-4" /> {formatDate(ride.departureTime)}</span>
            <span className="text-sm text-slate-600"><Clock className="inline w-4 h-4" /> {formatTime(ride.departureTime)}</span>
          </div>
          {isScheduled && isDriver && <Link to={`/edit-ride/${id}`} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white font-bold"><Edit className="w-4 h-4" /> Edit</Link>}
        </div>

        <Timeline status={ride.status} />

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div><p className="font-bold">From</p><p>{ride.source?.name}</p></div>
            <div><p className="font-bold">To</p><p>{ride.destination?.name}</p></div>
            <div className="rounded-2xl border bg-slate-50 p-4">
              <p className="font-black flex items-center gap-2"><BadgeCheck className="w-5 h-5 text-blue-600" /> Driver / Passenger Trust</p>
              <p className="text-sm mt-2">Driver: {driver?.name || 'Unknown'} ({driver?.rating ?? 0}/5)</p>
              <div className="flex flex-wrap gap-2 mt-3">
                <Badge tone={driver?.isVerified ? 'green' : 'amber'}>Email {driver?.isVerified ? 'verified' : 'pending'}</Badge>
                <Badge tone={verified.phone ? 'green' : 'slate'}>Phone {verified.phone ? 'verified' : 'pending'}</Badge>
                <Badge tone={verified.id ? 'green' : 'slate'}>ID {verified.id ? 'verified' : 'pending'}</Badge>
                <Badge tone={verified.profilePhoto || driver?.profilePic ? 'green' : 'slate'}>Photo</Badge>
                <Badge tone={vehicle.verified ? 'green' : 'slate'}>Vehicle verified</Badge>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-2xl font-bold flex items-center"><IndianRupee className="w-5 h-5" />{ride.price}</p>
            <p className="text-sm"><Users className="inline w-4 h-4" /> Seats left: {seatsLeft} / {ride.seatsAvailable}</p>
            <div className="rounded-2xl border p-4 bg-slate-50">
              <p className="font-black flex items-center gap-2"><Car className="w-5 h-5 text-blue-600" /> Vehicle Details</p>
              {vehicle.image ? <img src={vehicle.image} alt="Vehicle" className="mt-3 h-36 w-full rounded-xl object-cover" /> : null}
              <p className="mt-2 text-sm capitalize">{vehicle.type || '-'} {vehicle.brand || ''} {vehicle.model || ''}</p>
              <p className="text-sm font-black uppercase">{vehicle.number || 'Number not added'}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border p-4">
          <h3 className="font-black mb-3">Ride Preferences</h3>
          <div className="flex flex-wrap gap-2">
            <PreferencePill active={preferences.womenOnly}>Women-only</PreferencePill>
            <PreferencePill active={preferences.verifiedOnly}>Verified-only</PreferencePill>
            <PreferencePill active={preferences.hidePhoneNumber}>Hide phone</PreferencePill>
            <PreferencePill active={preferences.requireRideShare}>Share trip required</PreferencePill>
            <PreferencePill active={preferences.smokingAllowed}>Smoking allowed</PreferencePill>
            <PreferencePill active={preferences.musicAllowed}>Music</PreferencePill>
            <PreferencePill active={preferences.petsAllowed}>Pets</PreferencePill>
            <PreferencePill active={preferences.luggageSpace}>Luggage</PreferencePill>
            <PreferencePill active={preferences.acAvailable}>AC</PreferencePill>
            <PreferencePill active>{preferences.conversationLevel || 'normal'} conversation</PreferencePill>
            <PreferencePill active>{preferences.genderPreference || 'any'} gender</PreferencePill>
          </div>
        </div>

        <div className="rounded-2xl border overflow-hidden">
          <RouteMap source={ride.source} destination={ride.destination} liveLocations={liveLocations} />
        </div>

        {canTrackLive && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-3">
          <button onClick={handleCopyShare} className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 font-bold text-white"><Copy className="w-4 h-4" /> Copy Share Link</button>
          <button onClick={handleWhatsAppShare} className="flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 font-bold text-white"><Share2 className="w-4 h-4" /> WhatsApp Share</button>
          {isStarted && <button onClick={handleSOS} className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 font-bold text-white"><ShieldAlert className="w-4 h-4" /> SOS / Call 112</button>}
        </div>
        {shareUrl && <p className="break-all text-xs text-slate-500">Public tracking: {shareUrl}</p>}

        {isDriver && (
          <div className="space-y-3 border-t pt-5">
            <h3 className="font-black">Driver Controls</h3>
            {isScheduled && (
              <div className="max-w-md rounded-2xl border bg-slate-50 p-4 space-y-3">
                <p className="text-sm font-semibold">Passenger 4-digit Trip PIN required before ride start.</p>
                <input value={startPin} onChange={(e) => setStartPin(e.target.value.replace(/\D/g, '').slice(0, 4))} className="w-full rounded-xl border p-3 text-center text-2xl font-black tracking-[0.5em]" placeholder="4821" />
                <button onClick={handleStart} disabled={actionBusy} className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white disabled:opacity-60">Verify PIN & Start Ride</button>
              </div>
            )}
            {isStarted && <button onClick={handleEnd} disabled={actionBusy} className="rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white disabled:opacity-60">End Ride</button>}
            {isEnded && <button onClick={handleComplete} disabled={actionBusy} className="rounded-xl bg-violet-600 px-4 py-3 font-bold text-white disabled:opacity-60">Complete Ride</button>}
            {isScheduled && (
              <div className="space-y-2 max-w-md">
                <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="w-full border rounded-xl p-3" placeholder="Mandatory cancellation reason" />
                <button onClick={handleCancel} disabled={actionBusy} className="rounded-xl bg-red-600 px-4 py-3 font-bold text-white disabled:opacity-60">Cancel Ride</button>
              </div>
            )}
          </div>
        )}

        {!isDriver && (
          <div className="space-y-3 border-t pt-5">
            <h3 className="font-black">Ride Request</h3>
            {myLatestRequest ? (
              <div className="rounded-2xl border bg-slate-50 p-4 space-y-3">
                <p className="text-sm">Your request status: <span className="font-black uppercase">{myLatestRequest.status}</span></p>
                {myLatestRequest.status === 'accepted' && myLatestRequest.startPin ? (
                  <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-center">
                    <p className="text-sm font-bold text-emerald-800">Show this 4-digit PIN to driver before ride start</p>
                    <p className="mt-2 text-4xl font-black tracking-[0.4em] text-emerald-700">{myLatestRequest.startPin}</p>
                  </div>
                ) : null}
                {myLatestRequest.pickupLocation?.lat ? <p className="text-sm flex items-center gap-1"><MapPin className="w-4 h-4" /> Pickup GPS confirmed</p> : null}
                <div className="flex flex-wrap gap-2">
                  {['pending', 'accepted'].includes(myLatestRequest.status) && <button onClick={() => handleConfirmPickup(myLatestRequest._id)} className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white">Confirm pickup with GPS</button>}
                  {['pending', 'accepted'].includes(myLatestRequest.status) && <button onClick={() => handleCancelRequest(myLatestRequest._id)} disabled={!isScheduled} className="rounded-xl bg-slate-900 px-4 py-2 font-bold text-white disabled:opacity-60">Cancel Request</button>}
                  {['pending', 'accepted'].includes(myLatestRequest.status) && <button onClick={() => handleMarkNoShow(myLatestRequest._id)} className="rounded-xl bg-amber-600 px-4 py-2 font-bold text-white">Driver no-show</button>}
                </div>
              </div>
            ) : (
              <div className="space-y-3 max-w-xl rounded-2xl border bg-slate-50 p-4">
                <div className="flex items-center gap-2"><label className="text-sm w-24 font-bold">Seats</label><input type="number" min="1" max={Math.max(1, seatsLeft)} value={requestSeats} onChange={(e) => setRequestSeats(e.target.value)} className="border rounded-xl px-3 py-2 w-28" /></div>
                <input value={pickupLocation.name} onChange={(e) => setPickupLocation((p) => ({ ...p, name: e.target.value }))} className="border rounded-xl px-3 py-2 w-full" placeholder="Pickup location name" />
                <button type="button" onClick={handleUsePickupLocation} className="rounded-xl bg-blue-50 px-4 py-2 font-bold text-blue-700">Use current GPS as pickup</button>
                {pickupLocation.lat ? <p className="text-xs text-emerald-700">Pickup GPS: {Number(pickupLocation.lat).toFixed(5)}, {Number(pickupLocation.lng).toFixed(5)}</p> : null}
                <input value={dropLocation} onChange={(e) => setDropLocation(e.target.value)} className="border rounded-xl px-3 py-2 w-full" placeholder="Drop location (optional)" />
                <button onClick={handleCreateRequest} disabled={!isScheduled || seatsLeft <= 0} className="rounded-xl bg-slate-900 px-4 py-3 font-bold text-white disabled:opacity-60">Request Ride</button>
              </div>
            )}
          </div>
        )}

        {isDriver && (
          <div className="border-t pt-5 space-y-3">
            <h3 className="font-black">Ride Requests</h3>
            {requestsLoading ? <p className="text-sm text-slate-500">Loading requests...</p> : null}
            {pendingRequests.length ? pendingRequests.map((req) => (
              <div key={req._id} className="border rounded-2xl p-4 bg-slate-50 space-y-2">
                <p className="text-sm font-black">{req.passenger?.name || 'Passenger'} {req.passenger?.isVerified ? '✅' : ''}</p>
                <p className="text-xs text-slate-600">Seats requested: {req.seatsRequested}</p>
                {req.pickupLocation?.name ? <p className="text-xs">Pickup: {req.pickupLocation.name}</p> : null}
                {req.pickupLocation?.lat ? <p className="text-xs text-emerald-700">Pickup GPS confirmed</p> : null}
                {req.dropLocation?.name ? <p className="text-xs">Drop: {req.dropLocation.name}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => handleAcceptRequest(req._id)} className="rounded-xl bg-emerald-600 px-3 py-2 font-bold text-white">Accept & Generate PIN</button>
                  <button onClick={() => handleRejectRequest(req._id)} className="rounded-xl bg-rose-600 px-3 py-2 font-bold text-white">Reject</button>
                  <button onClick={() => handleMarkNoShow(req._id)} className="rounded-xl bg-amber-600 px-3 py-2 font-bold text-white">Mark no-show</button>
                </div>
              </div>
            )) : <p className="text-sm text-slate-500">No pending requests</p>}

            {acceptedRequests.length ? (
              <div className="space-y-2">
                <h4 className="font-bold">Accepted Passengers</h4>
                {acceptedRequests.map((req) => (
                  <div key={req._id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm">
                    <span>{req.passenger?.name || 'Passenger'} · seats {req.seatsRequested} · PIN verified: {req.pinVerified ? 'Yes ✅' : 'No'}</span>
                    <button onClick={() => handleMarkNoShow(req._id)} className="rounded-lg bg-amber-600 px-3 py-1 font-bold text-white">Mark no-show</button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}

        {token && (
          <div className="border-t pt-5 space-y-3">
            <h3 className="font-black">Report + Block User</h3>
            <input className="w-full border rounded-xl p-3" placeholder="Reason" value={reportForm.reason} onChange={(e) => setReportForm((p) => ({ ...p, reason: e.target.value }))} />
            <textarea className="w-full border rounded-xl p-3" placeholder="Description" value={reportForm.description} onChange={(e) => setReportForm((p) => ({ ...p, description: e.target.value }))} />
            <button onClick={handleReportAndBlock} className="rounded-xl bg-rose-600 px-4 py-3 font-bold text-white">Submit Report & Block</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RideDetails;
