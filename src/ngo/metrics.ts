import type { NgoRequest } from "./data";

export type NgoRequestFilter = "all" | "pending" | "accepted" | "declined" | "completed";
export type NgoDeliveryFilter = "all" | "scheduled" | "in_transit" | "completed";

export function isAwaitingNgoVerification(request: NgoRequest) {
  return request.status === "picked_up"
    && request.delivery_verification_status === "pending"
    && (request.volunteer_id === null || request.volunteer_delivered_at !== null);
}

export function ngoRequestLabel(status: NgoRequest["status"]) {
  if (status === "confirmed") return "Accepted";
  if (status === "picked_up") return "In transit";
  if (status === "completed") return "Received";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function ngoRequestTone(status: NgoRequest["status"]) {
  if (status === "completed") return "success" as const;
  if (status === "confirmed" || status === "picked_up") return "info" as const;
  if (status === "pending") return "warning" as const;
  if (status === "declined" || status === "cancelled") return "danger" as const;
  return "neutral" as const;
}

export function filterNgoRequests(requests: NgoRequest[], filter: NgoRequestFilter) {
  if (filter === "all") return requests;
  if (filter === "accepted") return requests.filter((request) => request.status === "confirmed");
  return requests.filter((request) => request.status === filter);
}

export function filterNgoDeliveries(requests: NgoRequest[], filter: NgoDeliveryFilter) {
  const deliveries = requests.filter((request) =>
    request.status === "confirmed" || request.status === "picked_up" || request.status === "completed",
  );
  if (filter === "scheduled") return deliveries.filter((request) => request.status === "confirmed");
  if (filter === "in_transit") return deliveries.filter((request) => request.status === "picked_up");
  if (filter === "completed") return deliveries.filter((request) => request.status === "completed");
  return deliveries;
}

export function summarizeNgoRequests(requests: NgoRequest[]) {
  return {
    pending: requests.filter((request) => request.status === "pending").length,
    active: requests.filter((request) => request.status === "confirmed" || request.status === "picked_up").length,
    completed: requests.filter((request) => request.status === "completed").length,
    declined: requests.filter((request) => request.status === "declined").length,
  };
}

export function matchesNgoRequest(request: NgoRequest, query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  return !normalized || request.id.toLocaleLowerCase().includes(normalized)
    || request.donation_id.toLocaleLowerCase().includes(normalized);
}
