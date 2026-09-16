import React, { useState } from 'react';
import {
  PLATFORM_PHASES,
  RECOMMENDED_FILE_TREE,
  DEPLOYMENT_PARTITIONING,
  SEBI_ALGO_REGULATORY_REQUIREMENTS,
} from '../../data/architectureRoadmapData';
import { BookOpen, FolderTree, Server, ShieldCheck, CheckCircle2, Lock, AlertTriangle } from 'lucide-react';

export const ArchitectureRoadmapView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'phases' | 'files' | 'deployment' | 'regulatory'>('phases');

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-wrap justify-between items-center gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <BookOpen className="w-5 h-5 text-blue-400" />
            <h2 className="text-sm font-semibold text-slate-100">QuantPulse Production Architecture & Roadmap</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Institutional engineering specifications spanning 10 development phases, deployment tiering, and SEBI compliance.
          </p>
        </div>

        <div className="flex space-x-2 font-mono text-xs">
          <button
            onClick={() => setActiveTab('phases')}
            className={`px-3 py-1.5 rounded transition-colors ${
              activeTab === 'phases' ? 'bg-blue-600 text-white font-bold' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            10-Phase Roadmap
          </button>
          <button
            onClick={() => setActiveTab('deployment')}
            className={`px-3 py-1.5 rounded transition-colors ${
              activeTab === 'deployment' ? 'bg-blue-600 text-white font-bold' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            Deployment Partitioning
          </button>
          <button
            onClick={() => setActiveTab('regulatory')}
            className={`px-3 py-1.5 rounded transition-colors ${
              activeTab === 'regulatory' ? 'bg-blue-600 text-white font-bold' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            SEBI Regulatory Specs
          </button>
          <button
            onClick={() => setActiveTab('files')}
            className={`px-3 py-1.5 rounded transition-colors ${
              activeTab === 'files' ? 'bg-blue-600 text-white font-bold' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            Directory Architecture
          </button>
        </div>
      </div>

      {/* Tab 1: 10 Phases */}
      {activeTab === 'phases' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PLATFORM_PHASES.map((p) => {
              const isImplemented = p.status === 'IMPLEMENTED';
              const isBlocked = p.status === 'BLOCKED_BY_SAFETY_POLICY';
              return (
                <div
                  key={p.phaseNumber}
                  className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-2.5 hover:border-slate-700 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center space-x-2">
                      <span className="w-6 h-6 rounded-full bg-slate-800 text-slate-300 font-mono text-xs font-bold flex items-center justify-center">
                        {p.phaseNumber}
                      </span>
                      <h3 className="text-sm font-bold text-slate-100">{p.name}</h3>
                    </div>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                      isImplemented
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/40'
                        : isBlocked
                        ? 'bg-red-950 text-red-300 border border-red-500/40'
                        : 'bg-amber-950 text-amber-300 border border-amber-500/40'
                    }`}>
                      {p.status.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300">{p.objective}</p>

                  <div className="space-y-1 text-xs">
                    <span className="text-slate-400 text-[10px] font-mono uppercase font-bold block">Deliverables:</span>
                    <ul className="list-disc pl-4 text-slate-400 text-[11px] space-y-0.5">
                      {p.deliverables.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 flex justify-between items-center text-[10px] font-mono text-slate-400">
                    <span>Target: {p.targetTimeline}</span>
                    <span className="text-blue-400">Prereq: {p.prerequisites.join(', ')}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 2: Deployment Partitioning */}
      {activeTab === 'deployment' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
          {DEPLOYMENT_PARTITIONING.map((tier) => (
            <div key={tier.category} className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-3">
              <div className="flex items-center space-x-2 text-indigo-400 font-bold border-b border-slate-800 pb-2">
                <Server className="w-4 h-4" />
                <span>{tier.category}</span>
              </div>
              <h3 className="text-sm font-bold text-slate-100">{tier.title}</h3>
              <p className="text-[11px] text-slate-400">{tier.reason}</p>

              <div>
                <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Architecture Components:</span>
                <ul className="list-disc pl-4 space-y-1 text-[11px] text-emerald-400">
                  {tier.components.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>

              <div>
                <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Security & Governance Boundaries:</span>
                <ul className="list-disc pl-4 space-y-1 text-[11px] text-rose-400">
                  {tier.securityBoundaries.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 3: SEBI Regulatory Specs */}
      {activeTab === 'regulatory' && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4 font-mono text-xs">
          <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-sm font-bold text-slate-100">
                Indian Securities & Exchange Board of India (SEBI) Algo-Trading Compliance Framework
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Mandatory rules for automated trading systems operating under Indian exchanges (NSE, BSE, MCX).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {SEBI_ALGO_REGULATORY_REQUIREMENTS.map((reg, i) => (
              <div key={i} className="p-3.5 bg-slate-950/60 rounded border border-slate-800 space-y-2">
                <div className="flex justify-between items-start">
                  <span className="text-[10px] text-blue-400 font-bold bg-blue-950/80 px-2 py-0.5 rounded border border-blue-800/60">
                    {reg.circularReference}
                  </span>
                  <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800/60">
                    {reg.complianceStatus}
                  </span>
                </div>
                <h4 className="text-xs font-bold text-slate-100">{reg.ruleName}</h4>
                <p className="text-[11px] text-slate-300">{reg.requirement}</p>
                <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
                  <strong className="text-slate-300">Technical Enforcement: </strong>
                  {reg.systemEnforcement}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: Directory Architecture */}
      {activeTab === 'files' && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-3 font-mono text-xs">
          <div className="flex items-center space-x-2 text-slate-200 font-bold border-b border-slate-800 pb-2">
            <FolderTree className="w-4 h-4 text-purple-400" />
            <span>Recommended Production Directory Architecture</span>
          </div>
          <p className="text-slate-400 text-[11px]">
            Strict separation of UI presentation, market data feed validation, strategy logic, deterministic risk gating, and append-only cryptographic logging.
          </p>
          <pre className="p-4 bg-slate-950 text-slate-300 rounded border border-slate-800 text-[11px] overflow-x-auto leading-relaxed">
            {RECOMMENDED_FILE_TREE}
          </pre>
        </div>
      )}
    </div>
  );
};
