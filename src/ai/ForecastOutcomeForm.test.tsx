import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ForecastOutcomeForm } from "./ForecastOutcomeForm";

afterEach(cleanup);

describe("ForecastOutcomeForm", () => {
  it("collects measured surplus and optional observations without changing forecast quantities", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ForecastOutcomeForm
        busy={false}
        forecast={{ id: "forecast-1", ready_at: "2020-01-01T00:00:00.000Z", unit: "servings" }}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Measured edible surplus/), { target: { value: "9" } });
    fireEvent.change(screen.getByLabelText(/Actual sales/), { target: { value: "18" } });
    fireEvent.change(screen.getByLabelText(/Actual customers/), { target: { value: "22" } });
    fireEvent.click(screen.getByRole("button", { name: "Save outcome" }));

    expect(await screen.findByText(/Record the edible surplus after this meal period/)).toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      forecast_id: "forecast-1",
      actual_surplus_quantity: 9,
      unit: "servings",
      actual_sales: 18,
      actual_customers: 22,
    }));
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty("predicted_quantity");
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty("confirmed_quantity");
  });

  it("shows a validation error and does not submit invalid surplus", () => {
    const onSubmit = vi.fn();
    render(
      <ForecastOutcomeForm
        busy={false}
        forecast={{ id: "forecast-1", ready_at: "2020-01-01T00:00:00.000Z", unit: "servings" }}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Measured edible surplus/), { target: { value: "-1" } });
    const form = screen.getByRole("button", { name: "Save outcome" }).closest("form");
    if (!form) throw new Error("Outcome form was not rendered.");
    fireEvent.submit(form);

    expect(screen.getByRole("alert")).toHaveTextContent(/surplus quantity/);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
