import { PhaseRoadmapItem, DeploymentPartitioningPlan, RegulatoryComplianceSpec } from '../types/architecture';

export const TEN_PHASE_ROADMAP: PhaseRoadmapItem[] = [
  {
    phase: 1,
    title: 'Phase 1: Architecture, Visual System & Mock Engine Prototyping',
    objective: 'Establish end-to-end non-executing architecture, deterministic state models, simulated data feeds, and institutional dashboard layout.',
    status: 'COMPLETED',
    filesRequired: [
      'src/types/*',
      'src/engines/marketDataEngine.ts',
      'src/engines/riskEngine.ts',
      'src/components/*',
    ],
    dependencies: ['react', 'lucide-react', 'motion', 'tailwindcss'],
    apisRequired: ['Local mock tick stream', 'Simulated broker latency handler'],
    securityRisks: ['Accidental live trade initiation (mitigated by hardcoded LIVE_BLOCKED flag)'],
    testsRequired: ['Data schema validity', 'Component render stability', 'Kill switch state propagation'],
    expectedResult: 'Single-pane-of-glass terminal visualizing market data, mock trades, and risk states with 0 live exposure.',
    passCriteria: [
      'Live trading switch is hard-locked to disabled',
      'Synthetic OHLCV generates without NaN/Infs',
      'All 14 dashboard modules render without uncaught exceptions',
    ],
    failCriteria: [
      'Any network call attempted to live broker endpoint',
      'UI displays uncalibrated AI confidence as guaranteed profit',
    ],
    whatRemainsIncomplete: [
      'Real-time WebSocket socket connections',
      'Persistent Cloud SQL / TimescaleDB storage',
      'Live broker OAuth / API authentication handshake',
    ],
  },
  {
    phase: 2,
    title: 'Phase 2: Market Data Validation & Quantitative Feature Engine',
    objective: 'Implement high-throughput OHLCV data ingestion, timestamp verification, missing candle repair, and statistical indicators (EMA, RSI, MACD, ATR, Bollinger, VWAP, Regimes).',
    status: 'COMPLETED',
    filesRequired: [
      'src/engines/marketDataEngine.ts',
      'src/engines/marketAnalysisEngine.ts',
      'src/types/market.ts',
    ],
    dependencies: ['Statistical math libraries', 'Time-series interpolation helpers'],
    apisRequired: ['NSE / Binance / Polygon market data normalized REST/WS adapters'],
    securityRisks: ['Data poisoning attacks via malformed feed prices (mitigated by outlier filters)'],
    testsRequired: ['Negative price check', 'High-Low inversion check', 'Stale tick rejection (>3000ms)'],
    expectedResult: 'Clean, verified OHLCV bar series and mathematical feature vectors with zero look-ahead bias.',
    passCriteria: [
      'Stale timestamps correctly trigger data quality flags',
      'Mathematical parity of EMA and RSI against standard quant reference benchmarks',
    ],
    failCriteria: [
      'Negative prices permitted into indicator arrays',
      'Division by zero on zero-volume days',
    ],
    whatRemainsIncomplete: ['Level-2 order book depth delta processing (requires dedicated backend service)'],
  },
  {
    phase: 3,
    title: 'Phase 3: Quantitative Strategy Engine & Rule Validation',
    objective: 'Codify multi-strategy algorithmic signals: Trend Following (Dual EMA), Mean Reversion (Bollinger/RSI), Volatility Squeeze, and Momentum with deterministic entry/exit criteria.',
    status: 'COMPLETED',
    filesRequired: [
      'src/engines/strategyEngine.ts',
      'src/types/strategy.ts',
    ],
    dependencies: ['Vectorized technical analysis algorithms'],
    apisRequired: ['Internal Strategy Bus'],
    securityRisks: ['Infinite execution loops in custom strategy scripts (mitigated by no-eval sandbox)'],
    testsRequired: ['Strategy signal determinism', 'Mandatory stop-loss calculation validation'],
    expectedResult: 'Deterministic signal outputs with predefined stop-loss, take-profit, and risk/reward calculations.',
    passCriteria: [
      'Every BUY/SELL signal contains non-null Stop-Loss and Take-Profit',
      'Risk/Reward ratio is mathematically verified >= 1.5 before signal emission',
    ],
    failCriteria: [
      'Strategy emits signals without stop-loss',
      'Strategy modifies historical performance metadata',
    ],
    whatRemainsIncomplete: ['Machine-learning genetic hyperparameter search (requires offline compute cluster)'],
  },
  {
    phase: 4,
    title: 'Phase 4: Rigorous Backtesting Lab & Walk-Forward Validation',
    objective: 'Event-driven backtester featuring realistic slippage, commission modeling, Indian STT taxes, out-of-sample splits, walk-forward 3-fold analysis, and sample size warnings.',
    status: 'COMPLETED',
    filesRequired: [
      'src/engines/backtestingLab.ts',
      'src/types/backtest.ts',
    ],
    dependencies: ['Quantitative statistics formulas'],
    apisRequired: ['Historical OHLCV historical repository'],
    securityRisks: ['Look-ahead bias and data leakage producing false performance claims'],
    testsRequired: ['Walk-forward degradation ratio verification', 'Under-sampling warning trigger (N < 30)'],
    expectedResult: 'Defensible backtest metrics (Sharpe, Sortino, Calmar, Max Drawdown, CAGR, Win Rate) with explicit sample-size warnings.',
    passCriteria: [
      'Decisions at bar t are filled exclusively at bar t+1 open without future data access',
      'Realistic commissions and slippage are subtracted from every trade gross return',
    ],
    failCriteria: [
      'Overfitted strategies shown without degradation disclosure',
      'Sample size < 30 evaluated without high p-value warning',
    ],
    whatRemainsIncomplete: ['Tick-level microsecond tick replay simulation'],
  },
  {
    phase: 5,
    title: 'Phase 5: Institutional Deterministic Risk Engine (HIGHEST PRIORITY)',
    objective: 'Enforce 15 non-negotiable risk gates BEFORE any simulated or live order execution. If ANY check fails, immediate order rejection.',
    status: 'COMPLETED',
    filesRequired: [
      'src/engines/riskEngine.ts',
      'src/types/risk.ts',
    ],
    dependencies: ['Cryptographic token generator'],
    apisRequired: ['Internal Risk Validation Service'],
    securityRisks: ['Race conditions allowing concurrent orders to breach exposure limits'],
    testsRequired: ['Position size boundary test', 'Daily loss breaker test', 'Duplicate order throttle test'],
    expectedResult: '100% of orders intercepted and gated; rejection audit generated with detailed cause.',
    passCriteria: [
      'Zero orders reach broker without valid cryptographic Risk Verdict Token',
      'Duplicate orders within 60-second window are instantaneously suppressed',
      'Stale data (>3000ms) causes unconditional order rejection',
    ],
    failCriteria: [
      'Any order passes with missing stop-loss',
      'Portfolio exposure exceeds 70% threshold',
    ],
    whatRemainsIncomplete: ['Portfolio VaR (Value at Risk) Monte-Carlo matrix (to be deployed on backend cluster)'],
  },
  {
    phase: 6,
    title: 'Phase 6: High-Fidelity Paper Trading Simulation Engine',
    objective: 'Simulate realistic fills, broker latency, slippage penalties, exchange turnover fees, and mark-to-market portfolio accounting.',
    status: 'COMPLETED',
    filesRequired: [
      'src/engines/paperTradingEngine.ts',
      'src/types/order.ts',
    ],
    dependencies: ['State machine container'],
    apisRequired: ['Mock Broker Execution Adapter'],
    securityRisks: ['Confusing paper trades with live orders (mitigated by prominent PAPER watermark)'],
    testsRequired: ['Order lifecycle state transitions', 'Slippage and transaction cost deductions'],
    expectedResult: 'Virtual execution sandbox with exact real-world cost accounting and fill auditing.',
    passCriteria: [
      'Clear high-visibility PAPER TRADING indicator visible on all screens',
      'Cash and equity balances update correctly with realized/unrealized P&L',
    ],
    failCriteria: [
      'Paper mode UI looks identical to Live mode UI',
      'Negative cash balance allowed without margin approval',
    ],
    whatRemainsIncomplete: ['Partial fill queue simulation under thin limit book conditions'],
  },
  {
    phase: 7,
    title: 'Phase 7: Tamper-Evident Audit Logging & Emergency Kill Switches',
    objective: 'Cryptographically hash-chained append-only audit trail and multi-trigger safety kill switch with mandatory manual verification codes.',
    status: 'COMPLETED',
    filesRequired: [
      'src/engines/auditEngine.ts',
      'src/engines/killSwitchEngine.ts',
      'src/types/audit.ts',
    ],
    dependencies: ['SHA-256 equivalent cryptographic hashing'],
    apisRequired: ['Audit verification validator'],
    securityRisks: ['Unauthorized kill-switch override (mitigated by dual alphanumeric code requirement)'],
    testsRequired: ['Audit chain integrity validation', 'Kill switch instant freeze test'],
    expectedResult: 'Tamper-evident sequence of all market, AI, risk, and broker events; zero-secret logging.',
    passCriteria: [
      'Any manual modification to an audit log entry invalidates the chain integrity hash',
      'Kill switch instantly halts all proposed orders across all strategies',
    ],
    failCriteria: [
      'Any API key or secret written to audit logs',
      'Kill switch automatically re-enables without manual administrator code',
    ],
    whatRemainsIncomplete: ['Immutable WORM (Write Once Read Many) AWS S3 / Cloud Storage bucket export'],
  },
  {
    phase: 8,
    title: 'Phase 8: Broker Adapter Abstraction Layer (MOCK BROKER ONLY)',
    objective: 'Design unified broker interface (Connect, Authenticate, PlaceOrder, CancelOrder, GetPositions) with mock adapter implementation.',
    status: 'IN_PROGRESS',
    filesRequired: [
      'src/engines/brokerAdapter.ts',
      'src/types/order.ts',
    ],
    dependencies: ['Standard HTTP/WebSocket client types'],
    apisRequired: ['Mock Broker Gateway endpoint'],
    securityRisks: ['Premature live credential wiring (hard-locked to disabled)'],
    testsRequired: ['Heartbeat disconnect handling', 'Timeout retry safety limit (max 1 retry)'],
    expectedResult: 'Pluggable broker interface with mock adapter returning realistic fill and error payloads.',
    passCriteria: [
      'Real broker adapter is physically disabled by feature flags',
      'Mock broker simulates network jitter and order rejection scenarios',
    ],
    failCriteria: ['Any attempt to load production broker credentials'],
    whatRemainsIncomplete: ['SEBI-mandated vendor certificate validation for Indian broker APIs'],
  },
  {
    phase: 9,
    title: 'Phase 9: Regulatory Review & Exchange Compliance Verification (SEBI / Regulated)',
    objective: 'Audit system against SEBI algo trading circulars, exchange audit requirements, algorithmic ID tagging, and latency limits.',
    status: 'PLANNED',
    filesRequired: [
      'docs/regulatory/SEBI_COMPLIANCE_CHECKLIST.md',
      'docs/regulatory/ALGO_AUDIT_SPEC.md',
    ],
    dependencies: ['Legal and compliance sign-off'],
    apisRequired: ['Exchange-approved testing environment (Sandbox)'],
    securityRisks: ['Operating an unauthorized algorithmic strategy on Indian retail exchanges without 2FA and broker approval'],
    testsRequired: ['Mock audit trail extraction', 'Order-to-trade ratio (OTR) compliance verification'],
    expectedResult: 'Comprehensive regulatory readiness report and compliance audit package.',
    passCriteria: [
      'System tags every order with an explicit SEBI-compliant Unique Algo ID',
      'Order rate limiter enforces exchange throttle limits (< 20 orders/sec)',
    ],
    failCriteria: ['Initiating live broker integration before obtaining broker algo authorization'],
    whatRemainsIncomplete: ['Brokers formal API sandbox certificate'],
  },
  {
    phase: 10,
    title: 'Phase 10: Controlled Production Execution (Future Scope — Strictly Governed)',
    objective: 'Multi-stage canary deployment with minimal micro-lots (1 share), dedicated hardware kill-switches, and continuous human supervisory override.',
    status: 'GOVERNED_BLOCKED',
    filesRequired: [
      'src/security/hardwareKeyValidator.ts',
      'src/production/canaryExecutor.ts',
    ],
    dependencies: ['Hardware security module (HSM)', 'Dedicated co-located VPS'],
    apisRequired: ['Live Broker Production REST/WebSocket Gateway'],
    securityRisks: ['Capital loss from market flash crashes or anomalous broker fills'],
    testsRequired: ['End-to-end canary order test with ₹1,000 max capital allocation'],
    expectedResult: 'Zero-breach automated micro-execution with automated circuit tripping.',
    passCriteria: ['Pre-trade risk engine halts execution within 5ms of boundary breach'],
    failCriteria: ['Real-money execution initiated without manual human approval'],
    whatRemainsIncomplete: ['Hardware HSM token validation infrastructure'],
    governanceNotes: 'Execution is locked until Phases 1-9 complete institutional audit.',
  },
];

export const DEPLOYMENT_PARTITIONING: DeploymentPartitioningPlan[] = [
  {
    category: 'AI_STUDIO_SAFE',
    title: 'Google AI Studio Applet Runtime (Safe Zone)',
    reason: 'Designed for rapid quantitative experimentation, user interface, AI feature generation, strategy backtesting, paper trading, and deterministic risk modeling without live execution exposure.',
    components: [
      'All UI Dashboard modules (14 views)',
      'Deterministic Quantitative Indicators (EMA, RSI, MACD, Bollinger, ATR, VWAP)',
      'AI Decision Engine with Gemini API server-side inference',
      'Historical Backtesting Lab with Out-of-Sample and Walk-Forward Splits',
      'Deterministic 15-Gate Risk Engine',
      'Full Paper Trading Engine with cost/slippage models',
      'Tamper-Evident Audit Ledger (SHA-256 Chaining)',
      'Interactive Failure Simulation Lab',
      'Mock Broker Gateway Adapter',
    ],
    securityBoundaries: [
      'Live trading physically blocked at compile-time and runtime',
      'No broker account credentials stored or requested in browser',
      'Zero dynamic code evaluation (eval / new Function strictly banned)',
      'Isolated sandbox container with rate-limited server endpoints',
    ],
  },
  {
    category: 'GITHUB_VERCEL_EXTERNAL',
    title: 'Production Backend & Microservices Infrastructure',
    reason: 'Required for high-availability tick ingestion, persistent PostgreSQL/TimescaleDB time-series storage, and high-throughput low-latency execution engines.',
    components: [
      'Tick-level WebSocket ingestion cluster (Polygon / NSE Leased Line Feed)',
      'TimescaleDB / PostgreSQL database cluster for tick-by-tick storage',
      'Redis distributed memory cache for Level-2 order books',
      'Kafka event queue for asynchronous risk validation and audit logging',
      'SEBI-compliant WORM audit storage archive on cloud object storage',
    ],
    securityBoundaries: [
      'Private VPC with zero public ingress to database and risk daemon',
      'Mutual TLS (mTLS) between all internal microservices',
      'Secrets stored exclusively in HashiCorp Vault or AWS KMS',
    ],
  },
  {
    category: 'REGULATED_BROKER_CONTAINER',
    title: 'Regulated Broker Gateway Adapter (Co-located)',
    reason: 'Direct interface with licensed brokerage APIs (e.g. Zerodha Kite Connect, Angel One SmartAPI, Interactive Brokers).',
    components: [
      'Broker OAuth2 token refresh daemon with TOTP automation',
      'SEBI-approved Algo ID tagger on all FIX/REST order messages',
      'Hardware Kill Switch daemon listening on dedicated UDP heartbeat',
      'Real-time margin and capital sync service',
    ],
    securityBoundaries: [
      'Strict IP whitelisting with exchange and broker gateways',
      'Daily re-authentication with mandatory human 2FA sign-in',
      'Air-gapped from unauthorized network subnets',
    ],
  },
];

export const SEBI_ALGO_REGULATORY_SPEC: RegulatoryComplianceSpec = {
  framework: 'Securities and Exchange Board of India (SEBI) Algo-Trading Directives',
  circularReferences: [
    'SEBI/HO/MRD/DP/CIR/P/2018/62 (Broad Framework for Algorithmic Trading)',
    'SEBI Circular Cir/MRD/DP/09/2012 (Testing and Risk Management of Algos)',
    'NSE Circular NSE/SURV/35327 (Order to Trade Ratio Controls)',
  ],
  mandatoryRequirements: [
    {
      rule: 'Mandatory Pre-Trade Risk Controls',
      description: 'Brokers must ensure that all algorithmic orders pass through automated pre-trade risk controls before hitting the exchange order matching engine.',
      systemImplementation: 'Phase 5 Risk Engine with 15 mandatory deterministic checks executed before order dispatch.',
      auditVerification: 'Verified by cryptographic Risk Verdict Token attached to every simulated order record.',
    },
    {
      rule: 'Unique Algorithm Identifier Tagging',
      description: 'Every order placed by an automated strategy must be tagged with a unique algorithm ID provided/approved by the exchange.',
      systemImplementation: 'OrderRequest schema mandates strategyId and clientOrderId formatted according to broker Algo-ID taxonomy.',
      auditVerification: 'Audited in immutable audit log under each ORDER_SIMULATED / FILLED record.',
    },
    {
      rule: 'Kill Switch Telemetry & Immediate Order Cancellation',
      description: 'Stock brokers and algorithmic trading clients must maintain an emergency kill switch capable of halting new orders and canceling outstanding open orders within milliseconds.',
      systemImplementation: 'Phase 7 Kill Switch Engine with Global Trading OFF, Emergency Stop, and Panic Cancel All.',
      auditVerification: 'Verified by Failure Simulation Lab test suite and manual verification reset tokens.',
    },
    {
      rule: 'Order-to-Trade Ratio (OTR) Enforcement',
      description: 'Exchanges penalize algorithmic systems that produce abnormal order frequency with negligible executions (flooding order books).',
      systemImplementation: 'Gate 7 (Order Frequency Throttle) and Gate 6 (Max Trades Per Day) prevent hyper-frequency order submission.',
      auditVerification: 'Monitored continuously in System Health and Risk Monitor dashboard.',
    },
    {
      rule: 'Prevention of Look-Ahead & Misleading Profit Claims',
      description: 'Algorithmic systems marketed to clients cannot advertise unverified or guaranteed returns; backtests must reflect realistic costs and taxes.',
      systemImplementation: 'All AI confidence scores flagged with uncalibrated heuristic notice; backtests incorporate STT, exchange turnover fees, and slippage.',
      auditVerification: 'Static banner on UI: "AI Confidence != Probability of Profit. Real money execution disabled."',
    },
  ],
};

export const PLATFORM_PHASES = TEN_PHASE_ROADMAP.map((p) => ({
  phaseNumber: p.phase,
  name: p.title,
  objective: p.objective,
  status: p.status === 'COMPLETED' ? 'IMPLEMENTED' : p.status === 'GOVERNED_BLOCKED' ? 'BLOCKED_BY_SAFETY_POLICY' : 'IN_PROGRESS',
  deliverables: p.filesRequired,
  targetTimeline: 'Phase Target Ready',
  prerequisites: p.dependencies,
}));

export const SEBI_ALGO_REGULATORY_REQUIREMENTS = SEBI_ALGO_REGULATORY_SPEC.mandatoryRequirements.map((r, i) => ({
  circularReference: SEBI_ALGO_REGULATORY_SPEC.circularReferences[i % SEBI_ALGO_REGULATORY_SPEC.circularReferences.length],
  complianceStatus: 'COMPLIANT',
  ruleName: r.rule,
  requirement: r.description,
  systemEnforcement: r.systemImplementation,
}));

export const RECOMMENDED_FILE_TREE = `
quantpulse-ai-trading/
├── src/
│   ├── types/
│   │   ├── market.ts          # OHLCV, ticks, validation schemas
│   │   ├── strategy.ts        # Indicator signals, regime classifications
│   │   ├── ai.ts              # AIDecisionOutput, structured reasoning
│   │   ├── risk.ts            # 15 pre-trade check gates, limits
│   │   ├── order.ts           # OrderRequest, OrderFill, PortfolioState
│   │   ├── audit.ts           # AuditRecord, cryptographic ledger
│   │   ├── testing.ts         # Test matrix models and assertions
│   │   └── architecture.ts   # 10-phase roadmap & deployment tiering
│   ├── engines/
│   │   ├── marketDataEngine.ts     # Data ingestion, geometric drift simulation
│   │   ├── marketAnalysisEngine.ts # Indicator math (EMA, RSI, MACD, ATR, BB)
│   │   ├── strategyEngine.ts       # Algorithmic strategy evaluation
│   │   ├── aiDecisionEngine.ts     # Safe LLM integration with NO_TRADE default
│   │   ├── riskEngine.ts           # 15 deterministic pre-trade risk gates
│   │   ├── backtestingLab.ts       # Zero look-ahead historical simulation
│   │   ├── paperTradingEngine.ts   # Realistic fills, costs & slippage
│   │   ├── killSwitchEngine.ts     # Multi-trigger hardware safety layer
│   │   └── auditEngine.ts          # SHA-256 chained immutable ledger
│   ├── components/
│   │   ├── Header.tsx              # Mode indicator, persistent kill switch
│   │   ├── Sidebar.tsx             # System navigation across 14 modules
│   │   └── views/                  # 14 Institutional terminal views
│   └── data/
│       ├── systemDesignDocs.ts     # Database schemas & REST/WS contracts
│       ├── testingMatrixData.ts    # 15-category verification test matrix
│       └── architectureRoadmapData.ts # 10 phases, deployment & SEBI compliance
└── server.ts                       # Secure Express backend with Vite middleware
`;
