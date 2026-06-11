#!/usr/bin/env python3
"""Minimal in-memory mock of the Call Capture Protocol v1 (docs/CALL-CAPTURE-PROTOCOL.md)
for testing the helper without a real CRM.

    python3 scripts/mock-crm.py [--port 8899] [--token agbcap_test] [--drop-seq N]

    --drop-seq N   pretend chunk N was never received, so the first finalize
                   returns 409 {missing:[N]} (exercises the re-upload path).

Then:
    export AGB_CRM_URL=http://127.0.0.1:8899
    export AGB_CRM_TOKEN=agbcap_test
    .build/debug/AGBCaptureHelper --simulate test.wav
"""
import argparse
import json
import re
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer

SESSIONS = {}  # sessionId -> {"chunks": {seq: nbytes}, "meta": {...}, "finalized": bool}
ARGS = None


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        print("[mock-crm]", fmt % args)

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _authed(self):
        auth = self.headers.get("Authorization", "")
        if auth != f"Bearer {ARGS.token}":
            self._json(401, {"ok": False, "error": "bad token"})
            return False
        return True

    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        return self.rfile.read(length) if length else b""

    def do_GET(self):
        if not self._authed():
            return
        if self.path == "/api/capture/ping":
            self._json(200, {"ok": True, "workspaceId": "ws-mock", "userId": "u-mock",
                             "retentionDays": 30})
        else:
            self._json(404, {"ok": False})

    def do_POST(self):
        if not self._authed():
            return
        body = self._read_body()

        if self.path == "/api/capture/sessions":
            meta = json.loads(body or b"{}")
            session_id = f"mock-{uuid.uuid4().hex[:8]}"
            SESSIONS[session_id] = {"chunks": {}, "meta": meta, "finalized": False}
            print(f"[mock-crm] session {session_id} created: {meta}")
            self._json(201, {"sessionId": session_id})
            return

        m = re.match(r"^/api/capture/sessions/([^/]+)/finalize$", self.path)
        if m:
            session = SESSIONS.get(m.group(1))
            if not session:
                self._json(404, {"ok": False})
                return
            fin = json.loads(body or b"{}")
            total = fin.get("totalChunks", 0)
            have = set(session["chunks"])
            missing = sorted(set(range(total)) - have)
            if missing:
                print(f"[mock-crm] finalize 409, missing {missing}")
                self._json(409, {"missing": missing})
                return
            session["finalized"] = True
            nbytes = sum(session["chunks"].values())
            print(f"[mock-crm] finalized {m.group(1)}: {total} chunks, {nbytes} bytes, "
                  f"partial={fin.get('partial')}")
            self._json(200, {
                "ok": True,
                "recordingId": f"rec-{uuid.uuid4().hex[:8]}",
                "title": "Mock call with Carlos",
                "brief": f"Mock brief: {total} chunks / {fin.get('durationSecs')}s "
                         f"(partial={fin.get('partial')}).",
                "actionItemCount": 2,
                "contact": {"id": "c-1", "name": "Carlos"},
                "suspectFlags": [],
            })
            return

        self._json(404, {"ok": False})

    def do_PUT(self):
        if not self._authed():
            return
        m = re.match(r"^/api/capture/sessions/([^/]+)/chunks/(\d+)$", self.path)
        if not m:
            self._json(404, {"ok": False})
            return
        session = SESSIONS.get(m.group(1))
        if not session or session["finalized"]:
            self._read_body()
            self._json(404, {"ok": False})
            return
        seq = int(m.group(2))
        body = self._read_body()
        if len(body) > 4 * 1024 * 1024:
            self._json(413, {"ok": False})
            return
        if len(body) < 44 or body[0:4] != b"RIFF" or body[8:12] != b"WAVE":
            self._json(400, {"ok": False, "error": "not a WAV"})
            return
        if ARGS.drop_seq is not None and seq == ARGS.drop_seq and seq not in session["chunks"]:
            # Lie once: accept the upload but "lose" it (tests 409 recovery).
            print(f"[mock-crm] dropping chunk {seq} on purpose (--drop-seq)")
            ARGS.drop_seq = None
            self._json(200, {"ok": True, "bytes": len(body)})
            return
        session["chunks"][seq] = len(body)
        print(f"[mock-crm] chunk {seq}: {len(body)} bytes")
        self._json(200, {"ok": True, "bytes": len(body)})

    def do_DELETE(self):
        if not self._authed():
            return
        m = re.match(r"^/api/capture/sessions/([^/]+)$", self.path)
        if m and m.group(1) in SESSIONS:
            del SESSIONS[m.group(1)]
            print(f"[mock-crm] session {m.group(1)} abandoned + chunks deleted")
            self._json(200, {"ok": True})
        else:
            self._json(404, {"ok": False})


def main():
    global ARGS
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8899)
    parser.add_argument("--token", default="agbcap_test")
    parser.add_argument("--drop-seq", type=int, default=None)
    ARGS = parser.parse_args()
    server = HTTPServer(("127.0.0.1", ARGS.port), Handler)
    print(f"[mock-crm] listening on http://127.0.0.1:{ARGS.port} (token: {ARGS.token})")
    server.serve_forever()


if __name__ == "__main__":
    main()
