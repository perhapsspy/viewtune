# Chrome Web Store 릴리스

검증된 ViewTune 버전을 패키징해 기존 공개 항목에 업데이트로 제출하고, 문제가 있을 때 안전하게 중단하거나 복구하는 절차다.

현재 스토어 항목 ID는 `cglpigpdhbcbjgmlhkbmolgafdggbddb`이다. Developer Dashboard 화면과 정책은 바뀔 수 있으므로 제출 전에 [Chrome 공식 업데이트 절차](https://developer.chrome.com/docs/webstore/update)와 [검토 상태 안내](https://developer.chrome.com/docs/webstore/check-review)를 함께 확인한다.

## 준비 조건

- 배포 계정에 2단계 인증이 설정되어 있어야 한다.
- `manifest.json`과 `package.json`의 버전이 같고, 공개된 버전보다 커야 한다.
- `src/shared/constants.js`의 `BUILD_ID`가 새 버전으로 시작해야 한다.
- 작업트리의 변경 범위가 의도한 릴리스와 일치해야 한다.
- 스토어 설명·권한·개인정보 처리 내용이 실제 동작과 일치해야 한다.

## 릴리스 후보 만들기

1. 버전과 `BUILD_ID`를 갱신한다.
2. 사용자 기능, 지원 범위, 권한 또는 데이터 처리가 바뀌었다면 다음 소유 문서를 함께 갱신한다.

   - `release/store-listing-ko.md`
   - `release/store-listing-en.md`
   - `release/privacy-practices-ko.md`
   - `release/reviewer-instructions-ko.md`
   - `release/reviewer-instructions-en.md`

3. 자동 검증을 실행한다.

   ```powershell
   npm run check
   ```

4. [사이트 호환성 회귀 검사](compatibility-regression.md)를 완료한다.
5. 업로드 ZIP을 생성한다.

   ```powershell
   npm run package
   ```

6. `release/packages/viewtune-<version>.zip`이 생성됐는지 확인한다. 패키징 스크립트는 ZIP 최상위의 `manifest.json`, 한·영 locale, 개발 전용 파일 제외 여부를 검증한다.
7. 재현 가능한 인계를 위해 ZIP의 SHA-256과 크기를 기록한다.

   ```powershell
   Get-FileHash release/packages/viewtune-<version>.zip -Algorithm SHA256
   ```

8. 소스 변경을 커밋하고 공개 GitHub 저장소의 기본 브랜치에 푸시한다. ZIP 자체는 저장소에 커밋하지 않는다.

## Developer Dashboard 제출

1. 기존 ViewTune 항목의 **Package**에서 새 ZIP을 업로드한다.
2. 기능 설명이 바뀌었다면 **Store listing**의 한국어·영어 설명과 이미지를 확인한다.
3. 권한이나 데이터 처리가 바뀌었다면 **Privacy practices**와 개인정보처리방침 URL을 다시 확인한다.
4. 공개 범위를 바꾸려는 경우에만 **Distribution**을 수정한다. 기존 업데이트는 현재 공개 채널을 유지한다.
5. 검토자 안내가 실제 기본 단축키, 지원 사이트, 제한 사항과 일치하는지 확인한다.
6. 경고를 읽고 **Submit for Review**를 실행한다. 모든 `http`·`https` 페이지에서 동작하는 content script 범위 때문에 상세 검토가 길어질 수 있다.
7. 자동 게시 또는 검토 후 수동 게시 중 원하는 방식을 확인한다. 수동 게시를 선택하면 승인 후 30일 안에 게시해야 한다.

업데이트가 검토 중인 동안에는 기존 공개 버전이 계속 설치·사용된다. 새 버전은 승인과 게시가 끝난 뒤 사용자에게 전달된다.

## 게시 후 확인

1. Developer Dashboard에서 상태가 **Published**인지 확인한다.
2. 스토어 상세 페이지의 버전과 설명이 새 릴리스와 일치하는지 확인한다.
3. 스토어 설치본에서 팝업 버전, YouTube 속도 변경, `V`·`Esc`, `B`를 짧게 재검사한다.
4. 거절 또는 정책 경고가 있으면 Dashboard의 **Status**와 개발자 계정 이메일을 확인하고, 지적된 범위만 수정해 더 높은 버전으로 다시 제출한다.

## 중단과 복구

- 제출 전에 오류를 발견하면 ZIP을 폐기하고 수정·검증·패키징을 처음부터 반복한다. Dashboard가 해당 버전을 이미 초안으로 받아들였다면 다음 업로드에는 더 높은 버전을 사용한다.
- 검토 중 오류를 발견하면 Dashboard에서 검토를 취소해 초안으로 되돌린 뒤 수정본을 제출한다.
- 게시 후 중대한 회귀가 확인되면 [Chrome 공식 롤백 절차](https://developer.chrome.com/docs/webstore/rollback)를 사용한다. 롤백 후 후속 수정도 새 버전으로 정상 검토 절차를 거친다.
- 권한을 추가하면 사용자 재승인이 필요할 수 있다. 기능에 꼭 필요한 최소 권한인지 확인되지 않으면 제출을 중단한다.
- 서명 키나 계정 인증 정보는 저장소, ZIP 또는 작업 기록에 넣지 않는다.
