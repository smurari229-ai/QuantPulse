export type AuditEventType =
  | 'MARKET_DATA_INGESTED'
  | 'DATA_VALIDATION_ERROR'
  | 'AI_INFERENCE_INVOKED'
  | 'STRATEGY_SIGNAL_GENERATED'
  | 'RISK_GATE_PASSED'
  | 'RISK_GATE_REJECTED'
  | 'ORDER_SIMULATED'
  | 'ORDER_FILLED'
  | 'POSITION_CLOSED'
  | 'KILL_SWITCH_TRIGGERED'
  | 'KILL_SWITCH_RESET'
  | 'FAILURE_SIMULATION_ACTIVATED'
  | 'SYSTEM_HEALTH_ALERT';

export interface AuditRecord {
  id: string;
  sequenceNumber: number;
  timestamp: number;
  isoTimestamp: string;
  eventType: AuditEventType;
  symbol?: string;
  strategyId?: string;
  details: Record<string, unknown>;
  previousHash: string;
  recordHash: string; // Deterministic in-memory tamper-evident hash; not SHA-256.
  sourceModule: 'MARKET_DATA' | 'AI_ENGINE' | 'STRATEGY' | 'RISK_ENGINE' | 'PAPER_BROKER' | 'KILL_SWITCH' | 'SECURITY';
  severity: 'INFO' | 'NOTICE' | 'WARNING' | 'CRITICAL';
}

export interface AuditChainIntegrity {
  isValid: boolean;
  totalRecords: number;
  tamperedRecordIndex: number | null;
  lastVerifiedTimestamp: number;
}
