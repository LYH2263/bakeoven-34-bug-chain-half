import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import ProductsPage from "./pages/ProductsPage";
import OvensPage from "./pages/OvensPage";
import BatchesPage from "./pages/BatchesPage";
import GanttPage from "./pages/GanttPage";
import ConflictsPage from "./pages/ConflictsPage";
import WindowsPage from "./pages/WindowsPage";
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/gantt" replace />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/ovens" element={<OvensPage />} />
        <Route path="/batches" element={<BatchesPage />} />
        <Route path="/gantt" element={<GanttPage />} />
        <Route path="/conflicts" element={<ConflictsPage />} />
        <Route path="/windows" element={<WindowsPage />} />
      </Route>
    </Routes>
  );
}
