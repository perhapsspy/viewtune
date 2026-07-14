# ViewTune Chrome Web Store 제출 자료

이 디렉터리는 Chrome Web Store 첫 Public 제출에 필요한 로컬 산출물을 관리한다.

- `packages/`: 업로드용 ZIP. `manifest.json`이 ZIP 최상위에 있다.
- `store-assets/`: 스토어 아이콘·프로모션 이미지·스크린샷.
- `store-listing-ko.md`: 한국어 스토어 문구와 기본 분류.
- `privacy-practices-ko.md`: Privacy practices 입력 초안과 권한 사유.
- `privacy-policy-ko.md`, `privacy-policy.html`: 공개 HTTPS 주소에 게시할 개인정보처리방침 원문.
- `reviewer-instructions-ko.md`: 심사자용 재현 절차.
- `RELEASE_CHECKLIST.md`: 대시보드 수동 입력·제출 순서.

업로드 ZIP은 프로젝트 루트에서 `npm run package`로 다시 만들 수 있다. 공개 개인정보처리방침은 GitHub Pages의 `privacy-policy.html`을 기준으로 한다.
