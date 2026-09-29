"""Continuous five-dimensional artwork matching."""

from __future__ import annotations

import math

DIMENSIONS = ("connection", "structure", "affect", "exploration", "imagination")


def match_artworks(user_vector: dict[str, float], artworks: list[dict], limit: int = 3) -> list[dict]:
    candidates = []
    for artwork in artworks:
        if artwork.get("status") != "active":
            continue
        vector = artwork["dimensions"]
        distance = math.sqrt(sum(((user_vector[key] - vector[key]) / 100) ** 2 for key in DIMENSIONS) / 5)
        candidates.append({"artwork": artwork, "distance": distance, "similarity": round((1 - distance) * 100, 1)})
    candidates.sort(key=lambda item: (item["distance"], item["artwork"]["artwork_id"]))
    return candidates[:limit]
