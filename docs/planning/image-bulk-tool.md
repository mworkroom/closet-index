# 대량 이미지 등록 도구

## 목적

누끼 이미지 파일을 Closet Item과 자동으로 연결하고, 애매한 파일만 검토한 뒤 Supabase의 private `closet-images` bucket과 `closet_item_images` metadata에 일괄 반영한다.

## 실행

프로젝트 루트의 `대량 이미지 등록.cmd`를 더블클릭한다. 또는 터미널에서 다음 명령을 실행한다.

```powershell
npm.cmd run images:bulk
```

로컬 도구는 `http://127.0.0.1:4179`를 열고 다음 폴더를 자동 생성한다.

```text
assets/private/image-bulk/inbox/
```

이 폴더와 매칭 상태, 변환 결과는 모두 `assets/private/` 아래에 있으며 Git에서 제외된다.

## 사용 순서

1. `누끼 폴더 열기`를 누르고 PNG·JPEG·WebP·HEIC·HEIF 파일을 넣는다.
2. `폴더 다시 읽기`를 누른다.
3. 파일명과 Item명이 정확히 하나로 일치하면 자동 연결된다.
4. 미연결 파일은 Item 이름 입력란에서 검색해 선택한다.
5. `매칭 저장`을 누르면 중간 상태가 로컬에 저장된다.
6. `Dry-run`으로 투명 배경, 크기, WebP 변환 및 700KB 제한을 검사한다.
7. 결과를 확인한 뒤 `Supabase 업로드`를 누른다.

## 안전 경계

- Secret key는 `.env.supabase.local`에서 서버 프로세스만 읽고 브라우저로 전달하지 않는다.
- 대상 Supabase project ref와 workspace ID는 현재 Closet Index production 값으로 고정 검증한다.
- Item ID·이름·category가 production과 일치하는지 업로드 직전에 다시 확인한다.
- 원본 누끼는 업로드하지 않고 변환된 cutout WebP만 저장한다.
- 한 Item에 여러 파일을 연결할 수 없다.
- 기존 ready 이미지가 있는 Item은 `기존 이미지 교체 허용`을 직접 선택하기 전에는 업로드가 차단된다.
- Item 한 개씩 `Storage 업로드 → metadata ready` 순서로 완료하므로 중간에 종료되어도 다시 실행할 수 있다.
- Storage schema를 SQL로 직접 수정하지 않고 Storage API를 통해 객체를 저장한다.
