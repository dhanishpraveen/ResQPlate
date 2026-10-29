begin;

alter table public.surplus_forecasts
  alter column historical_sales drop not null,
  alter column historical_leftover drop not null,
  add column meal_period text not null default 'dinner',
  add column training_data_source text not null default 'synthetic_demo_hotel';

alter table public.surplus_forecasts
  add constraint surplus_forecasts_meal_period_check
    check (meal_period = any (array['breakfast'::text, 'lunch'::text, 'dinner'::text, 'banquet'::text])),
  add constraint surplus_forecasts_training_source_check
    check (training_data_source = any (array['synthetic_demo_hotel'::text, 'verified_donor_history'::text]));

commit;
