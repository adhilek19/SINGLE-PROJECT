import { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import UserAvatar from '../../components/common/UserAvatar';
import { adminService, getErrorMessage } from '../../services/api';

const formatDate = (value) => {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return '—';
  return new Date(time).toLocaleString();
};

const roleOptions = [
  { value: '', label: 'All roles' },
  { value: 'user', label: 'User' },
  { value: 'admin', label: 'Admin' },
];

const AdminUsers = () => {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoadingByUser, setActionLoadingByUser] = useState({});

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const queryParams = useMemo(
    () => ({ search, role, page, limit: 20 }),
    [search, role, page]
  );

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await adminService.getUsers(queryParams);
      const payload = response?.data?.data || {};
      setUsers(Array.isArray(payload.users) ? payload.users : []);
      setPagination(
        payload.pagination || { page, totalPages: 1, total: 0, limit: queryParams.limit }
      );
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load users'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadUsers();
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryParams.search, queryParams.role, queryParams.page, queryParams.limit]);

  const runUserAction = async (userId, actionFn) => {
    setActionLoadingByUser((prev) => ({ ...prev, [userId]: true }));
    try {
      await actionFn();
      await loadUsers();
    } catch (err) {
      setError(getErrorMessage(err, 'Action failed'));
    } finally {
      setActionLoadingByUser((prev) => ({ ...prev, [userId]: false }));
    }
  };

  return (
    <AdminLayout title="Manage Users" subtitle="Search users, control access, and manage admin roles.">
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px]">
            <input
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search by name or email"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            <select
              value={role}
              onChange={(event) => {
                setRole(event.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              {roleOptions.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-slate-200 bg-white">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-slate-700" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : users.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500">
            No users found for this filter.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600">Blocked</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600">Created</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => {
                  const userId = String(user?._id || '');
                  const rowBusy = Boolean(actionLoadingByUser[userId]);
                  const isBlocked = Boolean(user?.isBlocked);
                  const isAdmin = String(user?.role || '') === 'admin';

                  return (
                    <tr key={userId}>
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-900">
                        <div className="flex items-center gap-2">
                          <UserAvatar user={user} size="sm" />
                          <span>{user?.name || 'Unnamed'}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">{user?.email || '—'}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">{user?.role || 'user'}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-bold ${
                            isBlocked ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {isBlocked ? 'Blocked' : 'Active'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">{formatDate(user?.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {isBlocked ? (
                            <button
                              type="button"
                              disabled={rowBusy}
                              onClick={() => runUserAction(userId, () => adminService.unblockUser(userId))}
                              className="rounded-lg border border-emerald-300 px-2.5 py-1.5 text-xs font-bold text-emerald-700 disabled:opacity-50"
                            >
                              Unblock
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={rowBusy}
                              onClick={() => runUserAction(userId, () => adminService.blockUser(userId))}
                              className="rounded-lg border border-red-300 px-2.5 py-1.5 text-xs font-bold text-red-700 disabled:opacity-50"
                            >
                              Block
                            </button>
                          )}

                          {!isAdmin ? (
                            <button
                              type="button"
                              disabled={rowBusy}
                              onClick={() => runUserAction(userId, () => adminService.makeAdmin(userId))}
                              className="rounded-lg border border-blue-300 px-2.5 py-1.5 text-xs font-bold text-blue-700 disabled:opacity-50"
                            >
                              Make Admin
                            </button>
                          ) : null}
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

export default AdminUsers;
