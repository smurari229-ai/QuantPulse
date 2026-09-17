import React, { useState } from 'react';
import { GlobalAuditLedger, AuditRecord } from '../../engines/auditEngine';
import { FileSpreadsheet, ShieldCheck, AlertOctagon, Key, CheckCircle, Search, RefreshCw } from 'lucide-react';

export const AuditLogsView: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterModule, setFilterModule] = useState<string>('ALL');
  const [records, setRecords] = useState<AuditRecord[]>(GlobalAuditLedger.getAllRecords());
  const [integrityStatus, setIntegrityStatus] = useState<{ isValid: boolean; checkedCount: number } | null>(null);

  const handleVerifyLedger = () => {
    const valid = GlobalAuditLedger.verifyChainIntegrity();
    setIntegrityStatus({ isValid: valid, checkedCount: records.length });
  };

  const handleRefresh = () => setRecords(GlobalAuditLedger.getAllRecords());

  const filteredRecords = records.filter((r) => {
    const matchesModule = filterModule === 'ALL' || r.sourceModule === filterModule;
    const matchesSearch = r.eventType.toLowerCase().includes(searchTerm.toLowerCase())
      || r.recordHash.toLowerCase().includes(searchTerm.toLowerCase())
      || JSON.stringify(r.details).toLowerCase().includes(searchTerm.toLowerCase());
    return matchesModule && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-wrap justify-between items-center gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            <h2 className="text-sm font-semibold text-slate-100">Tamper-Evident In-Memory Audit Ledger</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Rule 8 & 21: events are chained with a deterministic in-memory hash and secrets are scrubbed. This is not a cryptographic SHA-256 security boundary.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button onClick={handleRefresh} className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition-colors" title="Refresh logs">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleVerifyLedger} className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-mono font-semibold transition-colors">
            <ShieldCheck className="w-4 h-4" /><span>Verify Chain Integrity</span>
          </button>
        </div>
      </div>

      {integrityStatus && (
        <div className={`p-4 rounded-lg border font-mono text-xs flex items-center space-x-3 ${integrityStatus.isValid ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300' : 'bg-rose-950/40 border-rose-500/80 text-rose-200'}`}>
          {integrityStatus.isValid ? <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" /> : <AlertOctagon className="w-5 h-5 text-rose-400 shrink-0" />}
          <div>
            <span className="font-bold block">
              {integrityStatus.isValid ? `LEDGER CHAIN VERIFIED: All ${integrityStatus.checkedCount} in-memory records match their hash pointers.` : 'INTEGRITY BREACH DETECTED: Hash chain broken or record modified!'}
            </span>
            <span className="text-[11px] text-slate-400">This verifies the current in-memory chain; durable production audit security requires server-side cryptographic storage and access controls.</span>
          </div>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 flex flex-wrap justify-between items-center gap-3 text-xs font-mono">
        <div className="flex items-center space-x-2 flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-500 shrink-0" />
          <input type="text" placeholder="Search event type, hash, or payload..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 text-xs" />
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="text-slate-500 text-[11px]">Module:</span>
          {['ALL', 'MARKET_DATA', 'AI_ENGINE', 'STRATEGY', 'RISK_ENGINE', 'PAPER_BROKER', 'KILL_SWITCH', 'SECURITY'].map((mod) => (
            <button key={mod} onClick={() => setFilterModule(mod)} className={`px-2 py-0.5 rounded text-[10px] ${filterModule === mod ? 'bg-blue-600 text-white font-bold' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>{mod}</button>
          ))}
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden font-mono text-xs">
        <div className="px-4 py-2.5 bg-slate-950/40 border-b border-slate-800 flex justify-between items-center text-[11px] text-slate-400">
          <span>Displaying {filteredRecords.length} chained events</span>
          <span className="flex items-center space-x-1 text-emerald-400"><Key className="w-3 h-3" /><span>Zero-Secret Sanitization Protocol: ACTIVE</span></span>
        </div>
        <div className="divide-y divide-slate-800/60 max-h-[600px] overflow-y-auto">
          {filteredRecords.map((record) => (
            <div key={record.sequenceNumber} className="p-4 hover:bg-slate-800/30 transition-colors space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center space-x-2"><span className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded font-bold text-[10px]">#{record.sequenceNumber}</span><span className="px-2 py-0.5 bg-blue-950/60 border border-blue-500/40 text-blue-300 rounded font-bold text-[10px]">{record.sourceModule}</span><span className="font-bold text-slate-100">{record.eventType}</span></div>
                <span className="text-slate-400 text-[11px]">{new Date(record.timestamp).toLocaleString()}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] text-slate-400 bg-slate-950/60 p-2 rounded border border-slate-800/60">
                <div className="truncate"><span className="text-slate-500">PREV HASH: </span><span className="text-slate-300 font-mono">{record.previousHash}</span></div>
                <div className="truncate"><span className="text-slate-500">BLOCK HASH: </span><span className="text-emerald-400 font-mono">{record.recordHash}</span></div>
              </div>
              <div className="bg-slate-950/40 p-2.5 rounded border border-slate-800/40 text-[11px] text-slate-300 overflow-x-auto"><pre className="whitespace-pre-wrap">{JSON.stringify(record.details, null, 2)}</pre></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
