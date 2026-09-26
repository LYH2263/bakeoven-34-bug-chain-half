import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { api } from "../api/client";

const drawerLinks = [
  ["/gantt", "甘特台"],
  ["/batches", "批次"],
  ["/products", "配方"],
  ["/ovens", "炉位"],
  ["/conflicts", "冲突"],
  ["/windows", "可开工"],
];

type Oven = { id: number; label: string; capacity_note: string };
type Conflict = { id: number; batch_code: string; oven_id: number; detail: string; created_at: string };
type Block = {
  batch_id: number;
  code: string;
  oven_id: number;
  oven_label: string;
  phase: string;
  start_min: number;
  end_min: number;
};

export default function Layout() {
  const loc = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [ovens, setOvens] = useState<Oven[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);

  useEffect(() => {
    api<Oven[]>("/ovens").then(setOvens).catch(() => setOvens([]));
    api<Conflict[]>("/conflicts").then((c) => setConflicts(c.slice(0, 6))).catch(() => setConflicts([]));
    api<Block[]>("/gantt").then(setBlocks).catch(() => setBlocks([]));
  }, [loc.pathname]);

  const ovenHeaders = useMemo(() => {
    if (ovens.length) return ovens;
    const map = new Map<number, string>();
    for (const b of blocks) map.set(b.oven_id, b.oven_label);
    return [...map.entries()].map(([id, label]) => ({
      id,
      label,
      capacity_note: "",
    }));
  }, [ovens, blocks]);

  return (
    <div className="workbench-shell">
      <aside className={`recipe-drawer${drawerOpen ? "" : " recipe-drawer--collapsed"}`}>
        <button
          type="button"
          className="recipe-drawer-toggle"
          onClick={() => setDrawerOpen((v) => !v)}
          aria-label="切换配方抽屉"
        >
          {drawerOpen ? "«" : "»"}
        </button>
        <div className="recipe-drawer-inner">
          <div className="recipe-drawer-brand">
            <span className="recipe-mark">BO</span>
            <div>
              <div className="recipe-name">BakeOven</div>
              <div className="recipe-sub">占炉工作台</div>
            </div>
          </div>
          <nav className="recipe-nav">
            {drawerLinks.map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `recipe-link${isActive ? " recipe-link--on" : ""}`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="recipe-note">工业烘焙排程 · 非预约日历</div>
        </div>
      </aside>

      <div className="workbench-main">
        <header className="oven-lane-headers" aria-label="炉位车道">
          <div className="oven-lane-lead">炉道</div>
          <div className="oven-lane-track">
            {ovenHeaders.map((o) => (
              <div key={o.id} className="oven-lane-chip">
                <span className="oven-lane-id">#{o.id}</span>
                <strong>{o.label}</strong>
                {o.capacity_note && (
                  <span className="oven-lane-cap">{o.capacity_note}</span>
                )}
              </div>
            ))}
            {!ovenHeaders.length && (
              <span className="oven-lane-empty">暂无炉位</span>
            )}
          </div>
        </header>

        <section className="gantt-deck">
          <Outlet />
        </section>

        <div className="conflict-badge-float" aria-label="冲突角标">
          {conflicts.length === 0 && (
            <span className="conflict-chip conflict-chip--ok">无冲突</span>
          )}
          {conflicts.map((c) => (
            <NavLink
              key={c.id}
              to="/conflicts"
              className="conflict-chip"
              title={c.detail}
            >
              <span className="conflict-chip-code">{c.batch_code}</span>
              <span className="conflict-chip-detail">{c.detail}</span>
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  );
}
