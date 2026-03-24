// src/pages/AdminDashboard.jsx
import React, { useState, useEffect } from 'react';
import useApi from '../hooks/useApi';
import useAuthStore from '../store/authStore';
import { ShieldAlert, Users, DatabaseZap, TerminalSquare, LogOut } from 'lucide-react';

export default function AdminDashboard() {
  const api = useApi();
  const { logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState('access'); // 'access' | 'debugger'

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 font-mono">
      {/* Admin Topbar */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex justify-between items-center text-sm">
        <div className="flex items-center gap-3 text-emerald-400 font-bold tracking-widest">
          <ShieldAlert size={20} />
          <span>FLOW.AI // SYSTEM ADMIN</span>
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('access')}
            className={`flex items-center gap-2 px-3 py-1 rounded transition-colors ${activeTab === 'access' ? 'bg-slate-800 text-white' : 'hover:text-white'}`}
          >
            <Users size={16} /> Access Mapping
          </button>
          <button
            onClick={() => setActiveTab('debugger')}
            className={`flex items-center gap-2 px-3 py-1 rounded transition-colors ${activeTab === 'debugger' ? 'bg-slate-800 text-white' : 'hover:text-white'}`}
          >
            <DatabaseZap size={16} /> Data Debugger
          </button>
          <div className="w-px h-6 bg-slate-700 mx-2"></div>
          <button onClick={logout} className="flex items-center gap-2 text-rose-400 hover:text-rose-300">
            <LogOut size={16} /> Exit
          </button>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto">
        {activeTab === 'access' && <AccessManagement api={api} />}
        {activeTab === 'debugger' && <DataDebugger api={api} />}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------
// TAB 1: ACCESS MANAGEMENT
// ---------------------------------------------------------------------
function AccessManagement({ api }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState({ text: "", type: "" });

  const fetchUsers = async () => {
    try {
      const res = await api.get('/api/admin/users');
      setUsers(res.users || []);
    } catch (err) {
      setMsg({ text: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleUpdate = async (uid, field, value) => {
    setMsg({ text: `Updating ${field} for ${uid}...`, type: 'info' });
    try {
      if (field === 'role') await api.patch(`/api/admin/users/${uid}/role`, { role: value });
      if (field === 'emp_id') await api.patch(`/api/admin/users/${uid}/link`, { emp_id: value });
      setMsg({ text: `Success: Updated ${field} for ${uid}`, type: 'success' });
      fetchUsers();
    } catch (err) {
      setMsg({ text: `Error: ${err.message}`, type: 'error' });
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 shadow-2xl">
      <h2 className="text-xl text-white font-semibold mb-4 border-b border-slate-800 pb-2">User Identity & Role Mapping</h2>

      {msg.text && (
        <div className={`p-3 mb-4 rounded text-sm ${msg.type === 'error' ? 'bg-rose-950/50 text-rose-400 border border-rose-900' : msg.type === 'success' ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-900' : 'bg-blue-950/50 text-blue-400 border border-blue-900'}`}>
          {msg.text}
        </div>
      )}

      {loading ? <p>Loading system users...</p> : (
        <div className="overflow-x-auto rounded border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-xs">
              <tr>
                <th className="p-4">UID / Email</th>
                <th className="p-4">Role Assignment</th>
                <th className="p-4">EMP_ID Mapping</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {users.map(u => (
                <tr key={u.google_uid} className="hover:bg-slate-800/50 transition-colors">
                  <td className="p-4">
                    <div className="font-bold text-slate-200">{u.google_uid}</div>
                    <div className="text-xs text-slate-500">{u.email}</div>
                  </td>
                  <td className="p-4">
                    <select
                      defaultValue={u.role || 'employee'}
                      onChange={(e) => handleUpdate(u.google_uid, 'role', e.target.value)}
                      className="bg-slate-950 border border-slate-700 text-slate-300 p-2 rounded w-40 focus:border-blue-500 focus:outline-none outline-none"
                    >
                      <option value="employee">Employee</option>
                      <option value="hr_manager">HR Manager</option>
                      <option value="admin">Sys Admin</option>
                    </select>
                  </td>
                  <td className="p-4 space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        defaultValue={u.emp_id || ''}
                        onBlur={(e) => {
                          if (e.target.value !== u.emp_id) handleUpdate(u.google_uid, 'emp_id', e.target.value)
                        }}
                        placeholder="ID (EMP001)"
                        className="bg-slate-950 border border-slate-700 text-slate-300 p-2 rounded w-24 uppercase font-mono text-xs"
                      />
                      {u.emp_id && (
                        <div className="flex gap-1">
                          <input
                            type="text"
                            placeholder="Dept"
                            className="bg-slate-950 border border-slate-700 text-slate-300 p-2 rounded w-24 font-mono text-xs"
                            onBlur={(e) => {
                              if (e.target.value) api.patch(`/api/admin/employees/${u.emp_id}/mapping`, { department: e.target.value })
                                .then(() => setMsg({ text: `Updated ${u.emp_id} dept`, type: 'success' }))
                                .catch(err => setMsg({ text: err.message, type: 'error' }))
                            }}
                          />
                          <select
                            className="bg-slate-950 border border-slate-700 text-slate-300 p-2 rounded text-xs"
                            onChange={(e) => {
                              if (e.target.value) api.patch(`/api/admin/employees/${u.emp_id}/mapping`, { job_level: e.target.value })
                                .then(() => setMsg({ text: `Updated ${u.emp_id} level`, type: 'success' }))
                                .catch(err => setMsg({ text: err.message, type: 'error' }))
                            }}
                          >
                            <option value="">Lvl</option>
                            <option value="Junior">Junior</option>
                            <option value="Mid">Mid</option>
                            <option value="Senior">Senior</option>
                            <option value="Lead">Lead</option>
                          </select>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// TAB 2: SYSTEM DEBUGGER
// ---------------------------------------------------------------------
function DataDebugger({ api }) {
  const [empId, setEmpId] = useState('');
  const [debugData, setDebugData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const runDebug = async () => {
    if (!empId) return;
    setLoading(true);
    setError(null); 
    setDebugData(null);
    try {
      const res = await api.get(`/api/admin/debug/${empId}`);
      setDebugData(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 flex items-end gap-4 shadow-xl">
        <div className="flex-1">
          <label className="block text-xs text-slate-500 uppercase tracking-wider mb-2">Target Employee ID</label>
          <div className="flex items-center bg-slate-950 border border-slate-700 rounded overflow-hidden focus-within:border-blue-500">
            <TerminalSquare size={18} className="ml-3 text-slate-500" />
            <input
              type="text"
              value={empId}
              onChange={(e) => setEmpId(e.target.value)}
              placeholder="Enter EMP001..."
              className="bg-transparent text-white p-3 w-full outline-none uppercase font-mono tracking-widest"
              onKeyDown={(e) => e.key === 'Enter' && runDebug()}
            />
          </div>
        </div>
        <button
          onClick={runDebug}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-6 rounded shadow shadow-blue-900/50 disabled:opacity-50"
        >
          {loading ? 'Executing...' : 'Run Diagnostics'}
        </button>
      </div>

      {error && <div className="bg-rose-950/50 border border-rose-900 text-rose-400 p-4 rounded font-mono">{error}</div>}

      {debugData && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {/* Panel A: Twin State */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
            <h3 className="text-white font-semibold mb-4 border-b border-slate-800 pb-2">Digital Twin State</h3>
            {debugData.twin_exists ? (
              <pre className="bg-slate-950 text-emerald-400 p-4 rounded overflow-x-auto text-xs whitespace-pre-wrap">
                {JSON.stringify(debugData.twin_data, null, 2)}
              </pre>
            ) : (
              <p className="text-rose-400 text-sm">❌ No Digital Twin initialized for this ID.</p>
            )}
          </div>

          {/* Panel B: Telemetry Health */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
            <h3 className="text-white font-semibold mb-4 border-b border-slate-800 pb-2">Telemetry Pipeline Check</h3>
            <ul className="space-y-4 text-sm">
              <li className="flex justify-between border-b border-slate-800/50 pb-2">
                <span className="text-slate-400">Pipeline Status</span>
                {debugData.recent_telemetry_count > 0
                  ? <span className="text-emerald-400 font-bold">🟢 ACTIVE</span>
                  : <span className="text-rose-400 font-bold">🔴 NO DATA</span>}
              </li>
              <li className="flex justify-between border-b border-slate-800/50 pb-2">
                <span className="text-slate-400">Events in Buffer</span>
                <span className="text-white font-mono">{debugData.recent_telemetry_count} pending</span>
              </li>
            </ul>

            {debugData.last_event && (
              <div className="mt-4">
                <span className="text-xs text-slate-500 block mb-2">Most Recent Payload:</span>
                <pre className="bg-slate-950 text-blue-300 p-4 rounded overflow-x-auto text-xs whitespace-pre-wrap">
                  {JSON.stringify(debugData.last_event, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}