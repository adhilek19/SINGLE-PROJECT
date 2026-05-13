import { FileText, Trash2, UploadCloud } from 'lucide-react';

const statusStyles = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-rose-100 text-rose-700',
};

const DocumentUploader = ({
  title,
  documentType,
  value,
  uploading = false,
  deleting = false,
  onUpload,
  onDelete,
}) => {
  const status = String(value?.status || 'pending');
  const hasDocument = Boolean(value?.url);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="text-sm font-black text-slate-900">{title}</h4>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-bold ${
            statusStyles[status] || statusStyles.pending
          }`}
        >
          {status}
        </span>
      </div>

      {hasDocument ? (
        <div className="space-y-3">
          <a
            href={value.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-800"
          >
            <FileText className="h-4 w-4" />
            View uploaded document
          </a>
          {value?.rejectionReason ? (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
              Rejected: {value.rejectionReason}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => onDelete?.(documentType)}
            disabled={deleting || uploading}
            className="inline-flex items-center gap-1 rounded-xl border border-rose-300 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {deleting ? 'Removing...' : 'Remove'}
          </button>
        </div>
      ) : (
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:border-blue-300">
          <UploadCloud className="h-3.5 w-3.5" />
          {uploading ? 'Uploading...' : 'Upload document'}
          <input
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
            className="hidden"
            disabled={uploading || deleting}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              onUpload?.(documentType, file);
              event.target.value = '';
            }}
          />
        </label>
      )}
    </div>
  );
};

export default DocumentUploader;
