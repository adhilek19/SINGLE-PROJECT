import { useCallback, useEffect, useMemo, useState } from 'react';
import { Camera, CheckCircle2, Edit3, FileBadge2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useDispatch } from 'react-redux';
import AvatarPicker from '../components/AvatarPicker';
import DocumentUploader from '../components/DocumentUploader';
import ProfileImageCropper from '../components/ProfileImageCropper';
import VehicleDetailsForm from '../components/VehicleDetailsForm';
import UserAvatar, { getUserAvatarUrl } from '../components/common/UserAvatar';
import Skeleton from '../components/common/Skeleton';
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

const sectionButtonClass =
  'inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50';

const SectionHeader = ({ title, description = '', onEdit, editLabel = 'Edit' }) => (
  <div className="mb-4 flex items-start justify-between gap-3">
    <div>
      <h2 className="text-lg font-black text-slate-900">{title}</h2>
      {description ? <p className="text-sm text-slate-500">{description}</p> : null}
    </div>
    {onEdit ? (
      <button type="button" onClick={onEdit} className={sectionButtonClass}>
        <Edit3 className="h-3.5 w-3.5" />
        {editLabel}
      </button>
    ) : null}
  </div>
);

const Profile = () => {
  const dispatch = useDispatch();

  const [loading, setLoading] = useState(true);
  const [savingBasic, setSavingBasic] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [deletingImage, setDeletingImage] = useState(false);
  const [cropSourceFile, setCropSourceFile] = useState(null);
  const [uploadingDocs, setUploadingDocs] = useState({});
  const [deletingDocs, setDeletingDocs] = useState({});
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [deletingVehicle, setDeletingVehicle] = useState(false);
  const [editSection, setEditSection] = useState(null);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);

  const [profile, setProfile] = useState({
    name: '',
    email: '',
    phone: '',
    bio: '',
    selectedAvatar: '',
    profilePic: '',
    profileImage: { url: '', uploadedAt: null },
    verificationDocuments: initialDocs,
    vehicle: { type: '', brand: '', model: '', number: '', seats: '', image: '' },
    isProfileCompleted: false,
    profileCompletionPercentage: 0,
  });

  const [basicDraft, setBasicDraft] = useState({ name: '', phone: '', bio: '' });
  const [avatarDraft, setAvatarDraft] = useState('');
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
      setBasicDraft({
        name: nextProfile.name,
        phone: nextProfile.phone,
        bio: nextProfile.bio,
      });
      setAvatarDraft(nextProfile.selectedAvatar || '');
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

  const documentSummary = useMemo(() => {
    const docs = profile.verificationDocuments || initialDocs;
    const keys = Object.keys(docs);
    const uploadedCount = keys.filter((key) => docs[key]?.url).length;
    const approvedCount = keys.filter((key) => docs[key]?.status === 'approved').length;
    return { uploadedCount, approvedCount, total: keys.length };
  }, [profile.verificationDocuments]);

  const avatarDisplayUser = useMemo(
    () => ({
      ...profile,
      selectedAvatar: editSection === 'avatar' ? avatarDraft : profile.selectedAvatar,
    }),
    [editSection, avatarDraft, profile]
  );

  const openEditSection = (section) => {
    setEditSection(section);
    if (section === 'basic') {
      setBasicDraft({ name: profile.name, phone: profile.phone, bio: profile.bio });
    } else if (section === 'avatar') {
      setAvatarDraft(profile.selectedAvatar || '');
      setAvatarPickerOpen(false);
    } else if (section === 'vehicle') {
      setVehicleDraft(profile.vehicle);
    }
  };

  const cancelEdit = () => {
    setEditSection(null);
    setAvatarPickerOpen(false);
    setBasicDraft({ name: profile.name, phone: profile.phone, bio: profile.bio });
    setAvatarDraft(profile.selectedAvatar || '');
    setVehicleDraft(profile.vehicle);
  };

  const handleSaveBasic = async () => {
    try {
      setSavingBasic(true);
      const res = await authService.patchProfile({
        name: String(basicDraft.name || '').trim(),
        phone: String(basicDraft.phone || '').trim(),
        bio: String(basicDraft.bio || '').trim(),
      });
      applyUser(res.data?.data?.user || null);
      setEditSection(null);
      toast.success('Basic profile updated');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update profile'));
    } finally {
      setSavingBasic(false);
    }
  };

  const handleSaveAvatar = async () => {
    try {
      setSavingAvatar(true);
      const res = await authService.patchProfile({ selectedAvatar: avatarDraft || '' });
      applyUser(res.data?.data?.user || null);
      setEditSection(null);
      setAvatarPickerOpen(false);
      toast.success('Avatar updated');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save avatar'));
    } finally {
      setSavingAvatar(false);
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
      setEditSection(null);
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
      setEditSection(null);
      toast.success('Profile image removed');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to remove profile image'));
    } finally {
      setDeletingImage(false);
    }
  };

  const handleUploadDocument = async (documentType, file) => {
    const mime = String(file?.type || '').toLowerCase();
    const allowed = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']);
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
      setEditSection(null);
      toast.success('Vehicle saved');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save vehicle'));
    } finally {
      setSavingVehicle(false);
    }
  };

  const handleDeleteVehicle = async () => {
    const confirmed = window.confirm('Delete vehicle details from profile?');
    if (!confirmed) return;
    try {
      setDeletingVehicle(true);
      const res = await authService.deleteVehicle();
      applyUser(res.data?.data?.user || null);
      setEditSection(null);
      toast.success('Vehicle removed');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to remove vehicle'));
    } finally {
      setDeletingVehicle(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-grow bg-slate-50 px-4 py-8">
        <div className="mx-auto max-w-4xl space-y-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-grow bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
            <UserAvatar user={profile} size="xl" />
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-black text-slate-900">My Profile</h1>
              <p className="truncate text-sm text-slate-500">{profile.email || ''}</p>
              <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {profile.profileCompletionPercentage || 0}% completed
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <SectionHeader
            title="Basic Profile"
            description="Name, phone and bio"
            onEdit={editSection === 'basic' ? null : () => openEditSection('basic')}
          />

          {editSection === 'basic' ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <input
                  value={basicDraft.name || ''}
                  onChange={(event) => setBasicDraft((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Full name"
                  className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
                />
                <input
                  value={basicDraft.phone || ''}
                  onChange={(event) => setBasicDraft((prev) => ({ ...prev, phone: event.target.value }))}
                  placeholder="Phone number"
                  className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
                />
                <textarea
                  value={basicDraft.bio || ''}
                  onChange={(event) => setBasicDraft((prev) => ({ ...prev, bio: event.target.value }))}
                  placeholder="Bio"
                  rows={3}
                  className="rounded-xl border border-slate-300 px-4 py-3 text-sm md:col-span-2"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSaveBasic}
                  disabled={savingBasic}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                >
                  {savingBasic ? 'Saving...' : 'Save Basic Profile'}
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={savingBasic}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 md:grid-cols-3">
              <p><span className="font-bold text-slate-900">Name:</span> {profile.name || 'Not set'}</p>
              <p><span className="font-bold text-slate-900">Phone:</span> {profile.phone || 'Not set'}</p>
              <p><span className="font-bold text-slate-900">Bio:</span> {profile.bio || 'No bio yet'}</p>
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <SectionHeader
            title="Profile Image & Avatar"
            description="Upload an image or select a default avatar"
            onEdit={editSection === 'avatar' ? null : () => openEditSection('avatar')}
          />

          {editSection === 'avatar' ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <UserAvatar user={avatarDisplayUser} size="lg" />
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

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <button
                  type="button"
                  onClick={() => setAvatarPickerOpen((prev) => !prev)}
                  className="mb-3 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700"
                >
                  {avatarPickerOpen ? 'Hide avatar options' : 'Choose default avatar'}
                </button>
                {avatarPickerOpen ? (
                  <AvatarPicker value={avatarDraft || ''} onChange={setAvatarDraft} disabled={savingAvatar} />
                ) : (
                  <p className="text-xs font-semibold text-slate-500">
                    Current avatar selection is saved. Open options to change.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSaveAvatar}
                  disabled={savingAvatar || uploadingImage}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                >
                  {savingAvatar ? 'Saving...' : 'Save Avatar Preference'}
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={savingAvatar || uploadingImage}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-3">
                <UserAvatar user={profile} size="lg" />
                <div className="text-sm text-slate-600">
                  <p className="font-bold text-slate-900">
                    {profile.profileImage?.url ? 'Uploaded profile image' : getUserAvatarUrl(profile) ? 'Default avatar selected' : 'Initials fallback'}
                  </p>
                  <p className="text-xs text-slate-500">Avatar updates across chats, rides, and admin views.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <SectionHeader
            title="Vehicle Details"
            description="Used for ride posting auto-fill"
            onEdit={editSection === 'vehicle' ? null : () => openEditSection('vehicle')}
          />

          {editSection === 'vehicle' ? (
            <div className="space-y-4">
              <VehicleDetailsForm
                value={vehicleDraft}
                onChange={setVehicleDraft}
                onSave={handleSaveVehicle}
                onDelete={handleDeleteVehicle}
                saving={savingVehicle}
                deleting={deletingVehicle}
              />
              <button
                type="button"
                onClick={cancelEdit}
                disabled={savingVehicle || deletingVehicle}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700"
              >
                Cancel
              </button>
            </div>
          ) : profile.vehicle?.type ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="grid gap-2 text-sm text-slate-700 md:grid-cols-2">
                <p><span className="font-bold text-slate-900">Type:</span> {profile.vehicle.type}</p>
                <p><span className="font-bold text-slate-900">Brand + Model:</span> {profile.vehicle.brand} {profile.vehicle.model}</p>
                <p><span className="font-bold text-slate-900">Vehicle no:</span> {String(profile.vehicle.number || '').toUpperCase()}</p>
                <p><span className="font-bold text-slate-900">Seats:</span> {profile.vehicle.seats || '-'}</p>
              </div>
              {profile.vehicle.image ? (
                <img
                  src={profile.vehicle.image}
                  alt="Vehicle"
                  className="mt-3 h-32 w-full max-w-xs rounded-xl object-cover"
                />
              ) : null}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
              No vehicle details yet. Add your vehicle to auto-fill ride posting.
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <SectionHeader
            title="Verification Documents"
            description="ID proof, driving license and vehicle document"
            onEdit={editSection === 'documents' ? null : () => setEditSection('documents')}
          />

          {editSection === 'documents' ? (
            <div className="space-y-4">
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
              <button
                type="button"
                onClick={() => setEditSection(null)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <div className="flex items-center gap-2">
                <FileBadge2 className="h-4 w-4 text-slate-500" />
                <p>
                  Uploaded: <span className="font-bold text-slate-900">{documentSummary.uploadedCount}/{documentSummary.total}</span>
                  {' · '}
                  Approved: <span className="font-bold text-emerald-700">{documentSummary.approvedCount}</span>
                </p>
              </div>
            </div>
          )}
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
