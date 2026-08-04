comment on table public.closet_color_palette is '역할=옷장 공통 색상 이름과 HEX 팔레트; source_of_truth=명명된 색상과 HEX; lifecycle=LIVE_SUPPORT';
comment on column public.closet_color_palette.display_name is '역할=사용자에게 보이는 색상 이름; source_of_truth=closet_color_palette; lifecycle=LIVE_SUPPORT';
comment on column public.closet_color_palette.display_hex is '역할=팔레트 대표 HEX; source_of_truth=closet_color_palette; lifecycle=LIVE_SUPPORT';
comment on column public.closet_color_palette.semantic_color is '역할=색상 의미 그룹; source_of_truth=closet_color_palette; lifecycle=LIVE_SUPPORT';

comment on table public.closet_import_runs is '역할=초기 Notion to Supabase import 실행 기록; source_of_truth=아님, 일회성 실행 로그; lifecycle=LEGACY_DROP_CANDIDATE';
comment on column public.closet_import_runs.source is '역할=가져오기 원본 식별; source_of_truth=import 실행 기록; lifecycle=LEGACY_DROP_CANDIDATE';
comment on column public.closet_import_runs.status is '역할=가져오기 성공 상태; source_of_truth=import 실행 기록; lifecycle=LEGACY_DROP_CANDIDATE';
comment on column public.closet_import_runs.counts is '역할=가져온 row 수 요약; source_of_truth=import 실행 기록; lifecycle=LEGACY_DROP_CANDIDATE';
comment on column public.closet_import_runs.report is '역할=가져오기 검증 보고; source_of_truth=import 실행 기록; lifecycle=LEGACY_DROP_CANDIDATE';

comment on table public.closet_item_images is '역할=Item 이미지의 소유권, Storage 경로와 처리 상태; source_of_truth=이미지 메타데이터, binary는 Storage; lifecycle=LIVE_SUPPORT';
comment on column public.closet_item_images.item_id is '역할=이미지가 속한 Item; source_of_truth=closet_item_images; lifecycle=LIVE_SUPPORT';
comment on column public.closet_item_images.storage_path is '역할=closet-images bucket object 경로; source_of_truth=closet_item_images; lifecycle=LIVE_SUPPORT';
comment on column public.closet_item_images.variant is '역할=cutout 등 이미지 변형 종류; source_of_truth=closet_item_images; lifecycle=LIVE_SUPPORT';
comment on column public.closet_item_images.status is '역할=pending, ready, error 처리 상태; source_of_truth=closet_item_images; lifecycle=LIVE_SUPPORT';

comment on table public.closet_items is '역할=옷장 Item의 핵심 속성; source_of_truth=Item; lifecycle=LIVE_CORE';
comment on column public.closet_items.name is '역할=Item 이름; source_of_truth=closet_items; lifecycle=LIVE_CORE';
comment on column public.closet_items.category is '역할=Item category; source_of_truth=closet_items; lifecycle=LIVE_CORE';
comment on column public.closet_items.palette_id is '역할=공통 색상 팔레트 참조; source_of_truth=closet_items의 선택과 closet_color_palette의 정의; lifecycle=LIVE_CORE';
comment on column public.closet_items.display_hex is '역할=Item 표시용 HEX fallback; source_of_truth=closet_items; lifecycle=LIVE_CORE';
comment on column public.closet_items.seasons is '역할=착용 가능 계절 태그; source_of_truth=closet_items; lifecycle=LIVE_CORE';
comment on column public.closet_items.retired is '역할=현재 사용 종료 여부; source_of_truth=closet_items; lifecycle=LIVE_CORE';
comment on column public.closet_items.rain_ok is '역할=비 오는 날 적합 여부; source_of_truth=closet_items; lifecycle=LIVE_CORE';
comment on column public.closet_items.long_walk_ok is '역할=장시간 도보 적합 여부; source_of_truth=closet_items; lifecycle=LIVE_CORE';
comment on column public.closet_items.acquired_on is '역할=취득일과 통계 대상 기간 계산; source_of_truth=closet_items; lifecycle=LIVE_CORE';

comment on table public.closet_outfit_items is '역할=Outfit을 구성하는 Item과 화면 배치; source_of_truth=Outfit composition; lifecycle=LIVE_SUPPORT';
comment on column public.closet_outfit_items.outfit_id is '역할=구성 대상 Outfit; source_of_truth=closet_outfit_items; lifecycle=LIVE_SUPPORT';
comment on column public.closet_outfit_items.item_id is '역할=구성에 포함된 Item; source_of_truth=closet_outfit_items; lifecycle=LIVE_SUPPORT';
comment on column public.closet_outfit_items.slot is '역할=착장 layer slot; source_of_truth=closet_outfit_items; lifecycle=LIVE_SUPPORT';
comment on column public.closet_outfit_items.sort_order is '역할=안정적인 구성 순서; source_of_truth=closet_outfit_items; lifecycle=LIVE_SUPPORT';
comment on column public.closet_outfit_items.position_x is '역할=합성 화면 X 위치; source_of_truth=closet_outfit_items; lifecycle=LIVE_SUPPORT';
comment on column public.closet_outfit_items.position_y is '역할=합성 화면 Y 위치; source_of_truth=closet_outfit_items; lifecycle=LIVE_SUPPORT';
comment on column public.closet_outfit_items.scale is '역할=합성 화면 크기 비율; source_of_truth=closet_outfit_items; lifecycle=LIVE_SUPPORT';
comment on column public.closet_outfit_items.z_index is '역할=합성 layer 순서; source_of_truth=closet_outfit_items; lifecycle=LIVE_SUPPORT';

comment on table public.closet_outfits is '역할=저장 Outfit의 핵심 기록; source_of_truth=Outfit; lifecycle=LIVE_CORE';
comment on column public.closet_outfits.display_name is '역할=Outfit 표시 이름; source_of_truth=closet_outfits; lifecycle=LIVE_CORE';
comment on column public.closet_outfits.rating is '역할=Outfit 선호 평가; source_of_truth=closet_outfits; lifecycle=LIVE_CORE';
comment on column public.closet_outfits.archived_at is '역할=Outfit 보관 상태와 시각; source_of_truth=closet_outfits; lifecycle=LIVE_CORE';

comment on table public.closet_places is '역할=Wear Log 장소 선택지; source_of_truth=장소 사전; lifecycle=LIVE_SUPPORT';
comment on column public.closet_places.name is '역할=장소 표시 이름; source_of_truth=closet_places; lifecycle=LIVE_SUPPORT';
comment on column public.closet_places.active is '역할=현재 입력 UI 노출 여부; source_of_truth=closet_places; lifecycle=LIVE_SUPPORT';

comment on table public.closet_transport_modes is '역할=Wear Log 교통수단 선택지; source_of_truth=교통수단 사전; lifecycle=LIVE_SUPPORT';
comment on column public.closet_transport_modes.name is '역할=교통수단 표시 이름; source_of_truth=closet_transport_modes; lifecycle=LIVE_SUPPORT';
comment on column public.closet_transport_modes.active is '역할=현재 입력 UI 노출 여부; source_of_truth=closet_transport_modes; lifecycle=LIVE_SUPPORT';

comment on table public.closet_weather_locations is '역할=기상청 예보 조회와 Wear Log provenance 위치; source_of_truth=날씨 위치; lifecycle=LIVE_SUPPORT';
comment on column public.closet_weather_locations.label is '역할=앱 표시 위치 이름; source_of_truth=closet_weather_locations; lifecycle=LIVE_SUPPORT';
comment on column public.closet_weather_locations.official_name is '역할=기상 행정구역 공식 이름; source_of_truth=closet_weather_locations; lifecycle=LIVE_SUPPORT';
comment on column public.closet_weather_locations.admin_code is '역할=행정구역 코드; source_of_truth=closet_weather_locations; lifecycle=LIVE_SUPPORT';
comment on column public.closet_weather_locations.nx is '역할=기상청 격자 X; source_of_truth=closet_weather_locations; lifecycle=LIVE_SUPPORT';
comment on column public.closet_weather_locations.ny is '역할=기상청 격자 Y; source_of_truth=closet_weather_locations; lifecycle=LIVE_SUPPORT';
comment on column public.closet_weather_locations.is_default is '역할=workspace 기본 날씨 위치; source_of_truth=closet_weather_locations; lifecycle=LIVE_SUPPORT';

comment on table public.closet_wear_logs is '역할=날짜별 Outfit 착용과 날씨, 체감, 장소 기록; source_of_truth=착용 기록; lifecycle=LIVE_CORE';
comment on column public.closet_wear_logs.outfit_id is '역할=착용한 Outfit; source_of_truth=closet_wear_logs; lifecycle=LIVE_CORE';
comment on column public.closet_wear_logs.worn_on is '역할=착용 날짜와 통계 기간 기준; source_of_truth=closet_wear_logs; lifecycle=LIVE_CORE';
comment on column public.closet_wear_logs.temp_out is '역할=출발 시각 온도; source_of_truth=closet_wear_logs; lifecycle=LIVE_CORE';
comment on column public.closet_wear_logs.temp_back is '역할=귀가 시각 온도; source_of_truth=closet_wear_logs; lifecycle=LIVE_CORE';
comment on column public.closet_wear_logs.place_id is '역할=착용 장소; source_of_truth=closet_wear_logs; lifecycle=LIVE_CORE';
comment on column public.closet_wear_logs.transport_mode_id is '역할=이동 교통수단; source_of_truth=closet_wear_logs; lifecycle=LIVE_CORE';
comment on column public.closet_wear_logs.weather_location_id is '역할=자동 날씨 조회에 사용한 위치; source_of_truth=closet_wear_logs provenance; lifecycle=LIVE_CORE';
comment on column public.closet_wear_logs.temperature_source is '역할=온도 자동 또는 수동 출처; source_of_truth=closet_wear_logs provenance; lifecycle=LIVE_CORE';
comment on column public.closet_wear_logs.submission_token is '역할=중복 제출 방지 token; source_of_truth=closet_wear_logs; lifecycle=LIVE_CORE';

comment on table public.closet_replacement_lines is '역할=같은 역할과 색상 계열을 잇는 Replacement Line; source_of_truth=Line identity와 lifecycle; lifecycle=LIVE_CORE';
comment on column public.closet_replacement_lines.name is '역할=Line 이름; source_of_truth=closet_replacement_lines; lifecycle=LIVE_CORE';
comment on column public.closet_replacement_lines.style_identity is '역할=Line이 유지하는 스타일 역할; source_of_truth=closet_replacement_lines; lifecycle=LIVE_CORE';
comment on column public.closet_replacement_lines.color_category is '역할=사람이 직접 지정한 Line 대표 색상 category; source_of_truth=closet_replacement_lines; lifecycle=LIVE_CORE';
comment on column public.closet_replacement_lines.review_status is '역할=membership 변경 후 계보 재검토 상태; source_of_truth=closet_replacement_lines; lifecycle=LIVE_CORE';
comment on column public.closet_replacement_lines.lifecycle_status is '역할=active 또는 archived 상태; source_of_truth=closet_replacement_lines; lifecycle=LIVE_CORE';
comment on column public.closet_replacement_lines.representative_line_id is '역할=병합된 Line의 대표 Line 참조; source_of_truth=closet_replacement_lines; lifecycle=LIVE_CORE';
comment on column public.closet_replacement_lines.archived_at is '역할=Line 보관 시각; source_of_truth=closet_replacement_lines; lifecycle=LIVE_CORE';

comment on table public.closet_replacement_line_items is '역할=Replacement Line과 Item membership; source_of_truth=Line membership; lifecycle=LIVE_SUPPORT';
comment on column public.closet_replacement_line_items.replacement_line_id is '역할=membership 대상 Line; source_of_truth=closet_replacement_line_items; lifecycle=LIVE_SUPPORT';
comment on column public.closet_replacement_line_items.item_id is '역할=Line에 속한 Item; source_of_truth=closet_replacement_line_items; lifecycle=LIVE_SUPPORT';

comment on table public.closet_replacement_line_edges is '역할=Replacement Line 안의 predecessor to successor 계보; source_of_truth=현재 Lineage edge; lifecycle=LIVE_CORE';
comment on column public.closet_replacement_line_edges.replacement_line_id is '역할=edge가 속한 Line; source_of_truth=closet_replacement_line_edges; lifecycle=LIVE_CORE';
comment on column public.closet_replacement_line_edges.predecessor_item_id is '역할=부모 또는 이전 Item; source_of_truth=closet_replacement_line_edges; lifecycle=LIVE_CORE';
comment on column public.closet_replacement_line_edges.successor_item_id is '역할=자식 또는 다음 Item; source_of_truth=closet_replacement_line_edges; lifecycle=LIVE_CORE';
comment on column public.closet_replacement_line_edges.source_kind is '역할=manual 또는 legacy_link 출처 구분; source_of_truth=closet_replacement_line_edges; lifecycle=LIVE_CORE';
comment on column public.closet_replacement_line_edges.source_legacy_link_id is '역할=Legacy 판단 출처 FK; source_of_truth=과도기 provenance; lifecycle=LEGACY_DROP_CANDIDATE';
comment on column public.closet_replacement_line_edges.branch_name is '역할=선택적 가지 이름; source_of_truth=closet_replacement_line_edges; lifecycle=LIVE_CORE';
comment on column public.closet_replacement_line_edges.decision_reason is '역할=단순 교체, 멸종 후 교체, 계승 판단; source_of_truth=closet_replacement_line_edges; lifecycle=LIVE_CORE';
comment on column public.closet_replacement_line_edges.status is '역할=edge 확인 상태; source_of_truth=closet_replacement_line_edges; lifecycle=LIVE_CORE';

comment on table public.closet_replacement_line_starts is '역할=Lineage graph의 명시적 시작 Item; source_of_truth=explicit G0; lifecycle=LIVE_SUPPORT';
comment on column public.closet_replacement_line_starts.replacement_line_id is '역할=시작점이 속한 Line; source_of_truth=closet_replacement_line_starts; lifecycle=LIVE_SUPPORT';
comment on column public.closet_replacement_line_starts.item_id is '역할=명시적으로 지정한 시작 Item; source_of_truth=closet_replacement_line_starts; lifecycle=LIVE_SUPPORT';
comment on column public.closet_replacement_line_starts.designated_at is '역할=시작점 지정 시각; source_of_truth=closet_replacement_line_starts; lifecycle=LIVE_SUPPORT';

comment on table public.closet_replacement_legacy_links is '역할=Notion의 무방향 관계 49개와 사람의 방향 검토 결과; source_of_truth=과도기 Legacy 판단; lifecycle=LEGACY_DROP_CANDIDATE';
comment on column public.closet_replacement_legacy_links.item_a_id is '역할=canonical pair Item A; source_of_truth=closet_replacement_legacy_links; lifecycle=LEGACY_DROP_CANDIDATE';
comment on column public.closet_replacement_legacy_links.item_b_id is '역할=canonical pair Item B; source_of_truth=closet_replacement_legacy_links; lifecycle=LEGACY_DROP_CANDIDATE';
comment on column public.closet_replacement_legacy_links.review_status is '역할=검토 완료 여부; source_of_truth=closet_replacement_legacy_links; lifecycle=LEGACY_DROP_CANDIDATE';
comment on column public.closet_replacement_legacy_links.review_decision is '역할=A to B, B to A, parallel, not replacement 판단; source_of_truth=closet_replacement_legacy_links; lifecycle=LEGACY_DROP_CANDIDATE';
comment on column public.closet_replacement_legacy_links.review_reason is '역할=Legacy 검토 이유; source_of_truth=closet_replacement_legacy_links; lifecycle=LEGACY_DROP_CANDIDATE';

comment on table public.closet_replacement_legacy_link_revisions is '역할=Legacy Link 판단의 append-only 변경 이력; source_of_truth=아님, 감사 이력; lifecycle=LEGACY_DROP_CANDIDATE';
comment on column public.closet_replacement_legacy_link_revisions.legacy_link_id is '역할=변경 대상 Legacy Link; source_of_truth=revision history; lifecycle=LEGACY_DROP_CANDIDATE';
comment on column public.closet_replacement_legacy_link_revisions.revision_number is '역할=Link별 변경 순서; source_of_truth=revision history; lifecycle=LEGACY_DROP_CANDIDATE';
comment on column public.closet_replacement_legacy_link_revisions.decision is '역할=해당 revision의 판단; source_of_truth=revision history; lifecycle=LEGACY_DROP_CANDIDATE';
comment on column public.closet_replacement_legacy_link_revisions.reason is '역할=해당 revision의 이유; source_of_truth=revision history; lifecycle=LEGACY_DROP_CANDIDATE';

comment on function public.begin_closet_item_image_upload(uuid, uuid, uuid, integer, integer, integer) is '역할=Item 이미지 pending upload 시작; source_of_truth=closet_item_images 쓰기 계약; lifecycle=LIVE_SUPPORT';
comment on function public.finalize_closet_item_image_upload(uuid, uuid, uuid) is '역할=Item 이미지를 ready로 확정; source_of_truth=closet_item_images 쓰기 계약; lifecycle=LIVE_SUPPORT';
comment on function public.cancel_closet_item_image_upload(uuid, uuid, uuid) is '역할=Item 이미지 pending upload 취소; source_of_truth=closet_item_images 쓰기 계약; lifecycle=LIVE_SUPPORT';
comment on function public.create_closet_outfit(uuid, uuid, text, jsonb, boolean) is '역할=Outfit header와 구성을 원자 생성; source_of_truth=closet_outfits와 closet_outfit_items; lifecycle=LIVE_CORE';
comment on function public.update_closet_outfit(uuid, uuid, text, jsonb, boolean) is '역할=Outfit header와 구성을 원자 수정; source_of_truth=closet_outfits와 closet_outfit_items; lifecycle=LIVE_CORE';
comment on function public.clone_closet_outfit(uuid, uuid, uuid, text) is '역할=Outfit과 구성을 원자 복제; source_of_truth=closet_outfits와 closet_outfit_items; lifecycle=LIVE_CORE';
comment on function public.find_matching_closet_outfits(uuid, uuid[]) is '역할=동일 Item 구성 Outfit 탐색; source_of_truth=closet_outfits와 closet_outfit_items 조회; lifecycle=LIVE_CORE';
comment on function public.delete_closet_item_if_unreferenced(uuid, uuid, uuid) is '역할=참조 없는 Item과 이미지 메타데이터 안전 삭제; source_of_truth=closet_items 삭제 계약; lifecycle=LIVE_CORE';
comment on function public.delete_closet_outfit_if_unworn(uuid, uuid, uuid) is '역할=착용 기록 없는 Outfit과 preview 안전 삭제; source_of_truth=closet_outfits 삭제 계약; lifecycle=LIVE_CORE';
comment on function public.review_closet_replacement_legacy_link(uuid, uuid, text, text) is '역할=pending Legacy Link 최초 검토 wrapper; source_of_truth=closet_replacement_legacy_links; lifecycle=LEGACY_DROP_CANDIDATE';
comment on function public.revise_closet_replacement_legacy_link(uuid, uuid, timestamp with time zone, text, text) is '역할=Legacy 판단 수정과 revision 원자 추가; source_of_truth=legacy current snapshot과 revision history; lifecycle=LEGACY_DROP_CANDIDATE';
comment on function public.confirm_closet_replacement_line_edge(uuid, uuid, uuid, timestamp with time zone, text, text) is '역할=Legacy 판단 하나를 confirmed edge로 전환; source_of_truth=closet_replacement_line_edges; lifecycle=LEGACY_DROP_CANDIDATE';
comment on function public.confirm_closet_replacement_line_edges(uuid, jsonb) is '역할=Legacy edge 후보 batch 원자 확정; source_of_truth=closet_replacement_line_edges; lifecycle=LEGACY_DROP_CANDIDATE';
comment on function public.create_closet_replacement_manual_edge(uuid, uuid, uuid, uuid, text, text) is '역할=Legacy 출처 없는 manual edge 생성; source_of_truth=closet_replacement_line_edges; lifecycle=LIVE_CORE';
comment on function public.revise_closet_replacement_line_edge_details(uuid, uuid, timestamp with time zone, text, text) is '역할=edge 가지 이름과 선택 이유 수정; source_of_truth=closet_replacement_line_edges; lifecycle=LIVE_CORE';
comment on function public.update_closet_replacement_line_edge_connection(uuid, uuid, timestamp with time zone, uuid, text, text) is '역할=edge predecessor와 설명 원자 수정; source_of_truth=closet_replacement_line_edges; lifecycle=LIVE_CORE';
comment on function public.disconnect_closet_replacement_line_edge(uuid, uuid, timestamp with time zone) is '역할=edge 해제와 successor start 전환; source_of_truth=edge와 explicit start; lifecycle=LIVE_CORE';
comment on function public.reverse_closet_replacement_line_edge(uuid, uuid, timestamp with time zone) is '역할=edge 방향 반전과 Legacy 판단 동기화; source_of_truth=closet_replacement_line_edges; lifecycle=LIVE_CORE, Legacy dependency는 제거 후보';
comment on function public.set_closet_replacement_line_start(uuid, uuid, uuid, boolean) is '역할=명시적 Lineage 시작점 지정 또는 해제; source_of_truth=closet_replacement_line_starts; lifecycle=LIVE_SUPPORT';
comment on function public.move_closet_replacement_line_item(uuid, uuid, uuid, uuid, text, text, timestamp with time zone, timestamp with time zone) is '역할=edge 없는 Item의 Line membership 이동; source_of_truth=Line, membership, start; lifecycle=LIVE_CORE';
comment on function public.merge_closet_replacement_lines(uuid, uuid, uuid, timestamp with time zone, timestamp with time zone) is '역할=source Line을 대표 Line에 원자 병합하고 보관; source_of_truth=Line, membership, edge, start; lifecycle=LIVE_CORE';
comment on function public.set_closet_replacement_line_archived(uuid, uuid, boolean, timestamp with time zone) is '역할=독립 Line 보관 또는 복원; source_of_truth=closet_replacement_lines lifecycle; lifecycle=LIVE_CORE';
