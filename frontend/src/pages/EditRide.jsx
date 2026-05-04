import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  Calendar, Clock, Users, IndianRupee, 
  FileText, ArrowRight, Car, Image as ImageIcon, X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useDispatch, useSelector } from 'react-redux';
import { fetchRideByIdThunk, updateRideThunk } from '../redux/slices/rideSlice';
import LocationSearch from '../components/LocationSearch';

const EditRide = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const fileInputRef = useRef(null);
  
  const user = useSelector(s => s.auth.user);
  const ride = useSelector(s => s.rides.selected);
  const currentUserId = user?._id || user?.id;
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  
  const [formData, setFormData] = useState({
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
      number: ''
    },
    vehicleImage: null
  });

  useEffect(() => {
    const loadRide = async () => {
      try {
        const data = await dispatch(fetchRideByIdThunk(id)).unwrap();
        
        // Ownership check
        const driverId = data.driver?._id || data.driver || data.driverInfo?._id;
        if (driverId?.toString() !== currentUserId?.toString()) {
          toast.error("You can only edit your own rides");
          navigate(`/ride/${id}`);
          return;
        }

        const depDate = new Date(data.departureTime);
        const estEnd = data.estimatedEndTime ? new Date(data.estimatedEndTime) : null;
        const dur = estEnd ? Math.round((estEnd - depDate) / 60000) : 60;

        setFormData({
          source: data.source,
          destination: data.destination,
          date: depDate.toISOString().split('T')[0],
          time: depDate.toTimeString().split(' ')[0].substring(0, 5),
          duration: dur,
          seatsAvailable: data.seatsAvailable,
          price: data.price,
          description: data.description || '',
          vehicle: {
            type: data.vehicle?.type || 'car',
            brand: data.vehicle?.brand || '',
            model: data.vehicle?.model || '',
            number: data.vehicle?.number || '',
            image: data.vehicle?.image || ''
          },
          vehicleImage: null
        });
        if (data.vehicle?.image) setImagePreview(data.vehicle.image);
      } catch (err) {
        toast.error("Failed to load ride data");
        navigate('/my-rides');
      } finally {
        setLoading(false);
      }
    };
    loadRide();
  }, [id, dispatch, navigate, currentUserId]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name.startsWith('vehicle.')) {
      const vehicleField = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        vehicle: { ...prev.vehicle, [vehicleField]: value }
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFormData(prev => ({ ...prev, vehicleImage: file }));
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

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
      
      if (formData.vehicleImage) {
        data.append('vehicleImage', formData.vehicleImage);
      }
      const resultAction = await dispatch(updateRideThunk({ id, data }));
      if (updateRideThunk.fulfilled.match(resultAction)) {
        toast.success('Ride updated successfully!');
        navigate(`/ride/${id}`);
      } else {
        toast.error(resultAction.payload || 'Failed to update ride');
      }
    } catch (error) {
      toast.error('An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div></div>;

  return (
    <div className="flex-grow bg-[#F8FAFC] py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
            <h1 className="text-4xl font-black text-slate-900">Edit <span className="text-blue-600">Ride</span></h1>
        </div>

        <div className="bg-white rounded-[3rem] shadow-2xl border border-slate-100 p-8 md:p-12">
          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              
              <div className="md:col-span-2 space-y-6">
                <div className="bg-slate-50 border border-slate-100 p-1.5 rounded-2xl">
                  <LocationSearch 
                    placeholder="Source" 
                    defaultValue={formData.source.name}
                    onSelect={(p) => setFormData(prev => ({ ...prev, source: { name: p.name, lat: Number(p.lat), lng: Number(p.lng) } }))}
                  />
                </div>
                <div className="bg-slate-50 border border-slate-100 p-1.5 rounded-2xl">
                  <LocationSearch 
                    placeholder="Destination" 
                    defaultValue={formData.destination.name}
                    onSelect={(p) => setFormData(prev => ({ ...prev, destination: { name: p.name, lat: Number(p.lat), lng: Number(p.lng) } }))}
                  />
                </div>
              </div>

              <div className="relative group">
                <label className="block text-sm font-bold text-slate-500 mb-2 ml-2">Departure Date</label>
                <input type="date" name="date" required value={formData.date} onChange={handleChange} className="block w-full px-4 py-4 bg-slate-50 rounded-2xl focus:ring-2 focus:ring-blue-500/20 font-medium text-slate-700" />
              </div>

              <div className="relative group">
                <label className="block text-sm font-bold text-slate-500 mb-2 ml-2">Departure Time</label>
                <input type="time" name="time" required value={formData.time} onChange={handleChange} className="block w-full px-4 py-4 bg-slate-50 rounded-2xl focus:ring-2 focus:ring-blue-500/20 font-medium text-slate-700" />
              </div>

              <div className="relative group">
                <label className="block text-sm font-bold text-slate-500 mb-2 ml-2">Est. Duration (mins)</label>
                <input type="number" name="duration" min="1" required value={formData.duration} onChange={handleChange} className="block w-full px-4 py-4 bg-slate-50 rounded-2xl focus:ring-2 focus:ring-blue-500/20 font-medium text-slate-700" />
              </div>

              <div className="relative group">
                <label className="block text-sm font-bold text-slate-500 mb-2 ml-2">Seats Available</label>
                <input type="number" name="seatsAvailable" min="1" required value={formData.seatsAvailable} onChange={handleChange} className="block w-full px-4 py-4 bg-slate-50 rounded-2xl focus:ring-2 focus:ring-blue-500/20 font-medium text-slate-700" />
              </div>

              <div className="md:col-span-2 relative group">
                <label className="block text-sm font-bold text-slate-500 mb-2 ml-2">Price per Seat (₹)</label>
                <input type="number" name="price" min="0" required value={formData.price} onChange={handleChange} className="block w-full px-4 py-4 bg-slate-50 rounded-2xl focus:ring-2 focus:ring-blue-500/20 font-medium text-slate-700" />
              </div>
              
              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-slate-100 pt-8 mt-4">
                <div className="md:col-span-2"><h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Car className="w-5 h-5 text-blue-500" /> Vehicle Details</h3></div>
                <select name="vehicle.type" value={formData.vehicle.type} onChange={handleChange} className="block w-full px-4 py-4 bg-slate-50 rounded-2xl font-medium text-slate-700">
                  <option value="car">Car</option><option value="bike">Bike</option><option value="auto">Auto</option><option value="van">Van</option>
                </select>
                <input type="text" name="vehicle.brand" placeholder="Brand" value={formData.vehicle.brand} onChange={handleChange} className="block w-full px-4 py-4 bg-slate-50 rounded-2xl font-medium text-slate-700" />
                <input type="text" name="vehicle.model" placeholder="Model" value={formData.vehicle.model} onChange={handleChange} className="block w-full px-4 py-4 bg-slate-50 rounded-2xl font-medium text-slate-700" />
                <input type="text" name="vehicle.number" placeholder="License Plate" value={formData.vehicle.number} onChange={handleChange} className="block w-full px-4 py-4 bg-slate-50 rounded-2xl font-medium text-slate-700 uppercase" />

                <div className="md:col-span-2">
                  <label className="block text-sm font-bold text-slate-500 mb-3 ml-2">Update Vehicle Image</label>
                  <div onClick={() => fileInputRef.current?.click()} className="relative border-2 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center cursor-pointer">
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
                    {imagePreview ? <img src={imagePreview} className="w-full max-w-sm aspect-video object-cover rounded-2xl shadow-lg" alt="Preview" /> : <div className="text-center"><ImageIcon className="mx-auto h-12 w-12 text-slate-300" /><p className="mt-2 text-slate-500">Click to upload new photo</p></div>}
                  </div>
                </div>
              </div>

              <div className="md:col-span-2 relative group">
                <label className="block text-sm font-bold text-slate-500 mb-2 ml-2">Description</label>
                <textarea name="description" rows="3" value={formData.description} onChange={handleChange} className="block w-full px-4 py-4 bg-slate-50 rounded-2xl focus:ring-2 focus:ring-blue-500/20 font-medium text-slate-700" />
              </div>
            </div>

            <button type="submit" disabled={saving} className="w-full py-5 rounded-3xl bg-blue-600 text-white font-black text-lg hover:bg-blue-700 shadow-xl flex items-center justify-center gap-3 disabled:opacity-70">
              {saving ? 'Saving...' : 'Update Ride'} <ArrowRight className="w-6 h-6" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default EditRide;
