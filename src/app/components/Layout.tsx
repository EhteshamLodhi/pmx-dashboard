'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Clock,
  CalendarDays,
  ClipboardCheck,
  Users,
  ClipboardEdit,
  UserCircle,
  LogOut,
  Zap,
  Menu,
  X,
  ChevronRight,
  Shield,
  Loader2,
  ReceiptText,
  BarChart3,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { NotificationCenter } from './NotificationCenter';
import { useActionRunner } from '@/app/hooks/useActionRunner';

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  badge?: number;
}

const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/attendance', label: 'Attendance', icon: Clock },
  { path: '/insights', label: 'Insights', icon: BarChart3 },
  { path: '/leave', label: 'Leave Request', icon: CalendarDays },
  { path: '/reimbursements', label: 'Reimbursements', icon: ReceiptText },
  { path: '/approvals', label: 'Approvals', icon: ClipboardCheck },
];

const ADMIN_NAV_ITEMS: NavItem[] = [
  { path: '/admin/users', label: 'User Management', icon: Users },
  { path: '/admin/attendance', label: 'Edit Attendance', icon: ClipboardEdit },
];

const BOTTOM_NAV: NavItem[] = [
  { path: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { path: '/attendance', label: 'Punch', icon: Clock },
  { path: '/insights', label: 'Insights', icon: BarChart3 },
  { path: '/leave', label: 'Leave', icon: CalendarDays },
  { path: '/reimbursements', label: 'Claims', icon: ReceiptText },
  { path: '/approvals', label: 'Approvals', icon: ClipboardCheck },
  { path: '/profile', label: 'Profile', icon: UserCircle },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { isLoggedIn, isLoading, currentUser, logout, leaveRequests } = useApp();
  const { isPending, runAction } = useActionRunner();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const pendingApprovals = leaveRequests.filter((r) => {
    if (!currentUser) return false;
    const pendingApproval = r.approvals.find((approval) => approval.status === 'pending');
    if (!pendingApproval) return false;
    return currentUser.role === 'admin' || pendingApproval.approverId === currentUser.id;
  }).length;

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isLoading && !isLoggedIn) router.replace('/');
  }, [isLoading, isLoggedIn, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 rounded-xl bg-green-600/10 flex items-center justify-center">
            <Zap className="w-5 h-5 text-green-600" />
          </div>
          <p className="mt-3 text-sm text-gray-500">Loading your workspace...</p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return null;
  }

  const isAdmin = currentUser?.role === 'admin';
  const isManager = currentUser?.role === 'manager' || currentUser?.role === 'director' || isAdmin;
  const showAdminSection = isAdmin || isManager;

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + '/');

  const handleLogout = () => {
    void runAction('layout-logout', async () => {
      await logout();
      router.push('/');
    }, {
      loading: 'Signing out...',
      success: 'Signed out.',
      error: 'Unable to sign out.',
    });
  };
  const signingOut = isPending('layout-logout');

  const NavLink = ({ item }: { item: NavItem }) => {
    const active = isActive(item.path);
    return (
      <button
        onClick={() => router.push(item.path)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left group ${
          active
            ? 'bg-green-600 text-white shadow-sm'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }`}
      >
        <item.icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-white' : 'text-gray-400 group-hover:text-gray-600'}`} />
        <span style={{ fontSize: '14px', fontWeight: active ? 600 : 500 }}>{item.label}</span>
        {item.path === '/approvals' && pendingApprovals > 0 && (
          <span className={`ml-auto text-xs px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20 text-white' : 'bg-red-100 text-red-600'}`}
            style={{ fontSize: '11px', fontWeight: 600 }}>
            {pendingApprovals}
          </span>
        )}
        {!active && <ChevronRight className="w-3.5 h-3.5 ml-auto text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />}
      </button>
    );
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-green-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-gray-900" style={{ fontSize: '15px', fontWeight: 700, lineHeight: '1.2' }}>PowerMatix</p>
            <p className="text-gray-400" style={{ fontSize: '10px', letterSpacing: '0.05em' }}>ATTENDANCE PORTAL</p>
          </div>
        </div>
      </div>

      {/* Main navigation */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        <p className="px-3 pb-1 pt-2 text-gray-400 uppercase" style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em' }}>
          Main
        </p>
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.path} item={item} />
        ))}

        {showAdminSection && (
          <>
            <p className="px-3 pb-1 pt-4 text-gray-400 uppercase flex items-center gap-1.5" style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em' }}>
              <Shield className="w-3 h-3" />
              Administration
            </p>
            {ADMIN_NAV_ITEMS.map((item) => (
              <NavLink key={item.path} item={item} />
            ))}
          </>
        )}
      </div>

      {/* Profile + Logout */}
      <div className="p-3 border-t border-gray-100 space-y-1">
        <NavLink item={{ path: '/profile', label: 'Profile & Settings', icon: UserCircle }} />
        <button
          onClick={handleLogout}
          disabled={signingOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-500 hover:bg-red-50 transition-all text-left disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {signingOut ? <Loader2 className="w-5 h-5 flex-shrink-0 animate-spin" /> : <LogOut className="w-5 h-5 flex-shrink-0" />}
          <span style={{ fontSize: '14px', fontWeight: 500 }}>{signingOut ? 'Signing Out...' : 'Sign Out'}</span>
        </button>

        {/* User info */}
        <div className="mt-2 p-3 bg-gray-50 rounded-xl flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
            <span className="text-green-700" style={{ fontSize: '12px', fontWeight: 600 }}>
              {currentUser?.name.split(' ').map((n) => n[0]).join('')}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-gray-900 truncate" style={{ fontSize: '13px', fontWeight: 500 }}>{currentUser?.name}</p>
            <p className="text-gray-400 truncate" style={{ fontSize: '11px' }}>{currentUser?.position}</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-60 bg-white border-r border-gray-100 shadow-sm flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-2xl">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-gray-100 px-4 md:px-6 h-14 flex items-center justify-between flex-shrink-0 z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="md:hidden flex items-center gap-2">
              <div className="w-7 h-7 bg-green-600 rounded-lg flex items-center justify-center">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <span className="text-gray-900" style={{ fontSize: '15px', fontWeight: 700 }}>PowerMatix</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <NotificationCenter />

            {/* User avatar */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                <span className="text-green-700" style={{ fontSize: '12px', fontWeight: 600 }}>
                  {currentUser?.name.split(' ').map((n) => n[0]).join('')}
                </span>
              </div>
              <div className="hidden sm:block">
                <p className="text-gray-900" style={{ fontSize: '13px', fontWeight: 500 }}>{currentUser?.name}</p>
                <p className="text-gray-400" style={{ fontSize: '11px' }}>
                  {currentUser?.role === 'admin' ? 'Administrator' : currentUser?.role === 'manager' ? 'Manager' : currentUser?.role === 'director' ? 'Director' : 'Employee'}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <motion.main
          key={pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="flex-1 overflow-y-auto pb-16 md:pb-0"
        >
          {children}
        </motion.main>

        {/* Mobile Bottom Nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex items-center z-40 shadow-lg">
          {BOTTOM_NAV.map((item) => {
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => router.push(item.path)}
                className="flex-1 flex flex-col items-center justify-center py-2 px-1 relative"
              >
                <div className={`p-1.5 rounded-lg transition-all ${active ? 'bg-green-50' : ''}`}>
                  <item.icon className={`w-5 h-5 ${active ? 'text-green-600' : 'text-gray-400'}`} />
                </div>
                <span
                  className={`mt-0.5 ${active ? 'text-green-600' : 'text-gray-400'}`}
                  style={{ fontSize: '10px', fontWeight: active ? 600 : 400 }}
                >
                  {item.label}
                </span>
                {item.path === '/approvals' && pendingApprovals > 0 && (
                  <span className="absolute top-1.5 right-2 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center"
                    style={{ fontSize: '9px', fontWeight: 700 }}>
                    {pendingApprovals}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
