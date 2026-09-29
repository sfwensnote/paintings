"""Small stdlib H5/API server with SQLite persistence for the V1 product."""

from __future__ import annotations

import json
import mimetypes
import os
import re
import secrets
import sqlite3
import sys
from contextlib import contextmanager
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.assessment import MODEL_VERSION, load_question_set, score_answers  # noqa: E402
from backend.matching import DIMENSIONS, match_artworks  # noqa: E402

DB_PATH = Path(os.environ.get("ART_MUSEUM_DB", ROOT / "data" / "art_museum.sqlite3"))
APP_ENV = os.environ.get("APP_ENV", "development").lower()
ADMIN_TOKEN = os.environ.get("ART_ADMIN_TOKEN", "local-art-admin")
if APP_ENV == "production" and (ADMIN_TOKEN == "local-art-admin" or len(ADMIN_TOKEN) < 32):
    raise RuntimeError("Set ART_ADMIN_TOKEN to a random secret of at least 32 characters before production startup")
QUESTION_SET = load_question_set()
SCHEMA = (ROOT / "database" / "schema.sql").read_text(encoding="utf-8")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db


@contextmanager
def db_session():
    db = connect()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def parse_artwork(row: sqlite3.Row | dict) -> dict:
    item = dict(row)
    for key, target in (("dimensions_json", "dimensions"), ("keywords_json", "keywords")):
        item[target] = json.loads(item.pop(key))
    item.pop("updated_at", None)
    return item


def artwork_rows(db: sqlite3.Connection, include_drafts: bool = False) -> list[dict]:
    sql = "SELECT * FROM artworks" + ("" if include_drafts else " WHERE status='active'") + " ORDER BY artwork_id"
    return [parse_artwork(row) for row in db.execute(sql).fetchall()]


def current_artwork_version(db: sqlite3.Connection) -> str:
    row = db.execute("SELECT version FROM artwork_set_versions ORDER BY created_at DESC LIMIT 1").fetchone()
    return row["version"] if row else "A_V0.6"


def artwork_snapshot(db: sqlite3.Connection, version: str) -> list[dict]:
    row = db.execute("SELECT artworks_json FROM artwork_set_versions WHERE version=?", (version,)).fetchone()
    return json.loads(row["artworks_json"]) if row else artwork_rows(db)


def log_event(db: sqlite3.Connection, name: str, session_id: str | None = None,
              user_id: str | None = None, question_id: str | None = None, metadata: dict | None = None) -> None:
    db.execute("INSERT INTO events(session_id,user_id,event_name,question_id,metadata_json,created_at) VALUES(?,?,?,?,?,?)",
               (session_id, user_id, name, question_id, json.dumps(metadata or {}, ensure_ascii=False), now_iso()))


def bootstrap() -> None:
    db = connect()
    db.executescript(SCHEMA)
    artwork_columns = {row[1] for row in db.execute("PRAGMA table_info(artworks)")}
    for column, declaration in (("type_code", "TEXT"), ("culture_and_style", "TEXT"),
                                ("review_status", "TEXT NOT NULL DEFAULT 'pending_human_review'"),
                                ("image_layout", "TEXT NOT NULL DEFAULT 'fit'")):
        if column not in artwork_columns:
            db.execute(f"ALTER TABLE artworks ADD COLUMN {column} {declaration}")
    if db.execute("SELECT 1 FROM question_set_versions WHERE version=?", (QUESTION_SET["version"],)).fetchone() is None:
        db.execute("INSERT INTO question_set_versions(version,questions_json,created_at) VALUES(?,?,?)",
                   (QUESTION_SET["version"], json.dumps(QUESTION_SET, ensure_ascii=False), now_iso()))
    if db.execute("SELECT COUNT(*) FROM artworks").fetchone()[0] == 0:
        seeds = json.loads((ROOT / "database" / "artworks.json").read_text(encoding="utf-8"))
        for item in seeds:
            save_artwork(db, item)
        version = "A_V0.6"
        snapshot = json.dumps(artwork_rows(db), ensure_ascii=False)
        db.execute("INSERT INTO artwork_set_versions(version,artworks_json,created_at,published_by) VALUES(?,?,?,?)",
                   (version, snapshot, now_iso(), "seed"))
    db.commit()
    db.close()


def save_artwork(db: sqlite3.Connection, item: dict) -> None:
    required = ("artwork_id", "name_cn", "name_en", "artist_cn", "artist_en", "year", "dimensions",
                "keywords", "archetype_name", "hit_line", "life_narrative", "why_this_artwork", "art_context",
                "image_url", "image_source", "copyright_status", "status", "version")
    missing = [key for key in required if key not in item]
    if missing:
        raise ValueError(f"Missing fields: {', '.join(missing)}")
    if not set(item["dimensions"].keys()) == set(DIMENSIONS):
        raise ValueError("Artwork must have all five dimension values")
    for key in DIMENSIONS:
        value = item["dimensions"][key]
        if not isinstance(value, (int, float)) or not 0 <= value <= 100:
            raise ValueError(f"{key} must be between 0 and 100")
    columns = ("artwork_id", "type_id", "name_cn", "name_en", "artist_cn", "artist_en", "year", "dimensions_json",
               "keywords_json", "archetype_name", "hit_line", "life_narrative", "why_this_artwork", "art_context",
               "image_url", "image_source", "copyright_status", "image_layout", "status", "catalog_kind", "type_code", "culture_and_style",
               "review_status", "version", "updated_at")
    values = (item["artwork_id"], item.get("type_id"), item["name_cn"], item["name_en"], item["artist_cn"], item["artist_en"],
              item["year"], json.dumps(item["dimensions"], ensure_ascii=False), json.dumps(item["keywords"], ensure_ascii=False),
              item["archetype_name"], item["hit_line"], item["life_narrative"], item["why_this_artwork"], item["art_context"],
              item["image_url"], item["image_source"], item["copyright_status"], item.get("image_layout", "fit"), item["status"], item.get("catalog_kind", "formal"),
              item.get("type_code"), item.get("culture_and_style", ""), item.get("review_status", "pending_human_review"),
              item["version"], now_iso())
    placeholders = ",".join("?" for _ in columns)
    updates = ",".join(f"{key}=excluded.{key}" for key in columns[1:])
    db.execute(f"INSERT INTO artworks({','.join(columns)}) VALUES({placeholders}) ON CONFLICT(artwork_id) DO UPDATE SET {updates}", values)


bootstrap()


class Handler(BaseHTTPRequestHandler):
    server_version = "CanvasPersona/1.0"

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"[{self.log_date_time_string()}] {fmt % args}")

    def send_json(self, data: object, status: int = 200) -> None:
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def read_json(self) -> dict | list:
        length = int(self.headers.get("Content-Length", "0"))
        if length > 2_000_000:
            raise ValueError("Request body is too large")
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def require_admin(self) -> bool:
        if secrets.compare_digest(self.headers.get("X-Admin-Token", ""), ADMIN_TOKEN):
            return True
        self.send_json({"error": "请输入有效的管理口令。"}, 401)
        return False

    def do_GET(self) -> None:
        path = unquote(urlparse(self.path).path)
        if path == "/api/health":
            return self.send_json({"status": "ok", "question_set_version": QUESTION_SET["version"]})
        if path == "/api/questions":
            return self.send_json(QUESTION_SET)
        if path == "/api/catalog":
            with db_session() as db:
                artworks = artwork_rows(db)
                version = current_artwork_version(db)
            return self.send_json({"version": version, "artwork_count": len(artworks),
                                       "demo_count": sum(a["catalog_kind"] == "demo" for a in artworks),
                                       "formal_count": sum(a["catalog_kind"] == "formal_seed" for a in artworks),
                                       "pending_review_count": sum(a.get("review_status") == "pending_human_review" for a in artworks)})
        match = re.fullmatch(r"/api/session/([a-zA-Z0-9-]+)", path)
        if match:
            with db_session() as db:
                row = db.execute("SELECT * FROM sessions WHERE session_id=?", (match.group(1),)).fetchone()
                if not row:
                    return self.send_json({"error": "Session not found"}, 404)
                if row["completed_at"]:
                    return self.session_result(db, row)
                return self.send_json({"session_id": row["session_id"], "answers": json.loads(row["answers_json"])})
        if path.startswith("/api/share/"):
            share_id = path.rsplit("/", 1)[-1]
            with db_session() as db:
                row = db.execute("SELECT * FROM sessions WHERE share_id=? AND completed_at IS NOT NULL", (share_id,)).fetchone()
                if not row:
                    return self.send_json({"error": "这张结果卡片不存在或已经失效。"}, 404)
                artwork = next(a for a in artwork_snapshot(db, row["artwork_set_version"]) if a["artwork_id"] == row["primary_artwork_id"])
                return self.send_json({"artwork": artwork, "similarity": json.loads(row["similarity_scores_json"])[0]["similarity"]})
        if path.startswith("/api/admin/"):
            if not self.require_admin():
                return
            return self.admin_get(path)
        if path == "/" or path == "/index.html":
            return self.send_file(ROOT / "frontend" / "index.html")
        if path == "/admin" or path == "/admin/":
            return self.send_file(ROOT / "admin" / "index.html")
        if path == "/sw.js":
            return self.send_file(ROOT / "frontend" / "sw.js")
        if path.startswith("/frontend/") or path.startswith("/admin/") or path.startswith("/paints/") or path in ("/manifest.webmanifest", "/sw.js"):
            target = (ROOT / path.lstrip("/")).resolve()
            if ROOT not in target.parents or not target.is_file():
                return self.send_json({"error": "Not found"}, 404)
            return self.send_file(target)
        return self.send_json({"error": "Not found"}, 404)

    def send_file(self, path: Path) -> None:
        try:
            payload = path.read_bytes()
        except OSError:
            return self.send_json({"error": "Not found"}, 404)
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        if path.suffix == ".js":
            content_type = "text/javascript"
        if path.suffix == ".webmanifest":
            content_type = "application/manifest+json"
        self.send_response(200)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8" if content_type.startswith("text/") or "json" in content_type else content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def admin_get(self, path: str) -> None:
        with db_session() as db:
            if path == "/api/admin/artworks":
                return self.send_json({"artworks": artwork_rows(db, include_drafts=True), "current_version": current_artwork_version(db)})
            if path == "/api/admin/questions":
                return self.send_json(QUESTION_SET)
            if path == "/api/admin/analytics":
                totals = {r["event_name"]: r["n"] for r in db.execute("SELECT event_name,COUNT(*) n FROM events GROUP BY event_name")}
                ratings = db.execute("SELECT AVG(result_rating) average,COUNT(result_rating) count FROM sessions").fetchone()
                completed = db.execute("SELECT COUNT(*) FROM sessions WHERE completed_at IS NOT NULL").fetchone()[0]
                return self.send_json({"events": totals, "completed": completed,
                                       "rating_average": round(ratings["average"], 2) if ratings["average"] is not None else None,
                                       "rating_count": ratings["count"]})
            if path == "/api/admin/versions":
                return self.send_json({"artwork_sets": [dict(r) for r in db.execute("SELECT version,created_at,published_by FROM artwork_set_versions ORDER BY created_at DESC")],
                                       "question_sets": [dict(r) for r in db.execute("SELECT version,created_at FROM question_set_versions ORDER BY created_at DESC")]})
        return self.send_json({"error": "Not found"}, 404)

    def do_POST(self) -> None:
        path = unquote(urlparse(self.path).path)
        try:
            body = self.read_json()
            if path == "/api/session":
                return self.create_session(body)
            if path == "/api/event":
                return self.create_event(body)
            match = re.fullmatch(r"/api/session/([a-zA-Z0-9-]+)/(answer|complete|rating|share)", path)
            if match:
                session_id, action = match.groups()
                return {"answer": self.answer, "complete": self.complete, "rating": self.rating, "share": self.share}[action](session_id, body)
            if path.startswith("/api/admin/"):
                if not self.require_admin():
                    return
                if path == "/api/admin/artworks/save":
                    return self.admin_save(body)
                if path == "/api/admin/artworks/import":
                    return self.admin_import(body)
                if path == "/api/admin/publish":
                    return self.admin_publish()
        except (ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
            return self.send_json({"error": str(error)}, 400)
        return self.send_json({"error": "Not found"}, 404)

    def create_session(self, body: dict) -> None:
        session_id = str(body.get("session_id") or secrets.token_urlsafe(18))
        user_id = str(body.get("user_id") or secrets.token_urlsafe(12))
        timestamp = now_iso()
        with db_session() as db:
            existing = db.execute("SELECT session_id FROM sessions WHERE session_id=?", (session_id,)).fetchone()
            if not existing:
                db.execute("INSERT INTO sessions(session_id,user_id,question_set_version,question_order_version,scoring_model_version,artwork_set_version,artwork_vector_version,report_version,answers_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                           (session_id, user_id, QUESTION_SET["version"], QUESTION_SET["order_version"], MODEL_VERSION,
                            current_artwork_version(db), "AV_V0.6", "R_V1.0", "{}", timestamp, timestamp))
                log_event(db, "start_test", session_id, user_id)
            return self.send_json({"session_id": session_id, "user_id": user_id})

    def answer(self, session_id: str, body: dict) -> None:
        qid, option_id = body.get("question_id"), body.get("option_id")
        question = next((item for item in QUESTION_SET["questions"] if item["id"] == qid), None)
        if not question or option_id not in question["score_map"]:
            raise ValueError("This question or answer is not part of the active question set")
        with db_session() as db:
            row = db.execute("SELECT * FROM sessions WHERE session_id=?", (session_id,)).fetchone()
            if not row:
                return self.send_json({"error": "Session not found"}, 404)
            if row["completed_at"]:
                return self.send_json({"error": "This assessment is already complete"}, 409)
            answers = json.loads(row["answers_json"])
            answers[qid] = {"option_id": option_id, "raw_score": question["score_map"][option_id]}
            db.execute("UPDATE sessions SET answers_json=?,updated_at=? WHERE session_id=?",
                       (json.dumps(answers, ensure_ascii=False), now_iso(), session_id))
            db.execute("INSERT INTO answers(session_id,question_id,answer_option,raw_score,created_at) VALUES(?,?,?,?,?) ON CONFLICT(session_id,question_id) DO UPDATE SET answer_option=excluded.answer_option,raw_score=excluded.raw_score,created_at=excluded.created_at",
                       (session_id, qid, option_id, question["score_map"][option_id], now_iso()))
            log_event(db, "question_answer", session_id, row["user_id"], qid, {"option_id": option_id, "raw_score": question["score_map"][option_id]})
            return self.send_json({"saved": True})

    def complete(self, session_id: str, _body: dict) -> None:
        with db_session() as db:
            row = db.execute("SELECT * FROM sessions WHERE session_id=?", (session_id,)).fetchone()
            if not row:
                return self.send_json({"error": "Session not found"}, 404)
            if row["completed_at"]:
                return self.session_result(db, row)
            stored = json.loads(row["answers_json"])
            answers = {qid: answer["option_id"] for qid, answer in stored.items()}
            version_row = db.execute("SELECT questions_json FROM question_set_versions WHERE version=?", (row["question_set_version"],)).fetchone()
            historical_question_set = json.loads(version_row["questions_json"]) if version_row else QUESTION_SET
            try:
                calculation = score_answers(answers, historical_question_set)
            except ValueError as error:
                return self.send_json({"error": str(error), "missing": sorted({q["id"] for q in QUESTION_SET["questions"]} - answers.keys())}, 422)
            source_artworks = artwork_snapshot(db, row["artwork_set_version"])
            matches = match_artworks(calculation["scores"], source_artworks)
            if not matches:
                return self.send_json({"error": "当前作品库还没有可匹配的作品。"}, 503)
            share_id = secrets.token_urlsafe(18)
            created = datetime.fromisoformat(row["created_at"])
            elapsed = max(1, int((datetime.now(timezone.utc) - created).total_seconds()))
            similarities = [{"artwork_id": item["artwork"]["artwork_id"], "similarity": item["similarity"], "distance": round(item["distance"], 5)} for item in matches]
            db.execute("UPDATE sessions SET share_id=?,scores_json=?,type_id=?,primary_artwork_id=?,secondary_artwork_ids_json=?,similarity_scores_json=?,completion_time_seconds=?,completed_at=?,updated_at=? WHERE session_id=?",
                       (share_id, json.dumps(calculation, ensure_ascii=False), calculation["type_id"], matches[0]["artwork"]["artwork_id"],
                        json.dumps([i["artwork"]["artwork_id"] for i in matches[1:]]), json.dumps(similarities), elapsed,
                        now_iso(), now_iso(), session_id))
            log_event(db, "test_complete", session_id, row["user_id"], metadata={"type_id": calculation["type_id"]})
            result_row = db.execute("SELECT * FROM sessions WHERE session_id=?", (session_id,)).fetchone()
            return self.session_result(db, result_row)

    def session_result(self, db: sqlite3.Connection, row: sqlite3.Row) -> None:
        if not row["scores_json"]:
            return self.send_json({"error": "Session has no computed result"}, 409)
        by_id = {a["artwork_id"]: a for a in artwork_snapshot(db, row["artwork_set_version"])}
        similarities = json.loads(row["similarity_scores_json"] or "[]")
        score_by_id = {item["artwork_id"]: item["similarity"] for item in similarities}
        ordered = [by_id[item["artwork_id"]] for item in similarities if item["artwork_id"] in by_id]
        return self.send_json({"session_id": row["session_id"], "share_id": row["share_id"], "calculation": json.loads(row["scores_json"]),
                               "primary": ordered[0] if ordered else None,
                               "top3": [{"artwork": item, "similarity": score_by_id[item["artwork_id"]]} for item in ordered],
                               "result_rating": row["result_rating"], "feedback_text": row["feedback_text"],
                               "artwork_set_version": row["artwork_set_version"], "completion_time_seconds": row["completion_time_seconds"]})

    def rating(self, session_id: str, body: dict) -> None:
        rating = body.get("rating")
        if not isinstance(rating, int) or not 1 <= rating <= 5:
            raise ValueError("Rating must be from 1 to 5")
        feedback = str(body.get("feedback_text", ""))[:1000]
        with db_session() as db:
            row = db.execute("SELECT user_id FROM sessions WHERE session_id=? AND completed_at IS NOT NULL", (session_id,)).fetchone()
            if not row:
                return self.send_json({"error": "Completed session not found"}, 404)
            db.execute("UPDATE sessions SET result_rating=?,feedback_text=?,updated_at=? WHERE session_id=?", (rating, feedback, now_iso(), session_id))
            log_event(db, "result_rating", session_id, row["user_id"], metadata={"rating": rating, "feedback_text": feedback})
            return self.send_json({"saved": True})

    def share(self, session_id: str, _body: dict) -> None:
        with db_session() as db:
            row = db.execute("SELECT user_id FROM sessions WHERE session_id=? AND completed_at IS NOT NULL", (session_id,)).fetchone()
            if not row:
                return self.send_json({"error": "Completed session not found"}, 404)
            db.execute("UPDATE sessions SET share_event=share_event+1,updated_at=? WHERE session_id=?", (now_iso(), session_id))
            log_event(db, "share_click", session_id, row["user_id"])
            return self.send_json({"saved": True})

    def create_event(self, body: dict) -> None:
        event = str(body.get("event_name", ""))
        allowed = {"landing_view", "question_view", "question_back", "chapter_complete", "result_view", "share_success"}
        if event not in allowed:
            raise ValueError("Unknown analytics event")
        with db_session() as db:
            log_event(db, event, body.get("session_id"), body.get("user_id"), body.get("question_id"), body.get("metadata", {}))
        return self.send_json({"logged": True})

    def admin_save(self, body: dict | list) -> None:
        if not isinstance(body, dict):
            raise ValueError("Expected an artwork object")
        with db_session() as db:
            save_artwork(db, body)
        return self.send_json({"saved": True})

    def admin_import(self, body: dict | list) -> None:
        artworks = body.get("artworks") if isinstance(body, dict) else body
        if not isinstance(artworks, list):
            raise ValueError("Expected an array of artworks")
        with db_session() as db:
            for item in artworks:
                if not isinstance(item, dict):
                    raise ValueError("Each artwork must be an object")
                save_artwork(db, item)
        return self.send_json({"imported": len(artworks)})

    def admin_publish(self) -> None:
        with db_session() as db:
            all_active = artwork_rows(db)
            if not all_active:
                raise ValueError("At least one active artwork is required")
            current = current_artwork_version(db)
            match = re.search(r"(\d+)\.(\d+)", current)
            major, minor = (int(match.group(1)), int(match.group(2)) + 1) if match else (1, 1)
            version = f"A_V{major}.{minor}"
            snapshot = json.dumps(all_active, ensure_ascii=False)
            db.execute("INSERT INTO artwork_set_versions(version,artworks_json,created_at,published_by) VALUES(?,?,?,?)",
                       (version, snapshot, now_iso(), "admin"))
        return self.send_json({"published": version, "active_count": len(all_active)})


def main() -> None:
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"Canvas Persona is running at http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
