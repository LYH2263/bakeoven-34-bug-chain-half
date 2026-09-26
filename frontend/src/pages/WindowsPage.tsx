import { useEffect, useState } from "react";
import { api } from "../api/client";
type P = { id: number; name: string };
type W = { oven_id: number; oven_label: string; start_min: number; end_min: number; duration_min: number };
function fmt(m: number) { const h = Math.floor(m/60), mm = m%60; return `${String(h).padStart(2,"0")}:${String(mm).padStart(2,"0")}`; }
export default function WindowsPage() {
  const [products, setProducts] = useState<P[]>([]);
  const [pid, setPid] = useState<number | "">("");
  const [rows, setRows] = useState<W[]>([]);
  useEffect(() => { api<P[]>("/products").then(p => { setProducts(p); if (p[0]) setPid(p[0].id); }); }, []);
  useEffect(() => {
    if (pid === "") return;
    api<W[]>(`/windows?product_id=${pid}`).then(setRows);
  }, [pid]);
  return (<>
    <h2>可开工窗口</h2>
    <div className="toolbar">
      <select value={pid} onChange={e => setPid(Number(e.target.value))}>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
    </div>
    <table className="table"><thead><tr><th>炉位</th><th>窗口</th><th>所需时长</th></tr></thead>
    <tbody>{rows.map(w => <tr key={w.oven_id}><td>{w.oven_label}</td><td className="mono">{fmt(w.start_min)}–{fmt(w.end_min)}</td><td className="mono">{w.duration_min} min</td></tr>)}
      {!rows.length && <tr><td colSpan={3}>无可用窗口</td></tr>}
    </tbody></table>
  </>);
}
