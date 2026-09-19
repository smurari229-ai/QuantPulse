export interface KillSwitchState {
  isGlobalTradingOff: boolean;
  isPaperOnlyLocked: boolean; // Always true in Phase 1-8
  isEmergencyStopTripped: boolean;
  isDailyLossLockTripped: boolean;
  isApiFailureLockTripped: boolean;
  isDataStaleLockTripped: boolean;
  isAbnormalFrequencyLockTripped: boolean;
  lastTrippedTimestamp?: number;
  lastTrippedReason?: string;
  requiresManualReset: boolean;
  resetConfirmationCode: string;
}

export const INITIAL_KILL_SWITCH_STATE: KillSwitchState = {
  isGlobalTradingOff: false,
  isPaperOnlyLocked: true, // REAL TRADING DISABLED BY DEFAULT
  isEmergencyStopTripped: false,
  isDailyLossLockTripped: false,
  isApiFailureLockTripped: false,
  isDataStaleLockTripped: false,
  isAbnormalFrequencyLockTripped: false,
  requiresManualReset: false,
  resetConfirmationCode: '',
};

function generateSecureConfirmationCode(): string {
  const values = new Uint32Array(1);
  globalThis.crypto.getRandomValues(values);
  return (values[0] % 1_000_000).toString().padStart(6, '0');
}

export function canSubmitOrders(state: KillSwitchState): { allowed: boolean; reason?: string } {
  if (state.isPaperOnlyLocked) return { allowed: false, reason: 'PAPER_ONLY_LOCK_ACTIVE' };
  if (state.isGlobalTradingOff) return { allowed: false, reason: 'GLOBAL_TRADING_OFF_SWITCH_ENGAGED' };
  if (state.isEmergencyStopTripped) return { allowed: false, reason: 'EMERGENCY_STOP_CIRCUIT_BREAKER_ACTIVE' };
  if (state.isDailyLossLockTripped) return { allowed: false, reason: 'DAILY_LOSS_LIMIT_LOCK_ACTIVE' };
  if (state.isApiFailureLockTripped) return { allowed: false, reason: 'BROKER_API_FAILURE_LOCK_ACTIVE' };
  if (state.isDataStaleLockTripped) return { allowed: false, reason: 'STALE_MARKET_DATA_LOCK_ACTIVE' };
  if (state.isAbnormalFrequencyLockTripped) return { allowed: false, reason: 'ABNORMAL_ORDER_FREQUENCY_LOCK_ACTIVE' };
  return { allowed: true };
}

export const getKillSwitchState = (): KillSwitchState => ({ ...INITIAL_KILL_SWITCH_STATE });

export function triggerEmergencyKillSwitch(
  stateOrReason: KillSwitchState | string,
  maybeReason?: any
): KillSwitchState {
  let currentState: KillSwitchState = INITIAL_KILL_SWITCH_STATE;
  let reason = 'Manual Emergency Kill Switch Triggered';

  if (typeof stateOrReason === 'string') reason = stateOrReason;
  else {
    currentState = stateOrReason;
    if (typeof maybeReason === 'string') reason = maybeReason;
  }

  return {
    ...currentState,
    isEmergencyStopTripped: true,
    lastTrippedTimestamp: Date.now(),
    lastTrippedReason: reason,
    requiresManualReset: true,
    resetConfirmationCode: generateSecureConfirmationCode(),
  };
}

export function resetKillSwitch(
  currentStateOrCode: KillSwitchState | string,
  maybeCode?: string
): { success: boolean; state?: KillSwitchState; updatedState?: KillSwitchState; error?: string } {
  let state = INITIAL_KILL_SWITCH_STATE;
  let code = '';
  if (typeof currentStateOrCode === 'string') code = currentStateOrCode;
  else { state = currentStateOrCode; code = maybeCode || ''; }
  const res = resetKillSwitchWithVerification(state, code);
  return { success: res.success, state: res.updatedState, updatedState: res.updatedState, error: res.error };
}

export function resetKillSwitchWithVerification(
  currentState: KillSwitchState,
  enteredCode: string
): { success: boolean; updatedState: KillSwitchState; error?: string } {
  const hasActiveOperationalLock = currentState.isGlobalTradingOff
    || currentState.isEmergencyStopTripped
    || currentState.isDailyLossLockTripped
    || currentState.isApiFailureLockTripped
    || currentState.isDataStaleLockTripped
    || currentState.isAbnormalFrequencyLockTripped;

  // Any active operational lock requires the out-of-band authorization code.
  // Do not trust requiresManualReset alone because a malformed/stale state could
  // otherwise clear a safety lock without authorization.
  if (!currentState.requiresManualReset && !hasActiveOperationalLock) {
    return {
      success: true,
      updatedState: {
        ...currentState,
        isEmergencyStopTripped: false,
        isDailyLossLockTripped: false,
        isApiFailureLockTripped: false,
        isDataStaleLockTripped: false,
        isAbnormalFrequencyLockTripped: false,
        isGlobalTradingOff: false,
        lastTrippedReason: undefined,
      },
    };
  }

  if (enteredCode.trim().toUpperCase() !== currentState.resetConfirmationCode) {
    return { success: false, updatedState: currentState, error: 'Invalid authorization code. Kill switch remains engaged.' };
  }

  return {
    success: true,
    updatedState: {
      ...currentState,
      isEmergencyStopTripped: false,
      isDailyLossLockTripped: false,
      isApiFailureLockTripped: false,
      isDataStaleLockTripped: false,
      isAbnormalFrequencyLockTripped: false,
      isGlobalTradingOff: false,
      requiresManualReset: false,
      resetConfirmationCode: '',
      lastTrippedReason: undefined,
    },
  };
}
