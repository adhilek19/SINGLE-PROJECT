import { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import StatCard from '../../components/admin/StatCard';
import { adminService, getErrorMessage } from '../../services/api';

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await adminService.getStats();
        if (!alive) return;
        setStats(response?.data?.data || null);
      } catch (err) {
        if (!alive) return;
        setError(getErrorMessage(err, 'Failed to load admin stats'));
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <AdminLayout
      title="Admin Dashboard"
      subtitle="Overview of platform users, rides, and moderation workload."
    >
      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-slate-200 bg-white">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-slate-700" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="Total Users" value={Number(stats?.totalUsers || 0)} />
          <StatCard label="Total Rides" value={Number(stats?.totalRides || 0)} />
          <StatCard label="Active Rides" value={Number(stats?.activeRides || 0)} />
          <StatCard label="Completed Rides" value={Number(stats?.completedRides || 0)} />
          <StatCard label="Cancelled Rides" value={Number(stats?.cancelledRides || 0)} />
          <StatCard label="Blocked Users" value={Number(stats?.blockedUsers || 0)} />
          <StatCard label="Pending Reports" value={Number(stats?.pendingReports || 0)} />
        </div>
      )}
    </AdminLayout>
  );
};

export default AdminDashboard;
