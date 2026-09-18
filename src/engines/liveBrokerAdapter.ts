import { OrderFill, OrderRequest, PortfolioState } from '../types/order';

/**
 * Live broker boundary.
 *
 * This adapter is intentionally fail-closed: no live broker SDK, credentials,
 * network call, or order submission is implemented here yet. It provides the
 * seam for future broker-specific adapters without weakening the paper path.
 */
export interface LiveBrokerHealth {
  connected: boolean;
  authenticated: boolean;
  staticIpVerified: boolean;
  sessionValid: boolean;
  liveTradingAuthorized: boolean;
  reason: string;
}

export interface LiveBrokerAdapter {
  getHealth(): Promise<LiveBrokerHealth>;
  submitOrder(order: OrderRequest): Promise<OrderFill>;
  cancelOrder(orderId: string): Promise<void>;
  reconcilePortfolio(): Promise<PortfolioState>;
}

const BLOCKED_HEALTH: LiveBrokerHealth = {
  connected: false,
  authenticated: false,
  staticIpVerified: false,
  sessionValid: false,
  liveTradingAuthorized: false,
  reason: 'Live broker adapter is not authorized or connected. Paper trading remains the only executable mode.',
};

export const BLOCKED_LIVE_BROKER_ADAPTER: LiveBrokerAdapter = {
  async getHealth() {
    return BLOCKED_HEALTH;
  },
  async submitOrder(_order: OrderRequest) {
    throw new Error('LIVE_ORDER_BLOCKED: broker adapter is not connected or authorized. No live order was submitted.');
  },
  async cancelOrder(_orderId: string) {
    throw new Error('LIVE_CANCEL_BLOCKED: broker adapter is not connected or authorized.');
  },
  async reconcilePortfolio() {
    throw new Error('LIVE_RECONCILIATION_BLOCKED: broker adapter is not connected or authorized.');
  },
};
