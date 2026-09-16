export interface DatabaseTableSpec {
  tableName: string;
  engine: 'TimescaleDB (PostgreSQL)' | 'Relational PostgreSQL' | 'Append-Only Cryptographic Store';
  description: string;
  columns: { name: string; type: string; constraints: string; description: string }[];
  indexes: string[];
}

export interface ApiEndpointSpec {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'WS';
  path: string;
  description: string;
  authRequired: boolean;
  requestSchema?: Record<string, unknown>;
  responseSchema: Record<string, unknown>;
  errorCodes: { code: number; meaning: string }[];
}

export const DATABASE_SCHEMA_SPECS: DatabaseTableSpec[] = [
  {
    tableName: 'ticks_ohlcv',
    engine: 'TimescaleDB (PostgreSQL)',
    description: 'Hypertable partitioned by time for millisecond to 1-day bar time-series data.',
    columns: [
      { name: 'bucket_time', type: 'TIMESTAMPTZ', constraints: 'NOT NULL', description: 'Candle start timestamp' },
      { name: 'symbol', type: 'VARCHAR(20)', constraints: 'NOT NULL', description: 'Instrument identifier (e.g. NIFTY50, RELIANCE)' },
      { name: 'open', type: 'NUMERIC(14, 4)', constraints: 'NOT NULL CHECK (open > 0)', description: 'Bar open price' },
      { name: 'high', type: 'NUMERIC(14, 4)', constraints: 'NOT NULL CHECK (high >= low)', description: 'Bar high price' },
      { name: 'low', type: 'NUMERIC(14, 4)', constraints: 'NOT NULL CHECK (low > 0)', description: 'Bar low price' },
      { name: 'close', type: 'NUMERIC(14, 4)', constraints: 'NOT NULL CHECK (close > 0)', description: 'Bar close price' },
      { name: 'volume', type: 'BIGINT', constraints: 'NOT NULL DEFAULT 0', description: 'Traded volume quantity' },
      { name: 'vwap', type: 'NUMERIC(14, 4)', constraints: 'NULL', description: 'Volume-weighted average price' },
      { name: 'data_quality_flags', type: 'JSONB', constraints: 'DEFAULT \'{}\'', description: 'Validation status, latency, provider tag' },
    ],
    indexes: ['CREATE INDEX idx_ticks_symbol_time ON ticks_ohlcv (symbol, bucket_time DESC)'],
  },
  {
    tableName: 'ai_decision_records',
    engine: 'Relational PostgreSQL',
    description: 'Permanent record of every inference produced by AI models with inputs, reasoning, and risk flags.',
    columns: [
      { name: 'id', type: 'UUID', constraints: 'PRIMARY KEY DEFAULT gen_random_uuid()', description: 'Unique inference ID' },
      { name: 'symbol', type: 'VARCHAR(20)', constraints: 'NOT NULL', description: 'Target ticker symbol' },
      { name: 'signal', type: 'VARCHAR(10)', constraints: 'NOT NULL CHECK (signal IN (\'BUY\',\'SELL\',\'HOLD\',\'NO_TRADE\'))', description: 'AI trade recommendation' },
      { name: 'confidence', type: 'NUMERIC(4, 3)', constraints: 'NOT NULL CHECK (confidence BETWEEN 0 AND 1)', description: 'Uncalibrated heuristic confidence' },
      { name: 'reasoning', type: 'TEXT', constraints: 'NOT NULL', description: 'Human-readable statistical rationale' },
      { name: 'strategy', type: 'VARCHAR(50)', constraints: 'NOT NULL', description: 'Target algorithmic strategy mapping' },
      { name: 'risk_flags', type: 'TEXT[]', constraints: 'NOT NULL DEFAULT \'{}\'', description: 'Identified market or data risk factors' },
      { name: 'required_checks', type: 'TEXT[]', constraints: 'NOT NULL DEFAULT \'{}\'', description: 'Prerequisites for Risk Engine validation' },
      { name: 'model_version', type: 'VARCHAR(40)', constraints: 'NOT NULL', description: 'Versioned AI model identifier' },
      { name: 'created_at', type: 'TIMESTAMPTZ', constraints: 'DEFAULT NOW()', description: 'Inference generation timestamp' },
    ],
    indexes: ['CREATE INDEX idx_ai_symbol_time ON ai_decision_records (symbol, created_at DESC)'],
  },
  {
    tableName: 'risk_audit_verdicts',
    engine: 'Relational PostgreSQL',
    description: 'Deterministic risk engine verdicts evaluating each proposed order against the 15 gating checks.',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', constraints: 'PRIMARY KEY', description: 'Auditable cryptographic risk token' },
      { name: 'order_id_proposed', type: 'VARCHAR(64)', constraints: 'NOT NULL', description: 'Associated order ID' },
      { name: 'symbol', type: 'VARCHAR(20)', constraints: 'NOT NULL', description: 'Instrument symbol' },
      { name: 'is_approved', type: 'BOOLEAN', constraints: 'NOT NULL', description: 'True if all 15 gates passed' },
      { name: 'passed_checks_count', type: 'INT', constraints: 'NOT NULL', description: 'Number of passed risk checks' },
      { name: 'failed_checks_count', type: 'INT', constraints: 'NOT NULL', description: 'Number of failed risk checks' },
      { name: 'checks_snapshot', type: 'JSONB', constraints: 'NOT NULL', description: 'Full breakdown of values vs thresholds' },
      { name: 'rejection_reasons', type: 'TEXT[]', constraints: 'DEFAULT \'{}\'', description: 'Array of reasons if rejected' },
      { name: 'evaluated_at', type: 'TIMESTAMPTZ', constraints: 'DEFAULT NOW()', description: 'Evaluation timestamp' },
    ],
    indexes: ['CREATE INDEX idx_risk_verdicts_order ON risk_audit_verdicts (order_id_proposed)'],
  },
  {
    tableName: 'orders',
    engine: 'Relational PostgreSQL',
    description: 'Lifecycle of all simulated and paper orders with risk token linkage.',
    columns: [
      { name: 'id', type: 'VARCHAR(64)', constraints: 'PRIMARY KEY', description: 'Internal platform order ID' },
      { name: 'client_order_id', type: 'VARCHAR(64)', constraints: 'UNIQUE NOT NULL', description: 'Unique idempotent client token' },
      { name: 'symbol', type: 'VARCHAR(20)', constraints: 'NOT NULL', description: 'Instrument identifier' },
      { name: 'side', type: 'VARCHAR(10)', constraints: 'NOT NULL CHECK (side IN (\'BUY\', \'SELL\'))', description: 'Order direction' },
      { name: 'quantity', type: 'NUMERIC(14, 4)', constraints: 'NOT NULL CHECK (quantity > 0)', description: 'Order size' },
      { name: 'stop_loss_price', type: 'NUMERIC(14, 4)', constraints: 'NOT NULL', description: 'Mandatory pre-defined stop loss' },
      { name: 'take_profit_price', type: 'NUMERIC(14, 4)', constraints: 'NOT NULL', description: 'Mandatory take profit' },
      { name: 'execution_mode', type: 'VARCHAR(20)', constraints: 'NOT NULL CHECK (execution_mode IN (\'PAPER\', \'LIVE_BLOCKED\'))', description: 'Execution safety mode' },
      { name: 'status', type: 'VARCHAR(30)', constraints: 'NOT NULL', description: 'Order lifecycle state' },
      { name: 'risk_token', type: 'VARCHAR(64)', constraints: 'REFERENCES risk_audit_verdicts(id)', description: 'FK to Risk Verdict Token' },
      { name: 'created_at', type: 'TIMESTAMPTZ', constraints: 'DEFAULT NOW()', description: 'Order creation timestamp' },
    ],
    indexes: ['CREATE INDEX idx_orders_symbol_time ON orders (symbol, created_at DESC)'],
  },
  {
    tableName: 'audit_ledger_immutable',
    engine: 'Append-Only Cryptographic Store',
    description: 'Cryptographically hashed immutable ledger ensuring tamper-resistance across all platform events.',
    columns: [
      { name: 'sequence_number', type: 'BIGSERIAL', constraints: 'PRIMARY KEY', description: 'Strict monotonic sequence counter' },
      { name: 'timestamp', type: 'BIGINT', constraints: 'NOT NULL', description: 'Epoch millisecond timestamp' },
      { name: 'event_type', type: 'VARCHAR(40)', constraints: 'NOT NULL', description: 'Standardized audit event type' },
      { name: 'source_module', type: 'VARCHAR(30)', constraints: 'NOT NULL', description: 'Subsystem that generated event' },
      { name: 'details_sanitized', type: 'JSONB', constraints: 'NOT NULL', description: 'Event payload stripped of all secrets' },
      { name: 'previous_hash', type: 'VARCHAR(66)', constraints: 'NOT NULL', description: 'Hash of prior block' },
      { name: 'record_hash', type: 'VARCHAR(66)', constraints: 'NOT NULL', description: 'SHA-256 hash of payload + previous_hash' },
    ],
    indexes: ['CREATE INDEX idx_audit_seq ON audit_ledger_immutable (sequence_number DESC)'],
  },
];

export const API_CONTRACTS: ApiEndpointSpec[] = [
  {
    method: 'GET',
    path: '/api/v1/market/ohlcv',
    description: 'Fetch verified historical OHLCV bars with validation metadata.',
    authRequired: true,
    requestSchema: {
      symbol: 'string (e.g. NIFTY50)',
      daysCount: 'integer (e.g. 120)',
    },
    responseSchema: {
      symbol: 'string',
      bars: 'OHLCV[]',
      validation: 'MarketValidationResult',
    },
    errorCodes: [
      { code: 400, meaning: 'Invalid symbol or date range parameter' },
      { code: 422, meaning: 'Market data corrupted (negative prices detected)' },
    ],
  },
  {
    method: 'POST',
    path: '/api/v1/ai/decision',
    description: 'Request structured AI analysis on verified market features without dynamic execution.',
    authRequired: true,
    requestSchema: {
      symbol: 'string',
      indicators: 'TechnicalIndicators',
      currentMarketConditions: 'MarketConditionPayload',
    },
    responseSchema: {
      signal: "'BUY' | 'SELL' | 'HOLD' | 'NO_TRADE'",
      confidence: 'number (0.00-1.00)',
      confidenceCalibrationNote: 'string',
      reasoning: 'string',
      strategy: 'string',
      risk_flags: 'string[]',
      required_checks: 'string[]',
    },
    errorCodes: [
      { code: 429, meaning: 'Rate limit exceeded on AI inference endpoint' },
      { code: 503, meaning: 'AI service unavailable; safe fallback returned NO_TRADE' },
    ],
  },
  {
    method: 'POST',
    path: '/api/v1/risk/validate',
    description: 'Execute 15 deterministic pre-trade risk checks against proposed order. Intercepts before execution.',
    authRequired: true,
    requestSchema: {
      order: 'OrderRequest',
      portfolio: 'PortfolioState',
      marketSnapshot: 'MarketDataSnapshot',
    },
    responseSchema: {
      isApproved: 'boolean',
      auditableRiskToken: 'string',
      checks: 'IndividualRiskCheckResult[]',
      rejectionReasons: 'string[]',
    },
    errorCodes: [
      { code: 403, meaning: 'Risk Engine rejected order: 1 or more gates failed' },
      { code: 423, meaning: 'Emergency Kill Switch is currently active' },
    ],
  },
  {
    method: 'POST',
    path: '/api/v1/orders/simulate',
    description: 'Simulate paper execution with slippage, brokerage, and exchange transaction fees.',
    authRequired: true,
    requestSchema: {
      order: 'OrderRequest (executionMode must be PAPER)',
      riskToken: 'string (Must match valid approval verdict)',
    },
    responseSchema: {
      status: "'FILLED' | 'REJECTED'",
      fill: 'OrderFill',
      updatedPortfolio: 'PortfolioState',
    },
    errorCodes: [
      { code: 400, meaning: 'Missing valid Risk Verdict Token' },
      { code: 403, meaning: 'Live execution blocked by platform safety governance' },
    ],
  },
  {
    method: 'POST',
    path: '/api/v1/kill-switch/trigger',
    description: 'Emergency stop: instantaneously freezes all automated trading and rejects all orders.',
    authRequired: true,
    requestSchema: {
      reason: 'string',
    },
    responseSchema: {
      isEmergencyStopTripped: true,
      resetConfirmationCode: 'string (Generated dual-auth code)',
      trippedAt: 'number',
    },
    errorCodes: [
      { code: 500, meaning: 'Fatal kill switch hardware failure' },
    ],
  },
];
