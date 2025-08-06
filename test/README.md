# Viber Test Suite

이 테스트 스위트는 Now 탭의 Token Limit 계산 로직 버그를 수정하기 위해 작성되었습니다.

## 테스트 파일 설명

### 1. `realtimeMonitor.test.js`
- **목적**: RealtimeMonitor 클래스의 핵심 로직 테스트
- **주요 테스트 케이스**:
  - `findCurrentSessionStart`: 세션 경계 찾기 로직
  - `calculateWindowUsage`: 5시간/주간 윈도우 사용량 계산
  - 5시간 이상 사용하지 않은 경우 0 반환 확인
  - 날짜 포맷팅 헬퍼 함수

### 2. `now.test.js`
- **목적**: NowManager UI 업데이트 로직 테스트
- **주요 테스트 케이스**:
  - 세션이 없을 때 0 표시
  - 세션이 5시간 이상 오래된 경우 처리
  - 활성 세션 데이터 표시
  - YYYY-MM-DD HH:MM:SS 날짜 형식
  - Progress bar 색상 변경 (safe/warning/danger)

### 3. `integration.test.js`
- **목적**: 전체 시나리오 통합 테스트
- **주요 테스트 케이스**:
  - 5시간 이상 비활성 상태 처리
  - 비활성에서 활성 상태로 전환
  - 정확한 5시간 갭 세션 경계 식별

## 테스트 실행 방법

```bash
cd test
npm install
npm test
```

## 테스트가 검증하는 주요 버그

1. **5시간 이상 사용하지 않은 경우**: Session Started와 Effective Used가 0이 아닌 값을 표시하는 문제
2. **날짜 형식**: 기존 형식에서 YYYY-MM-DD HH:MM:SS로 변경

## 예상 수정 사항

테스트를 통과하려면 다음 수정이 필요합니다:

1. `realtimeMonitor.js`:
   - `calculateWindowUsage`: 마지막 활동이 5시간/7일 이상 지난 경우 null 반환
   
2. `now.js`:
   - `formatDateTime` 헬퍼 함수 추가
   - `updateFiveHourWindow`/`updateWeeklyWindow`: 세션이 없을 때 "-" 표시