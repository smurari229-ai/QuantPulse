import { OrderFill, OrderRequest, PortfolioState } from '../types/order';
import { MarketDataSnapshot } from '../types/market';
import { createOrderLifecycle, OrderLifecycle, transitionOrder } from './orderStateMachine';
import { applyPaperFill } from './paperFillEngine';
import { GlobalAuditLedger } from './auditEngine';

export interface PaperExecutionOrder {
  order: OrderRequest;
  lifecycle: OrderLifecycle;
  brokerOrderId?: string;
  filledQuantity: number;
  remainingQuantity: number;
  fills: OrderFill[];
}

export interface PaperExecutionEventResult {
  success: boolean;
  order?: PaperExecutionOrder;
  portfolio?: PortfolioState;
  reason?: string;
}

export interface ReconciliationOrderSnapshot {
  orderId: string;
  clientOrderId: string;
  brokerOrderId?: string;
  state: string;
  quantity: number;
  filledQuantity: number;
  averageFillPrice?: number;
}

export interface ReconciliationPositionSnapshot {
  symbol: string;
  quantity: number;
  averageEntryPrice: number;
}

export interface PaperReconciliationSnapshot {
  orders: ReconciliationOrderSnapshot[];
  positions: ReconciliationPositionSnapshot[];
  cash: number;
}

export interface ReconciliationMismatch {
  category: 'ORDER' | 'POSITION' | 'CASH';
  key: string;
  localValue: unknown;
  externalValue: unknown;
  reason: string;
}

export interface ReconciliationResult {
  isReconciled: boolean;
  mismatches: ReconciliationMismatch[];
}

function averageFillPrice(fills: OrderFill[]): number | undefined {
  const quantity = fills.reduce((sum, fill) => sum + fill.quantity, 0);
  if (quantity <= 0) return undefined;
  return fills.reduce((sum, fill) => sum + fill.price * fill.quantity, 0) / quantity;
}

/**
 * Stateful paper-execution boundary. It makes client/broker/fill identifiers
 * idempotent and routes every fill through the shared portfolio accounting path.
 */
export class PaperExecutionLedger {
  private readonly orders = new Map<string, PaperExecutionOrder>();
  private readonly clientOrderIds = new Map<string, string>();
  private readonly brokerOrderIds = new Map<string, string>();
  private readonly fillIds = new Set<string>();
  private readonly processedEventIds = new Set<string>();
  private reservedCash = 0;

  public submitOrder(order: OrderRequest, eventId: string, timestamp = Date.now()): PaperExecutionEventResult {
    if (!eventId.trim()) return { success: false, reason: 'Event ID is required.' };
    if (this.processedEventIds.has(eventId)) return { success: false, reason: 'Duplicate execution event rejected.' };
    if (this.orders.has(order.id)) return { success: false, reason: 'Duplicate order ID rejected.' };
    if (this.clientOrderIds.has(order.clientOrderId)) return { success: false, reason: 'Duplicate client order ID rejected.' };
    if (!Number.isFinite(timestamp) || timestamp <= 0) return { success: false, reason: 'Order timestamp must be positive and finite.' };

    let lifecycle = createOrderLifecycle(order.id);
    const first = transitionOrder(lifecycle, 'VALIDATED', `${eventId}:VALIDATED`, timestamp);
    if (!first.success) return { success: false, reason: first.reason };
    const second = transitionOrder(first.lifecycle, 'SUBMITTED', `${eventId}:SUBMITTED`, timestamp);
    if (!second.success) return { success: false, reason: second.reason };
    const third = transitionOrder(second.lifecycle, 'ACKNOWLEDGED', `${eventId}:ACKNOWLEDGED`, timestamp);
    if (!third.success) return { success: false, reason: third.reason };

    const execution: PaperExecutionOrder = {
      order,
      lifecycle: third.lifecycle,
      filledQuantity: 0,
      remainingQuantity: order.quantity,
      fills: [],
    };
    this.orders.set(order.id, execution);
    this.clientOrderIds.set(order.clientOrderId, order.id);
    if (order.side === 'BUY') {
      const reservationPrice = order.estimatedPrice ?? order.limitPrice;
      if (Number.isFinite(reservationPrice) && reservationPrice! > 0) {
        this.reservedCash += reservationPrice! * order.quantity;
      }
    }
    this.processedEventIds.add(eventId);
    GlobalAuditLedger.appendRecord('ORDER_SUBMITTED', 'PAPER_BROKER', { orderId: order.id, clientOrderId: order.clientOrderId, quantity: order.quantity, eventId });
    return { success: true, order: execution };
  }

  public recordFill(
    orderId: string,
    fill: OrderFill,
    portfolio: PortfolioState,
    marketSnapshot: MarketDataSnapshot,
    eventId: string,
    timestamp = Date.now(),
  ): PaperExecutionEventResult {
    if (!eventId.trim()) return { success: false, reason: 'Event ID is required.' };
    if (this.processedEventIds.has(eventId)) return { success: false, reason: 'Duplicate execution event rejected.' };
    if (this.fillIds.has(fill.fillId)) return { success: false, reason: 'Duplicate fill ID rejected.' };

    const execution = this.orders.get(orderId);
    if (!execution) return { success: false, reason: 'Unknown order rejected.' };
    if (execution.lifecycle.state === 'CANCELLED' || execution.lifecycle.state === 'REJECTED' || execution.lifecycle.state === 'FAILED' || execution.lifecycle.state === 'TIMEOUT' || execution.lifecycle.state === 'FILLED') {
      return { success: false, reason: `Fill rejected for terminal order state ${execution.lifecycle.state}.` };
    }
    if (fill.brokerOrderId && this.brokerOrderIds.has(fill.brokerOrderId) && this.brokerOrderIds.get(fill.brokerOrderId) !== orderId) {
      return { success: false, reason: 'Broker order ID is already bound to a different order.' };
    }
    if (!Number.isFinite(fill.quantity) || fill.quantity <= 0 || fill.quantity > execution.remainingQuantity) {
      return { success: false, reason: 'Fill quantity exceeds the remaining order quantity or is invalid.' };
    }

    let lifecycle = execution.lifecycle;
    const target = execution.filledQuantity + fill.quantity >= execution.order.quantity ? 'FILLED' : 'PARTIALLY_FILLED';
    const transition = transitionOrder(lifecycle, target, eventId, timestamp);
    if (!transition.success) return { success: false, reason: transition.reason };

    let updatedPortfolio: PortfolioState;
    try {
      updatedPortfolio = applyPaperFill(execution.order, portfolio, marketSnapshot, fill).updatedPortfolio;
    } catch (error) {
      return { success: false, reason: String(error) };
    }

    lifecycle = transition.lifecycle;
    execution.lifecycle = lifecycle;
    execution.filledQuantity += fill.quantity;
    execution.remainingQuantity -= fill.quantity;
    if (execution.order.side === 'BUY') {
      const reservationPrice = execution.order.estimatedPrice ?? execution.order.limitPrice;
      if (Number.isFinite(reservationPrice) && reservationPrice! > 0) {
        this.reservedCash = Math.max(0, this.reservedCash - reservationPrice! * fill.quantity);
      }
    }
    execution.remainingQuantity = Math.max(0, Math.round(execution.remainingQuantity * 1e10) / 1e10);
    execution.fills.push(fill);
    execution.brokerOrderId ||= fill.brokerOrderId;
    this.fillIds.add(fill.fillId);
    if (fill.brokerOrderId) this.brokerOrderIds.set(fill.brokerOrderId, orderId);
    this.processedEventIds.add(eventId);
    GlobalAuditLedger.appendRecord(target === 'FILLED' ? 'ORDER_FILLED' : 'ORDER_PARTIALLY_FILLED', 'PAPER_BROKER', {
      orderId, clientOrderId: execution.order.clientOrderId, fillId: fill.fillId, brokerOrderId: fill.brokerOrderId,
      fillQuantity: fill.quantity, filledQuantity: execution.filledQuantity, remainingQuantity: execution.remainingQuantity, eventId,
    });
    return { success: true, order: execution, portfolio: updatedPortfolio };
  }

  public cancelOrder(orderId: string, eventId: string, timestamp = Date.now()): PaperExecutionEventResult {
    if (!eventId.trim()) return { success: false, reason: 'Event ID is required.' };
    if (this.processedEventIds.has(eventId)) return { success: false, reason: 'Duplicate execution event rejected.' };

    const execution = this.orders.get(orderId);
    if (!execution) return { success: false, reason: 'Unknown order rejected.' };
    if (execution.lifecycle.state === 'FILLED' || execution.lifecycle.state === 'CANCELLED' || execution.lifecycle.state === 'REJECTED' || execution.lifecycle.state === 'FAILED' || execution.lifecycle.state === 'TIMEOUT') {
      return { success: false, reason: `Cancellation rejected for terminal order state ${execution.lifecycle.state}.` };
    }

    const requested = transitionOrder(execution.lifecycle, 'CANCEL_REQUESTED', `${eventId}:REQUESTED`, timestamp);
    if (!requested.success) return { success: false, reason: requested.reason };
    const cancelled = transitionOrder(requested.lifecycle, 'CANCELLED', `${eventId}:CANCELLED`, timestamp);
    if (!cancelled.success) return { success: false, reason: cancelled.reason };

    execution.lifecycle = cancelled.lifecycle;
    if (execution.order.side === 'BUY') {
      const reservationPrice = execution.order.estimatedPrice ?? execution.order.limitPrice;
      if (Number.isFinite(reservationPrice) && reservationPrice! > 0) {
        this.reservedCash = Math.max(0, this.reservedCash - reservationPrice! * execution.remainingQuantity);
      }
    }
    execution.remainingQuantity = 0;
    this.processedEventIds.add(eventId);
    GlobalAuditLedger.appendRecord('ORDER_CANCELLED', 'PAPER_BROKER', { orderId, clientOrderId: execution.order.clientOrderId, filledQuantity: execution.filledQuantity, eventId });
    return { success: true, order: execution };
  }

  public getReservedCash(): number {
    return Math.round(this.reservedCash * 100) / 100;
  }

  public getOrder(orderId: string): PaperExecutionOrder | undefined {
    const execution = this.orders.get(orderId);
    return execution ? { ...execution, fills: [...execution.fills] } : undefined;
  }

  public reconcile(external: PaperReconciliationSnapshot, portfolio: PortfolioState): ReconciliationResult {
    const mismatches: ReconciliationMismatch[] = [];

    const externalOrders = new Map(external.orders.map((order) => [order.orderId, order]));
    for (const local of this.orders.values()) {
      const remote = externalOrders.get(local.order.id);
      if (!remote) {
        mismatches.push({ category: 'ORDER', key: local.order.id, localValue: local.lifecycle.state, externalValue: 'MISSING', reason: 'Local order is missing from external execution state.' });
        continue;
      }
      const localAverage = averageFillPrice(local.fills);
      const checks: Array<[string, unknown, unknown, string]> = [
        ['state', local.lifecycle.state, remote.state, 'Order lifecycle state mismatch.'],
        ['quantity', local.order.quantity, remote.quantity, 'Order quantity mismatch.'],
        ['filledQuantity', local.filledQuantity, remote.filledQuantity, 'Filled quantity mismatch.'],
        ['brokerOrderId', local.brokerOrderId, remote.brokerOrderId, 'Broker order ID mismatch.'],
        ['averageFillPrice', localAverage, remote.averageFillPrice, 'Average fill price mismatch.'],
      ];
      for (const [key, localValue, externalValue, reason] of checks) {
        if (JSON.stringify(localValue) !== JSON.stringify(externalValue)) {
          mismatches.push({ category: 'ORDER', key: `${local.order.id}:${key}`, localValue, externalValue, reason });
        }
      }
    }
    for (const remote of external.orders) {
      if (!this.orders.has(remote.orderId)) {
        mismatches.push({ category: 'ORDER', key: remote.orderId, localValue: 'MISSING', externalValue: remote, reason: 'External order is unknown to local execution state.' });
      }
    }

    const localPositions = new Map(portfolio.positions.map((position) => [position.symbol, position]));
    const externalPositions = new Map(external.positions.map((position) => [position.symbol, position]));
    for (const [symbol, local] of localPositions) {
      const remote = externalPositions.get(symbol);
      if (!remote || Math.abs(local.quantity - remote.quantity) > 1e-10 || Math.abs(local.averageEntryPrice - remote.averageEntryPrice) > 1e-8) {
        mismatches.push({ category: 'POSITION', key: symbol, localValue: { quantity: local.quantity, averageEntryPrice: local.averageEntryPrice }, externalValue: remote ?? 'MISSING', reason: 'Position quantity or average price mismatch.' });
      }
    }
    for (const remote of external.positions) {
      if (!localPositions.has(remote.symbol)) {
        mismatches.push({ category: 'POSITION', key: remote.symbol, localValue: 'MISSING', externalValue: remote, reason: 'External position is unknown to local state.' });
      }
    }

    if (!Number.isFinite(external.cash) || Math.abs(portfolio.cash - external.cash) > 0.01) {
      mismatches.push({ category: 'CASH', key: 'cash', localValue: portfolio.cash, externalValue: external.cash, reason: 'Cash balance mismatch.' });
    }

    return { isReconciled: mismatches.length === 0, mismatches };
  }
}
