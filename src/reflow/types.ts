// ─── Core document wrapper ───────────────────────────────────────────────────

export interface Document<T> {
  docId: string;
  docType: string;
  data: T;
}

// ─── Settlement Channel ───────────────────────────────────────────────────────

export interface OperatingHours {
  dayOfWeek: number; // 0 = Sunday, 1 = Monday … 6 = Saturday
  startHour: number; // inclusive
  endHour: number;   // exclusive
}

export interface BlackoutWindow {
  startDate: string;
  endDate: string;
  reason?: string;
}

export interface SettlementChannelData {
  name: string;
  operatingHours: OperatingHours[];
  blackoutWindows: BlackoutWindow[];
}

export interface SettlementChannel extends Document<SettlementChannelData> {
  docType: 'settlementChannel';
}

// ─── Settlement Task ──────────────────────────────────────────────────────────

// @upgrade: consider making TaskType extensible (string union + branded type)
// to support custom task types without modifying this file.
export type TaskType =
  | 'marginCheck'
  | 'fundTransfer'
  | 'disbursement'
  | 'complianceScreen'
  | 'reconciliation'
  | 'regulatoryHold';

export interface SettlementTaskData {
  taskReference: string;
  tradeOrderId: string;
  settlementChannelId: string;
  startDate: string;
  endDate: string;
  durationMinutes: number;
  isRegulatoryHold: boolean;
  dependsOnTaskIds: string[];
  taskType: TaskType;
  prepTimeMinutes?: number;
}

export interface SettlementTask extends Document<SettlementTaskData> {
  docType: 'settlementTask';
}

// ─── Trade Order ──────────────────────────────────────────────────────────────

export interface TradeOrderData {
  tradeOrderNumber: string;
  instrumentId: string;
  quantity: number;
  settlementDate: string;
}

export interface TradeOrder extends Document<TradeOrderData> {
  docType: 'tradeOrder';
}

// ─── Reflow I/O ───────────────────────────────────────────────────────────────

export interface ReflowInput {
  settlementTasks: SettlementTask[];
  settlementChannels: SettlementChannel[];
  tradeOrders: TradeOrder[];
}

export interface TaskChange {
  taskId: string;
  taskReference: string;
  originalStartDate: string;
  originalEndDate: string;
  newStartDate: string;
  newEndDate: string;
  delayMinutes: number;
  reason: string;
}

export interface SLABreach {
  taskId: string;
  taskReference: string;
  tradeOrderId: string;
  targetSettlementDate: string;
  actualEndDate: string;
  breachMinutes: number;
}

export interface ChannelUtilization {
  channelId: string;
  channelName: string;
  totalProcessingMinutes: number;
  utilizationPercent: number;
}

export interface OptimizationMetrics {
  totalDelayMinutes: number;
  tasksAffected: number;
  slaBreaches: SLABreach[];
  channelUtilization: ChannelUtilization[];
}

export interface ReflowResult {
  updatedTasks: SettlementTask[];
  changes: TaskChange[];
  explanation: string;
  metrics: OptimizationMetrics;
}

export interface ChannelBooking {
  taskId: string;
  start: string;
  end: string;
}