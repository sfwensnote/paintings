"""Deterministic V1 scoring. The versioned question file is the source of truth."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
QUESTION_FILE = ROOT / "database" / "questions.json"
MODEL_VERSION = "S_V1.0"


def load_question_set() -> dict:
    return json.loads(QUESTION_FILE.read_text(encoding="utf-8"))


def score_answers(answers: dict[str, str], question_set: dict | None = None) -> dict:
    """Score all 25 answers, preserving raw totals and normalized one-decimal values."""
    question_set = question_set or load_question_set()
    questions = question_set["questions"]
    expected = {q["id"] for q in questions}
    missing = sorted(expected - answers.keys())
    if missing:
        raise ValueError(f"Missing answers: {', '.join(missing)}")
    unknown = sorted(answers.keys() - expected)
    if unknown:
        raise ValueError(f"Unknown questions: {', '.join(unknown)}")

    raw: dict[str, int] = {}
    for q in questions:
        choice = answers[q["id"]]
        if choice not in q["score_map"]:
            raise ValueError(f"Invalid option for {q['id']}: {choice}")
        dimension = q["dimension"]
        raw[dimension] = raw.get(dimension, 0) + q["score_map"][choice]
    scores = {dimension: round(total / 15 * 100, 1) for dimension, total in raw.items()}
    dimensions = ("connection", "structure", "affect", "exploration", "imagination")
    if set(scores) != set(dimensions):
        raise ValueError("Question set must map to the five fixed V1 dimensions")

    bits = "".join("1" if scores[key] >= 50 else "0" for key in dimensions)
    type_id = f"T{int(bits, 2) + 1:02d}"
    return {"raw_scores": raw, "scores": scores, "type_id": type_id}
