import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ReaderPage from './pages/reader/ReaderPage';

const AdminApp = lazy(() => import('./pages/admin/AdminApp'));

// The public reader and admin stay split into separate route chunks. The only
// admin surface reachable from the reader is an additional lazy chunk loaded
// for the authenticated `?preview=1` owner workflow; normal readers never
// render it.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ReaderPage />} />
        <Route path="/admin/*" element={<Suspense fallback={<div className="min-h-screen bg-[#f5eee9]" />}><AdminApp /></Suspense>} />
      </Routes>
    </BrowserRouter>
  );
}
