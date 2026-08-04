#!/usr/bin/env python3
"""Stub Telegram Bot API for the local compose environment.

TelegramOptions.ApiBase is overridable precisely so the bot flows can be driven
against something that isn't Telegram. Pointing TG_API_BASE here means /api/anon,
the outbox dispatcher and the weekly scheduler all run end to end with no BotFather
token, no admin chat, and no risk of a stray message reaching the real community.

Every call is echoed to stdout, so `docker compose logs -f tg-stub` is a readable
transcript of what the bot tried to send. Responses are the minimum shape the client
actually reads (see TelegramClient.MessageIdOf and StopPollAsync).

Stdlib only – it runs on a plain python image with nothing installed.
"""
import json
import re
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs

# /bot<token>/<method>
ROUTE = re.compile(r"^/bot(?P<token>[^/]+)/(?P<method>\w+)$")

_next_message_id = 1000


def _result_for(method, payload):
    """The `result` field Telegram would return for this method."""
    global _next_message_id

    if method in ("sendMessage", "editMessageText", "sendPoll", "sendPhoto"):
        _next_message_id += 1
        return {
            "message_id": _next_message_id,
            "date": int(time.time()),
            "chat": {"id": payload.get("chat_id"), "type": "supergroup"},
            "text": payload.get("text"),
        }

    if method == "stopPoll":
        # Deterministic vote counts so a dilemma reveal has something to render.
        return {"id": "stub-poll", "options": [
            {"text": "А", "voter_count": 7},
            {"text": "Б", "voter_count": 3},
            {"text": "В", "voter_count": 12},
        ]}

    # answerCallbackQuery, answerInlineQuery, setWebhook, … all return `true`.
    return True


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        match = ROUTE.match(self.path)
        if not match:
            return self._send(404, {"ok": False, "error_code": 404,
                                    "description": "Not Found: method not found"})

        method = match.group("method")
        payload = self._parse(self._read_body())

        # Readable transcript. Text is the interesting part; everything else is noise.
        summary = payload.get("text") or payload.get("question") or ""
        summary = summary.replace("\n", " ⏎ ")
        if len(summary) > 160:
            summary = summary[:157] + "…"
        print(f"→ {method:22} chat={payload.get('chat_id', '-')} {summary}", flush=True)

        self._send(200, {"ok": True, "result": _result_for(method, payload)})

    def _read_body(self):
        """Read the request body, chunked or not.

        HttpClient.PostAsJsonAsync streams the payload, so the request arrives with
        `Transfer-Encoding: chunked` and no Content-Length. BaseHTTPRequestHandler does
        not decode that for us – reading Content-Length alone yields an empty body and
        a transcript full of blanks.
        """
        if "chunked" in (self.headers.get("Transfer-Encoding") or "").lower():
            body = b""
            while True:
                size_line = self.rfile.readline().strip()
                size = int(size_line.split(b";")[0] or b"0", 16)
                if size == 0:
                    self.rfile.readline()   # consume the trailing CRLF
                    return body
                body += self.rfile.read(size)
                self.rfile.readline()       # CRLF after each chunk

        return self.rfile.read(int(self.headers.get("Content-Length") or 0))

    @staticmethod
    def _parse(raw):
        """Accept both wire formats: the current client posts JSON, Telebot posts a form."""
        if not raw:
            return {}
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except ValueError:
            return {k: v[0] for k, v in parse_qs(raw.decode("utf-8", "replace")).items()}

    def _send(self, status, body):
        blob = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(blob)))
        self.end_headers()
        self.wfile.write(blob)

    # The default handler logs every request to stderr; the transcript above is enough.
    def log_message(self, *args):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8081
    print(f"Telegram stub listening on :{port}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
