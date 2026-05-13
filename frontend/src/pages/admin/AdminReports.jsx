import { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { adminService, getErrorMessage } from '../../services/api';

const reportStatuses = ['', 'pending', 'reviewed', 'resolved'];

const formatDate = (value) => {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return '—';
  return new Date(time).toLocaleString();
};

const AdminReports = () => {
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [reports, setReports] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusDraftByReport, setStatusDraftByReport] = useState({});
  const [actionLoadingByReport, setActionLoadingByReport] = useState({});

  const params = useMemo(
    () => ({ status: statusFilter, page, limit: 20 }),
    [statusFilter, page]
  );

  const loadReports = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await adminService.getReports(params);
      const payload = response?.data?.data || {};
      const reportList = Array.isArray(payload.reports) ? payload.reports : [];
      setReports(reportList);
      setPagination(payload.pagination || { page, totalPages: 1, total: 0, limit: params.limit });
      setStatusDraftByReport((prev) => {
        const next = { ...prev };
        reportList.forEach((report) => {
          const reportId = String(report?._id || '');
          if (!next[reportId]) next[reportId] = String(report?.status || 'pending');
        });
        return next;
      });
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load reports'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadReports();
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.status, params.page, params.limit]);

  const updateReportStatus = async (reportId) => {
    const nextStatus = String(statusDraftByReport[reportId] || '').trim();
    if (!nextStatus) return;

    setActionLoadingByReport((prev) => ({ ...prev, [reportId]: true }));
    try {
      await adminService.updateReportStatus(reportId, nextStatus);
      await loadReports();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to update report status'));
    } finally {
      setActionLoadingByReport((prev) => ({ ...prev, [reportId]: false }));
    }
  };

  return (
    <AdminLayout title="Manage Reports" subtitle="Review abuse and safety reports from rides.">
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setPage(1);
            }}
            className="w-full max-w-[220px] rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            {reportStatuses.map((status) => (
              <option key={status || 'all'} value={status}>
                {status ? `Status: ${status}` : 'All statuses'}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-slate-200 bg-white">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-slate-700" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : reports.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500">
            No reports found for this filter.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600">Reporter</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600">Reported User</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600">Reason</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600">Description</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reports.map((report) => {
                  const reportId = String(report?._id || '');
                  const rowBusy = Boolean(actionLoadingByReport[reportId]);

                  return (
                    <tr key={reportId}>
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-900">
                        {report?.reportedBy?.name || 'Unknown'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">
                        {report?.reportedUser?.name || 'Not specified'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-800">
                        {report?.reason || '—'}
                      </td>
                      <td className="max-w-xs px-4 py-3 text-sm text-slate-700">{report?.description || '—'}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">{report?.status || 'pending'}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">{formatDate(report?.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={statusDraftByReport[reportId] || String(report?.status || 'pending')}
                            onChange={(event) =>
                              setStatusDraftByReport((prev) => ({
                                ...prev,
                                [reportId]: event.target.value,
                              }))
                            }
                            className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700"
                          >
                            {reportStatuses
                              .filter(Boolean)
                              .map((status) => (
                                <option key={status} value={status}>
                                  {status}
                                </option>
                              ))}
                          </select>
                          <button
                            type="button"
                            disabled={rowBusy}
                            onClick={() => updateReportStatus(reportId)}
                            className="rounded-lg border border-blue-300 px-2.5 py-1.5 text-xs font-bold text-blue-700 disabled:opacity-50"
                          >
                            Update
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-3 text-sm">
          <p className="font-semibold text-slate-600">
            Total: <span className="text-slate-900">{Number(pagination?.total || 0)}</span>
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={Number(pagination?.page || 1) <= 1}
              className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 disabled:opacity-50"
            >
              Prev
            </button>
            <span className="font-bold text-slate-700">
              {Number(pagination?.page || 1)} / {Math.max(1, Number(pagination?.totalPages || 1))}
            </span>
            <button
              type="button"
              onClick={() =>
                setPage((prev) =>
                  Math.min(Math.max(1, Number(pagination?.totalPages || 1)), prev + 1)
                )
              }
              disabled={Number(pagination?.page || 1) >= Number(pagination?.totalPages || 1)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminReports;
