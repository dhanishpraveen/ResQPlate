import { useState, type FormEvent } from "react";
import { Button, TextField } from "../components/ui";
import {
  buildForecastOutcomeValues,
  type ForecastOutcomeFormValues,
  type ForecastOutcomeInsert,
  type ForecastRow,
} from "./data";

function localDateTime(value: Date) {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function ForecastOutcomeForm({
  forecast,
  busy,
  onCancel,
  onSubmit,
}: {
  forecast: Pick<ForecastRow, "id" | "ready_at" | "unit">;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: ForecastOutcomeInsert) => Promise<void>;
}) {
  const [values, setValues] = useState<ForecastOutcomeFormValues>({
    actual_surplus_quantity: "",
    actual_sales: "",
    actual_customers: "",
    observed_at: localDateTime(new Date()),
  });
  const [error, setError] = useState<string | null>(null);

  function update<Key extends keyof ForecastOutcomeFormValues>(key: Key, value: ForecastOutcomeFormValues[Key]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const input = buildForecastOutcomeValues(forecast, values);
      setError(null);
      await onSubmit(input);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The outcome could not be validated.");
    }
  }

  return (
    <form className="donor-outcome-form" onSubmit={(event) => void submit(event)}>
      <p>Record the edible surplus after this meal period. This is separate from the forecast, any confirmed donation, and quantity delivered.</p>
      <TextField
        label={`Measured edible surplus (${forecast.unit})`}
        min="0"
        onChange={(event) => update("actual_surplus_quantity", event.target.value)}
        required
        step="0.001"
        type="number"
        value={values.actual_surplus_quantity}
      />
      <TextField
        label={`Actual sales, same unit (${forecast.unit}, optional)`}
        min="0"
        onChange={(event) => update("actual_sales", event.target.value)}
        step="0.001"
        type="number"
        value={values.actual_sales}
      />
      <TextField
        label="Actual customers / orders (optional)"
        min="0"
        onChange={(event) => update("actual_customers", event.target.value)}
        step="1"
        type="number"
        value={values.actual_customers}
      />
      <TextField
        label="Observed at"
        max={localDateTime(new Date())}
        min={localDateTime(new Date(forecast.ready_at))}
        onChange={(event) => update("observed_at", event.target.value)}
        required
        type="datetime-local"
        value={values.observed_at}
      />
      {error && <span className="ui-error-text" role="alert">{error}</span>}
      <div className="donor-outcome-actions">
        <Button disabled={busy} loading={busy} type="submit">{busy ? "Saving…" : "Save outcome"}</Button>
        <Button disabled={busy} onClick={onCancel} variant="outline">Cancel</Button>
      </div>
    </form>
  );
}
