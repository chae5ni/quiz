# 1-Minute IT Quiz MVP

매일 5문제를 자동 생성하고, 사용자가 원하면 무제한으로 더 풀 수 있는 `1분 IT 퀴즈` MVP입니다.

## 실행

```bash
py -3 main.py
```

브라우저에서 `http://127.0.0.1:8080/index.html` 이 열립니다.

## 로컬 설정

프론트엔드:

- [index.html](C:\Users\1aa20\OneDrive\문서\New project 5\index.html:15)의 `window.SUPABASE_PUBLISHABLE_KEY`에 Publishable key를 넣으세요.

백엔드 / GitHub Actions:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY` 또는 `SUPABASE_KEY`
- `GEMINI_API_KEY`

로컬에서 생성기만 실행하려면:

```bash
set SUPABASE_URL=https://inpozrhlofyhenqfucy.supabase.co
set SUPABASE_SERVICE_KEY=여기에_service_role_key
set GEMINI_API_KEY=여기에_gemini_key
py -3 main.py generate
```

## 동작 방식

- Daily 모드: 오늘 생성된 문제 5개를 순서대로 불러옵니다.
- Infinite 모드: Daily 5를 다 풀면 최신 문제들을 섞어서 계속 이어서 풉니다.
- GitHub Actions: 매일 아침 `main.py generate`를 실행해 Supabase에 5문제를 저장합니다.

## 필요한 테이블 컬럼 예시

- `id`
- `question`
- `answer`
- `explanation`
- `category`
- `difficulty`
- `choices`
- `batch_id`
- `daily_order`
- `created_at`
