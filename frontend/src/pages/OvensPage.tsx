import { useEffect, useState } from "react";
import { api } from "../api/client";
type O = { id: number; label: string; capacity_note: string };
export default function OvensPage() {
  const [rows, setRows] = useState<O[]>([]);
  useEffect(() => { api<O[]>("/ovens").then(setRows); }, []);
  return (<>
    <h2>炉位</h2>
    <table className="table"><thead><tr><th>标签</th><th>备注</th></tr></thead>
    <tbody>{rows.map(o => <tr key={o.id}><td>{o.label}</td><td>{o.capacity_note}</td></tr>)}</tbody></table>
  </>);
}
