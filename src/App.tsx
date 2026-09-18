import React, { useState, useMemo, useCallback, useEffect } from 'react';
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
import { getNewsSentimentForSymbol } from './engines/newsEventEngine';
import { evaluateRiskGates, DEFAULT_RISK_CONFIG, RecentOrderContext } from './engines/riskEngine';
import { INITIAL_PORTFOLIO_STATE } from './engines/paperTradingEngine';
import { getKillSwitchState, triggerEmergencyKillSwitch, KillSwitchState } from './engines/killSwitchEngine';
import { OrderRequest, PortfolioState, RiskValidationVerdict, SystemExecutionMode } from './types/order';
import { RiskEngineConfig } from './types/risk';

export default function App() {
  const [activeView, setActiveView] = useState<NavViewId>('portfolio');
  const [executionMode, setExecutionMode] = useState<SystemExecutionMode>('PAPER');
  const [killSwitchState, setKillSwitchState] = useState<KillSwitchState>(getKillSwitchState());
  const [selectedSymbol, setSelectedSymbol] = useState('NIFTY50');
  const [bars, setBars] = useState(() => generateSyntheticDailyBars('NIFTY50', 120));
  const [marketSnapshot, setMarketSnapshot] = useState(() => generateMarketSnapshot('NIFTY50', bars[bars.length - 1].close));
  const [portfolio, setPortfolio] = useState<PortfolioState>(INITIAL_PORTFOLIO_STATE);
  const [orders, setOrders] = useState<OrderRequest[]>([]);
  const [riskConfig, setRiskConfig] = useState<RiskEngineConfig>({ ...DEFAULT_RISK_CONFIG });
  const validationResult = useMemo(() => validateMarketDataSeries(bars), [bars]);
  const indicators = useMemo(() => computeAllIndicators(bars), [bars]);
  const killActive = killSwitchState.isGlobalTradingOff || killSwitchState.isEmergencyStopTripped || killSwitchState.isDailyLossLockTripped || killSwitchState.isApiFailureLockTripped || killSwitchState.isDataStaleLockTripped || killSwitchState.isAbnormalFrequencyLockTripped;
  const [aiDecision, setAiDecision] = useState(() => {
    const news = getNewsSentimentForSymbol(selectedSymbol);
    return generateAIDecision({ symbol: selectedSymbol, timestamp: Date.now(), currentPrice: marketSnapshot.lastPrice, indicators, newsSentiment: news.latestItem ? { headline: news.latestItem.headline, score: news.latestItem.sentimentScore, source: news.latestItem.source, timestamp: news.latestItem.timestamp } : undefined, currentMarketConditions: { spreadBps: ((marketSnapshot.ask - marketSnapshot.bid) / marketSnapshot.bid) * 10000, dataStalenessMs: Date.now() - marketSnapshot.timestamp } });
  });

  useEffect(() => {
    const dataStalenessMs = Math.max(0, Date.now() - marketSnapshot.timestamp);
    const spreadBps = marketSnapshot.bid > 0 ? ((marketSnapshot.ask - marketSnapshot.bid) / marketSnapshot.bid) * 10000 : Number.POSITIVE_INFINITY;
    const news = getNewsSentimentForSymbol(selectedSymbol);
    setAiDecision(generateAIDecision({
      symbol: selectedSymbol, timestamp: Date.now(), currentPrice: marketSnapshot.lastPrice, indicators,
      newsSentiment: news.latestItem ? { headline: news.latestItem.headline, score: news.latestItem.sentimentScore, source: news.latestItem.source, timestamp: news.latestItem.timestamp } : undefined,
      currentMarketConditions: { spreadBps, dataStalenessMs },
    }));
  }, [selectedSymbol, marketSnapshot, indicators]);

  const riskContext = useMemo<RecentOrderContext>(() => {
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
    const lastOrderTimestamps: Record<string, number> = {};
    const recentOrders = orders.map((order) => ({ id: order.id, symbol: order.symbol, side: order.side, quantity: order.quantity, timestamp: order.timestamp ?? order.createdAt ?? 0 }));
    for (const order of recentOrders) {
      if (order.timestamp <= 0) continue;
      const previous = lastOrderTimestamps[order.symbol] ?? 0;
      if (order.timestamp > previous) lastOrderTimestamps[order.symbol] = order.timestamp;
    }
    const todayExecutedTradesCount = recentOrders.filter((order) => {
      if (order.timestamp <= 0) return false;
      const date = new Date(order.timestamp);
      return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` === todayKey;
    }).length;
    return { lastOrderTimestamps, recentOrders, todayExecutedTradesCount, brokerHeartbeatActive: true, isEmergencyKillSwitchActive: killActive };
  }, [orders, killActive]);

  const [currentVerdict, setCurrentVerdict] = useState<RiskValidationVerdict>(() => {
    const dummyOrder: OrderRequest = { id: 'INIT-AUDIT-01', orderId: 'INIT-AUDIT-01', clientOrderId: 'CLI-INIT-01', symbol: selectedSymbol, side: 'BUY', type: 'MARKET', quantity: 10, limitPrice: marketSnapshot.lastPrice, stopLossPrice: Math.round(marketSnapshot.lastPrice * 0.96), takeProfitPrice: Math.round(marketSnapshot.lastPrice * 1.08), executionMode: 'PAPER', timestamp: Date.now() };
    return evaluateRiskGates(dummyOrder, INITIAL_PORTFOLIO_STATE, marketSnapshot, { isEmergencyKillSwitchActive: killActive }, riskConfig);
  });

  useEffect(() => {
    const referencePrice = marketSnapshot.lastPrice;
    const dummyOrder: OrderRequest = {
      id: `VIEW-AUD-${Date.now()}`, orderId: `VIEW-AUD-${Date.now()}`, clientOrderId: `CLI-VIEW-${Date.now()}`,
      symbol: selectedSymbol, side: 'BUY', type: 'MARKET', quantity: 1, limitPrice: referencePrice,
      stopLossPrice: referencePrice * 0.96, takeProfitPrice: referencePrice * 1.08,
      executionMode: 'PAPER', timestamp: Date.now(),
    };
    setCurrentVerdict(evaluateRiskGates(dummyOrder, portfolio, marketSnapshot, riskContext, DEFAULT_RISK_CONFIG));
  }, [selectedSymbol, marketSnapshot, portfolio, riskContext, riskConfig]);

  const handleSelectSymbol = useCallback((newSymbol: string) => {
    setSelectedSymbol(newSymbol);
    const newBars = generateSyntheticDailyBars(newSymbol, 120);
    setBars(newBars);
    const newSnap = generateMarketSnapshot(newSymbol, newBars[newBars.length - 1].close);
    setMarketSnapshot(newSnap);
  }, []);

  const handleOrderExecuted = (newPortfolio: PortfolioState, executedOrder: OrderRequest) => { setPortfolio(newPortfolio); setOrders(prev => [executedOrder, ...prev]); };
  const handleHeaderKillSwitch = () => setKillSwitchState(triggerEmergencyKillSwitch(killSwitchState, 'Header emergency kill switch pressed'));
  const failedRiskChecksCount = currentVerdict.checks.filter(c => !c.passed).length;

  return <div id="quantpulse-platform-root" className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased selection:bg-blue-600 selection:text-white">
    <Header executionMode={executionMode} killSwitchState={killSwitchState} onTriggerKillSwitch={handleHeaderKillSwitch} dailyPnL={portfolio.dailyPnL} equity={portfolio.equity} isStaleData={marketSnapshot.dataQuality.isStale} activeView={activeView} />
    <div className="flex-1 flex overflow-hidden"><Sidebar activeView={activeView} onSelectView={setActiveView} failedRiskChecksCount={failedRiskChecksCount} />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-950/60"><div className="max-w-7xl mx-auto">
        {activeView === 'portfolio' && <PortfolioView portfolio={portfolio} />}
        {activeView === 'market' && <MarketOverviewView selectedSymbol={selectedSymbol} onSelectSymbol={handleSelectSymbol} bars={bars} snapshot={marketSnapshot} validationResult={validationResult} isStaleData={marketSnapshot.dataQuality.isStale} />}
        {activeView === 'analysis' && <MarketAnalysisView symbol={selectedSymbol} indicators={indicators} currentPrice={marketSnapshot.lastPrice} />}
        {activeView === 'news' && <NewsEventView />}
        {activeView === 'ai' && <AiDecisionView decision={aiDecision} indicators={indicators} currentPrice={marketSnapshot.lastPrice} symbol={selectedSymbol} marketSnapshot={marketSnapshot} onRefreshDecision={setAiDecision} />}
        {activeView === 'strategy' && <StrategyStatusView symbol={selectedSymbol} bars={bars} />}
        {activeView === 'backtest' && <BacktestingLabView bars={bars} symbol={selectedSymbol} />}
        {activeView === 'paper' && <PaperTradingView riskConfig={riskConfig} portfolio={portfolio} marketSnapshot={marketSnapshot} isEmergencyKillSwitchActive={killActive} riskContext={riskContext} onOrderExecuted={handleOrderExecuted} onRiskVerdictGenerated={setCurrentVerdict} />}
        {activeView === 'orders' && <OrdersHistoryView orders={orders} />}
        {activeView === 'risk' && <RiskMonitorView currentVerdict={currentVerdict} portfolio={portfolio} marketSnapshot={marketSnapshot} riskContext={riskContext} onNewVerdict={setCurrentVerdict} />}
        {activeView === 'audit' && <AuditLogsView />}
        {activeView === 'killswitch' && <KillSwitchSafetyView killSwitchState={killSwitchState} portfolio={portfolio} onKillSwitchChanged={setKillSwitchState} />}
        {activeView === 'failure_sim' && <FailureSimulatorView portfolio={portfolio} marketSnapshot={marketSnapshot} onUpdateSnapshot={setMarketSnapshot} onUpdateKillSwitch={setKillSwitchState} onRiskVerdictGenerated={setCurrentVerdict} />}
        {activeView === 'roadmap' && <ArchitectureRoadmapView />}
        {activeView === 'system_design' && <SystemDesignDocsView />}
        {activeView === 'testing' && <TestingMatrixView />}
        {activeView === 'settings' && <SettingsView executionMode={executionMode} onUpdateExecutionMode={setExecutionMode} onRiskConfigSaved={() => setRiskConfigRevision((revision) => revision + 1)} />}
      </div></main>
    </div>
  </div>;
}
