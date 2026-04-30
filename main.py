from __future__ import annotations

import argparse
import http.server
import json
import os
import socketserver
import sys
import time
import webbrowser
from pathlib import Path
from typing import Any

try:
    from google import genai
except ImportError:  # pragma: no cover - optional dependency for local serving
    genai = None

try:
    from supabase import Client, create_client
except ImportError:  # pragma: no cover - optional dependency for local serving
    Client = Any  # type: ignore[assignment]
    create_client = None


HOST = "127.0.0.1"
PORT = 8080
ROOT = Path(__file__).resolve().parent
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://inpozrhlofyhenqfucy.supabase.co")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")


class AppRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


def get_supabase_client() -> Client:
    if create_client is None:
        raise RuntimeError("supabase 패키지가 없습니다. `pip install supabase`를 실행하세요.")
    if not SUPABASE_URL:
        raise RuntimeError("SUPABASE_URL 환경변수가 필요합니다.")
    if not SUPABASE_SERVICE_KEY:
        raise RuntimeError("SUPABASE_SERVICE_KEY 또는 SUPABASE_KEY 환경변수가 필요합니다.")
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def get_genai_client():
    if genai is None:
        raise RuntimeError("google-genai 패키지가 없습니다. `pip install google-genai`를 실행하세요.")
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY 환경변수가 필요합니다.")
    return genai.Client(api_key=GEMINI_API_KEY)


def normalize_generated_quiz(item: dict[str, Any], batch_id: str, position: int) -> dict[str, Any]:
    question = str(item.get("question", "")).strip()
    answer = str(item.get("answer", "")).strip().upper()
    explanation = str(item.get("explanation", "")).strip()
    category = str(item.get("category", "Daily IT")).strip() or "Daily IT"
    difficulty = str(item.get("difficulty", "Daily")).strip() or "Daily"

    if answer not in {"O", "X"}:
        raise ValueError(f"유효하지 않은 answer 값입니다: {answer}")
    if not question or not explanation:
        raise ValueError("question / explanation은 비어 있을 수 없습니다.")

    return {
        "question": question,
        "answer": answer,
        "explanation": explanation,
        "category": category,
        "difficulty": difficulty,
        "choices": ["O", "X"],
        "batch_id": batch_id,
        "daily_order": position,
    }


def generate_5_quizzes() -> list[dict[str, Any]]:
    client = get_genai_client()
    prompt = """
당신은 한국어 IT 퀴즈 에디터입니다.
오늘 앱에 넣을 O/X 퀴즈 5개를 JSON 배열로만 생성하세요.

규칙:
- 반드시 5개
- 한국어
- 최신 AI/개발 트렌드 또는 기초 CS 지식
- 너무 모호하거나 논쟁적인 문장 금지
- answer는 반드시 "O" 또는 "X"
- explanation은 2문장 이내
- category는 짧게, 예: "AI", "Web", "CS", "Cloud"
- difficulty는 "Easy", "Medium" 중 하나

응답 스키마:
[
  {
    "question": "문장",
    "answer": "O",
    "explanation": "해설",
    "category": "AI",
    "difficulty": "Easy"
  }
]
""".strip()

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config={
            "response_mime_type": "application/json",
            "response_json_schema": {
                "type": "array",
                "minItems": 5,
                "maxItems": 5,
                "items": {
                    "type": "object",
                    "required": ["question", "answer", "explanation", "category", "difficulty"],
                    "properties": {
                        "question": {"type": "string"},
                        "answer": {"type": "string", "enum": ["O", "X"]},
                        "explanation": {"type": "string"},
                        "category": {"type": "string"},
                        "difficulty": {"type": "string", "enum": ["Easy", "Medium"]},
                    },
                },
            }
        },
    )

    payload = json.loads(response.text)
    if not isinstance(payload, list) or len(payload) != 5:
        raise RuntimeError("Gemini 응답이 5개 퀴즈 배열이 아닙니다.")
    return payload


def generate_with_retry(max_retries: int = 3, delay_seconds: int = 10) -> list[dict[str, Any]]:
    last_error: Exception | None = None

    for attempt in range(1, max_retries + 1):
        try:
            return generate_5_quizzes()
        except Exception as error:  # pragma: no cover - depends on external API behavior
            last_error = error
            message = str(error)
            is_retryable = any(
                token in message for token in ("503", "UNAVAILABLE", "RESOURCE_EXHAUSTED", "429")
            )
            if not is_retryable or attempt == max_retries:
                raise

            print(
                f"Gemini 서버가 바쁜 상태입니다. "
                f"{attempt}/{max_retries} 재시도 후 {delay_seconds}초 대기합니다."
            )
            time.sleep(delay_seconds)

    if last_error is not None:
        raise last_error
    raise RuntimeError("퀴즈 생성 재시도 로직이 비정상 종료되었습니다.")


def save_quizzes_to_db(quizzes: list[dict[str, Any]]):
    supabase = get_supabase_client()
    batch_id = os.getenv("QUIZ_BATCH_ID")
    if not batch_id:
        from datetime import datetime, timezone

        batch_id = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    rows = [
        normalize_generated_quiz(item, batch_id=batch_id, position=index + 1)
        for index, item in enumerate(quizzes)
    ]
    return supabase.table("quizzes").insert(rows).execute()


def generate_and_save_quizzes() -> None:
    quizzes = generate_with_retry()
    save_quizzes_to_db(quizzes)
    print(f"Saved {len(quizzes)} quizzes to Supabase.")


def serve() -> None:
    with ReusableTCPServer((HOST, PORT), AppRequestHandler) as server:
        url = f"http://{HOST}:{PORT}/index.html"
        print("1-Minute IT Quiz MVP server is running.")
        print(f"Open: {url}")
        try:
            webbrowser.open(url)
        except Exception:
            pass
        server.serve_forever()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="1-Minute IT Quiz app server and generator")
    parser.add_argument(
        "command",
        nargs="?",
        choices=("serve", "generate"),
        default="serve",
        help="serve the local web app or generate quizzes into Supabase",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.command == "generate":
        generate_and_save_quizzes()
        return 0

    serve()
    return 0


if __name__ == "__main__":
    sys.exit(main())
