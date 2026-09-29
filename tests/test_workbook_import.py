import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class WorkbookImportTests(unittest.TestCase):
    def test_versioned_sources_join_into_one_32_item_catalog(self):
        source = json.loads((ROOT / "artwork_personality_assets_v1.json").read_text(encoding="utf-8"))
        imported = json.loads((ROOT / "database" / "artworks.json").read_text(encoding="utf-8"))
        self.assertEqual(source["version"], "V0.6")
        self.assertEqual(len(source["assets"]), 32)
        self.assertEqual(len(imported), 32)
        source_by_id = {item["type_id"]: item for item in source["assets"]}
        for item in imported:
            asset = source_by_id[item["type_id"]]
            self.assertEqual(item["dimensions"], asset["dimensions"])
            self.assertEqual(item["life_narrative"], asset["life_narrative"])
            self.assertEqual(item["hit_line"], asset["hit_line"])
            self.assertEqual(item["review_status"], asset["review_status"])


if __name__ == "__main__":
    unittest.main()
