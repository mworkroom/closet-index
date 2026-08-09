-- The dedicated Wear Log HVAC memo duplicated the existing general memo.
-- Live inventory before removal found 784 Wear Logs and zero non-null values,
-- with no view, function, or trigger dependencies. Keep HVAC mode/intensity as
-- the structured observation and use closet_wear_logs.memo for optional prose.

alter table public.closet_wear_logs
  drop constraint closet_wear_logs_observed_hvac_memo_check,
  drop column observed_hvac_memo;
