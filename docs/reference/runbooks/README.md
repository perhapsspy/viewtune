# ViewTune 운영 런북

이 디렉터리는 ViewTune을 수정하고 검증하고 배포할 때 반복해서 사용하는 표준 절차를 관리한다. 제품 동작의 최종 소유자는 코드와 `manifest.json`이며, 이 문서들은 그 동작을 안전하게 다루는 순서와 중단 조건을 소유한다.

## 작업별 시작점

| 하려는 일 | 런북 |
| --- | --- |
| 로컬 코드를 Chrome에 다시 로드하고 변경을 확인한다 | [로컬 확장 개발 주기](local-extension-cycle.md) |
| YouTube·라프텔과 Netflix 방어 동작을 회귀 검사한다 | [사이트 호환성 회귀 검사](compatibility-regression.md) |
| 새 버전을 패키징하고 Chrome Web Store에 제출한다 | [Chrome Web Store 릴리스](chrome-web-store-release.md) |

## 문서 소유권

- 설치 방법과 사용자 기능 설명은 루트 [`README.md`](../../../README.md)가 소유한다.
- 스토어 입력용 문구와 자산은 [`release/`](../../../release/)가 소유한다.
- 현재 빌드·단축키·사이트 정책은 `manifest.json`, `src/shared/constants.js`, `src/content/site-policy.js`가 소유한다.
- Git으로 관리하지 않는 작업 메모·임시 증거·로컬 컨텍스트는 저장소의 `.local/` 아래에만 둔다. `docs/reference/`에는 공유할 현재 기준만 둔다.
- 실행 결과나 제출 진행 상황은 런북에 체크 표시로 누적하지 않는다. 해당 작업의 커밋, 이슈 또는 릴리스 기록에 남긴다.
