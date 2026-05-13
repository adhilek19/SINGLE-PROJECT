import { useEffect, useMemo, useState } from 'react';
import { Camera, CheckCircle2, UserCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import AvatarPicker from '../components/AvatarPicker';
import ProfileImageCropper from '../components/ProfileImageCropper';
import { getDefaultAvatarByKey } from '../constants/avatars';
import { setUser } from '../redux/slices/authSlice';
import { authService, getErrorMessage } from '../services/api';

const CompleteProfile = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useSelector((state) => state.auth.user);

  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [selectedAvatar, setSelectedAvatar] = useState(user?.selectedAvatar || '');
  const [cropSourceFile, setCropSourceFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const uploadedImageUrl = user?.profileImage?.url || '';
  const selectedAvatarUrl = getDefaultAvatarByKey(selectedAvatar)?.url || '';
  const previewImage = uploadedImageUrl || selectedAvatarUrl || user?.profilePic || '';

  const canSubmit = useMemo(
    () =>
      Boolean(String(name || '').trim()) &&
      Boolean(String(phone || '').trim()) &&
      Boolean(uploadedImageUrl || selectedAvatar),
    [name, phone, uploadedImageUrl, selectedAvatar]
  );

  useEffect(() => {
    if (user?.isProfileCompleted) {
      navigate(location.state?.from || '/', { replace: true });
    }
  }, [location.state?.from, navigate, user?.isProfileCompleted]);

  const applyUserResponse = (nextUser) => {
    if (!nextUser) return;
    dispatch(setUser(nextUser));
    setSelectedAvatar(nextUser.selectedAvatar || '');
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
      const nextUser = res.data?.data?.user;
      applyUserResponse(nextUser);
      toast.success('Profile image uploaded.');
      setCropSourceFile(null);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Profile image upload failed'));
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!canSubmit) {
      toast.error('Name, phone, and profile photo/avatar are required.');
      return;
    }

    try {
      setSaving(true);
      const res = await authService.patchProfile({
        name: String(name || '').trim(),
        phone: String(phone || '').trim(),
        selectedAvatar: selectedAvatar || '',
      });
      const nextUser = res.data?.data?.user;
      applyUserResponse(nextUser);
      toast.success('Profile completed successfully.');
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to complete profile'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-grow bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-black text-slate-900">Complete Your Profile</h1>
          <p className="mt-2 text-sm text-slate-500">
            Add required details before posting rides.
          </p>
        </div>

        <div className="mb-6 flex justify-center">
          {previewImage ? (
            <img
              src={previewImage}
              alt="Profile preview"
              className="h-24 w-24 rounded-full border-4 border-white object-cover shadow-md"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <UserCircle2 className="h-12 w-12" />
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Full name"
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
            />
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="Phone number"
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-3 text-sm font-black text-slate-800">Upload profile photo</p>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
              <Camera className="h-4 w-4" />
              {uploadingImage ? 'Uploading...' : 'Select Image'}
              <input
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                className="hidden"
                disabled={uploadingImage || saving}
                onChange={handlePickImage}
              />
            </label>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-3 text-sm font-black text-slate-800">Or choose a default avatar</p>
            <AvatarPicker
              value={selectedAvatar}
              onChange={setSelectedAvatar}
              disabled={saving || uploadingImage}
            />
          </div>

          <button
            type="button"
            onClick={handleSaveProfile}
            disabled={!canSubmit || saving || uploadingImage}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white disabled:opacity-60"
          >
            <CheckCircle2 className="h-4 w-4" />
            {saving ? 'Saving...' : 'Finish Profile Setup'}
          </button>
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

export default CompleteProfile;
