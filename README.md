# 1-Minute IT Quiz MVP

토스 미니앱 스타일의 `1분 IT 퀴즈` 웹 MVP입니다.

## 포함 기능

- 오늘의 퀴즈 1개
- 스트릭(연속 참여 일수)
- 콤보 이펙트
- 오답 노트
- 공유용 결과 카드 이미지 저장
- 푸시/AI 자동화/랭킹을 고려한 확장 구조

## 실행 방법

```bash
python main.py
```

Windows에서 `python` 명령이 안 잡히면 아래처럼 실행하면 됩니다.

```bash
py -3 main.py
```

브라우저에서 `http://127.0.0.1:8080/index.html` 이 열립니다.

## Supabase 연결

- `index.html`에는 Supabase CDN이 연결되어 있습니다.
- `app.js`는 `quizzes` 테이블에서 가장 최근 퀴즈 1개를 읽어옵니다.
- 브라우저에서 아래처럼 Publishable key를 먼저 주입할 수 있습니다.

```html
<script>
  window.SUPABASE_PUBLISHABLE_KEY = "여기에 Publishable key";
</script>
```

- Python에서 DB 저장을 쓰려면 먼저 패키지를 설치하세요.

```bash
pip install supabase
```

- 그리고 Secret key는 소스에 직접 넣기보다 환경변수로 설정하는 편이 안전합니다.

```bash
set SUPABASE_URL=https://inpozrhlofyhenqfucy.supabase.co
set SUPABASE_SECRET_KEY=여기에_Secret_key
```

## 파일 구조

- `main.py`: 로컬 정적 서버
- `index.html`: 앱 화면
- `styles.css`: Toss-like UI 스타일
- `app.js`: 퀴즈 로직, 스트릭, 공유, 오답 노트
- `quiz-data.json`: 샘플 퀴즈 데이터

## MVP 동작 방식

- 날짜 기준으로 매일 다른 퀴즈 1개를 보여줍니다.
- 정답을 맞히면 스트릭과 콤보가 올라갑니다.
- 틀리면 오답 노트에 저장됩니다.
- 결과 카드는 PNG로 저장할 수 있습니다.

## 다음 단계 추천

1. `quiz-data.json` 대신 Supabase/Firebase DB 사용
2. 로그인 붙여서 사용자별 스트릭 동기화
3. OpenAI API로 매일 아침 퀴즈 자동 생성
4. 웹 푸시 또는 앱 푸시 연결
5. 친구 랭킹/정답률 리더보드 추가
