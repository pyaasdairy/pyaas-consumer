import type { OrderStatus } from './api';
import { colors } from './theme';

export const STATUS_FLOW: OrderStatus[] = [
  'placed',
  'confirmed',
  'preparing',
  'assigned',
  'out_for_delivery',
  'delivered',
];

// Consumer-facing delivery states, aligned to the Saathi delivery note:
// Scheduled -> (packed) -> Out for delivery -> Live -> At your door -> Delivered.
export const STATUS_LABEL: Record<OrderStatus, string> = {
  placed: 'Scheduled',
  confirmed: 'Confirmed',
  preparing: 'Being packed',
  assigned: 'Rider assigned',
  out_for_delivery: 'On the way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const STATUS_SUB: Record<OrderStatus, string> = {
  placed: 'Scheduled for delivery tomorrow morning.',
  confirmed: 'Reserved from your nearest PYAAS store.',
  preparing: 'Being packed fresh for your morning route.',
  assigned: 'A rider accepted your order and will pick it up shortly. Live tracking is on.',
  out_for_delivery: 'Your rider is on the way. Track them live.',
  delivered: 'Delivered. Your wallet was charged on delivery.',
  cancelled: 'This order was cancelled.',
};

export function statusColor(s: OrderStatus): string {
  if (s === 'cancelled') return colors.flameDeep;
  if (s === 'delivered') return colors.blue;
  return colors.flameDeep;
}

export function statusIndex(s: OrderStatus): number {
  return STATUS_FLOW.indexOf(s);
}
