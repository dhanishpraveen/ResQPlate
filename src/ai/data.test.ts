import { describe, expect, it, vi } from "vitest";
import {
  buildForecastOutcomeValues,
  createForecastOutcome,
  type ForecastOutcomeFormValues,
} from "./data";
import outcomeMigration from "../../supabase/migrations/20261030023000_forecast_outcome_records.sql?raw";
import finiteOutcomeMigration from "../../supabase/migrations/20261030041800_forecast_outcome_finite_numeric_checks.sql?raw";

function localDateTime(value: Date) {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function validInput(now: Date): ForecastOutcomeFormValues {
  return {
    actual_surplus_quantity: "0",
    actual_sales: "",
    actual_customers: "24",
    observed_at: localDateTime(new Date(now.getTime() - 60 * 60_000)),
  };
}

describe("forecast outcome data", () => {
  it("defines one immutable, donor-owned outcome per forecast in the migration", () => {
    expect(outcomeMigration).toMatch(
      /forecast_id uuid primary key references public\.surplus_forecasts \(id\) on delete restrict/i,
    );
    expect(outcomeMigration).toMatch(/actual_surplus_quantity numeric not null/i);
    expect(outcomeMigration).toMatch(/actual_sales numeric/i);
    expect(outcomeMigration).toMatch(/actual_customers integer/i);
    expect(outcomeMigration).toMatch(/observed_at timestamptz not null/i);
    expect(outcomeMigration).toMatch(/constraint forecast_outcomes_surplus_nonnegative\s+check\s*\(actual_surplus_quantity >= 0\)/i);
    expect(outcomeMigration).toMatch(/constraint forecast_outcomes_sales_nonnegative\s+check\s*\(actual_sales is null or actual_sales >= 0\)/i);
    expect(outcomeMigration).toMatch(/enable row level security/i);
    expect(outcomeMigration).toMatch(/revoke all on public\.forecast_outcomes from public, anon, authenticated/i);
    expect(outcomeMigration).toMatch(/grant select, insert on public\.forecast_outcomes to authenticated/i);
    expect(outcomeMigration).toMatch(/f\.donor_id = \(select auth\.uid\(\)\)/i);
    expect(outcomeMigration).toMatch(/f\.unit = forecast_outcomes\.unit/i);
    expect(outcomeMigration).toMatch(/forecast_outcomes\.observed_at > f\.ready_at/i);
    expect(outcomeMigration).toMatch(/observed_at <= \(select now\(\)\)/i);
    expect(outcomeMigration).not.toMatch(/grant\s+(?:update|delete|all)\s+on\s+public\.forecast_outcomes/i);
  });

  it("adds forward-only finite numeric checks while allowing zero and nullable sales", () => {
    expect(finiteOutcomeMigration).toMatch(
      /add constraint forecast_outcomes_surplus_finite\s+check\s*\(\s*actual_surplus_quantity not in\s*\(\s*'NaN'::numeric,\s*'Infinity'::numeric,\s*'-Infinity'::numeric/is,
    );
    expect(finiteOutcomeMigration).toMatch(
      /add constraint forecast_outcomes_sales_finite\s+check\s*\(\s*actual_sales is null\s+or actual_sales not in\s*\(\s*'NaN'::numeric,\s*'Infinity'::numeric,\s*'-Infinity'::numeric/is,
    );
    expect(finiteOutcomeMigration).toMatch(/begin;[\s\S]*commit;/i);
    expect(finiteOutcomeMigration).not.toMatch(/drop constraint|drop policy|grant|revoke/i);
  });

  it("denies outcome reads and inserts unless the authenticated user owns the linked forecast", () => {
    expect(outcomeMigration).toMatch(
      /create policy forecast_outcomes_donor_read[\s\S]*?for select to authenticated[\s\S]*?using\s*\([\s\S]*?f\.donor_id = \(select auth\.uid\(\)\)[\s\S]*?\);/i,
    );
    expect(outcomeMigration).toMatch(
      /create policy forecast_outcomes_donor_insert[\s\S]*?for insert to authenticated[\s\S]*?with check\s*\([\s\S]*?f\.donor_id = \(select auth\.uid\(\)\)[\s\S]*?f\.unit = forecast_outcomes\.unit[\s\S]*?forecast_outcomes\.observed_at > f\.ready_at[\s\S]*?\);/i,
    );
    expect(outcomeMigration).not.toMatch(/create policy[^;]+forecast_outcomes[\s\S]*?for all/i);
  });

  it("requires the outcome unit to match the owned forecast", () => {
    expect(outcomeMigration).toMatch(
      /f\.donor_id = \(select auth\.uid\(\)\)[\s\S]*?f\.unit = forecast_outcomes\.unit/i,
    );
  });

  it("keeps measured surplus separate and permits optional sales and customer observations", () => {
    const now = new Date("2030-01-01T12:00:00.000Z");
    const observedAt = new Date(now.getTime() - 60 * 60_000);
    const values = { ...validInput(now), actual_customers: "" };
    const result = buildForecastOutcomeValues(
      { id: "forecast-1", ready_at: new Date(observedAt.getTime() - 60_000).toISOString(), unit: "servings" },
      values,
      now.getTime(),
    );

    expect(result).toEqual({
      forecast_id: "forecast-1",
      actual_surplus_quantity: 0,
      unit: "servings",
      actual_sales: null,
      actual_customers: null,
      observed_at: observedAt.toISOString(),
    });
    expect(result).not.toHaveProperty("predicted_quantity");
    expect(result).not.toHaveProperty("confirmed_quantity");
    expect(result).not.toHaveProperty("quantity_handed_over");
  });

  it.each([
    ["negative surplus", { actual_surplus_quantity: "-1" }, /surplus quantity/],
    ["negative sales", { actual_sales: "-1" }, /Actual sales/],
    ["non-finite surplus", { actual_surplus_quantity: "Infinity" }, /surplus quantity/],
    ["NaN sales", { actual_sales: "NaN" }, /Actual sales/],
    ["fractional customers", { actual_customers: "1.5" }, /whole number/],
  ])("rejects %s", (_label, override, error) => {
    const now = new Date("2030-01-01T12:00:00.000Z");
    const values = { ...validInput(now), ...override } as ForecastOutcomeFormValues;
    expect(() => buildForecastOutcomeValues(
      { id: "forecast-1", ready_at: "2030-01-01T10:00:00.000Z", unit: "servings" },
      values,
      now.getTime(),
    )).toThrow(error);
  });

  it("rejects observations at or before the forecast ready time or in the future", () => {
    const now = new Date("2030-01-01T12:00:00.000Z");
    const forecast = { id: "forecast-1", ready_at: "2030-01-01T11:00:00.000Z", unit: "servings" };
    const beforeReady = { ...validInput(now), observed_at: localDateTime(new Date("2030-01-01T10:00:00.000Z")) };
    const atReady = { ...validInput(now), observed_at: localDateTime(new Date("2030-01-01T11:00:00.000Z")) };
    const future = { ...validInput(now), observed_at: localDateTime(new Date("2030-01-01T13:00:00.000Z")) };

    expect(() => buildForecastOutcomeValues(forecast, beforeReady, now.getTime()))
      .toThrow(/must be after/);
    expect(() => buildForecastOutcomeValues(forecast, atReady, now.getTime()))
      .toThrow(/must be after/);
    expect(() => buildForecastOutcomeValues(forecast, future, now.getTime()))
      .toThrow(/cannot be in the future/);
  });

  it("inserts through the forecast_outcomes table and maps duplicate submissions clearly", async () => {
    const saved = { forecast_id: "forecast-1", actual_surplus_quantity: 4, unit: "servings" };
    const single = vi.fn().mockResolvedValue({ data: saved, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });
    const client = { from } as never;
    const input = {
      forecast_id: "forecast-1",
      actual_surplus_quantity: 4,
      unit: "servings",
      actual_sales: null,
      actual_customers: null,
      observed_at: "2030-01-01T12:00:00.000Z",
    };

    await expect(createForecastOutcome(client, input)).resolves.toEqual(saved);
    expect(from).toHaveBeenCalledWith("forecast_outcomes");
    expect(insert).toHaveBeenCalledWith(input);
    expect(select).toHaveBeenCalledWith("*");

    const duplicateError = { code: "23505", message: "duplicate key" };
    const duplicateClient = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: duplicateError }),
          }),
        }),
      }),
    } as never;
    await expect(createForecastOutcome(duplicateClient, input))
      .rejects.toThrow("An outcome has already been recorded for this forecast.");
  });
});
