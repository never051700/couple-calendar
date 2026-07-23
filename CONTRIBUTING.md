# 기여 안내

이 프로젝트는 Android와 iOS가 같은 코드와 같은 Supabase 스키마를 사용합니다.
한 플랫폼의 수정이 다른 플랫폼에 미치는 영향을 함께 확인해 주세요.

## 변경 절차

1. 목적별 브랜치를 만듭니다.
2. 필요한 코드와 문서만 변경합니다.
3. 아래 검사를 실행합니다.
4. Android와 iOS 영향, DB migration 여부를 PR에 적습니다.

```bash
npm ci
npm test
npm run check
npm run export:android
npm run export:ios
```

## 데이터베이스 변경

- 이미 배포된 migration 파일을 수정하지 않습니다.
- `supabase/migrations/`에 번호가 증가한 새 SQL 파일을 추가합니다.
- RLS 정책은 본인 계정뿐 아니라 상대 계정과 관계없는 제3의 계정으로도 검사합니다.
- 앱과 DB의 전환 순서가 필요한 변경은 `HANDOFF.md`와 PR에 명시합니다.

## 공개 저장소 안전 규칙

- `.env`, Firebase 서비스 계정, Android keystore, Apple/APNs 키를 커밋하지 않습니다.
- 실제 이메일, 일정, 장소, 메모, 푸시 토큰을 테스트 자료나 Issue에 올리지 않습니다.
- 비밀값이 노출되면 커밋 삭제만으로 끝내지 않고 즉시 폐기·재발급합니다.

보안 취약점은 공개 Issue 대신 [SECURITY.md](./SECURITY.md)를 따라 전달하세요.
