import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import AdminLogin from './AdminLogin';
import RequireAdmin from '@/components/admin/RequireAdmin';

const AdminDashboard = lazy(() => import('./AdminDashboard'));

export default function AdminApp() {
  return <Routes><Route path="login" element={<AdminLogin />} /><Route path="*" element={<RequireAdmin><Suspense fallback={<div className="min-h-screen bg-[#f5eee9]" />}><AdminDashboard /></Suspense></RequireAdmin>} /></Routes>;
}
