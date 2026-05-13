import { useCallback, useEffect, useMemo, useState } from 'react';
import { Camera, CheckCircle2, Trash2, UserCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useDispatch } from 'react-redux';
import AvatarPicker from '../components/AvatarPicker';
import DocumentUploader from '../components/DocumentUploader';
import ProfileImageCropper from '../components/ProfileImageCropper';
import VehicleDetailsForm from '../components/VehicleDetailsForm';
import { getDefaultAvatarByKey } from '../constants/avatars';
import { setUser } from '../redux/slices/authSlice';
import { authService, getErrorMessage } from '../services/api';

const initialDocs = {
  idProof: {
    url: '',
    type: '',
    mimeType: '',
    uploadedAt: null,
    status: 'pending',
    rejectionReason: '',
  },
  drivingLicense: {
    url: '',
    type: '',
    mimeType: '',
    uploadedAt: null,
    status: 'pending',
    rejectionReason: '',
  },
  vehicleDocument: {
    url: '',
    type: '',
    mimeType: '',
    uploadedAt: null,
    status: 'pending',
    rejectionReason: '',
  },
};

const Profile = () => {
  const dispatch = useDispatch();

  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [deletingImage, setDeletingImage] = useState(false);
  const [cropSourceFile, setCropSourceFile] = useState(null);
  const [uploadingDocs, setUploadingDocs] = useState({});
  const [deletingDocs, setDeletingDocs] = useState({});
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [deletingVehicle, setDeletingVehicle] = useState(false);

  const [profile, setProfile] = useState({
    name: '',
    email: '',
    phone: '',
    bio: '',
    selectedAvatar: '',
    profilePic: '',
    profileImage: { url: '', uploadedAt: null },
    verificationDocuments: initialDocs,
    vehicle: {
      type: '',
      brand: '',
      model: '',
      number: '',
      seats: '',
      image: '',
    },
    isProfileCompleted: false,
    profileCompletionPercentage: 0,
  });

  const [vehicleDraft, setVehicleDraft] = useState(profile.vehicle);

  const applyUser = useCallback(
    (user) => {
      if (!user) return;
      const nextProfile = {
        name: user?.name || '',
        email: user?.email || '',
        phone: user?.phone || '',
        bio: user?.bio || '',
        selectedAvatar: user?.selectedAvatar || '',
        profilePic: user?.profilePic || '',
        profileImage: user?.profileImage || { url: '', uploadedAt: null },
        isProfileCompleted: Boolean(user?.isProfileCompleted),
        profileCompletionPercentage: Number(user?.profileCompletionPercentage || 0),
        verificationDocuments: {
          ...initialDocs,
          ...(user.verificationDocuments || {}),
        },
        vehicle: {
          type: user?.vehicle?.type || '',
          brand: user?.vehicle?.brand || '',
          model: user?.vehicle?.model || '',
          number: user?.vehicle?.number || '',
          seats:
            Number.isFinite(Number(user?.vehicle?.seats)) && Number(user.vehicle.seats) > 0
              ? Number(user.vehicle.seats)
              : '',
          image: user?.vehicle?.image || '',
        },
      };
      setProfile(nextProfile);
      setVehicleDraft(nextProfile.vehicle);
      dispatch(setUser(user));
    },
    [dispatch]
  );

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      const res = await authService.getProfile();
      applyUser(res.data?.data?.user || null);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load profile'));
    } finally {
      setLoading(false);
    }
  }, [applyUser]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadProfile();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadProfile]);

  const profileImagePreview = useMemo(() => {
    if (profile?.profileImage?.url) return profile.profileImage.url;
    const avatar = getDefaultAvatarByKey(profile?.selectedAvatar);
    if (avatar?.url) return avatar.url;
    return profile?.profilePic || '';
  }, [profile]);

  const handleSaveProfile = async () => {
    try {
      setSavingProfile(true);
      const payload = {
        name: String(profile.name || '').trim(),
        phone: String(profile.phone || '').trim(),
        bio: String(profile.bio || '').trim(),
        selectedAvatar: profile.selectedAvatar || '',
      };
      const res = await authService.patchProfile(payload);
      applyUser(res.data?.data?.user || null);
      toast.success('Profile updated');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update profile'));
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePickImage = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const mime = String(file.type || '').toLowerCase();
    const allowed = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
    if (!allowed.has(mime)) {
      toast.error('Use JPG, JPEG, PNG, or WEBP image only.');
      event.target.value = '';
      return;
    }
    if (Number(file.size || 0) > 5 * 1024 * 1024) {
      toast.error('Image size must be 5MB or less.');
      event.target.value = '';
      return;
    }

    setCropSourceFile(file);
    event.target.value = '';
  };

  const handleUploadCropped = async (croppedFile) => {
    try {
      setUploadingImage(true);
      const res = await authService.uploadProfileImage(croppedFile);
      applyUser(res.data?.data?.user || null);
      setCropSourceFile(null);
      toast.success('Profile image uploaded');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Profile image upload failed'));
    } finally {
      setUploadingImage(false);
    }
  };

  const handleDeleteProfileImage = async () => {
    try {
      setDeletingImage(true);
      const res = await authService.deleteProfileImage();
      applyUser(res.data?.data?.user || null);
      toast.success('Profile image removed');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to remove profile image'));
    } finally {
      setDeletingImage(false);
    }
  };

  const handleUploadDocument = async (documentType, file) => {
    const mime = String(file?.type || '').toLowerCase();
    const allowed = new Set([
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'application/pdf',
    ]);
    if (!allowed.has(mime)) {
      toast.error('Use image or PDF files only.');
      return;
    }
    if (Number(file?.size || 0) > 10 * 1024 * 1024) {
      toast.error('Document size must be 10MB or less.');
      return;
    }

    try {
      setUploadingDocs((prev) => ({ ...prev, [documentType]: true }));
      const res = await authService.uploadProfileDocument({ documentType, file });
      applyUser(res.data?.data?.user || null);
      toast.success('Document uploaded');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Document upload failed'));
    } finally {
      setUploadingDocs((prev) => ({ ...prev, [documentType]: false }));
    }
  };

  const handleDeleteDocument = async (documentType) => {
    try {
      setDeletingDocs((prev) => ({ ...prev, [documentType]: true }));
      const res = await authService.deleteProfileDocument(documentType);
      applyUser(res.data?.data?.user || null);
      toast.success('Document removed');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to remove document'));
    } finally {
      setDeletingDocs((prev) => ({ ...prev, [documentType]: false }));
    }
  };

  const handleSaveVehicle = async () => {
    const payload = {
      ...vehicleDraft,
      number: String(vehicleDraft?.number || '').trim().toUpperCase(),
      seats: Number(vehicleDraft?.seats || 0),
    };

    if (!payload.type || !payload.number || !payload.model || !payload.brand || !payload.seats) {
      toast.error('Vehicle type, brand, model, number, and seats are required.');
      return;
    }

    try {
      setSavingVehicle(true);
      const res = await authService.patchVehicle(payload);
      applyUser(res.data?.data?.user || null);
      toast.success('Vehicle saved');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save vehicle'));
    } finally {
      setSavingVehicle(false);
    }
  };

  const handleDeleteVehicle = async () => {
    try {
      setDeletingVehicle(true);
      const res = await authService.deleteVehicle();
      applyUser(res.data?.data?.user || null);
      toast.success('Vehicle removed');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to remove vehicle'));
    } finally {
      setDeletingVehicle(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-300 border-t-blue-600" />
      </div>
    );
  }

  return (
    <div className="flex-grow bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col items-center gap-4 text-center">
            {profileImagePreview ? (
              <img
                src={profileImagePreview}
                alt="Profile"
                className="h-24 w-24 rounded-full border-4 border-white object-cover shadow-md"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <UserCircle2 className="h-12 w-12" />
              </div>
            )}
            <div>
              <h1 className="text-2xl font-black text-slate-900">My Profile</h1>
              <p className="text-sm text-slate-500">{profile.email || ''}</p>
              <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {profile.profileCompletionPercentage || 0}% completed
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <h2 className="mb-4 text-lg font-black text-slate-900">Basic Details</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <input
              value={profile.name || ''}
              onChange={(event) => setProfile((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Full name"
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
            />
            <input
              value={profile.phone || ''}
              onChange={(event) => setProfile((prev) => ({ ...prev, phone: event.target.value }))}
              placeholder="Phone number"
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
            />
            <textarea
              value={profile.bio || ''}
              onChange={(event) => setProfile((prev) => ({ ...prev, bio: event.target.value }))}
              placeholder="Bio"
              rows={3}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm md:col-span-2"
            />
          </div>

          <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-black text-slate-800">Profile image</p>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
                <Camera className="h-4 w-4" />
                {uploadingImage ? 'Uploading...' : 'Upload image'}
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  className="hidden"
                  disabled={uploadingImage || deletingImage}
                  onChange={handlePickImage}
                />
              </label>
              {profile?.profileImage?.url ? (
                <button
                  type="button"
                  onClick={handleDeleteProfileImage}
                  disabled={uploadingImage || deletingImage}
                  className="inline-flex items-center gap-1 rounded-xl border border-rose-300 px-4 py-2 text-sm font-bold text-rose-700 disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" />
                  {deletingImage ? 'Removing...' : 'Remove image'}
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-3 text-sm font-black text-slate-800">Default avatars</p>
            <AvatarPicker
              value={profile.selectedAvatar || ''}
              onChange={(avatarKey) => setProfile((prev) => ({ ...prev, selectedAvatar: avatarKey }))}
              disabled={savingProfile}
            />
          </div>

          <button
            type="button"
            onClick={handleSaveProfile}
            disabled={savingProfile || uploadingImage}
            className="mt-5 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-black text-white disabled:opacity-60"
          >
            {savingProfile ? 'Saving...' : 'Save Basic Profile'}
          </button>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <h2 className="mb-4 text-lg font-black text-slate-900">Verification Documents</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <DocumentUploader
              title="ID Proof"
              documentType="idProof"
              value={profile.verificationDocuments?.idProof}
              uploading={Boolean(uploadingDocs.idProof)}
              deleting={Boolean(deletingDocs.idProof)}
              onUpload={handleUploadDocument}
              onDelete={handleDeleteDocument}
            />
            <DocumentUploader
              title="Driving License"
              documentType="drivingLicense"
              value={profile.verificationDocuments?.drivingLicense}
              uploading={Boolean(uploadingDocs.drivingLicense)}
              deleting={Boolean(deletingDocs.drivingLicense)}
              onUpload={handleUploadDocument}
              onDelete={handleDeleteDocument}
            />
            <DocumentUploader
              title="Vehicle Document"
              documentType="vehicleDocument"
              value={profile.verificationDocuments?.vehicleDocument}
              uploading={Boolean(uploadingDocs.vehicleDocument)}
              deleting={Boolean(deletingDocs.vehicleDocument)}
              onUpload={handleUploadDocument}
              onDelete={handleDeleteDocument}
            />
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <h2 className="mb-4 text-lg font-black text-slate-900">Vehicle Details</h2>
          <VehicleDetailsForm
            value={vehicleDraft}
            onChange={setVehicleDraft}
            onSave={handleSaveVehicle}
            onDelete={handleDeleteVehicle}
            saving={savingVehicle}
            deleting={deletingVehicle}
          />
        </div>
      </div>

      <ProfileImageCropper
        file={cropSourceFile}
        isSubmitting={uploadingImage}
        onCancel={() => setCropSourceFile(null)}
        onCropped={handleUploadCropped}
      />
    </div>
  );
};

export default Profile;
