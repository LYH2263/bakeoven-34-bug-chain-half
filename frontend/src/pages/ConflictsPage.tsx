import { useEffect, useState } from "react";
import { api } from "../api/client";
type C = { id: number; batch_code: string; oven_id: number; detail: string; created_at: string };
type O = { id: number; label: string };

function categoryOf(detail: string): { label: string; cls: string } {
  if (detail.includes("跨炉")) return { label: "跨炉", cls: "conflict-tag conflict-tag--oven" };
  if (detail.includes("空档")) return { label: detail.includes("空档不足") ? "空档不足" : "空档超限", cls: "conflict-tag conflict-tag--gap" };
  if (detail.includes("撞炉") || detail.includes("重叠")) return { label: "撞炉", cls: "conflict-tag conflict-tag--bump" };
  return { label: "其他", cls: "conflict-tag conflict-tag--other" };
}

export default function ConflictsPage() {
  const [rows, setRows] = useState<C[]>([]);
  const [ovens, setOvens] = useState<O[]>([]);
  useEffect(() => {
    api<C[]>("/conflicts").then(setRows).catch(() => setRows([]));
    api<O[]>("/ovens").then(setOvens).catch(() => setOvens([]));
  }, []);
  const ovenLabel = (id: number) => ovens.find(o => o.id === id)?.label ?? `#${id}`;
  return (<>
    <h2>冲突</h2>
    <table className="table"><thead><tr><th>时间</th><th>类型</th><th>批次</th><th>炉位</th><th>详情</th></tr></thead>
    <tbody>{rows.map(c => {
      const cat = categoryOf(c.detail);
      return <tr key={c.id}>
        <td className="mono">{new Date(c.created_at).toLocaleString()}</td>
        <td><span className={cat.cls}>{cat.label}</span></td>
        <td>{c.batch_code}</td>
        <td>{ovenLabel(c.oven_id)}</td>
        <td>{c.detail}</td>
      </tr>;
    })}</tbody></table>
  </>);
}
