import React, { useState } from 'react';
import { DATABASE_SCHEMA_SPECS, API_CONTRACTS } from '../../data/systemDesignDocs';
import { Database, Network, Key, Layers, Code } from 'lucide-react';

export const SystemDesignDocsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'db' | 'api'>('db');

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-wrap justify-between items-center gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Database className="w-5 h-5 text-indigo-400" />
            <h2 className="text-sm font-semibold text-slate-100">System Design: Data Models & REST/WS API Contracts</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Formal database table specifications (TimescaleDB hypertables, relational entities, immutable ledger) and API endpoint schemas.
          </p>
        </div>

        <div className="flex space-x-2 font-mono text-xs">
          <button
            onClick={() => setActiveTab('db')}
            className={`px-3 py-1.5 rounded transition-colors ${
              activeTab === 'db' ? 'bg-blue-600 text-white font-bold' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            Database & Data Models ({DATABASE_SCHEMA_SPECS.length})
          </button>
          <button
            onClick={() => setActiveTab('api')}
            className={`px-3 py-1.5 rounded transition-colors ${
              activeTab === 'api' ? 'bg-blue-600 text-white font-bold' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            API Endpoints & Contracts ({API_CONTRACTS.length})
          </button>
        </div>
      </div>

      {/* Tab 1: Database Schemas */}
      {activeTab === 'db' && (
        <div className="space-y-6">
          {DATABASE_SCHEMA_SPECS.map((table) => (
            <div key={table.tableName} className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
              <div className="px-4 py-3 bg-slate-950/40 border-b border-slate-800 flex justify-between items-center text-xs font-mono">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-slate-100 text-sm">{table.tableName}</span>
                  <span className="px-2 py-0.5 rounded bg-blue-950/80 border border-blue-800/60 text-blue-300 text-[10px]">
                    {table.engine}
                  </span>
                </div>
                <span className="text-slate-400 text-[11px]">{table.description}</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 text-[11px]">
                    <tr>
                      <th className="px-4 py-2">COLUMN</th>
                      <th className="px-4 py-2">DATA TYPE</th>
                      <th className="px-4 py-2">CONSTRAINTS</th>
                      <th className="px-4 py-2">DESCRIPTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {table.columns.map((col) => (
                      <tr key={col.name} className="hover:bg-slate-800/30">
                        <td className="px-4 py-2.5 font-bold text-slate-200">{col.name}</td>
                        <td className="px-4 py-2.5 text-indigo-300">{col.type}</td>
                        <td className="px-4 py-2.5 text-amber-400 text-[11px]">{col.constraints}</td>
                        <td className="px-4 py-2.5 text-slate-400 text-[11px]">{col.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-3 bg-slate-950/80 border-t border-slate-800 text-[10px] font-mono text-slate-400">
                <strong>Indexes: </strong>
                {table.indexes.join(' | ')}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 2: API Contracts */}
      {activeTab === 'api' && (
        <div className="space-y-4 font-mono text-xs">
          {API_CONTRACTS.map((api, idx) => (
            <div key={idx} className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                    api.method === 'GET' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-blue-950 text-blue-400 border border-blue-800'
                  }`}>
                    {api.method}
                  </span>
                  <span className="text-sm font-bold text-slate-100">{api.path}</span>
                </div>
                <div className="flex items-center space-x-2 text-[11px]">
                  {api.authRequired && (
                    <span className="flex items-center space-x-1 text-amber-400 bg-amber-950/40 border border-amber-800/40 px-2 py-0.5 rounded">
                      <Key className="w-3 h-3" />
                      <span>mTLS / Token Required</span>
                    </span>
                  )}
                </div>
              </div>

              <p className="text-slate-300 text-xs">{api.description}</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                {api.requestSchema && (
                  <div className="p-3 bg-slate-950 rounded border border-slate-800">
                    <span className="text-slate-400 font-bold block mb-1">Request Payload:</span>
                    <pre className="text-slate-300 overflow-x-auto">{JSON.stringify(api.requestSchema, null, 2)}</pre>
                  </div>
                )}
                <div className="p-3 bg-slate-950 rounded border border-slate-800">
                  <span className="text-slate-400 font-bold block mb-1">Response Payload:</span>
                  <pre className="text-emerald-400 overflow-x-auto">{JSON.stringify(api.responseSchema, null, 2)}</pre>
                </div>
              </div>

              <div className="text-[10px] text-slate-400 pt-1">
                <strong>Error Codes: </strong>
                {api.errorCodes.map((e) => `${e.code} (${e.meaning})`).join(', ')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
