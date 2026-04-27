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

권한 문자열은 두 종류:
- **메뉴 접근**: `menu_users`, `menu_admin` (사이드바 링크 표시 여부)
- **기능 권한**: `reset_password`, `unlock`, `disable`, `admin`

세션에 comma-separated 문자열로 저장. 컨트롤러에서 `HasPerm()` 메서드로 확인.

**메뉴 표시 규칙**: `menu_*` 권한이 하나도 없으면 하위 호환으로 전체 메뉴 허용. 있으면 `menu_{key}` 권한이 있는 메뉴만 표시.  
**메뉴 동적 처리**: `app.js`의 `loadMe()`가 `id="menu-{key}"` 사이드바 링크를 자동 순회 — `menu-users` → `menu_users` 변환. 메뉴를 추가할 때 HTML에 `id="menu-{새키}"` 링크와 `operators.json`에 `menu_{새키}` 권한만 추가하면 됨.  
**자기 자신 권한 수정**: `AdminController.UpdateOperator`가 저장 후 현재 로그인 사용자와 일치하면 세션을 즉시 갱신(`sessionUpdated: true` 반환). 프론트엔드는 이를 받아 `loadMe()`를 재호출해 메뉴 즉시 반영.

### GraphApiClient 주의사항

- `$filter`와 `$orderby` 동시 사용 불가 → orderby 제거됨
- 그룹 멤버 조회: `/groups/{id}/members/microsoft.graph.user` (user 타입만 필터)
- 그룹 조회 후 계정/이름 필터는 C# 메모리 내 처리 (`FilterUsers`)
- Azure AD 필드 매핑: 직위→`jobTitle`, 직급→`title`
- `SearchUsersAsync` 내부에서 전체 조회용 URL 변수명은 `allUrl` (같은 메서드 내 하단의 `url`과 C# 7.3 스코프 충돌 방지)

### 데이터 파일

- `appsettings.json` — Azure AD 앱 등록 정보 (TenantId, ClientId, ClientSecret), 기본 비밀번호 (.gitignore 제외)
- `Data/operators.json` — 웹앱 관리자 계정 목록 (런타임에 읽기/쓰기, 테스트용으로 git 포함)

### 프론트엔드 구조

- `wwwroot/login.html` — 인라인 JS 포함 단독 로그인 페이지 (아이디 저장: localStorage)
- `wwwroot/index.html` — Bootstrap 5 레이아웃. 사이드바 링크 id 규칙: `menu-{key}`
- `wwwroot/js/app.js` — 모든 메인 페이지 로직. 주요 전역 변수: `allUsers[]`, `currentPage`, `PAGE_SIZE`, `sortField`, `sortDir`
- `wwwroot/css/style.css` — 레이아웃 및 애니메이션 (pageFadeIn, rowFadeIn)
- C# 코드 변경 시만 재빌드 필요, HTML/CSS/JS는 저장 후 브라우저 새로고침으로 반영

### 모바일 대응

- 사이드바: 모바일(≤767px)에서 `position: fixed` 오버레이. `.collapsed` 클래스는 데스크톱 전용(width 토글). 모바일은 `.open` 클래스로 `transform: translateX(0)` 전환.
- 테이블 컬럼 부서/직위/직급: `d-none d-md-table-cell`로 모바일 숨김 (thead와 tbody 모두 적용).
- `showPage()` / `toggleSidebar()` 내부에서 `window.innerWidth < 768`으로 분기.
