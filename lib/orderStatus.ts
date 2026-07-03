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

export const STATUS_LABEL: Record<OrderStatus, string> = {
  placed: 'Order placed',
  confirmed: 'Confirmed',
  preparing: 'Being packed',
  assigned: 'Rider assigned',
  out_for_delivery: 'On the way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const STATUS_SUB: Record<OrderStatus, string> = {
  placed: 'We have received your order.',
  confirmed: 'Your order is confirmed.',
  preparing: 'Your milk is being packed fresh.',
  assigned: 'A rider has picked up your order.',
  out_for_delivery: 'Your rider is on the way to you.',
  delivered: 'Enjoy your PYAAS. See you tomorrow!',
  cancelled: 'This order was cancelled.',
};

export function statusColor(s: OrderStatus): string {
  if (s === 'cancelled') return colors.roseDeep;
  if (s === 'delivered') return colors.sage;
  return colors.roseDeep;
}

export function statusIndex(s: OrderStatus): number {
  return STATUS_FLOW.indexOf(s);
}
