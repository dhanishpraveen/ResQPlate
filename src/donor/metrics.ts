import type { Database } from "../lib/database.types";

type ImpactRecord = Database["public"]["Views"]["donor_completed_impact"]["Row"];

export function calculateDonorImpact(records: ImpactRecord[]) {
  const mealsDonated = records
    .filter((record) => record.unit === "servings")
    .reduce((total, record) => total + record.quantity, 0);
  const foodSavedKg = records
    .filter((record) => record.unit === "kg")
    .reduce((total, record) => total + record.quantity, 0);

  return {
    mealsDonated,
    foodSavedKg,
    peopleFed: null as number | null,
    co2ReducedKg: null as number | null,
  };
}

export function monthlyCompletedSummary(records: ImpactRecord[], monthCount = 6, now = new Date()) {
  const months = Array.from({ length: monthCount }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthCount + 1 + index, 1));
    const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    return {
      month,
      label: date.toLocaleString("en", { month: "short", timeZone: "UTC" }),
      completedDonations: 0,
      kilograms: 0,
    };
  });
  const monthIndex = new Map(months.map((month, index) => [month.month, index]));

  for (const record of records) {
    const date = new Date(record.completed_at);
    if (Number.isNaN(date.getTime())) continue;
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const index = monthIndex.get(key);
    if (index !== undefined) {
      months[index].completedDonations += 1;
      if (record.unit === "kg") months[index].kilograms += record.quantity;
    }
  }
  return months;
}

export function formatQuantity(quantity: number, unit: string) {
  const formatted = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(quantity);
  return `${formatted} ${unit}`;
}

export function displayedDonationStatus(status: string, expiresAt: string, now = Date.now()) {
  if (status === "available" && new Date(expiresAt).getTime() <= now) return "expired";
  return status;
}
