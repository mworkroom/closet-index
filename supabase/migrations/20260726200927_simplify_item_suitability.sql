alter table public.closet_items
  drop constraint if exists closet_items_rain_ok_values,
  drop constraint if exists closet_items_long_walk_ok_values,
  alter column rain_ok drop default,
  alter column long_walk_ok drop default;

alter table public.closet_items
  alter column rain_ok type boolean
    using (rain_ok <> 'unsuitable'),
  alter column long_walk_ok type boolean
    using (long_walk_ok <> 'unsuitable'),
  alter column rain_ok set default true,
  alter column long_walk_ok set default true;

comment on column public.closet_items.rain_ok is
  '기본값 true. 비 오는 날 착용할 수 없는 아이템만 false로 지정한다.';

comment on column public.closet_items.long_walk_ok is
  '기본값 true. 신발 중 장거리 걷기에 적합하지 않은 아이템만 false로 지정한다.';
