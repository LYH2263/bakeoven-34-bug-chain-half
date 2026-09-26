import { useEffect, useState } from "react";
import { api } from "../api/client";
type P = { id: number; name: string; ferment_min: number; bake_min: number };
export default function ProductsPage() {
  const [rows, setRows] = useState<P[]>([]);
  useEffect(() => { api<P[]>("/products").then(setRows); }, []);
  return (<>
    <h2>产品（配方时长）</h2>
    <table className="table"><thead><tr><th>名称</th><th>发酵 min</th><th>烘烤 min</th><th>合计</th></tr></thead>
    <tbody>{rows.map(p => <tr key={p.id}><td>{p.name}</td><td className="mono">{p.ferment_min}</td><td className="mono">{p.bake_min}</td><td className="mono">{p.ferment_min + p.bake_min}</td></tr>)}</tbody></table>
  </>);
}
