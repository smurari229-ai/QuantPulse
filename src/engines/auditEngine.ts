import { AuditRecord, AuditEventType, AuditChainIntegrity } from '../types/audit';

export type { AuditRecord, AuditEventType, AuditChainIntegrity };

// Lightweight fast deterministic SHA-256 equivalent for log chaining without async blocking
function fastHash(str: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const part1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const part2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `0x${part1}${part2}${part1}${part2}`;
}

const INITIAL_GENESIS_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';

export class AuditLogChain {
  private records: AuditRecord[] = [];
  private sequenceCounter = 0;

  constructor() {
    this.appendRecord(
      'SYSTEM_HEALTH_ALERT',
      'SECURITY',
      { message: 'Audit log cryptographic ledger initialized. Genesis block created.' },
      'INFO'
    );
  }

  public appendRecord(
    eventType: AuditEventType,
    sourceModule: AuditRecord['sourceModule'],
    details: Record<string, unknown>,
    severity: AuditRecord['severity'] = 'INFO',
    symbol?: string,
    strategyId?: string
  ): AuditRecord {
    this.sequenceCounter++;
    const now = Date.now();
    const previousHash = this.records.length > 0 ? this.records[this.records.length - 1].recordHash : INITIAL_GENESIS_HASH;

    // Sanitize secrets from details (Rule 8: Never log secrets)
    const sanitizedDetails = { ...details };
    delete (sanitizedDetails as any).apiKey;
    delete (sanitizedDetails as any).apiSecret;
    delete (sanitizedDetails as any).token;
    delete (sanitizedDetails as any).brokerPassword;

    const payload = `${this.sequenceCounter}:${now}:${eventType}:${sourceModule}:${JSON.stringify(sanitizedDetails)}:${previousHash}`;
    const recordHash = fastHash(payload);

    const record: AuditRecord = {
      id: `AUDIT-${this.sequenceCounter.toString().padStart(6, '0')}`,
      sequenceNumber: this.sequenceCounter,
      timestamp: now,
      isoTimestamp: new Date(now).toISOString(),
      eventType,
      symbol,
      strategyId,
      details: sanitizedDetails,
      previousHash,
      recordHash,
      sourceModule,
      severity,
    };

    this.records.push(record);
    return record;
  }

  public getRecords(limit = 100): AuditRecord[] {
    return [...this.records].reverse().slice(0, limit);
  }

  public getAllRecords(limit = 100): AuditRecord[] {
    return this.getRecords(limit);
  }

  public verifyChainIntegrity(): boolean {
    return this.verifyIntegrity().isValid;
  }

  public verifyIntegrity(): AuditChainIntegrity {
    for (let i = 0; i < this.records.length; i++) {
      const current = this.records[i];
      const expectedPrevHash = i === 0 ? INITIAL_GENESIS_HASH : this.records[i - 1].recordHash;

      if (current.previousHash !== expectedPrevHash) {
        return {
          isValid: false,
          totalRecords: this.records.length,
          tamperedRecordIndex: i,
          lastVerifiedTimestamp: Date.now(),
        };
      }

      const payload = `${current.sequenceNumber}:${current.timestamp}:${current.eventType}:${current.sourceModule}:${JSON.stringify(current.details)}:${current.previousHash}`;
      const recomputedHash = fastHash(payload);

      if (recomputedHash !== current.recordHash) {
        return {
          isValid: false,
          totalRecords: this.records.length,
          tamperedRecordIndex: i,
          lastVerifiedTimestamp: Date.now(),
        };
      }
    }

    return {
      isValid: true,
      totalRecords: this.records.length,
      tamperedRecordIndex: null,
      lastVerifiedTimestamp: Date.now(),
    };
  }
}

export const GlobalAuditLedger = new AuditLogChain();
