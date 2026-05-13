import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Calendar, Clock, Users, IndianRupee,
  FileText, ArrowRight, Car, Image as ImageIcon, X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useDispatch, useSelector } from 'react-redux';
import { createRideThunk } from '../redux/slices/rideSlice';
import LocationSearch from '../components/LocationSearch';


const POST_RIDE_DRAFT_KEY = 'sahayatri_post_ride_draft_v1';

const DEFAULT_POST_RIDE_FORM = {
  source: { name: '', lat: 0, lng: 0 },
  destination: { name: '', lat: 0, lng: 0 },
  date: '',
  time: '',
  duration: 60,
  seatsAvailable: 3,
  price: 0,
  description: '',
  vehicle: {
    type: 'car',
    brand: '',
    model: '',
    number: '',
  },
  preferences: {
    womenOnly: false,
    verifiedOnly: false,
    hidePhoneNumber: false,
    requireRideShare: false,
    smokingAllowed: false,
    musicAllowed: true,
    petsAllowed: false,
    luggageSpace: true,
    acAvailable: false,
    conversationLevel: 'normal',
    genderPreference: 'any',
  },
  vehicleImage: null,
};

const normalizeDraftLocation = (place) => {
  if (!place) return { name: '', lat: 0, lng: 0 };

  if (typeof place === 'string') {
    return { name: place, lat: 0, lng: 0 };
  }

  return {
    name: place.name || place.label || '',
    lat: Number(place.lat) || 0,
    lng: Number(place.lng) || 0,
  };
};

const hasValidLocationCoords = (place) =>
  Number.isFinite(Number(place?.lat)) &&
  Number.isFinite(Number(place?.lng)) &&
  Number(place?.lat) >= -90 &&
  Number(place?.lat) <= 90 &&
  Number(place?.lng) >= -180 &&
  Number(place?.lng) <= 180 &&
  !(Number(place?.lat) === 0 && Number(place?.lng) === 0);

const normalizePostRideDraft = (draft = {}) => ({
  ...DEFAULT_POST_RIDE_FORM,
  ...draft,
  source: normalizeDraftLocation(draft.source),
  destination: normalizeDraftLocation(draft.destination),
  vehicle: {
    ...DEFAULT_POST_RIDE_FORM.vehicle,
    ...(draft.vehicle || {}),
  },
  preferences: {
    ...DEFAULT_POST_RIDE_FORM.preferences,
    ...(draft.preferences || {}),
  },
  vehicleImage: null,
});

const getInitialPostRideForm = () => {
  try {
    const saved = localStorage.getItem(POST_RIDE_DRAFT_KEY);
    if (!saved) return DEFAULT_POST_RIDE_FORM;
    return normalizePostRideDraft(JSON.parse(saved));
  } catch {
    return DEFAULT_POST_RIDE_FORM;
  }
};

const getPostRideDraftPayload = (formData) => ({
  ...formData,
  vehicleImage: null,
});

const PostRide = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const authUser = useSelector((state) => state.auth.user);
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [formData, setFormData] = useState(getInitialPostRideForm);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          POST_RIDE_DRAFT_KEY,
          JSON.stringify(getPostRideDraftPayload(formData))
        );
      } catch {
        // Ignore localStorage quota/private-mode errors. Draft saving is best-effort.
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [formData]);

  useEffect(() => {
    const vehicle = authUser?.vehicle || {};
    const hasProfileVehicle = Boolean(
      String(vehicle?.type || '').trim() &&
        String(vehicle?.number || '').trim()
    );
    if (!hasProfileVehicle) return;

    setFormData((prev) => {
      const hasCustomVehicleValues =
        String(prev?.vehicle?.brand || '').trim() ||
        String(prev?.vehicle?.model || '').trim() ||
        String(prev?.vehicle?.number || '').trim();
      if (hasCustomVehicleValues) return prev;

      const next = {
        ...prev,
        vehicle: {
          ...prev.vehicle,
          type: vehicle.type || prev.vehicle.type || 'car',
          brand: vehicle.brand || '',
          model: vehicle.model || '',
          number: vehicle.number || '',
        },
      };

      if (
        Number(prev.seatsAvailable) === Number(DEFAULT_POST_RIDE_FORM.seatsAvailable) &&
        Number(vehicle.seats) > 0
      ) {
        next.seatsAvailable = Number(vehicle.seats);
      }

      return next;
    });

    if (!imagePreview && vehicle?.image) {
      setImagePreview(vehicle.image);
    }
  }, [authUser, imagePreview]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name.startsWith('vehicle.')) {
      const vehicleField = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        vehicle: { ...prev.vehicle, [vehicleField]: value }
      }));
    } else if (name.startsWith('preferences.')) {
      const key = name.split('.')[1];
      const nextValue = e.target.type === 'checkbox' ? e.target.checked : value;
      setFormData(prev => ({
        ...prev,
        preferences: { ...prev.preferences, [key]: nextValue }
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image size should be less than 5MB');
        return;
      }
      setFormData(prev => ({ ...prev, vehicleImage: file }));
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSourceChange = (place) => {
    setFormData(prev => ({
      ...prev,
      source: normalizeDraftLocation(place),
    }));
  };

  const handleDestinationChange = (place) => {
    setFormData(prev => ({
      ...prev,
      destination: normalizeDraftLocation(place),
    }));
  };

  const handleSelectSource = (place) => {
    handleSourceChange(place);
  };

  const handleSelectDestination = (place) => {
    handleDestinationChange(place);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (
      !formData.source.name ||
      !formData.destination.name ||
      !hasValidLocationCoords(formData.source) ||
      !hasValidLocationCoords(formData.destination)
    ) {
      toast.error('Please select both source and destination from suggestions');
      return;
    }
    setLoading(true);

    try {
      const datetime = new Date(`${formData.date}T${formData.time}`);
      if (Number.isNaN(datetime.getTime()) || datetime <= new Date()) {
        toast.error('Departure time must be in the future');
        return;
      }
      
      const data = new FormData();
      data.append('source', JSON.stringify(formData.source));
      data.append('destination', JSON.stringify(formData.destination));
      data.append('departureTime', datetime.toISOString());
      data.append('seatsAvailable', formData.seatsAvailable);
      data.append('price', formData.price);
      data.append('description', formData.description);
      data.append('duration', formData.duration);
      data.append('vehicle', JSON.stringify(formData.vehicle));
      data.append('preferences', JSON.stringify(formData.preferences));
      
      if (formData.vehicleImage) {
        data.append('vehicleImage', formData.vehicleImage);
      }
      
      const resultAction = await dispatch(createRideThunk(data));
      if (createRideThunk.fulfilled.match(resultAction)) {
        localStorage.removeItem(POST_RIDE_DRAFT_KEY);
        toast.success('Ride posted successfully!');
        navigate(`/ride/${resultAction.payload._id}`);
      } else {
        toast.error(resultAction.payload || 'Failed to post ride');
      }
    } catch (error) {
      toast.error(error?.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-grow bg-[#F8FAFC] py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
            <div className="w-16 h-16 bg-blue-600 rounded-[2rem] flex items-center justify-center shadow-lg shadow-blue-600/20 mb-6 mx-auto">
              <Car className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tight leading-tight">
              Post a <span className="text-blue-600">Ride</span>
            </h1>
            <p className="mt-4 text-lg text-slate-500 leading-relaxed max-w-xl mx-auto">
              Share your journey with the community and save costs while helping others.
            </p>
        </div>

        <div className="bg-white rounded-[3rem] shadow-2xl shadow-slate-200/60 border border-slate-100 p-8 md:p-12 overflow-hidden relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full -mr-16 -mt-16 blur-3xl opacity-50"></div>

          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              
              {/* Route Section */}
              <div className="md:col-span-2 space-y-6">
                <div className="bg-slate-50 border border-slate-100 p-1.5 rounded-2xl">
                  <LocationSearch 
                    placeholder="Source (Leaving from)" 
                    iconColor="text-blue-500"
                    value={formData.source}
                    onChange={handleSourceChange}
                    onSelect={handleSelectSource}
                  />
                </div>

                <div className="bg-slate-50 border border-slate-100 p-1.5 rounded-2xl">
                  <LocationSearch 
                    placeholder="Destination (Going to)" 
                    iconColor="text-emerald-500"
                    value={formData.destination}
                    onChange={handleDestinationChange}
                    onSelect={handleSelectDestination}
                  />
                </div>
              </div>

              {/* Date & Time */}
              <div className="relative group">
                <label className="block text-sm font-bold text-slate-500 mb-2 ml-2">Departure Date</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Calendar className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type="date"
                    name="date"
                    required
                    value={formData.date}
                    onChange={handleChange}
                    className="block w-full pl-12 pr-4 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500/20 transition-all font-medium text-slate-700"
                  />
                </div>
              </div>

              <div className="relative group">
                <label className="block text-sm font-bold text-slate-500 mb-2 ml-2">Departure Time</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Clock className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type="time"
                    name="time"
                    required
                    value={formData.time}
                    onChange={handleChange}
                    className="block w-full pl-12 pr-4 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500/20 transition-all font-medium text-slate-700"
                  />
                </div>
              </div>

              {/* Duration & Seats */}
              <div className="relative group">
                <label className="block text-sm font-bold text-slate-500 mb-2 ml-2">Est. Duration (mins)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Clock className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type="number"
                    name="duration"
                    min="1"
                    required
                    value={formData.duration}
                    onChange={handleChange}
                    className="block w-full pl-12 pr-4 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500/20 transition-all font-medium text-slate-700"
                  />
                </div>
              </div>

              <div className="relative group">
                <label className="block text-sm font-bold text-slate-500 mb-2 ml-2">Seats Available</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Users className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type="number"
                    name="seatsAvailable"
                    min="1"
                    required
                    value={formData.seatsAvailable}
                    onChange={handleChange}
                    className="block w-full pl-12 pr-4 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500/20 transition-all font-medium text-slate-700"
                  />
                </div>
              </div>

              <div className="md:col-span-2 relative group">
                <label className="block text-sm font-bold text-slate-500 mb-2 ml-2">Price per Seat (₹)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <IndianRupee className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type="number"
                    name="price"
                    min="0"
                    required
                    value={formData.price}
                    onChange={handleChange}
                    className="block w-full pl-12 pr-4 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500/20 transition-all font-medium text-slate-700"
                  />
                </div>
              </div>
              
              {/* Vehicle Info */}
              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-slate-100 pt-8 mt-4">
                <div className="md:col-span-2">
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <Car className="w-5 h-5 text-blue-500" /> Vehicle Information
                  </h3>
                  {!authUser?.vehicle?.type ? (
                    <p className="mt-2 text-xs font-semibold text-amber-700">
                      Add vehicle details in your profile to auto-fill this next time.
                    </p>
                  ) : null}
                </div>

                <div className="relative group">
                   <select
                    name="vehicle.type"
                    value={formData.vehicle.type}
                    onChange={handleChange}
                    className="block w-full px-4 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500/20 transition-all font-medium text-slate-700 appearance-none cursor-pointer"
                   >
                     <option value="car">Car</option>
                     <option value="bike">Bike</option>
                     <option value="auto">Auto</option>
                     <option value="van">Van</option>
                   </select>
                </div>

                <div className="relative group">
                  <input
                    type="text"
                    name="vehicle.brand"
                    placeholder="Brand (e.g. Honda, Toyota)"
                    value={formData.vehicle.brand}
                    onChange={handleChange}
                    className="block w-full px-4 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500/20 transition-all font-medium text-slate-700 placeholder:text-slate-400"
                  />
                </div>

                <div className="relative group">
                  <input
                    type="text"
                    name="vehicle.model"
                    placeholder="Model (e.g. Civic, Activa)"
                    value={formData.vehicle.model}
                    onChange={handleChange}
                    className="block w-full px-4 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500/20 transition-all font-medium text-slate-700 placeholder:text-slate-400"
                  />
                </div>

                <div className="relative group">
                  <input
                    type="text"
                    name="vehicle.number"
                    placeholder="License Plate Number"
                    value={formData.vehicle.number}
                    onChange={handleChange}
                    className="block w-full px-4 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500/20 transition-all font-medium text-slate-700 placeholder:text-slate-400 uppercase"
                  />
                </div>

                {/* Vehicle Image Upload */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-bold text-slate-500 mb-3 ml-2">Vehicle Image</label>
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative border-2 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all ${imagePreview ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-400 hover:bg-slate-50'}`}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      className="hidden"
                      accept="image/*"
                    />
                    
                    {imagePreview ? (
                      <div className="relative w-full max-w-sm aspect-video rounded-2xl overflow-hidden shadow-lg">
                        <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                        <button 
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setImagePreview(null); setFormData(p => ({...p, vehicleImage: null})); }}
                          className="absolute top-2 right-2 bg-white/90 p-2 rounded-full text-red-500 shadow-md hover:bg-red-50"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600 mb-4">
                          <ImageIcon className="w-7 h-7" />
                        </div>
                        <p className="text-slate-600 font-bold">Click to upload vehicle photo</p>
                        <p className="text-slate-400 text-sm mt-1">Supports JPG, PNG (Max 5MB)</p>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Ride Preferences */}
              <div className="md:col-span-2 border-t border-slate-100 pt-8 mt-4">
                <h3 className="text-lg font-bold text-slate-800 mb-4">Safety & Ride Preferences</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    ['womenOnly', 'Women-only ride preference'],
                    ['verifiedOnly', 'Show only verified users'],
                    ['hidePhoneNumber', 'Hide phone number'],
                    ['requireRideShare', 'Share trip required'],
                    ['smokingAllowed', 'Smoking allowed'],
                    ['musicAllowed', 'Music allowed'],
                    ['petsAllowed', 'Pets allowed'],
                    ['luggageSpace', 'Luggage space'],
                    ['acAvailable', 'AC available'],
                  ].map(([key, label]) => (
                    <label key={key} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 font-semibold text-slate-700">
                      <span>{label}</span>
                      <input
                        type="checkbox"
                        name={`preferences.${key}`}
                        checked={Boolean(formData.preferences[key])}
                        onChange={handleChange}
                        className="h-5 w-5 accent-blue-600"
                      />
                    </label>
                  ))}
                  <div>
                    <label className="block text-sm font-bold text-slate-500 mb-2 ml-2">Conversation</label>
                    <select name="preferences.conversationLevel" value={formData.preferences.conversationLevel} onChange={handleChange} className="block w-full px-4 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500/20 font-medium text-slate-700">
                      <option value="quiet">Quiet ride</option>
                      <option value="normal">Normal</option>
                      <option value="talkative">Talkative</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-500 mb-2 ml-2">Gender preference</label>
                    <select name="preferences.genderPreference" value={formData.preferences.genderPreference} onChange={handleChange} className="block w-full px-4 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500/20 font-medium text-slate-700">
                      <option value="any">Any</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="md:col-span-2 relative group">
                <label className="block text-sm font-bold text-slate-500 mb-2 ml-2">Ride Description</label>
                <div className="relative">
                  <div className="absolute top-4 left-4 pointer-events-none">
                    <FileText className="h-5 w-5 text-slate-400" />
                  </div>
                  <textarea
                    name="description"
                    rows="3"
                    value={formData.description}
                    onChange={handleChange}
                    className="block w-full pl-12 pr-4 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500/20 transition-all font-medium text-slate-700 placeholder:text-slate-400"
                    placeholder="Add any extra details (luggage, pets, etc.)"
                  ></textarea>
                </div>
              </div>
            </div>

            <div className="pt-6">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-5 px-6 rounded-3xl bg-emerald-500 text-white font-black text-lg hover:bg-emerald-600 shadow-xl shadow-emerald-500/20 transition-all active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-70"
              >
                {loading ? 'Posting...' : 'Post a Ride'}
                {!loading && <ArrowRight className="w-6 h-6" />}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default PostRide;
