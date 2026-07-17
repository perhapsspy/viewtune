# ViewTune Chrome Web Store 제출 자료

이 디렉터리는 Chrome Web Store 공개와 업데이트에 필요한 입력 자료를 관리한다.

- `packages/`: 업로드용 ZIP. `manifest.json`이 ZIP 최상위에 있어야 한다.
- `store-assets/`: 스토어 아이콘·프로모션 이미지·스크린샷.
- `store-listing-ko.md`, `store-listing-en.md`: 한국어·영어 스토어 문구와 분류.
- `privacy-practices-ko.md`: Privacy practices 입력 초안과 권한 사유.
- `privacy-policy-ko.md`, `privacy-policy.html`: 공개 개인정보처리방침 원문.
- `reviewer-instructions-ko.md`, `reviewer-instructions-en.md`: 검토자용 재현 절차.
- `RELEASE_CHECKLIST.md`: 현재 릴리스 런북으로 이동하는 호환 경로.

업로드 ZIP은 저장소 루트에서 `npm run package`로 생성한다. 전체 제출·검증 순서는 [`docs/reference/runbooks/chrome-web-store-release.md`](../docs/reference/runbooks/chrome-web-store-release.md)를 따른다.
