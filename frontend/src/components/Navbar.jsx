import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ShareCaregiverModal from './ShareCaregiverModal';

export default function Navbar({ user, onLogout }) {
  const navigate = useNavigate();
  const [shareModalOpen, setShareModalOpen] = useState(false);

  const handleLogout = () => {
    onLogout();
    navigate('/login');
  };

  return (
    <>
      <nav className="bg-white shadow-sm border-b border-teal-100">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2">
            <span className="text-2xl">💊</span>
            <span className="text-xl font-bold text-primary-dark">NuskhaSaathi</span>
          </Link>

          <div className="flex items-center gap-3 sm:gap-4">
            <Link
              to="/dashboard"
              className="text-sm font-medium text-gray-600 hover:text-primary-dark transition"
            >
              Upload
            </Link>
            <Link
              to="/schedule"
              className="text-sm font-medium text-gray-600 hover:text-primary-dark transition"
            >
              Today
            </Link>
            <Link
              to="/history"
              className="text-sm font-medium text-gray-600 hover:text-primary-dark transition"
            >
              History
            </Link>
            <button
              type="button"
              onClick={() => setShareModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-primary-dark hover:bg-teal-100 transition shadow-xs"
            >
              <span>👨‍👩‍👧</span>
              <span className="hidden sm:inline">Family Share</span>
            </button>
            <span className="hidden md:inline text-sm text-gray-500">
              {user?.name}
            </span>
            <button
              onClick={handleLogout}
              className="text-xs sm:text-sm bg-red-50 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-100 transition"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>
      <ShareCaregiverModal isOpen={shareModalOpen} onClose={() => setShareModalOpen(false)} />
    </>
  );
}
