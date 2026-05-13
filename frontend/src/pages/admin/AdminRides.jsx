import { Fragment, useEffect, useMemo, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import UserAvatar from '../../components/common/UserAvatar';
import { adminService, getErrorMessage } from '../../services/api';

const rideStatuses = ['', 'scheduled', 'started', 'ended', 'completed', 'cancelled'];

const statusClassMap = {
  scheduled: 'bg-blue-100 text-blue-700',
  started: 'bg-amber-100 text-amber-700',
  ended: 'bg-indigo-100 text-indigo-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-rose-100 text-rose-700',
};

const formatDate = (value) => {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return '-';
  return new Date(time).toLocaleString();
};

const toRideId = (ride) => String(ride?._id || '');

const seatsBookedFromPassenger = (passenger) =>
  Number(passenger?.seatsBooked || passenger?.seats || passenger?.requestedSeats || 1);

const PassengerList = ({ ride }) => {
  const passengers = Array.isArray(ride?.passengers) ? ride.passengers : [];

  if (!passengers.length) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-500">
        No passengers yet
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
      {passengers.map((entry, index) => {
        const passenger = entry?.user || {};
        return (
          <div
            key={`${passenger?._id || index}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2"
          >
            <div className="flex min-w-0 items-center gap-2">
              <UserAvatar user={passenger} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">
                  {passenger?.name || 'Passenger'}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {passenger?.email || passenger?.phone || '-'}
                </p>
              </div>
            </div>
            <div className="text-right text-xs">
              <p className="font-semibold text-slate-700">Seats: {seatsBookedFromPassenger(entry)}</p>
              <p className="font-semibold text-slate-500">{entry?.status || 'joined'}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const StatusBadge = ({ status }) => {
  const safeStatus = String(status || 'scheduled');
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClassMap[safeStatus] || 'bg-slate-100 text-slate-700'}`}
    >
      {safeStatus}
    </span>
  );
};

const AdminRides = () => {
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [rides, setRides] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusDraftByRide, setStatusDraftByRide] = useState({});
  const [actionLoadingByRide, setActionLoadingByRide] = useState({});
  const [expandedPassengersByRide, setExpandedPassengersByRide] = useState({});

  const params = useMemo(
    () => ({ status: statusFilter, page, limit: 20 }),
    [statusFilter, page]
  );

  const loadRides = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await adminService.getRides(params);
      const payload = response?.data?.data || {};
      const rideList = Array.isArray(payload.rides) ? payload.rides : [];
      setRides(rideList);
      setPagination(payload.pagination || { page, totalPages: 1, total: 0, limit: params.limit });
      setStatusDraftByRide((prev) => {
        const next = { ...prev };
        rideList.forEach((ride) => {
          const rideId = toRideId(ride);
          if (!next[rideId]) next[rideId] = String(ride?.status || 'scheduled');
        });
        return next;
      });
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load rides'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadRides();
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.status, params.page, params.limit]);

  const updateRideStatus = async (rideId) => {
    const nextStatus = String(statusDraftByRide[rideId] || '').trim();
    if (!nextStatus) return;

    setActionLoadingByRide((prev) => ({ ...prev, [rideId]: true }));
    try {
      await adminService.updateRideStatus(rideId, nextStatus);
      await loadRides();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to update ride status'));
    } finally {
      setActionLoadingByRide((prev) => ({ ...prev, [rideId]: false }));
    }
  };

  const togglePassengers = (rideId) => {
    setExpandedPassengersByRide((prev) => ({ ...prev, [rideId]: !prev[rideId] }));
  };

  return (
    <AdminLayout title="Manage Rides" subtitle="Review rides, passengers, and moderate ride status.">
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[220px_auto]">
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              {rideStatuses.map((status) => (
                <option key={status || 'all'} value={status}>
                  {status ? `Status: ${status}` : 'All statuses'}
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
        ) : rides.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500">
            No rides found for this filter.
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600">Driver</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600">Route</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600">Seats</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600">Passengers</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600">Departure</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rides.map((ride) => {
                    const rideId = toRideId(ride);
                    const rowBusy = Boolean(actionLoadingByRide[rideId]);
                    const isExpanded = Boolean(expandedPassengersByRide[rideId]);
                    const driver = ride?.driver || {};
                    const source = ride?.source?.name || 'Unknown source';
                    const destination = ride?.destination?.name || 'Unknown destination';
                    const passengers = Array.isArray(ride?.passengers) ? ride.passengers : [];

                    return (
                      <Fragment key={rideId}>
                        <tr>
                          <td className="whitespace-nowrap px-4 py-3 text-sm">
                            <div className="flex items-center gap-2">
                              <UserAvatar user={driver} size="sm" />
                              <span className="font-semibold text-slate-900">
                                {driver?.name || 'Unknown driver'}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-700">
                            <p className="max-w-[260px] whitespace-normal break-words">
                              {source} to {destination}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">
                            {Number(ride?.bookedSeats || 0)} / {Number(ride?.seatsAvailable || 0)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">
                            <button
                              type="button"
                              onClick={() => togglePassengers(rideId)}
                              className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-bold text-slate-700"
                            >
                              {isExpanded ? 'Hide passengers' : `View passengers (${passengers.length})`}
                            </button>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">
                            <StatusBadge status={ride?.status} />
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">
                            {formatDate(ride?.departureTime)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <select
                                value={statusDraftByRide[rideId] || String(ride?.status || 'scheduled')}
                                onChange={(event) =>
                                  setStatusDraftByRide((prev) => ({ ...prev, [rideId]: event.target.value }))
                                }
                                className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700"
                              >
                                {rideStatuses.filter(Boolean).map((status) => (
                                  <option key={status} value={status}>
                                    {status}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                disabled={rowBusy}
                                onClick={() => updateRideStatus(rideId)}
                                className="rounded-lg border border-blue-300 px-2.5 py-1.5 text-xs font-bold text-blue-700 disabled:opacity-50"
                              >
                                {rowBusy ? 'Updating...' : 'Update'}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded ? (
                          <tr>
                            <td colSpan={7} className="bg-slate-50 px-4 py-3">
                              <PassengerList ride={ride} />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {rides.map((ride) => {
                const rideId = toRideId(ride);
                const rowBusy = Boolean(actionLoadingByRide[rideId]);
                const isExpanded = Boolean(expandedPassengersByRide[rideId]);
                const driver = ride?.driver || {};
                const source = ride?.source?.name || 'Unknown source';
                const destination = ride?.destination?.name || 'Unknown destination';
                const passengers = Array.isArray(ride?.passengers) ? ride.passengers : [];

                return (
                  <div key={rideId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <UserAvatar user={driver} size="sm" />
                        <p className="truncate text-sm font-black text-slate-900">
                          {driver?.name || 'Unknown driver'}
                        </p>
                      </div>
                      <StatusBadge status={ride?.status} />
                    </div>

                    <p className="mt-2 text-sm text-slate-700 break-words">{source} to {destination}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                      <p>Seats: {Number(ride?.bookedSeats || 0)} / {Number(ride?.seatsAvailable || 0)}</p>
                      <p>Departure: {formatDate(ride?.departureTime)}</p>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => togglePassengers(rideId)}
                        className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-700"
                      >
                        {isExpanded ? 'Hide passengers' : `View passengers (${passengers.length})`}
                      </button>
                    </div>

                    {isExpanded ? (
                      <div className="mt-3">
                        <PassengerList ride={ride} />
                      </div>
                    ) : null}

                    <div className="mt-3 flex items-center gap-2">
                      <select
                        value={statusDraftByRide[rideId] || String(ride?.status || 'scheduled')}
                        onChange={(event) =>
                          setStatusDraftByRide((prev) => ({ ...prev, [rideId]: event.target.value }))
                        }
                        className="flex-1 rounded-lg border border-slate-300 px-2 py-2 text-xs font-semibold text-slate-700"
                      >
                        {rideStatuses.filter(Boolean).map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={rowBusy}
                        onClick={() => updateRideStatus(rideId)}
                        className="rounded-lg border border-blue-300 px-3 py-2 text-xs font-bold text-blue-700 disabled:opacity-50"
                      >
                        {rowBusy ? 'Updating...' : 'Update'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
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

export default AdminRides;
