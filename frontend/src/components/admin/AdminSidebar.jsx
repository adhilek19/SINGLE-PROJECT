import { Shield, Users, Car, TriangleAlert } from 'lucide-react';
import { NavLink } from 'react-router-dom';

const links = [
  { label: 'Dashboard', to: '/admin', icon: Shield, end: true },
  { label: 'Users', to: '/admin/users', icon: Users },
  { label: 'Rides', to: '/admin/rides', icon: Car },
  { label: 'Reports', to: '/admin/reports', icon: TriangleAlert },
];

const linkClassName = ({ isActive }) =>
  `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition ${
    isActive
      ? 'bg-blue-600 text-white shadow-sm'
      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
  }`;

const AdminSidebar = () => {
  return (
    <aside className="w-full rounded-2xl border border-slate-200 bg-white p-3 md:sticky md:top-20 md:w-64 md:self-start">
      <div className="mb-3 px-2">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Admin Panel</p>
      </div>
      <nav className="space-y-1.5">
        {links.map(({ label, to, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={Boolean(end)} className={linkClassName}>
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};

export default AdminSidebar;
