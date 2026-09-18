import React from 'react';
import {
  PieChart,
  LineChart,
  Cpu,
  Layers,
  FlaskConical,
  ShieldCheck,
  ClipboardList,
  FileSpreadsheet,
  History,
  Activity,
  AlertOctagon,
  Settings,
  BookOpen,
  Code2,
  CheckSquare,
  Flame,
  Newspaper,
} from 'lucide-react';

export type NavViewId =
  | 'portfolio'
  | 'market'
  | 'analysis'
  | 'news'
  | 'ai'
  | 'strategy'
  | 'backtest'
  | 'paper'
  | 'orders'
  | 'risk'
  | 'audit'
  | 'killswitch'
  | 'failure_sim'
  | 'roadmap'
  | 'system_design'
  | 'testing'
  | 'settings';

interface SidebarProps {
  activeView: NavViewId;
  onSelectView: (view: NavViewId) => void;
  failedRiskChecksCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onSelectView,
  failedRiskChecksCount,
}) => {
  const navSections = [
    {
      group: 'Trading Operations',
      items: [
        { id: 'portfolio' as NavViewId, label: 'Portfolio & Capital', icon: PieChart },
        { id: 'market' as NavViewId, label: 'Market Overview', icon: LineChart },
        { id: 'analysis' as NavViewId, label: 'Market Analysis (Math)', icon: Activity },
        { id: 'news' as NavViewId, label: 'News & Macro Events', icon: Newspaper },
        { id: 'ai' as NavViewId, label: 'AI Decision Engine', icon: Cpu },
        { id: 'strategy' as NavViewId, label: 'Strategy Status', icon: Layers },
        { id: 'backtest' as NavViewId, label: 'Backtesting Lab', icon: FlaskConical },
        { id: 'paper' as NavViewId, label: 'Paper Trading Console', icon: ClipboardList },
        { id: 'orders' as NavViewId, label: 'Orders & Trade History', icon: History },
      ],
    },
    {
      group: 'Risk & Governance',
      items: [
        {
          id: 'risk' as NavViewId,
          label: 'Risk Monitor (17 Gates)',
          icon: ShieldCheck,
          badge: failedRiskChecksCount > 0 ? `${failedRiskChecksCount} VIOLATIONS` : 'SHIELD OK',
          badgeColor: failedRiskChecksCount > 0 ? 'bg-rose-900 text-rose-300' : 'bg-emerald-950 text-emerald-400',
        },
        { id: 'killswitch' as NavViewId, label: 'Kill Switch & Safety', icon: AlertOctagon },
        { id: 'audit' as NavViewId, label: 'Audit Trail (Hash Chain)', icon: FileSpreadsheet },
        { id: 'failure_sim' as NavViewId, label: 'Failure Simulation Lab', icon: Flame },
      ],
    },
    {
      group: 'System Specs & Roadmap',
      items: [
        { id: 'roadmap' as NavViewId, label: 'Architecture & 10 Phases', icon: BookOpen },
        { id: 'system_design' as NavViewId, label: 'Data Model & APIs', icon: Code2 },
        { id: 'testing' as NavViewId, label: 'Testing Matrix (13 Cats)', icon: CheckSquare },
        { id: 'settings' as NavViewId, label: 'Risk Rules & Settings', icon: Settings },
      ],
    },
  ];

  return (
    <aside id="platform-sidebar" className="w-64 bg-slate-900 border-r border-slate-800 text-slate-300 flex flex-col shrink-0 select-none overflow-y-auto">
      <div className="p-3 space-y-5">
        {navSections.map((section) => (
          <div key={section.group}>
            <div className="px-2 pb-1.5 text-[10px] font-mono tracking-wider text-slate-400 uppercase font-semibold">
              {section.group}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    id={`nav-item-${item.id}`}
                    onClick={() => onSelectView(item.id)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 truncate">
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-400' : 'text-slate-400'}`} />
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border border-transparent font-bold ${item.badgeColor}`}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Safety Notice Footer */}
      <div className="mt-auto p-3 border-t border-slate-800 bg-slate-950/40 text-[10px] text-slate-400 leading-tight">
        <p className="font-semibold text-slate-300 mb-0.5">Institutional Risk Mandate</p>
        <p>No real money execution. AI decisions must pass deterministic pre-trade risk interception.</p>
      </div>
    </aside>
  );
};
