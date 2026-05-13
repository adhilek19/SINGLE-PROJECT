import AdminSidebar from './AdminSidebar';

const AdminLayout = ({ title, subtitle = '', children }) => {
  return (
    <section className="mx-auto w-full max-w-7xl px-3 py-4 md:px-6">
      <div className="mb-4">
        <h1 className="text-xl font-black text-slate-900 md:text-2xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[16rem_1fr] md:gap-6">
        <AdminSidebar />
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
};

export default AdminLayout;
