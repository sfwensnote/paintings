import json
import unittest
from pathlib import Path

from backend.matching import DIMENSIONS, match_artworks

ROOT = Path(__file__).resolve().parents[1]


class MatchingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.artworks = json.loads((ROOT / "database" / "artworks.json").read_text(encoding="utf-8"))

    def test_exact_vector_is_the_top_hit_and_top_three_are_stable(self):
        target = next(art for art in self.artworks if art["type_id"] == "T23")
        matches = match_artworks(target["dimensions"], self.artworks)
        self.assertEqual(len(matches), 3)
        self.assertEqual(matches[0]["artwork"]["type_id"], "T23")
        self.assertEqual(matches[0]["similarity"], 100.0)
        self.assertEqual([m["artwork"]["artwork_id"] for m in matches],
                         [m["artwork"]["artwork_id"] for m in match_artworks(target["dimensions"], self.artworks)])
        self.assertTrue(all(matches[i]["distance"] <= matches[i + 1]["distance"] for i in range(2)))

    def test_inactive_artwork_is_not_matched_and_dimensions_are_five_axis(self):
        vector = {dimension: 50 for dimension in DIMENSIONS}
        excluded = [{"artwork_id": "DRAFT", "status": "draft", "dimensions": vector}]
        self.assertEqual(match_artworks(vector, excluded), [])
        for artwork in self.artworks:
            self.assertEqual(set(artwork["dimensions"]), set(DIMENSIONS))

    def test_imported_v06_covers_all_32_types_and_preserves_review_flags(self):
        self.assertEqual({a["type_id"] for a in self.artworks}, {f"T{i:02d}" for i in range(1, 33)})
        self.assertTrue(all(a["review_status"] == "pending_human_review" for a in self.artworks))
        self.assertTrue(all(a["version"] == "A_V0.6" for a in self.artworks))


if __name__ == "__main__":
    unittest.main()
