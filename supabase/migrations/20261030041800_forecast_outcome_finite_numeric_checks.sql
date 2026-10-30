begin;

alter table public.forecast_outcomes
  add constraint forecast_outcomes_surplus_finite
    check (
      actual_surplus_quantity not in (
        'NaN'::numeric,
        'Infinity'::numeric,
        '-Infinity'::numeric
      )
    ),
  add constraint forecast_outcomes_sales_finite
    check (
      actual_sales is null
      or actual_sales not in (
        'NaN'::numeric,
        'Infinity'::numeric,
        '-Infinity'::numeric
      )
    );

-- PostgreSQL 17 verification in a disposable database:
-- SELECT value,
--   value NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) AS surplus_check,
--   value IS NULL OR value NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) AS sales_check
-- FROM (VALUES
--   (0::numeric), (NULL::numeric), ('NaN'::numeric),
--   ('Infinity'::numeric), ('-Infinity'::numeric)
-- ) AS samples(value);
-- Expected: zero passes both; NULL passes the optional-sales check; all three
-- non-finite values fail both checks.

commit;
