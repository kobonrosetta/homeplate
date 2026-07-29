// One source of truth for order-status pill colors. Buyer and cook views show
// audience-specific LABELS (passed in) but the same color per status.
export const ORDER_STATUS_COLOR: Record<string, string> = {
  confirmed: "bg-amber-100 text-amber-900",
  in_progress: "bg-indigo-100 text-indigo-900",
  ready: "bg-blue-100 text-blue-900",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-800",
};

export function orderStatusColor(status: string): string {
  return ORDER_STATUS_COLOR[status] ?? ORDER_STATUS_COLOR.confirmed;
}
