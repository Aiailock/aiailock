import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ReaderPage from './pages/reader/ReaderPage';
import AdminApp from './pages/admin/AdminApp';

// Top-level split kept intentionally simple: the reader route tree has zero
// knowledge of admin concepts (no imports, no "admin", no ids in the URL),
// and the admin route tree is entirely separate and gated by auth further
// down (see pages/admin/AdminApp.tsx, built out in the admin stage).
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ReaderPage />} />
        <Route path="/admin/*" element={<AdminApp />} />
      </Routes>
    </BrowserRouter>
  );
}
