# 📅 우리 캘린더

[![CI](https://github.com/never051700/couple-calendar/actions/workflows/ci.yml/badge.svg)](https://github.com/never051700/couple-calendar/actions/workflows/ci.yml)

두 사람이 함께 쓰는 실시간 공유 캘린더입니다. Expo(React Native) 공용
코드베이스라 Android와 iPhone에서 같은 Supabase 데이터를 사용합니다.
플랫폼별 프로젝트를 따로 복사하지 말고 이 저장소 하나에서 Android와 iOS 빌드를
각각 만드세요.

> 프로젝트를 친구에게 넘겨받거나 운영을 인계받는 경우
> **[HANDOFF.md](./HANDOFF.md)**부터 읽으세요. 저장소에 포함되지 않는 계정·키,
> 두 플랫폼 동시 전환 순서와 실기기 확인표가 정리되어 있습니다.

최초 프로젝트의 공개 귀속과 라이선스 상태는 [NOTICE.md](./NOTICE.md)를 확인하세요.

## 준비 사항

- Node.js 22.13 이상
- Supabase 프로젝트
- Expo 계정
- iPhone 실기기 배포/TestFlight용 Apple Developer 계정
- iOS 16.4 이상 iPhone
- Android 7.0(API 24) 이상 휴대폰
- 기존 Android 앱을 업데이트한다면 친구가 쓰던 EAS 프로젝트와 Android 서명키

## 1. 설치와 기본 검사

```bash
npm ci
npm test
npm run check
```

`npm run check`는 TypeScript와 Expo 프로젝트 설정을 함께 검사합니다.

## 2. Supabase 연결

새 프로젝트라면 SQL Editor에서 아래 파일을 순서대로 실행합니다.

1. `supabase/migrations/0001_init.sql`
2. `supabase/migrations/0002_ios_and_security_hardening.sql`
3. `supabase/migrations/0003_atomic_account_deletion.sql`

이미 0001을 적용한 프로젝트도 반드시 0002와 0003을 순서대로 추가 실행해야
합니다. 0002는 멤버십 RLS 우회, 재사용 가능한 초대 코드, 노출되던 푸시 토큰을
수정합니다. 기존에 한 사용자가 여러 공간에 속했거나 한 공간에 세 명 이상이 있으면
0002가 안전하게 중단되므로, 표시되는 진단에 따라 기존 멤버십을 먼저 정리하세요.
구버전 푸시 토큰은 안전한 소유자를 판별할 수 없어 폐기되며 각 기기에서 다시
등록됩니다. 0003은 계정 삭제와 캘린더 소유권 이전을 한 트랜잭션으로 묶습니다.

Supabase의 **Authentication > Providers > Email**을 활성화합니다. 운영 환경에서는
이메일 확인을 끄지 않는 것을 권장합니다.

`.env.example`을 `.env`로 복사한 뒤 프로젝트 값을 입력합니다.

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
EXPO_PUBLIC_PRIVACY_POLICY_URL=
EXPO_PUBLIC_SUPPORT_URL=
```

마지막 두 값에는 로그인 없이 접속할 수 있는 실제 HTTPS
개인정보처리방침과 지원 페이지 주소를 입력해야 합니다. 미설정 또는
잘못된 주소는 앱에서 임의로 열지 않고 `준비 중` 안내를 표시합니다.

Supabase 두 값이 없으면 앱이 종료되는 대신 연결 설정 안내 화면을
표시합니다. 연결 확인은
다음 명령으로 할 수 있습니다.

```bash
npm run smoke
```

## 3. iPhone과 Android에서 개발 실행

개발 서버는 다음 명령으로 실행합니다.

```bash
npm start
```

SDK 전환기에는 스토어의 Expo Go가 이 프로젝트의 SDK 56과 맞지 않을 수 있습니다.
Android 원격 푸시는 Expo Go에서 동작하지 않으므로 두 플랫폼 모두 아래 EAS
`preview` 빌드로 최종 확인하는 것을 권장합니다.

로컬 네이티브 실행은 다음 명령을 사용합니다. iOS는 Xcode와 CocoaPods, Android는
Android Studio·SDK·JDK가 필요합니다.

```bash
npm run ios
npm run android
```

네이티브 도구가 없어도 양쪽 JavaScript 번들은 확인할 수 있습니다.

```bash
npm run export:ios
npm run export:android
```

원격 푸시는 EAS로 만든 실제 앱 빌드에서 확인하세요.

## 4. Expo/EAS 프로젝트 연결

먼저 친구가 기존 Android 앱을 만들 때 사용한 Expo/EAS 프로젝트가 있는지
확인하세요. 기존 프로젝트를 그대로 쓰면 EAS `projectId`, 빌드 기록과 관리형
Android keystore를 이어받기 쉬우므로 우선 연결하는 것을 권장합니다. 별도로
동일한 keystore를 안전하게 보유한 경우 새 EAS 프로젝트도 기술적으로 가능하지만,
기존 설치본 업데이트와 푸시 설정을 모두 다시 검증해야 합니다. 신규 프로젝트일
때만 아래 초기화를 진행합니다.

```bash
npx eas-cli@latest login
npx eas-cli@latest init
```

`eas init`이 실제 EAS `projectId`를 기록합니다. 이 값이 없으면 앱은
일정 기능은 사용할 수 있지만 원격 푸시 토큰 등록은 건너뜁니다.

EAS 대시보드의 development, preview, production 환경에 아래 네 값을 각각
등록합니다. `.env`는 빌드 서버로 업로드되지 않습니다.

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_PRIVACY_POLICY_URL`
- `EXPO_PUBLIC_SUPPORT_URL`

Apple 자격 증명과 APNs 키는 첫 iOS 빌드 과정에서 EAS 안내에 따라 연결합니다.

### Android Firebase/FCM 연결

Android 원격 푸시에는 Firebase에 패키지명 `com.couplecalander.app`으로 등록한
앱의 `google-services.json`과 EAS의 FCM V1 서비스 계정 키가 필요합니다.

- 로컬 네이티브 빌드에서는 `google-services.json`을 프로젝트 루트에 두면
  `app.config.js`가 자동으로 연결합니다. 이 파일은 Git에서 제외됩니다.
- EAS 클라우드 빌드에서는 `GOOGLE_SERVICES_JSON`이라는 **File** 환경 변수로
  등록하는 방법을 권장합니다.
- `npx eas-cli@latest credentials -p android`에서 기존 FCM V1 서비스 계정 키를
  선택하거나 등록합니다.
- FCM 서비스 계정의 비공개 키 JSON은 저장소나 친구에게 보낼 압축 파일에 넣지
  마세요.

## 5. iPhone과 Android 배포

등록한 테스트 iPhone에 직접 설치하는 내부 빌드:

```bash
npx eas-cli@latest device:create
npx eas-cli@latest build --profile preview --platform ios
```

친구 Android 휴대폰에 직접 설치할 APK:

```bash
npx eas-cli@latest build --profile preview --platform android
```

iOS Simulator 전용 클라우드 빌드:

```bash
npx eas-cli@latest build --profile development --platform ios
```

TestFlight와 Google Play용 빌드는 `preview`가 아니라 `production`을 사용합니다.

```bash
npx eas-cli@latest build --profile production --platform ios
npx eas-cli@latest submit --profile production --platform ios
npx eas-cli@latest build --profile production --platform android
npx eas-cli@latest submit --profile production --platform android
```

Android `preview` 결과는 직접 설치 가능한 APK이고, `production` 결과는 Google
Play용 AAB입니다. EAS 클라우드 빌드는 Mac이 없어도 사용할 수 있습니다.

출시 전 `app.json`의 `ios.bundleIdentifier`가 본인 Apple 계정에서 소유 가능한 고유
값인지 확인하세요. 현재 식별자는 기존 Android 프로젝트와의 호환성을 위해 그대로
보존했습니다.

기존 Android 설치본 위에 업데이트하려면 `android.package`뿐 아니라 이전 빌드의
동일한 Android keystore와 기존 설치본보다 큰 `versionCode`가 필요합니다. 키를
찾을 수 없으면 기존 앱을 업데이트할 수 없고 삭제 후 새 앱으로 설치해야 할 수
있습니다. Google Play App Signing을 사용했다면 앱 서명키와 업로드 키를 구분해
확인하세요.

## 6. 푸시 알림과 계정 삭제 배포

로컬 일정 리마인더는 기기에서 예약됩니다. 상대의 일정 변경 푸시를 사용하려면
강한 임의 문자열을 `WEBHOOK_SECRET`으로 정한 뒤 Edge Function에 등록합니다.

```bash
supabase secrets set WEBHOOK_SECRET=여기에_충분히_긴_임의_문자열
supabase functions deploy notify-event --no-verify-jwt
```

Supabase **Database > Webhooks**에서 `events` 테이블의 INSERT/UPDATE를
`notify-event`로 보내고, 요청 헤더에 다음 값을 추가합니다.

```text
x-webhook-secret: 위에서_등록한_동일한_문자열
```

함수는 이 비밀값을 검사하고, 웹훅 본문 대신 DB의 실제 일정을 다시 조회한 뒤
푸시를 보냅니다.

App Store의 앱 내 계정 삭제 요구사항을 지원하려면 인증 검증을 유지한 상태로 다음
함수도 배포합니다.

```bash
supabase functions deploy delete-account
```

0003 적용 후 공간 소유자가 탈퇴하면 같은 사용자 삭제 트랜잭션에서 상대에게
소유권을 이전합니다. 혼자 쓰던 공간은 계정과 함께 삭제됩니다.

## 7. 사용 흐름

1. 각자 이메일과 비밀번호로 가입 또는 로그인
2. 한 명이 새 캘린더 생성
3. 설정에서 12자리 일회용 초대 코드를 생성해 공유
4. 상대가 초대 코드로 참여
5. 일정 추가/수정 후 실시간 동기화와 알림 확인

한 사용자는 한 공간, 한 공간은 최대 두 명으로 제한됩니다.

### 두 플랫폼을 함께 전환하는 순서

`0002`는 보안을 위해 초대·색상·푸시 API를 변경하므로 친구의 구형 Android
바이너리와 완전히 호환되지 않습니다.

1. 이 수정본으로 Android APK와 iPhone 빌드를 먼저 준비
2. Supabase 데이터를 백업하고 `0002`, `0003`을 순서대로 적용
3. 두 사람 모두 새 빌드를 설치해 같은 Supabase URL·키로 로그인
4. Android에서 새 12자리 초대, 색상 변경, 로컬 알림, 상대 변경 푸시 확인

마이그레이션만 먼저 적용한 채 친구가 구형 Android 앱을 계속 쓰면 초대·색상·푸시
기능이 실패할 수 있습니다.

## 8. 프로젝트 구조

```text
app/                         Expo Router 화면
  (auth)/login.tsx           로그인/가입
  (onboarding)/setup.tsx     공간 생성/참여
  (app)/calendar.tsx         달력/목록
  (app)/settings.tsx         프로필/알림/계정 삭제
  (app)/event/               일정 CRUD
src/
  components/                공용 화면 컴포넌트
  lib/                       인증, Supabase, 알림, 날짜, 공간 상태
  types/                     DB 타입
supabase/
  migrations/                초기 스키마 + 보안 강화
  functions/notify-event/    상대 일정 변경 푸시
  functions/delete-account/  인증된 본인 계정 삭제
tests/                       핵심 날짜 로직 테스트
```

## 9. App Store 제출 전 외부 준비

코드 밖에서 다음 작업이 남습니다.

- App Store Connect 앱 생성 및 고유 Bundle ID 확정
- 기존 Android EAS 프로젝트·keystore·Firebase 프로젝트 연결 확인
- 로그인 없이 열리는 공개 HTTPS 개인정보처리방침과 지원
  페이지 준비
- 두 URL을 EAS 운영 환경의 `EXPO_PUBLIC_PRIVACY_POLICY_URL`,
  `EXPO_PUBLIC_SUPPORT_URL`에 등록하고 앱 설정 화면에서 열리는지 확인
- 동일한 개인정보처리방침 URL과 지원 URL을 App Store Connect에도 등록
- App Privacy에 이메일, 사용자 ID, 이름, 일정/메모/장소, 푸시 토큰 신고
- 심사용 데모 계정 두 개와 초대/페어링 방법을 Review Notes에 작성
- 실제 iPhone과 Android에서 가입, 초대, CRUD, 로컬/원격 알림, 계정 삭제 확인

현재 알려진 기술 부채와 코드 평가는 `CODE_REVIEW.md`에 정리되어 있습니다.
