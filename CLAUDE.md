# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

```bash
# VS 2017에서 F5 또는 터미널에서:
dotnet build
dotnet run
# → http://localhost:5000
```

.NET SDK 2.1만 설치된 환경이므로 `dotnet run`은 SDK 버전 문제로 실패할 수 있음. **VS 2017 Community에서 F5로 실행**하는 것이 표준 방법.

## 기술 스택

- **런타임**: .NET Framework 4.7.2 (`net472`)
- **프레임워크**: ASP.NET Core 2.1 (개별 패키지, `Microsoft.AspNetCore.App` 미사용)
- **인증**: Microsoft.Identity.Client (MSAL) — Client Credentials flow
- **Azure 연동**: Microsoft Graph REST API를 `HttpClient`로 직접 호출 (Graph SDK 미사용 — .NET Framework 비호환)
- **세션**: ASP.NET Core 분산 메모리 세션 (쿠키 기반)
- **프론트엔드**: 정적 HTML/JS (`wwwroot/`) — 재빌드 불필요
- **언어 버전**: C# 7.3 (`LangVersion` 고정) — `using var`, `switch expression` 등 C# 8+ 문법 사용 불가

## 아키텍처

```
요청 흐름:
브라우저 → Kestrel → Session → AuthMiddleware → StaticFiles/MVC → Controller → GraphApiClient → Microsoft Graph API
```

### 인증 구조 (2단계)

1. **웹앱 로그인** (`Data/operators.json`): 이 관리 도구에 로그인하는 IT 관리자 계정. `OperatorService`가 파일 I/O로 CRUD 관리.
2. **Azure AD 연동** (`appsettings.json` AzureAd 섹션): Graph API 호출용 Service Principal. `GraphApiClient`가 MSAL로 토큰 획득 후 캐싱.

`AuthMiddleware`는 `/api/auth/login`을 제외한 모든 `/api/*` 경로에 세션 검사 적용. HTML/정적 파일은 서버 사이드 보호 없음 — `app.js`가 페이지 로드 시 `/api/auth/me`를 호출해 클라이언트 사이드에서 리다이렉트.

### 권한 시스템

관리자별 권한 문자열: `reset_password`, `unlock`, `disable`, `admin`  
세션에 comma-separated 문자열로 저장. 컨트롤러에서 `HasPerm()` 메서드로 확인.  
프론트엔드는 `/api/auth/me` 응답의 `permissions` 배열로 버튼 표시/숨김.

### GraphApiClient 주의사항

- `$filter`와 `$orderby` 동시 사용 불가 → orderby 제거됨
- 그룹 멤버 조회: `/groups/{id}/members/microsoft.graph.user` (user 타입만 필터)
- 그룹 조회 후 계정/이름 필터는 C# 메모리 내 처리 (`FilterGroupMembers`)
- Azure AD 필드 매핑: 직위→`jobTitle`, 직급→`title`

### 데이터 파일

- `appsettings.json` — Azure AD 앱 등록 정보 (TenantId, ClientId, ClientSecret), 기본 비밀번호
- `Data/operators.json` — 웹앱 관리자 계정 목록 (런타임에 읽기/쓰기)

### 프론트엔드 구조

- `wwwroot/login.html` — 인라인 JS 포함 단독 로그인 페이지
- `wwwroot/index.html` — Bootstrap 5 탭 UI (사용자 관리, 관리자 설정)
- `wwwroot/js/app.js` — 모든 메인 페이지 로직 (검색, 상세 모달, 관리자 CRUD)
- C# 코드 변경 시만 재빌드 필요, HTML/CSS/JS는 저장 후 브라우저 새로고침으로 반영
