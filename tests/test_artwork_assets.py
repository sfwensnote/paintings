import json
import unittest
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]


class ArtworkAssetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.artworks = json.loads((ROOT / "database" / "artworks.json").read_text(encoding="utf-8"))

    def test_all_32_types_have_unique_ids_and_existing_local_artwork_images(self):
        expected = {f"T{number:02d}" for number in range(1, 33)}
        type_ids = [artwork["type_id"] for artwork in self.artworks]
        self.assertEqual(set(type_ids), expected)
        self.assertEqual(len(type_ids), len(expected))

        for artwork in self.artworks:
            with self.subTest(type_id=artwork["type_id"]):
                image_path = urlparse(artwork["image_url"]).path
                self.assertTrue(image_path.startswith("/paints/"))
                self.assertTrue((ROOT / image_path.lstrip("/")).is_file(), image_path)
                self.assertIn(artwork.get("image_layout"), {"fit", "panorama"})


if __name__ == "__main__":
    unittest.main()
