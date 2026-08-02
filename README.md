# Neon Pulse Protocol

오리지널 AI 생성 음악 3곡으로 즐기는 브라우저 기반 4레인 리듬 게임입니다.

## 현재 콘텐츠

- Circuit Bloom — melodic future bass
- Neon Pulse Protocol — electro synthwave
- Overclock Horizon — cyber drum & bass
- 곡별 EASY / NORMAL / HARD
- 키보드 `D F J K` 및 모바일 터치 입력
- PERFECT / GREAT / GOOD / MISS, EARLY / LATE 피드백
- 콤보, 점수, 오버드라이브, 최고 기록, FULL COMBO
- 난이도별 CORE INTEGRITY 체력과 GAME OVER
- 전 난이도 롱노트와 조기 해제 BREAK 판정
- 타격음, 모션 축소, 진동 설정

## 로컬 실행

Node.js 22.13 이상이 필요합니다.

```bash
npm install
npm run dev
```

## 품질 확인

```bash
npm run lint
npm test
```

`npm test`는 프로덕션 빌드 후 서버 렌더링, 세 곡의 오디오 에셋, 핵심 판정·설정·접근성 기능을 확인합니다.

## 주요 파일

- `app/page.tsx`: 게임 상태, 채보, 입력, 판정, 캔버스 렌더링
- `app/globals.css`: 전체 UI와 반응형 스타일
- `public/audio/`: 배포용 OGG 음원
- `docs/AI_PLAYTEST_REPORT.md`: 9명 AI 플레이테스트 및 개선 보고서

## 음악 권리 메모

세 곡은 Flow Music의 Lyria를 사용해 생성했습니다. 공개 또는 상업 출시 전 생성 당시 계정 플랜과 이용 약관, 생성 날짜를 별도 증빙으로 보관해야 합니다. 저장소의 음원 존재 자체가 제3자에게 이용 권리를 부여하지는 않습니다.

## 배포

이 프로젝트는 OpenAI Sites 설정인 `.openai/hosting.json`을 사용합니다. 현재 배포는 비공개 접근 정책을 유지합니다.
