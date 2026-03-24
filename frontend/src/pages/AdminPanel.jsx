import React, { useEffect, useMemo, useState } from "react";
import useApi from "../hooks/useApi";

function fmtDate(v) {
  if (!v) return "-";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString();
}

export default function AdminPanel() {
  const api = useApi();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyUid, setBusyUid] = useState(null);

  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  // client-side filtering (simple + fast)
  const [query, setQuery] = useState("");

  // local edit state
  const [roleDraft, setRoleDraft] = useState({}); // uid -> role
  const [linkDraft, setLinkDraft] = useState({}); // uid -> emp_id

  async function loadUsers() {
    setLoading(true);
    setError("");
    setOk("");
    try {
      const res = await api.get("/api/admin/users");
      const list = res?.users ?? res ?? [];
      setUsers(Array.isArray(list) ? list : []);
      // init drafts
      const rd = {};
      const ld = {};
      (Array.isArray(list) ? list : []).forEach((u) => {
        rd[u.uid] = u.role || "employee";
        ld[u.uid] = u.emp_id || "";
      });
      setRoleDraft(rd);
      setLinkDraft(ld);
    } catch (e) {
      setError(e?.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const hay = `${u.uid} ${u.email || ""} ${u.role || ""} ${u.emp_id || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [users, query]);

  async function saveRole(uid) {
    setBusyUid(uid);
    setError("");
    setOk("");
    try {
      const newRole = roleDraft[uid];
      await api.patch(`/api/admin/users/${encodeURIComponent(uid)}/role`, { role: newRole });
      setOk(`Updated role for ${uid} → ${newRole}`);
      await loadUsers();
    } catch (e) {
      setError(e?.message || "Failed to update role");
    } finally {
      setBusyUid(null);
    }
  }

  async function saveLink(uid) {
    setBusyUid(uid);
    setError("");
    setOk("");
    try {
      const emp_id = (linkDraft[uid] || "").trim().toUpperCase();
      await api.patch(`/api/admin/users/${encodeURIComponent(uid)}/link`, { emp_id });
      setOk(`Linked ${uid} → ${emp_id}`);
      await loadUsers();
    } catch (e) {
      setError(e?.message || "Failed to link user");
    } finally {
      setBusyUid(null);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Admin Panel</h1>
          <p className="text-slate-600 mt-1">
            Manage user roles and link accounts to employees (HR Managers only).
          </p>
        </div>
        <button
          onClick={loadUsers}
          className="px-4 py-2 rounded bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      <div className="mt-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by uid, email, role, emp_id..."
          className="w-full sm:max-w-md px-3 py-2 border rounded"
        />

        <div className="text-sm text-slate-600">
          Showing <span className="font-medium">{filtered.length}</span> of{" "}
          <span className="font-medium">{users.length}</span>
        </div>
      </div>

      {error && (
        <div className="mt-4 p-3 rounded border border-red-200 bg-red-50 text-red-800">
          {error}
        </div>
      )}
      {ok && (
        <div className="mt-4 p-3 rounded border border-green-200 bg-green-50 text-green-800">
          {ok}
        </div>
      )}

      <div className="mt-6 overflow-x-auto border rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="text-left px-4 py-3">UID</th>
              <th className="text-left px-4 py-3">Email</th>
              <th className="text-left px-4 py-3">Role</th>
              <th className="text-left px-4 py-3">Emp ID</th>
              <th className="text-left px-4 py-3">Created</th>
              <th className="text-left px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-4 text-slate-600" colSpan={6}>
                  Loading users...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-slate-600" colSpan={6}>
                  No users found.
                </td>
              </tr>
            ) : (
              filtered.map((u) => {
                const uid = u.uid;
                const isBusy = busyUid === uid;
                return (
                  <tr key={uid} className="border-t">
                    <td className="px-4 py-3 font-mono text-xs">{uid}</td>
                    <td className="px-4 py-3">{u.email || "-"}</td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <select
                          className="border rounded px-2 py-1"
                          value={roleDraft[uid] ?? u.role ?? "employee"}
                          onChange={(e) =>
                            setRoleDraft((prev) => ({ ...prev, [uid]: e.target.value }))
                          }
                          disabled={isBusy}
                        >
                          <option value="employee">employee</option>
                          <option value="hr_manager">hr_manager</option>
                        </select>
                        <button
                          onClick={() => saveRole(uid)}
                          disabled={isBusy}
                          className="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-60"
                        >
                          Save
                        </button>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <input
                          className="border rounded px-2 py-1 w-32 font-mono"
                          value={linkDraft[uid] ?? u.emp_id ?? ""}
                          onChange={(e) =>
                            setLinkDraft((prev) => ({ ...prev, [uid]: e.target.value }))
                          }
                          placeholder="EMP001"
                          disabled={isBusy}
                        />
                        <button
                          onClick={() => saveLink(uid)}
                          disabled={isBusy}
                          className="px-3 py-1.5 rounded bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
                        >
                          Link
                        </button>
                      </div>
                    </td>

                    <td className="px-4 py-3 text-slate-600">{fmtDate(u.created_at)}</td>

                    <td className="px-4 py-3 text-slate-500">
                      {isBusy ? "Working..." : ""}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-xs text-slate-500">
        Notes: The backend prevents HR managers from demoting themselves; link requires an existing employee and a unique emp_id.
      </div>
    </div>
  );
}