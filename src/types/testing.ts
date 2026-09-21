export type TestCategory =
  | 'UNIT'
  | 'STRATEGY'
  | 'BACKTEST_CORRECTNESS'
  | 'RISK_ENGINE'
  | 'DUPLICATE_ORDER'
  | 'DATA_VALIDATION'
  | 'API_FAILURE'
  | 'NETWORK_FAILURE'
  | 'STALE_DATA'
  | 'SECURITY'
  | 'AUTHENTICATION'
  | 'AUTHORIZATION'
  | 'KILL_SWITCH'
  | 'PAPER_TRADING'
  | 'BROKER_ADAPTER';

export type TestStatus = 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT_RUN';

export interface TestCaseItem {
  id: string;
  category: TestCategory;
  name: string;
  description: string;
  preConditions: string;
  executionSteps: string;
  expectedBehavior: string;
  status: TestStatus;
  lastExecutedTimestamp?: number;
  assertionMessage?: string;
  evidencePath?: string;
  blockingReason?: string;
}

export interface TestMatrixSummary {
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  notRun: number;
  passPercentage: number;
}
