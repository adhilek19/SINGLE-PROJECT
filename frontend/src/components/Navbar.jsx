
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  Car,
  Search,
  PlusCircle,
  User,
  LogOut,
  House,
  MessageCircle,
} from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { logoutThunk } from '../redux/slices/authSlice';
import { selectChatUnreadCount } from '../redux/slices/chatSlice';

const Avatar = ({ user, size = 'small' }) => (
  <div
    className={`${
      size === 'large' ? 'w-9 h-9' : 'w-8 h-8'
    } rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-600 overflow-hidden`}
  >
    {user?.profilePic ? (
      <img
        src={user.profilePic}
        alt={user.name || 'Profile'}
        className="w-full h-full object-cover"
      />
    ) : (
      <User className={size === 'large' ? 'w-5 h-5' : 'w-4 h-4'} />
    )}
  </div>
);

const Navbar = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { user, isHydrated, isInitializing } = useSelector((s) => s.auth);
  const unreadCount = useSelector(selectChatUnreadCount);
  const authReady = isHydrated && !isInitializing;

  const handleLogout = () => {
    dispatch(logoutThunk());
    navigate('/login');
  };

  const navLinks = [
    { name: 'Home', path: '/', icon: House },
    { name: 'Find', path: '/find-ride', icon: Search },
    { name: 'Post', path: '/post-ride', icon: PlusCircle, center: true },
    { name: 'Rides', path: '/my-rides', icon: Car },
    { name: 'Messages', path: user ? '/chats' : '/login', icon: MessageCircle },
    { name: 'Profile', path: user ? '/profile' : '/login', icon: User },
  ];

  return (
    <>
      {/* Desktop Navbar */}
      <nav className="hidden md:block bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link to="/" className="flex items-center gap-2">
                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                  <Car className="text-white w-6 h-6" />
                </div>
                <span className="font-bold text-xl text-slate-900">
                  SahaYatri
                </span>
              </Link>
            </div>

            <div className="flex items-center space-x-8">
              <div className="flex space-x-6">
                {navLinks.slice(0, 5).map((link) => {
                  const Icon = link.icon;

                  return (
                    <NavLink
                      key={link.name}
                      to={link.path}
                      className={({ isActive }) =>
                        `flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
                          isActive
                            ? 'text-blue-600 bg-blue-50'
                            : 'text-slate-600 hover:text-blue-600 hover:bg-slate-50'
                        }`
                      }
                    >
                      <Icon className="w-4 h-4" />
                      {link.name === 'Find' ? 'Find Ride' : link.name === 'Rides' ? 'My Rides' : link.name}
                      {link.name === 'Messages' && unreadCount > 0 ? (
                        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[10px] font-black text-white">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      ) : null}
                    </NavLink>
                  );
                })}
              </div>

              <div className="flex items-center gap-4 pl-6 border-l border-slate-200">
                {!authReady ? (
                  <div className="w-20 h-4 bg-slate-200 rounded animate-pulse" />
                ) : user ? (
                  <>
                    <Link
                      to="/chats"
                      className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-blue-600"
                      title="Messages"
                    >
                      <MessageCircle className="h-5 w-5" />
                      {unreadCount > 0 ? (
                        <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[10px] font-black text-white">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      ) : null}
                    </Link>

                    <Link
                      to="/profile"
                      className="flex items-center gap-2 hover:text-blue-600"
                    >
                      <Avatar user={user} />
                      <span className="text-sm font-medium">
                        Hi, {user.name}
                      </span>
                    </Link>

                    <button
                      onClick={handleLogout}
                      className="text-sm text-slate-500 hover:text-red-500 flex items-center gap-1"
                    >
                      <LogOut className="w-4 h-4" />
                      Logout
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      to="/login"
                      className="text-sm text-slate-600 hover:text-blue-600"
                    >
                      Log in
                    </Link>

                    <Link
                      to="/register"
                      className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                    >
                      Sign up
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Top Header */}
      <nav className="md:hidden sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200">
        <div className="h-14 px-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-md">
              <Car className="text-white w-5 h-5" />
            </div>
            <span className="font-black text-lg text-slate-900">
              SahaYatri
            </span>
          </Link>

          {!authReady ? (
            <div className="w-9 h-9 rounded-full bg-slate-200 animate-pulse" />
          ) : user ? (
            <div className="flex items-center gap-3">
              <Link to="/chats" className="relative rounded-lg p-1.5 text-slate-600">
                <MessageCircle className="h-5 w-5" />
                {unreadCount > 0 ? (
                  <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[10px] font-black text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                ) : null}
              </Link>
              <Link to="/profile">
                <Avatar user={user} size="large" />
              </Link>
            </div>
          ) : (
            <Link
              to="/login"
              className="text-sm font-semibold text-blue-600"
            >
              Login
            </Link>
          )}
        </div>
      </nav>

      {/* Mobile Bottom Navbar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-t border-slate-200 shadow-[0_-8px_30px_rgba(15,23,42,0.12)]">
        <div className="grid grid-cols-6 h-16 px-2">
          {navLinks.map((link) => {
            const Icon = link.icon;

            return (
              <NavLink
                key={link.name}
                to={link.path}
                className={({ isActive }) =>
                  `relative flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition ${
                    isActive
                      ? 'text-blue-600'
                      : 'text-slate-500 hover:text-blue-600'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {link.center ? (
                      <div
                        className={`-mt-7 w-14 h-14 rounded-full flex items-center justify-center shadow-xl border-4 border-white transition ${
                          isActive
                            ? 'bg-blue-700 text-white'
                            : 'bg-blue-600 text-white'
                        }`}
                      >
                        <Icon className="w-7 h-7" />
                      </div>
                    ) : link.name === 'Profile' && user?.profilePic ? (
                      <div
                        className={`w-6 h-6 rounded-full overflow-hidden border ${
                          isActive ? 'border-blue-600' : 'border-slate-300'
                        }`}
                      >
                        <img
                          src={user.profilePic}
                          alt="Profile"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <Icon className="w-5 h-5" />
                    )}

                    <span className={link.center ? '-mt-1' : ''}>
                      {link.name}
                    </span>
                    {link.name === 'Messages' && unreadCount > 0 ? (
                      <span className="absolute right-4 top-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[10px] font-black text-white">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    ) : null}

                    {isActive && !link.center && (
                      <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-blue-600" />
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </>
  );
};

export default Navbar;
