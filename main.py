from __future__ import annotations

import http.server
import os
import socketserver
import webbrowser
from pathlib import Path

try:
    from supabase import Client, create_client
except ImportError:  # pragma: no cover - optional dependency for local MVP
    Client = None
    create_client = None


HOST = "127.0.0.1"
PORT = 8080
ROOT = Path(__file__).resolve().parent
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://inpozrhlofyhenqfucy.supabase.co")
SUPABASE_SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY", "여기에_Secret_key를_넣으세요")


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
        raise RuntimeError(
            "supabase 패키지가 설치되지 않았습니다. `pip install supabase` 후 다시 시도하세요."
        )
    if not SUPABASE_SECRET_KEY or SUPABASE_SECRET_KEY == "여기에_Secret_key를_넣으세요":
        raise RuntimeError("SUPABASE_SECRET_KEY 환경변수를 설정해야 합니다.")
    return create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)


def save_quiz_to_db(quiz_data: dict):
    """Save a generated quiz record to the Supabase quizzes table."""
    supabase = get_supabase_client()
    response = supabase.table("quizzes").insert(quiz_data).execute()
    return response


def main() -> None:
    with ReusableTCPServer((HOST, PORT), AppRequestHandler) as server:
        url = f"http://{HOST}:{PORT}/index.html"
        print("1-Minute IT Quiz MVP server is running.")
        print(f"Open: {url}")
        try:
            webbrowser.open(url)
        except Exception:
            pass
        server.serve_forever()


if __name__ == "__main__":
    main()
