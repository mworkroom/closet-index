do $$
begin
  if exists (
    select 1
    from public.closet_wear_logs
    where rain_condition = 'unknown'
       or long_walk_condition = 'unknown'
  ) then
    raise exception 'Wear Log condition cleanup requires zero unknown values';
  end if;
end
$$;

alter table public.closet_wear_logs
  drop constraint if exists closet_wear_logs_rain_condition_values,
  drop constraint if exists closet_wear_logs_long_walk_condition_values,
  alter column rain_condition set default 'no',
  alter column long_walk_condition set default 'no',
  add constraint closet_wear_logs_rain_condition_values
    check (rain_condition in ('no', 'yes')),
  add constraint closet_wear_logs_long_walk_condition_values
    check (long_walk_condition in ('no', 'yes'));

comment on column public.closet_wear_logs.rain_condition is
  '비가 오지 않았으면 no, 비가 왔으면 yes. 미지정 상태는 사용하지 않는다.';

comment on column public.closet_wear_logs.long_walk_condition is
  '장거리 걷기가 아니면 no, 장거리 걷기였으면 yes. 미지정 상태는 사용하지 않는다.';
