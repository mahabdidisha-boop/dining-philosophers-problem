export type BarberState = 'Sleeping' | 'Serving' | 'Checking Queue';

export type LogDotColor = 'grey' | 'blue' | 'green' | 'yellow' | 'red';

export interface LogEntry {
  id: string;
  time: string;
  message: string;
  color: LogDotColor;
}

export type CustomerPose = 'standing' | 'sitting' | 'in_chair' | 'walking';

export interface CustomerColor {
  name: string;
  bgHex: string;
  borderHex: string;
}

export const CUSTOMER_COLORS: CustomerColor[] = [
  { name: 'blue', bgHex: '#3B82F6', borderHex: '#1D4ED8' },    // Customer 1
  { name: 'green', bgHex: '#10B981', borderHex: '#047857' },   // Customer 2
  { name: 'yellow', bgHex: '#F59E0B', borderHex: '#B45309' },  // Customer 3
  { name: 'red', bgHex: '#EF4444', borderHex: '#B91C1C' },     // Customer 4
  { name: 'purple', bgHex: '#8B5CF6', borderHex: '#6D28D9' },  // Customer 5
  { name: 'orange', bgHex: '#F97316', borderHex: '#C2410C' },  // Customer 6
  { name: 'teal', bgHex: '#14B8A6', borderHex: '#0F766E' },    // Customer 7
  { name: 'pink', bgHex: '#EC4899', borderHex: '#BE185D' },    // Customer 8
  { name: 'indigo', bgHex: '#6366F1', borderHex: '#4338CA' },  // Customer 9
  { name: 'amber', bgHex: '#D97706', borderHex: '#92400E' },   // Customer 10
];

export interface ActiveCustomerAnimation {
  customerId: number;
  type: 'entering' | 'walking_to_barber' | 'walking_to_chair' | 'leaving_rejected' | 'leaving_done';
  chairIndex?: number;
}
