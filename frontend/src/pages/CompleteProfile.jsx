import { useEffect, useMemo, useState } from 'react';
import { Camera, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import AvatarPicker from '../components/AvatarPicker';
import DocumentUploader from '../components/DocumentUploader';
import ProfileImageCropper from '../components/ProfileImageCropper';
import VehicleDetailsForm from '../components/VehicleDetailsForm';
import UserAvatar from '../components/common/UserAvatar';
import { setUser } from '../redux/slices/authSlice';
import { authService, getErrorMessage } from '../services/api';

const totalSteps = 4;

const initialDocs = {
  idProof: { url: '', status: 'pending' },
  drivingLicense: { url: '', status: 'pending' },
  vehicleDocument: { url: '', status: 'pending' },
};

const CompleteProfile = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useSelector((state) => state.auth.user);

  const [step, setStep] = useState(1);
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [selectedAvatar, setSelectedAvatar] = useState(user?.selectedAvatar || '');
  const [cropSourceFile, setCropSourceFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingDocs, setUploadingDocs] = useState({});
  const [deletingDocs, setDeletingDocs] = useState({});
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [deletingVehicle, setDeletingVehicle] = useState(false);
  const [vehicleDraft, setVehicleDraft] = useState({
    type: user?.vehicle?.type || '',
    brand: user?.vehicle?.brand || '',
    model: user?.vehicle?.model || '',
    number: user?.vehicle?.number || '',
    seats: user?.vehicle?.seats || '',
    image: user?.vehicle?.image || '',
  });

  const uploadedImageUrl = user?.profileImage?.url || '';
  const verificationDocs = {
    ...initialDocs,
    ...(user?.verificationDocuments || {}),
  };

  const previewUser = useMemo(
    () => ({
      ...user,
      selectedAvatar,
      name,
    }),
    [name, selectedAvatar, user]
  );

  const requiredComplete = useMemo(
    () =>
      Boolean(String(name || '').trim()) &&
      Boolean(String(phone || '').trim()) &&
      Boolean(uploadedImageUrl || selectedAvatar),
    [name, phone, uploadedImageUrl, selectedAvatar]
  );

  const localProgress = useMemo(() => {
    let done = 0;
    if (String(name || '').trim()) done += 1;
    if (String(phone || '').trim()) done += 1;
    if (uploadedImageUrl || selectedAvatar) done += 1;
    return Math.round((done / 3) * 100);
  }, [name, phone, uploadedImageUrl, selectedAvatar]);

  useEffect(() => {
    if (user?.isProfileCompleted) {
      navigate(location.state?.from || '/', { replace: true });
    }
  }, [location.state?.from, navigate, user?.isProfileCompleted]);

  const applyUserResponse = (nextUser) => {
    if (!nextUser) return;
    dispatch(setUser(nextUser));
    setSelectedAvatar(nextUser.selectedAvatar || '');
    setVehicleDraft({
      type: nextUser?.vehicle?.type || '',
      brand: nextUser?.vehicle?.brand || '',
      model: nextUser?.vehicle?.model || '',
      number: nextUser?.vehicle?.number || '',
      seats: nextUser?.vehicle?.seats || '',
      image: nextUser?.vehicle?.image || '',
    });
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
      applyUserResponse(res.data?.data?.user);
      toast.success('Profile image uploaded.');
      setCropSourceFile(null);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Profile image upload failed'));
    } finally {
      setUploadingImage(false);
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
      applyUserResponse(res.data?.data?.user);
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
      applyUserResponse(res.data?.data?.user);
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
    if (!payload.type || !payload.brand || !payload.model || !payload.number || !payload.seats) {
      toast.error('Vehicle type, brand, model, number and seats are required.');
      return;
    }
    try {
      setSavingVehicle(true);
      const res = await authService.patchVehicle(payload);
      applyUserResponse(res.data?.data?.user);
      toast.success('Vehicle details saved');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save vehicle'));
    } finally {
      setSavingVehicle(false);
    }
  };

  const handleDeleteVehicle = async () => {
    const confirmed = window.confirm('Delete saved vehicle details?');
    if (!confirmed) return;
    try {
      setDeletingVehicle(true);
      const res = await authService.deleteVehicle();
      applyUserResponse(res.data?.data?.user);
      toast.success('Vehicle removed');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to remove vehicle'));
    } finally {
      setDeletingVehicle(false);
    }
  };

  const handleNext = () => {
    if (step === 2 && !requiredComplete) {
      toast.error('Name, phone and profile image or avatar are required.');
      return;
    }
    setStep((prev) => Math.min(totalSteps, prev + 1));
  };

  const handleFinish = async () => {
    if (!requiredComplete) {
      toast.error('Complete required profile fields first.');
      setStep(2);
      return;
    }
    try {
      setSaving(true);
      const res = await authService.patchProfile({
        name: String(name || '').trim(),
        phone: String(phone || '').trim(),
        selectedAvatar: selectedAvatar || '',
      });
      applyUserResponse(res.data?.data?.user);
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
      <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <div className="mb-6 flex flex-col items-center gap-4 text-center">
          <UserAvatar user={previewUser} size="xl" />
          <div>
            <h1 className="text-2xl font-black text-slate-900">Complete Your Profile</h1>
            <p className="mt-1 text-sm text-slate-500">
              Finish required profile setup before posting rides.
            </p>
          </div>
          <div className="w-full max-w-md">
            <div className="mb-1 flex items-center justify-between text-xs font-bold text-slate-500">
              <span>Required completion</span>
              <span>{Math.max(localProgress, Number(user?.profileCompletionPercentage || 0))}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.max(localProgress, Number(user?.profileCompletionPercentage || 0))}%` }}
              />
            </div>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-4 gap-2">
          {Array.from({ length: totalSteps }).map((_, index) => {
            const stepNo = index + 1;
            const active = stepNo === step;
            const done = stepNo < step;
            return (
              <div
                key={stepNo}
                className={`rounded-xl border px-2 py-2 text-center text-xs font-bold ${
                  active
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : done
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-slate-50 text-slate-500'
                }`}
              >
                Step {stepNo}
              </div>
            );
          })}
        </div>

        {step === 1 ? (
          <div className="space-y-4">
            <h2 className="text-lg font-black text-slate-900">Step 1: Basic details</h2>
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
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <h2 className="text-lg font-black text-slate-900">Step 2: Profile image or avatar</h2>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
                <Camera className="h-4 w-4" />
                {uploadingImage ? 'Uploading...' : 'Upload profile image'}
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
            {!requiredComplete ? (
              <p className="text-xs font-semibold text-amber-700">
                Name, phone and profile image or avatar are required to continue.
              </p>
            ) : (
              <p className="text-xs font-semibold text-emerald-700">
                Required profile fields are complete.
              </p>
            )}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4">
            <h2 className="text-lg font-black text-slate-900">Step 3: Vehicle details (optional)</h2>
            <VehicleDetailsForm
              value={vehicleDraft}
              onChange={setVehicleDraft}
              onSave={handleSaveVehicle}
              onDelete={handleDeleteVehicle}
              saving={savingVehicle}
              deleting={deletingVehicle}
            />
            <p className="text-xs font-semibold text-slate-500">
              You can skip now and add vehicle details later from profile.
            </p>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-4">
            <h2 className="text-lg font-black text-slate-900">Step 4: Documents (optional)</h2>
            <div className="grid gap-3 md:grid-cols-3">
              <DocumentUploader
                title="ID Proof"
                documentType="idProof"
                value={verificationDocs.idProof}
                uploading={Boolean(uploadingDocs.idProof)}
                deleting={Boolean(deletingDocs.idProof)}
                onUpload={handleUploadDocument}
                onDelete={handleDeleteDocument}
              />
              <DocumentUploader
                title="Driving License"
                documentType="drivingLicense"
                value={verificationDocs.drivingLicense}
                uploading={Boolean(uploadingDocs.drivingLicense)}
                deleting={Boolean(deletingDocs.drivingLicense)}
                onUpload={handleUploadDocument}
                onDelete={handleDeleteDocument}
              />
              <DocumentUploader
                title="Vehicle Document"
                documentType="vehicleDocument"
                value={verificationDocs.vehicleDocument}
                uploading={Boolean(uploadingDocs.vehicleDocument)}
                deleting={Boolean(deletingDocs.vehicleDocument)}
                onUpload={handleUploadDocument}
                onDelete={handleDeleteDocument}
              />
            </div>
          </div>
        ) : null}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setStep((prev) => Math.max(1, prev - 1))}
            disabled={step <= 1 || saving}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>

          {step < totalSteps ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={saving || uploadingImage}
              className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              Continue
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinish}
              disabled={!requiredComplete || saving || uploadingImage}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white disabled:opacity-60"
            >
              <CheckCircle2 className="h-4 w-4" />
              {saving ? 'Saving...' : 'Finish Profile Setup'}
            </button>
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

export default CompleteProfile;
