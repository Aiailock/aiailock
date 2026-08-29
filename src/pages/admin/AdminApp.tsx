import { Routes, Route } from 'react-router-dom';
import AdminLogin from './AdminLogin';
import AdminDashboard from './AdminDashboard';
import RequireAdmin from '@/components/admin/RequireAdmin';

export default function AdminApp() {
  return <Routes><Route path="login" element={<AdminLogin />} /><Route path="*" element={<RequireAdmin><AdminDashboard /></RequireAdmin>} /></Routes>;
}
