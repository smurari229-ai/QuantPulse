export const ORDER_LIFECYCLE_STATES = [
  'CREATED',
  'VALIDATED',
  'SUBMITTED',
  'ACKNOWLEDGED',
  'PARTIALLY_FILLED',
  'FILLED',
  'CANCEL_REQUESTED',
  'CANCELLED',
  'REJECTED',
  'FAILED',
  'TIMEOUT',
] as const;

export type OrderLifecycleState = typeof ORDER_LIFECYCLE_STATES[number];

const ALLOWED_TRANSITIONS: Record<OrderLifecycleState, readonly OrderLifecycleState[]> = {
  CREATED: ['VALIDATED', 'REJECTED', 'FAILED'],
  VALIDATED: ['SUBMITTED', 'REJECTED', 'FAILED'],
  SUBMITTED: ['ACKNOWLEDGED', 'REJECTED', 'FAILED', 'TIMEOUT'],
  ACKNOWLEDGED: ['PARTIALLY_FILLED', 'FILLED', 'CANCEL_REQUESTED', 'REJECTED', 'FAILED', 'TIMEOUT'],
  PARTIALLY_FILLED: ['PARTIALLY_FILLED', 'FILLED', 'CANCEL_REQUESTED', 'FAILED', 'TIMEOUT'],
  FILLED: [],
  CANCEL_REQUESTED: ['CANCELLED', 'FILLED', 'PARTIALLY_FILLED', 'FAILED', 'TIMEOUT'],
  CANCELLED: [],
  REJECTED: [],
  FAILED: [],
  TIMEOUT: [],
};

export interface OrderLifecycleEvent {
  orderId: string;
  from: OrderLifecycleState;
  to: OrderLifecycleState;
  eventId: string;
  timestamp: number;
}

export interface OrderLifecycle {
  orderId: string;
  state: OrderLifecycleState;
  processedEventIds: string[];
  events: OrderLifecycleEvent[];
}

export function createOrderLifecycle(orderId: string): OrderLifecycle {
  if (typeof orderId !== 'string' || orderId.trim().length === 0) {
    throw new Error('Order ID is required.');
  }
  return { orderId, state: 'CREATED', processedEventIds: [], events: [] };
}

export function transitionOrder(
  lifecycle: OrderLifecycle,
  to: OrderLifecycleState,
  eventId: string,
  timestamp = Date.now(),
): { success: boolean; lifecycle: OrderLifecycle; reason?: string } {
  if (!eventId.trim()) return { success: false, lifecycle, reason: 'Event ID is required.' };
  if (!Number.isFinite(timestamp) || timestamp <= 0) return { success: false, lifecycle, reason: 'Transition timestamp must be a positive finite number.' };

  if (lifecycle.processedEventIds.includes(eventId)) {
    return { success: false, lifecycle, reason: 'Duplicate lifecycle event rejected.' };
  }

  if (!ORDER_LIFECYCLE_STATES.includes(to)) {
    return { success: false, lifecycle, reason: 'Unknown lifecycle state rejected.' };
  }

  if (!ALLOWED_TRANSITIONS[lifecycle.state].includes(to)) {
    return { success: false, lifecycle, reason: `Invalid order transition: ${lifecycle.state} -> ${to}.` };
  }

  const event: OrderLifecycleEvent = {
    orderId: lifecycle.orderId,
    from: lifecycle.state,
    to,
    eventId,
    timestamp,
  };

  return {
    success: true,
    lifecycle: {
      ...lifecycle,
      state: to,
      processedEventIds: [...lifecycle.processedEventIds, eventId],
      events: [...lifecycle.events, event],
    },
  };
}
