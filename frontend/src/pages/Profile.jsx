import React, { useEffect, useState } from 'react';
import {
  User,
  Phone,
  Save,
  Star,
  BadgeCheck,
  MapPin,
  Navigation,
  ShieldCheck,
  Car,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useDispatch } from 'react-redux';
import { authService } from '../services/api';
import { setUser } from '../redux/slices/authSlice';

const getBrowserLocation = () =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          name: 'Current location',
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      reject,
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 5 * 60 * 1000,
      }
    );
  });

const Badge = ({ active, children }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black ${
      active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
    }`}
  >
    <BadgeCheck className="w-3.5 h-3.5" />
    {children}
  </span>
);

const Toggle = ({ label, checked, onChange }) => (
  <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold">
    <span>{label}</span>
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="h-5 w-5 accent-blue-600"
    />
  </label>
);

const Profile = () => {
  const dispatch = useDispatch();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locationSaving, setLocationSaving] = useState(false);

  const [form, setForm] = useState({
    name: '',
    phone: '',
    bio: '',
    profilePic: '',
    currentLocation: null,
    trustedContact: { name: '', phone: '', relationship: '' },
    verification: { phone: false, id: false, profilePhoto: false, vehicle: false },
    safetyPreferences: {
      womenOnlyRides: false,
      verifiedOnlyRides: false,
      hidePhoneNumber: false,
      requireRideShare: false,
    },
    vehicle: {
      type: '',
      model: '',
      number: '',
      image: '',
    },
  });

  const [stats, setStats] = useState({
    rating: 0,
    rideCount: 0,
    email: '',
    isVerified: false,
  });

  const syncUser = (user) => {
    const storedUser = JSON.parse(localStorage.getItem('authUser') || '{}');

    dispatch(
      setUser({
        ...storedUser,
        id: user?._id || user?.id || storedUser.id,
        _id: user?._id || user?.id || storedUser._id,
        name: user?.name || storedUser.name,
        email: user?.email || storedUser.email || '',
        profilePic: user?.profilePic || '',
        bio: user?.bio || '',
        rating: user?.rating || 0,
        rideCount: user?.rideCount || 0,
        isVerified: Boolean(user?.isVerified),
        role: user?.role || storedUser.role || 'user',
        currentLocation: user?.currentLocation || null,
        trustedContact: user?.trustedContact || {},
        verification: user?.verification || {},
        safetyPreferences: user?.safetyPreferences || {},
      })
    );
  };

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const res = await authService.getProfile();
        const user = res.data?.data?.user;

        setForm({
          name: user?.name || '',
          phone: user?.phone || '',
          bio: user?.bio || '',
          profilePic: user?.profilePic || '',
          currentLocation: user?.currentLocation || null,
          trustedContact: {
            name: user?.trustedContact?.name || '',
            phone: user?.trustedContact?.phone || '',
            relationship: user?.trustedContact?.relationship || '',
          },
          verification: {
            phone: Boolean(user?.verification?.phone || user?.phone),
            id: Boolean(user?.verification?.id),
            profilePhoto: Boolean(user?.verification?.profilePhoto || user?.profilePic),
            vehicle: Boolean(user?.verification?.vehicle),
          },
          safetyPreferences: {
            womenOnlyRides: Boolean(user?.safetyPreferences?.womenOnlyRides),
            verifiedOnlyRides: Boolean(user?.safetyPreferences?.verifiedOnlyRides),
            hidePhoneNumber: Boolean(user?.safetyPreferences?.hidePhoneNumber),
            requireRideShare: Boolean(user?.safetyPreferences?.requireRideShare),
          },
          vehicle: {
            type: user?.vehicle?.type || '',
            model: user?.vehicle?.model || '',
            number: user?.vehicle?.number || '',
            image: user?.vehicle?.image || '',
          },
        });

        setStats({
          rating: user?.rating || 0,
          rideCount: user?.rideCount || 0,
          email: user?.email || '',
          isVerified: Boolean(user?.isVerified),
        });

        syncUser(user);
      } catch {
        toast.error('Failed to load profile');
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [dispatch]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name.includes('.')) {
      const [group, key] = name.split('.');
      setForm((prev) => ({
        ...prev,
        [group]: {
          ...prev[group],
          [key]: value,
        },
      }));
      return;
    }

    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const setNestedBoolean = (group, key, value) => {
    setForm((prev) => ({
      ...prev,
      [group]: {
        ...prev[group],
        [key]: value,
      },
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setSaving(true);

      const vehicle = {
        type: form.vehicle.type || undefined,
        model: form.vehicle.model || '',
        number: form.vehicle.number || '',
        image: form.vehicle.image || '',
      };

      const payload = {
        name: form.name,
        phone: form.phone,
        bio: form.bio,
        profilePic: form.profilePic,
        trustedContact: form.trustedContact,
        verification: form.verification,
        safetyPreferences: form.safetyPreferences,
        ...(vehicle.type || vehicle.model || vehicle.number || vehicle.image ? { vehicle } : {}),
      };

      const res = await authService.updateProfile(payload);
      const user = res.data?.data?.user;

      if (user) syncUser(user);

      toast.success('Profile updated');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateLocation = async () => {
    try {
      setLocationSaving(true);
      const currentLocation = await getBrowserLocation();
      const res = await authService.updateLocation(currentLocation);
      const user = res.data?.data?.user;

      setForm((prev) => ({ ...prev, currentLocation: user?.currentLocation || currentLocation }));
      if (user) syncUser(user);

      toast.success('Location permission allowed and location updated');
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Unable to update location');
    } finally {
      setLocationSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-grow bg-slate-50 py-6 md:py-10 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-blue-600 px-5 md:px-8 py-8 md:py-10 text-white">
            <div className="flex flex-col sm:flex-row sm:items-center gap-5">
              <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center overflow-hidden shrink-0">
                {form.profilePic ? <img src={form.profilePic} alt="Profile" className="w-full h-full object-cover" /> : <User className="w-10 h-10" />}
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl md:text-3xl font-black truncate">{form.name}</h1>
                  {stats.isVerified && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white text-blue-700 px-2.5 py-1 text-xs font-black">
                      <BadgeCheck className="w-4 h-4" /> Email Verified
                    </span>
                  )}
                </div>
                <p className="text-blue-100 break-all">{stats.email}</p>
                <div className="flex flex-wrap gap-4 mt-3 text-sm">
                  <span className="flex items-center gap-1"><Star className="w-4 h-4" />{Number(stats.rating || 0).toFixed(1)}</span>
                  <span>{stats.rideCount} rides</span>
                  {form.currentLocation?.lat && <span className="flex items-center gap-1"><MapPin className="w-4 h-4" />Location saved</span>}
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-5 md:p-8 space-y-8">
            <section>
              <h2 className="text-xl font-bold mb-4">Verification Badges</h2>
              <div className="flex flex-wrap gap-2">
                <Badge active={stats.isVerified}>Email verified</Badge>
                <Badge active={form.verification.phone}>Phone verified</Badge>
                <Badge active={form.verification.id}>ID verified</Badge>
                <Badge active={form.verification.profilePhoto}>Profile photo added</Badge>
                <Badge active={form.verification.vehicle}>Vehicle verified</Badge>
              </div>
              <div className="grid md:grid-cols-2 gap-3 mt-4">
                <Toggle label="Mark phone verified" checked={form.verification.phone} onChange={(v) => setNestedBoolean('verification', 'phone', v)} />
                <Toggle label="Mark ID verified" checked={form.verification.id} onChange={(v) => setNestedBoolean('verification', 'id', v)} />
                <Toggle label="Mark vehicle verified" checked={form.verification.vehicle} onChange={(v) => setNestedBoolean('verification', 'vehicle', v)} />
                <Toggle label="Profile photo added" checked={form.verification.profilePhoto} onChange={(v) => setNestedBoolean('verification', 'profilePhoto', v)} />
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-4">Personal Details</h2>
              <div className="grid md:grid-cols-2 gap-5">
                <div>
                  <label className="text-sm font-semibold text-slate-700">Name</label>
                  <div className="mt-2 flex items-center border rounded-xl px-3 bg-white"><User className="w-5 h-5 text-slate-400" /><input name="name" value={form.name} onChange={handleChange} className="w-full p-3 outline-none bg-transparent" placeholder="Your name" /></div>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Phone</label>
                  <div className="mt-2 flex items-center border rounded-xl px-3 bg-white"><Phone className="w-5 h-5 text-slate-400" /><input name="phone" value={form.phone} onChange={handleChange} className="w-full p-3 outline-none bg-transparent" placeholder="Phone number" /></div>
                </div>
                <div className="md:col-span-2">
                  <label className="text-sm font-semibold text-slate-700">Bio</label>
                  <textarea name="bio" value={form.bio} onChange={handleChange} rows={4} maxLength={300} className="mt-2 w-full border rounded-xl p-3 outline-none resize-none" placeholder="Tell passengers/riders about you..." />
                  <p className="text-xs text-slate-400 mt-1">{form.bio.length}/300</p>
                </div>
                <div className="md:col-span-2">
                  <label className="text-sm font-semibold text-slate-700">Profile Image URL</label>
                  <input name="profilePic" value={form.profilePic} onChange={handleChange} className="mt-2 w-full border rounded-xl p-3 outline-none" placeholder="https://example.com/image.jpg" />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 md:p-5">
              <h2 className="text-xl font-bold flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-emerald-700" />Trusted Contact</h2>
              <p className="text-sm text-slate-600 mt-1">Ride start aayal share ride link manually ayakkan use cheyyam.</p>
              <div className="grid md:grid-cols-3 gap-4 mt-4">
                <input name="trustedContact.name" value={form.trustedContact.name} onChange={handleChange} className="border rounded-xl p-3 outline-none" placeholder="Name" />
                <input name="trustedContact.phone" value={form.trustedContact.phone} onChange={handleChange} className="border rounded-xl p-3 outline-none" placeholder="Phone number" />
                <input name="trustedContact.relationship" value={form.trustedContact.relationship} onChange={handleChange} className="border rounded-xl p-3 outline-none" placeholder="Relationship" />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:p-5">
              <h2 className="text-xl font-bold flex items-center gap-2"><Users className="w-5 h-5 text-blue-700" />Safety Preferences</h2>
              <div className="grid md:grid-cols-2 gap-3 mt-4">
                <Toggle label="Women-only ride preference" checked={form.safetyPreferences.womenOnlyRides} onChange={(v) => setNestedBoolean('safetyPreferences', 'womenOnlyRides', v)} />
                <Toggle label="Show only verified users" checked={form.safetyPreferences.verifiedOnlyRides} onChange={(v) => setNestedBoolean('safetyPreferences', 'verifiedOnlyRides', v)} />
                <Toggle label="Hide phone number" checked={form.safetyPreferences.hidePhoneNumber} onChange={(v) => setNestedBoolean('safetyPreferences', 'hidePhoneNumber', v)} />
                <Toggle label="Share trip required" checked={form.safetyPreferences.requireRideShare} onChange={(v) => setNestedBoolean('safetyPreferences', 'requireRideShare', v)} />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:p-5">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold">Current Location Permission</h2>
                  <p className="text-sm text-slate-500 mt-1">Browser permission prompt varum. Nearby rides and pickup confirmation use cheyyum.</p>
                  {form.currentLocation?.lat ? <p className="text-sm text-slate-700 mt-2">Lat: {Number(form.currentLocation.lat).toFixed(5)}, Lng: {Number(form.currentLocation.lng).toFixed(5)}</p> : <p className="text-sm text-amber-700 mt-2">No location saved yet.</p>}
                </div>
                <button type="button" onClick={handleUpdateLocation} disabled={locationSaving} className="w-full md:w-auto bg-slate-900 text-white px-5 py-3 rounded-xl font-bold hover:bg-slate-800 disabled:opacity-60 flex items-center justify-center gap-2">
                  <Navigation className="w-5 h-5" />{locationSaving ? 'Updating...' : 'Allow / Use my location'}
                </button>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Car className="w-5 h-5 text-blue-600" />Vehicle Verification</h2>
              <div className="grid md:grid-cols-4 gap-5">
                <select name="vehicle.type" value={form.vehicle.type} onChange={handleChange} className="border rounded-xl p-3 outline-none"><option value="">Type</option><option value="bike">Bike</option><option value="car">Car</option><option value="auto">Auto</option><option value="van">Van</option></select>
                <input name="vehicle.model" value={form.vehicle.model} onChange={handleChange} className="border rounded-xl p-3 outline-none" placeholder="Model" />
                <input name="vehicle.number" value={form.vehicle.number} onChange={handleChange} className="border rounded-xl p-3 outline-none uppercase" placeholder="KL 40 AB 1234" />
                <input name="vehicle.image" value={form.vehicle.image} onChange={handleChange} className="border rounded-xl p-3 outline-none" placeholder="Vehicle image URL" />
              </div>
            </section>

            <button disabled={saving} className="w-full md:w-auto bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2"><Save className="w-5 h-5" />{saving ? 'Saving...' : 'Save Profile'}</button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Profile;
