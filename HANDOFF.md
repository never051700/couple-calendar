# 우리 캘린더 인계 문서

이 문서는 프로젝트를 넘겨받은 사람이 Android와 iPhone 앱을 같은 코드와 같은
데이터로 계속 운영하기 위한 기준 문서입니다. 실행·배포의 상세 명령은
[README.md](./README.md), 코드 품질과 남은 기술 부채는
[CODE_REVIEW.md](./CODE_REVIEW.md)를 함께 참고하세요.

## 1. 현재 상태

- Expo SDK 56, React Native, TypeScript 기반의 단일 코드베이스입니다.
- Android와 iOS가 같은 Supabase 프로젝트의 회원·공간·일정 데이터를 사용합니다.
- Android 패키지명과 iOS Bundle ID는 현재 모두 `com.couplecalander.app`입니다.
- Expo slug와 딥링크 scheme은 기존 호환성을 위해 철자가 `couplecalander`입니다.
  오탈자처럼 보여도 기존 배포 연결을 확인하기 전에는 임의로 바꾸지 마세요.
- 현재 앱 표시 버전은 `1.0.0`입니다.
- Android 7.0(API 24) 이상, iOS 16.4 이상을 대상으로 합니다.
- 자동 테스트 5개, TypeScript 검사, Expo Doctor 21개 검사를 통과했습니다.
- Android/iOS JavaScript 번들과 네이티브 프로젝트 생성까지 확인했습니다.
- 실제 배포 계정, Firebase, Supabase 운영값이 없어 양쪽 실기기 원격 푸시와
  스토어 제출은 인계 후 최종 확인이 필요합니다.

## 2. 인계받은 직후 할 일

```bash
git clone https://github.com/never051700/couple-calendar.git
cd couple-calendar
npm ci
cp .env.example .env
npm test
npm run check
```

`.env`에 실제 Supabase 값과 공개 웹페이지 주소를 입력한 후 `npm run smoke`로
연결을 확인하세요. `.env`와 인증 파일은 Git에 올리지 않습니다.

그다음 친구가 기존 Android 앱을 만들 때 사용한 Expo 계정과 프로젝트가 있는지
먼저 확인합니다. 기존 프로젝트를 연결하면 EAS `projectId`, 빌드 기록과 관리형
Android keystore를 이어받기 쉽습니다. 별도로 동일한 keystore를 보유했다면 새
EAS 프로젝트도 가능하지만, 기존 설치본 업데이트와 푸시를 모두 다시 검증해야
합니다.

## 3. 저장소에 포함되지 않는 인계 항목

아래 항목은 공개 저장소에 넣지 않고 계정 초대 또는 합의된 비공개 채널로
전달해야 합니다.

| 항목 | 필요한 이유 | 권장 인계 방법 |
| --- | --- | --- |
| Supabase 프로젝트 접근 권한 | 인증, DB, Realtime, Edge Function 운영 | Supabase 조직/프로젝트 멤버 초대 |
| 실제 Supabase URL·anon key | 앱의 운영 데이터 연결 | EAS 환경 변수와 로컬 `.env`에 등록 |
| 기존 Expo/EAS 프로젝트 접근 권한 | 기존 앱 식별과 원격 푸시 | Expo 조직 멤버 초대 |
| 기존 Android keystore | 설치된 Android 앱 위에 업데이트 | EAS Credentials에서 공동 관리 |
| Firebase 프로젝트 접근 권한 | Android FCM 원격 푸시 | Firebase 프로젝트 멤버 초대 |
| `google-services.json` | Android 앱과 Firebase 연결 | EAS File 환경 변수 또는 로컬 파일 |
| FCM V1 서비스 계정 키 | Expo가 Android 푸시 발송 | EAS Credentials에 등록, 파일 공유 금지 |
| Apple Developer/App Store Connect 권한 | iOS 서명·TestFlight·심사 | Apple 계정의 사용자 초대 |
| APNs 키·iOS 자격 증명 | iPhone 원격 푸시와 서명 | EAS Credentials 또는 Apple 계정에서 관리 |
| 공개 개인정보처리방침·지원 URL | 앱 설정과 스토어 심사 | EAS 환경 변수에 등록 |
| `WEBHOOK_SECRET` | DB 웹훅 요청 검증 | Supabase Secret으로만 등록 |

`anon key`와 `EXPO_PUBLIC_*` 값은 앱 번들에 포함되므로 서버 비밀키로 취급할 수
없습니다. Supabase 보안은 `service-role` 은닉과 RLS 정책에 의존합니다. 운영 환경
구분과 실수 방지를 위해 공개용 값도 저장소에 하드코딩하지 않으며 앱에는 절대로
`service-role` 키를 넣지 않습니다. 서비스 계정 키, keystore, APNs 키,
`WEBHOOK_SECRET`은 비밀정보이므로 어떤 경우에도 공개 커밋에 넣지 마세요.

## 4. 기존 Android 앱 업데이트 조건

패키지명만 같다고 기존 설치본을 업데이트할 수 있는 것은 아닙니다. 이전 앱과
동일한 Android keystore로 서명하고 기존 설치본보다 큰 `versionCode`를 사용해야
합니다. 키를 잃어버렸다면 기존 앱 위에 업데이트하지 못하고 삭제 후 새 앱으로
설치해야 할 수 있습니다.

다음 세 항목을 친구에게 반드시 확인하세요.

1. 기존 Expo/EAS 프로젝트 소유 계정 또는 조직
2. 기존 Android keystore가 EAS Credentials에 보관되어 있는지
3. Firebase에 `com.couplecalander.app` Android 앱이 등록되어 있는지

Google Play에 이미 게시했다면 Play App Signing의 앱 서명키와 업로드 키를 구분해
확인해야 합니다. 친구의 기존 앱을 삭제하지 않은 테스트 기기에서 Preview APK가
정상적으로 덮어쓰기 설치되는지도 확인하세요.

## 5. 두 플랫폼을 함께 전환하는 안전한 순서

`0002_ios_and_security_hardening.sql`은 초대 코드, 색상 변경, 푸시 토큰 저장
방식을 바꿉니다. 이 마이그레이션을 먼저 적용한 뒤 구형 Android 앱을 계속 쓰면
일부 기능이 실패할 수 있습니다.

1. 동일한 Supabase·EAS 환경값으로 Android Preview APK와 iOS Preview 빌드를 준비
2. 별도 테스트 환경에서 가입 → 초대 → 일정 → 알림 → 탈퇴 흐름 확인
3. 운영 Supabase 데이터 백업
4. 한 사용자의 다중 공간, 한 공간의 3인 이상 가입 같은 `0002` 사전진단 확인
5. `0002_ios_and_security_hardening.sql` 적용
6. `0003_atomic_account_deletion.sql` 적용
7. `npm run smoke`와 DB의 `account_deletion_ready` 상태 확인
8. `notify-event`, `delete-account` Edge Function 배포 및 웹훅 설정
9. 두 사용자 모두 새 Android/iOS 빌드 설치 후 알림을 다시 허용
10. 새 12자리 초대 코드와 상대방 변경 푸시를 다시 확인

운영 DB 마이그레이션과 두 기기의 앱 업데이트는 같은 전환 시간대에 진행하세요.
자동 롤백 migration은 제공되지 않으므로 문제가 생기면 배포를 중단하고 백업 복구
여부를 판단해야 합니다. `0002` 적용 시 구형 푸시 토큰과 기존 6자리 초대는
폐기됩니다.

## 6. 빌드와 실기기 수용 테스트

직접 설치 가능한 빌드는 다음 명령으로 준비합니다.

```bash
npx eas-cli@latest build --profile preview --platform android
npx eas-cli@latest build --profile preview --platform ios
```

Android 원격 푸시는 Expo Go가 아니라 EAS 빌드에서 확인해야 합니다.

| 확인 항목 | Android | iPhone | 기대 결과 |
| --- | :---: | :---: | --- |
| 이메일 가입·로그인·로그아웃 | □ | □ | 세션이 안전하게 저장·해제됨 |
| 캘린더 생성 | □ | □ | 생성 후 달력 화면으로 이동 |
| 12자리 초대 코드 참여 | □ | □ | 두 계정이 같은 공간에 연결 |
| iPhone → Android 일정 CRUD | — | □ | 생성·수정·삭제가 Android에 실시간 반영 |
| Android → iPhone 일정 CRUD | □ | — | 생성·수정·삭제가 iPhone에 실시간 반영 |
| 종일·시간 지정 일정 | □ | □ | 날짜와 시간이 동일하게 표시 |
| 공개·비공개 일정 | □ | □ | 비공개 내용은 작성자에게만 노출 |
| 로컬 알림 생성·변경·취소 | □ | □ | 이전 예약이 남지 않고 새 시간에 표시 |
| 상대방 변경 원격 푸시 | □ | □ | 전경·배경·종료 상태에서 알림 수신 |
| 알림 탭 이동 | □ | □ | 관련 일정 또는 달력으로 이동 |
| 알림 거부 후 설정 복구 | □ | □ | 기기 설정에서 허용 후 정상 등록 |
| 앱 재실행·기기 재부팅 | □ | □ | 세션과 예정 알림이 정상 복구 |
| 로그아웃·계정 전환 | □ | □ | 이전 계정 알림을 더 이상 받지 않음 |
| 계정 삭제 | □ | □ | 공유 공간 소유권과 계정이 원자적으로 처리 |
| 기존 Android 덮어쓰기 설치 | □ | — | 앱 삭제 없이 업데이트되고 로그인 유지 |
| 네트워크 재연결 | □ | □ | 연결 복구 후 최신 일정과 일치 |

테스트 중에는 두 기기가 같은 Supabase URL을 사용하는지, Android와 iOS의 시간대가
같은지도 확인하세요.

## 7. 서버 배포 확인표

- Supabase migration `0001` → `0002` → `0003` 순서 확인
- Email 인증 Provider와 운영 이메일 정책 확인
- `WEBHOOK_SECRET` 등록
- `notify-event` 배포와 `events` INSERT/UPDATE 웹훅 연결
- `delete-account`를 JWT 검증이 켜진 상태로 배포
- EAS development/preview/production 환경 변수 등록
- Android `google-services.json`과 FCM V1 키 등록
- Apple/APNs 자격 증명 등록
- 개인정보처리방침과 지원 URL의 비로그인 접근 확인

## 8. 주요 코드 위치

```text
app/                         화면과 라우팅
src/components/              공용 UI와 일정 입력 폼
src/lib/                     인증, DB, 시간, 알림, 보안 저장소
supabase/migrations/         DB 스키마와 보안 정책
supabase/functions/          푸시와 계정 삭제 서버 함수
tests/                       핵심 날짜 로직 테스트
app.json / app.config.js     iOS·Android 앱 설정
eas.json                     EAS 빌드 프로필
```

DB 구조를 바꿀 때 기존 migration 파일을 수정하지 말고 번호가 증가한 새 migration을
추가하세요. 공개 DB 타입이 바뀌면 `src/types/db.ts`도 함께 갱신합니다.

## 9. 알려진 한계와 다음 우선순위

- 실제 Supabase 환경을 사용하는 RLS 통합 테스트가 없습니다.
- 로그인부터 계정 삭제까지 자동화한 E2E 테스트가 없습니다.
- Android FCM과 iPhone APNs는 실제 자격 증명·실기기에서 최종 검증해야 합니다.
- 현재 원격 알림은 표시명과 일정 제목을 잠금화면에 보여줄 수 있습니다. 공개
  개인정보처리방침에 반영하고, 필요하면 제목을 숨기는 알림 옵션을 추가하세요.
- 캘린더 조회 범위 제한과 페이지네이션이 필요합니다.
- 오류 수집과 운영 모니터링 도구가 아직 없습니다.
- 비밀번호 재설정 흐름이 아직 없습니다.
- 원격 푸시 Edge Function은 일정 INSERT/UPDATE를 처리하며 DELETE 푸시는 없습니다.
- `0002`의 일부 `NOT VALID` 제약은 운영 데이터 정리 후 검증 확정이 필요합니다.

현재 평가는 **7.0/10, 좋은 MVP이나 운영 실기기 검증이 남은 상태**입니다.

## 10. 공개 저장소 운영 주의

- 공개 Issue, PR, Actions 로그에 사용자 데이터나 인증값을 붙이지 마세요.
- 비밀값이 커밋되었다면 파일만 삭제하지 말고 해당 키를 즉시 폐기·재발급하세요.
- 이 저장소에는 별도 오픈소스 라이선스가 없습니다. 외부 공개·재배포 범위를
  넓히려면 [NOTICE.md](./NOTICE.md)를 확인하고 원저작자와 소유권을 확인한 뒤
  라이선스를 합의해 추가하세요.
- 보안 문제는 [SECURITY.md](./SECURITY.md)의 절차로 비공개 전달하세요.

## 11. 인계 완료 확인

- [ ] Supabase 프로젝트 권한을 인계받음
- [ ] 기존 EAS 프로젝트와 Android keystore를 확인함
- [ ] Firebase와 Apple 개발자 권한을 확인함
- [ ] 로컬 `.env`와 EAS 환경 변수를 설정함
- [ ] Android/iOS Preview 빌드를 모두 설치함
- [ ] 수용 테스트 표를 양쪽 기기에서 완료함
- [ ] 운영 DB 백업과 마이그레이션 적용 시점을 합의함
- [ ] 개인정보처리방침·지원 URL과 스토어 정보를 확인함
- [ ] 향후 코드·배포·계정 관리 담당자를 정함
- [ ] GitHub, EAS, Supabase, Firebase, Apple/Google 콘솔 담당자를 기록함
- [ ] 적용한 앱 `versionCode`·`buildNumber`와 배포 빌드 링크를 기록함
- [ ] 원저작자 공개 동의와 표시할 이름·GitHub 계정을 확인함
