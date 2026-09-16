import React, { useState, useMemo, useCallback } from 'react';
import { Header } from './components/Header';
import { Sidebar, NavViewId } from './components/Sidebar';
import { PortfolioView } from './components/views/PortfolioView';
import { MarketOverviewView } from './components/views/MarketOverviewView';
import { MarketAnalysisView } from './components/views/MarketAnalysisView';
import { NewsEventView } from './components/views/NewsEventView';
import { AiDecisionView } from './components/views/AiDecisionView';
import { StrategyStatusView } from './components/views/StrategyStatusView';
import { BacktestingLabView } from './components/views/BacktestingLabView';
import { PaperTradingView } from './components/views/PaperTradingView';
import { OrdersHistoryView } from './components/views/OrdersHistoryView';
import { RiskMonitorView } from './components/views/RiskMonitorView';
import { AuditLogsView } from './components/views/AuditLogsView';
import { KillSwitchSafetyView } from './components/views/KillSwitchSafetyView';
import { FailureSimulatorView } from './components/views/FailureSimulatorView';
import { ArchitectureRoadmapView } from './components/views/ArchitectureRoadmapView';
import { SystemDesignDocsView } from './components/views/SystemDesignDocsView';
import { TestingMatrixView } from './components/views/TestingMatrixView';
import { SettingsView } from './components/views/SettingsView';
import { generateSyntheticDailyBars, generateMarketSnapshot, validateMarketDataSeries } from './engines/marketDataEngine';
import { computeAllIndicators } from './engines/marketAnalysisEngine';
import { generateAIDecision } from './engines/aiDecisionEngine';
import { evaluateRiskGates, DEFAULT_RISK_CONFIG } from './engines/riskEngine';
import { INITIAL_PORTFOLIO_STATE } from './engines/paperTradingEngine';
import { getKillSwitchState, triggerEmergencyKillSwitch, KillSwitchState } from './engines/killSwitchEngine';
import { OrderRequest, PortfolioState, RiskValidationVerdict, SystemExecutionMode } from './types/order';

export default function App() {
  const [activeView, setActiveView] = useState<NavViewId>('portfolio');
  const [executionMode, setExecutionMode] = useState<SystemExecutionMode>('PAPER');
  const [killSwitchState, setKillSwitchState] = useState<KillSwitchState>(getKillSwitchState());
  const [selectedSymbol, setSelectedSymbol] = useState('NIFTY50');
  const [bars, setBars] = useState(() => generateSyntheticDailyBars('NIFTY50', 120));
  const [marketSnapshot, setMarketSnapshot] = useState(() => generateMarketSnapshot('NIFTY50', bars[bars.length - 1].close));
  const [portfolio, setPortfolio] = useState<PortfolioState>(INITIAL_PORTFOLIO_STATE);
  const [orders, setOrders] = useState<OrderRequest[]>([]);
  const validationResult = useMemo(() => validateMarketDataSeries(bars), [bars]);
  const indicators = useMemo(() => computeAllIndicators(bars), [bars]);
  const killActive = killSwitchState.isGlobalTradingOff || killSwitchState.isEmergencyStopTripped || killSwitchState.isDailyLossLockTripped || killSwitchState.isApiFailureLockTripped || killSwitchState.isDataStaleLockTripped || killSwitchState.isAbnormalFrequencyLockTripped;

  const [aiDecision, setAiDecision] = useState(() => generateAIDecision({
    symbol: selectedSymbol, timestamp: Date.now(), currentPrice: marketSnapshot.lastPrice, indicators,
    currentMarketConditions: { spreadBps: 4.2, dataStalenessMs: marketSnapshot.dataQuality.latencyMs },
  }));

  const [currentVerdict, setCurrentVerdict] = useState<RiskValidationVerdict>(() => {
    const dummyOrder: OrderRequest = { id: 'INIT-AUDIT-01', orderId: 'INIT-AUDIT-01', clientOrderId: 'CLI-INIT-01', symbol: selectedSymbol, side: 'BUY', type: 'MARKET', quantity: 10, limitPrice: marketSnapshot.lastPrice, stopLossPrice: Math.round(marketSnapshot.lastPrice * 0.96), takeProfitPrice: Math.round(marketSnapshot.lastPrice * 1.08), executionMode: 'PAPER', timestamp: Date.now() };
    return evaluateRiskGates(dummyOrder, INITIAL_PORTFOLIO_STATE, marketSnapshot, { isEmergencyKillSwitchActive: killActive }, DEFAULT_RISK_CONFIG);
  });

  const handleSelectSymbol = useCallback((newSymbol: string) => {
    setSelectedSymbol(newSymbol);
    const newBars = generateSyntheticDailyBars(newSymbol, 120);
    setBars(newBars);
    const newSnap = generateMarketSnapshot(newSymbol, newBars[newBars.length - 1].close);
    setMarketSnapshot(newSnap);
    const newIndicators = computeAllIndicators(newBars);
    setAiDecision(generateAIDecision({ symbol: newSymbol, timestamp: Date.now(), currentPrice: newSnap.lastPrice, indicators: newIndicators, currentMarketConditions: { spreadBps: 4.5, dataStalenessMs: newSnap.dataQuality.latencyMs } }));
    const dummyOrder: OrderRequest = { id: `AUD-${Date.now().toString().slice(-4)}`, orderId: `AUD-${Date.now().toString().slice(-4)}`, clientOrderId: `CLI-${Date.now()}`, symbol: newSymbol, side: 'BUY', type: 'MARKET', quantity: 10, limitPrice: newSnap.lastPrice, stopLossPrice: Math.round(newSnap.lastPrice * 0.96), takeProfitPrice: Math.round(newSnap.lastPrice * 1.08), executionMode: 'PAPER', timestamp: Date.now() };
    setCurrentVerdict(evaluateRiskGates(dummyOrder, portfolio, newSnap, { isEmergencyKillSwitchActive: killActive }, DEFAULT_RISK_CONFIG));
  }, [portfolio, killActive]);

  const handleOrderExecuted = (newPortfolio: PortfolioState, executedOrder: OrderRequest) => { setPortfolio(newPortfolio); setOrders(prev => [executedOrder, ...prev]); };
  const handleHeaderKillSwitch = () => {
    const tripped = triggerEmergencyKillSwitch(killSwitchState, 'Header emergency kill switch pressed');
    setKillSwitchState(tripped);
    const dummyOrder: OrderRequest = { id: `KILL-AUD-${Date.now()}`, orderId: `KILL-AUD-${Date.now()}`, clientOrderId: `CLI-KILL-${Date.now()}`, symbol: selectedSymbol, side: 'BUY', type: 'MARKET', quantity: 1, limitPrice: marketSnapshot.lastPrice, stopLossPrice: marketSnapshot.lastPrice * 0.96, takeProfitPrice: marketSnapshot.lastPrice * 1.08, executionMode: 'PAPER', timestamp: Date.now() };
    setCurrentVerdict(evaluateRiskGates(dummyOrder, portfolio, marketSnapshot, { isEmergencyKillSwitchActive: true }, DEFAULT_RISK_CONFIG));
  };
  const failedRiskChecksCount = currentVerdict.checks.filter(c => c.status === 'FAILED').length;

  return (
    <div id="quantpulse-platform-root" className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased selection:bg-blue-600 selection:text-white">
      <Header executionMode={executionMode} killSwitchState={killSwitchState} onTriggerKillSwitch={handleHeaderKillSwitch} dailyPnL={portfolio.dailyPnL} equity={portfolio.equity} isStaleData={marketSnapshot.dataQuality.isStale} activeView={activeView} />
      <div className="flex-1 flex overflow-hidden"><Sidebar activeView={activeView} onSelectView={setActiveView} failedRiskChecksCount={failedRiskChecksCount} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-950/60"><div className="max-w-7xl mx-auto">
          {activeView === 'portfolio' && <PortfolioView portfolio={portfolio} />}
          {activeView === 'market' && <MarketOverviewView selectedSymbol={selectedSymbol} onSelectSymbol={handleSelectSymbol} bars={bars} snapshot={marketSnapshot} validationResult={validationResult} isStaleData={marketSnapshot.dataQuality.isStale} />}
          {activeView === 'analysis' && <MarketAnalysisView symbol={selectedSymbol} indicators={indicators} currentPrice={marketSnapshot.lastPrice} />}
          {activeView === 'news' && <NewsEventView />}
          {activeView === 'ai' && <AiDecisionView decision={aiDecision} indicators={indicators} currentPrice={marketSnapshot.lastPrice} symbol={selectedSymbol} onRefreshDecision={setAiDecision} />}
          {activeView === 'strategy' && <StrategyStatusView symbol={selectedSymbol} bars={bars} />}
          {activeView === 'backtest' && <BacktestingLabView bars={bars} symbol={selectedSymbol} />}
          {activeView === 'paper' && <PaperTradingView portfolio={portfolio} marketSnapshot={marketSnapshot} isEmergencyKillSwitchActive={killActive} onOrderExecuted={handleOrderExecuted} onRiskVerdictGenerated={setCurrentVerdict} />}
          {activeView === 'orders' && <OrdersHistoryView orders={orders} />}
          {activeView === 'risk' && <RiskMonitorView currentVerdict={currentVerdict} portfolio={portfolio} marketSnapshot={marketSnapshot} onNewVerdict={setCurrentVerdict} />}
          {activeView === 'audit' && <AuditLogsView />}
          {activeView === 'killswitch' && <KillSwitchSafetyView killSwitchState={killSwitchState} portfolio={portfolio} onKillSwitchChanged={setKillSwitchState} />}
          {activeView === 'failure_sim' && <FailureSimulatorView portfolio={portfolio} marketSnapshot={marketSnapshot} onUpdateSnapshot={setMarketSnapshot} onUpdateKillSwitch={setKillSwitchState} onRiskVerdictGenerated={setCurrentVerdict} />}
          {activeView === 'roadmap' && <ArchitectureRoadmapView />}
          {activeView === 'system_design' && <SystemDesignDocsView />}
          {activeView === 'testing' && <TestingMatrixView />}
          {activeView === 'settings' && <SettingsView executionMode={executionMode} onUpdateExecutionMode={setExecutionMode} />}
        </div></main>
      </div>
    </div>
  );
}
