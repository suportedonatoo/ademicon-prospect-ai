'use client';

import { Fragment, useState } from 'react';
import { api, toast } from '@/lib/client';

type Role = { id: string; key: string; name: string; scope: string; users: number; keys: string[] };

export function PermissionMatrix({ roles, catalog, canManage }: { roles: Role[]; catalog: { key: string; label: string; module: string }[]; canManage: boolean }) {
  const [grants, setGrants] = useState<Record<string, Set<string>>>(() => Object.fromEntries(roles.map((r) => [r.id, new Set(r.keys)])));
  const modules = [...new Set(catalog.map((c) => c.module))];

  const toggle = async (role: Role, key: string, granted: boolean) => {
    setGrants((g) => {
      const next = new Set(g[role.id]);
      if (granted) next.add(key);
      else next.delete(key);
      return { ...g, [role.id]: next };
    });
    try {
      await api(`/roles/${role.id}/permissions`, { method: 'PUT', body: { permission: key, granted } });
    } catch (e) {
      toast((e as Error).message, 'error');
      setGrants((g) => {
        const next = new Set(g[role.id]);
        if (granted) next.delete(key);
        else next.add(key);
        return { ...g, [role.id]: next };
      });
    }
  };

  return (
    <div className="overflow-auto scroll-thin max-h-[calc(100vh-240px)]">
      <table className="text-xs border-separate border-spacing-0">
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="sticky left-0 z-20 bg-slate-50 text-left px-3 py-2 border-b border-line min-w-60">Permissão</th>
            {roles.map((r) => (
              <th key={r.id} className="bg-slate-50 px-2 py-2 border-b border-line text-center min-w-24 align-bottom">
                <div className="font-semibold text-ink">{r.name}</div>
                <div className="font-normal text-muted">
                  {r.scope} · {r.users} usuário(s)
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {modules.map((m) => (
            <Fragment key={m}>
              <tr>
                <td colSpan={roles.length + 1} className="sticky left-0 bg-white px-3 pt-3 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted">
                  {m}
                </td>
              </tr>
              {catalog
                .filter((c) => c.module === m)
                .map((c) => (
                  <tr key={c.key} className="hover:bg-slate-50">
                    <td className="sticky left-0 bg-white px-3 py-1.5 border-b border-line">
                      <code className="text-[11px] text-ink">{c.key}</code>
                      <div className="text-muted">{c.label}</div>
                    </td>
                    {roles.map((r) => (
                      <td key={r.id} className="text-center border-b border-line">
                        <input
                          type="checkbox"
                          aria-label={`${r.name}: ${c.key}`}
                          checked={grants[r.id]?.has(c.key) ?? false}
                          disabled={!canManage || r.key === 'SUPER_ADMIN'}
                          onChange={(e) => toggle(r, c.key, e.target.checked)}
                          className="size-4 accent-[#1f5fa8]"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
