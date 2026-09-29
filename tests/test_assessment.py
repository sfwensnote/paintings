import json
import unittest
from pathlib import Path

from backend.assessment import load_question_set, score_answers

ROOT = Path(__file__).resolve().parents[1]


class AssessmentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.question_set = load_question_set()
        cls.questions = cls.question_set["questions"]

    def extreme_answers(self, high):
        answers = {}
        for question in self.questions:
            scores = question["score_map"]
            target = max(scores.values()) if high else min(scores.values())
            answers[question["id"]] = next(option for option, value in scores.items() if value == target)
        return answers

    def test_question_set_is_the_frozen_25_item_sequence(self):
        self.assertEqual(len(self.questions), 25)
        self.assertEqual([q["id"] for q in self.questions], [f"Q{i:02d}" for i in range(1, 26)])
        self.assertEqual([q["id"] for q in self.questions if q["score_map"] != {"A": 0, "B": 1, "C": 2, "D": 3}],
                         ["Q07", "Q09", "Q15", "Q16", "Q20"])

    def test_extremes_and_repeatability(self):
        low_answers, high_answers = self.extreme_answers(False), self.extreme_answers(True)
        low = score_answers(low_answers, self.question_set)
        high = score_answers(high_answers, self.question_set)
        self.assertEqual(set(low["raw_scores"].values()), {0})
        self.assertEqual(set(low["scores"].values()), {0.0})
        self.assertEqual(set(high["raw_scores"].values()), {15})
        self.assertEqual(set(high["scores"].values()), {100.0})
        self.assertEqual(score_answers(high_answers, self.question_set), high)

    def test_every_binary_type_is_reachable(self):
        for ordinal in range(32):
            bits = f"{ordinal:05b}"
            answers = {}
            for question in self.questions:
                position = ("connection", "structure", "affect", "exploration", "imagination").index(question["dimension"])
                high = bits[position] == "1"
                wanted = max(question["score_map"].values()) if high else min(question["score_map"].values())
                answers[question["id"]] = next(key for key, value in question["score_map"].items() if value == wanted)
            self.assertEqual(score_answers(answers, self.question_set)["type_id"], f"T{ordinal + 1:02d}")

    def test_missing_unknown_and_invalid_answers_are_rejected(self):
        answers = self.extreme_answers(True)
        answers.pop("Q25")
        with self.assertRaisesRegex(ValueError, "Missing answers"):
            score_answers(answers, self.question_set)
        answers["Q25"] = "A"
        answers["Q99"] = "A"
        with self.assertRaisesRegex(ValueError, "Unknown questions"):
            score_answers(answers, self.question_set)
        answers.pop("Q99")
        answers["Q25"] = "E"
        with self.assertRaisesRegex(ValueError, "Invalid option"):
            score_answers(answers, self.question_set)

    def test_source_json_is_a_complete_one_to_one_versioned_question_set(self):
        source = json.loads((ROOT / "database" / "questions.json").read_text(encoding="utf-8"))
        self.assertEqual(source["version"], "Q_V1.0")
        self.assertEqual(source["order_version"], "ORDER_V1.0")
        self.assertEqual(source, self.question_set)
        self.assertTrue(all(len(q["options"]) == 4 for q in self.questions))


if __name__ == "__main__":
    unittest.main()
