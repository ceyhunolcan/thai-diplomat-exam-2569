"""Build the self-contained GitHub Pages study app from the content files."""

import argparse
import json
from pathlib import Path
import re
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
CONTENT = ROOT / "content"
KEY = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def check(condition, message):
    if not condition:
        raise ValueError(message)


def build():
    sources = read_json(CONTENT / "sources.json")
    for key, (label, url) in sources.items():
        parsed = urlsplit(url)
        check(label and parsed.scheme == "https" and parsed.hostname and not parsed.username,
              f"{key}: add a named HTTPS reference")
        check("x-amz-" not in parsed.query.lower(), f"{key}: use a public, unsigned source URL")

    cards, decks, prompts, deck_ids = {}, [], set(), set()
    paths = sorted((CONTENT / "sets").glob("*.json"))
    paths.extend([CONTENT / "recap.json", CONTENT / "logistics.json"])
    paths.extend(sorted((CONTENT / "assessments").glob("*.json")))
    mock_only_ids = set()
    topics = read_json(CONTENT / "topics.json")
    check(all(KEY.fullmatch(key) and label.strip() for key, label in topics.items()), "invalid topic map")
    for path in paths:
        deck = read_json(path)
        key = deck["id"]
        check(KEY.fullmatch(key) and key not in deck_ids, f"{path.name}: invalid or duplicate set ID")
        check(deck["kind"] in {"study", "recap", "assessment"} and deck["title"].strip(), f"{key}: invalid set")
        if deck["kind"] in {"study", "assessment"}:
            check(deck.get("level") in {1, 2, 3}, f"{key}: level must be 1, 2, or 3")
        tags = deck.get("tags", [])
        check(isinstance(tags, list) and all(isinstance(tag, str) and tag.strip() for tag in tags),
              f"{key}: tags must be a list of non-empty search terms")
        questions = deck.pop("questions")
        check(questions, f"{key}: add at least one question")
        for card in questions:
            card_id = card["id"]
            prompt = " ".join(card["question"].split())
            check(KEY.fullmatch(card_id) and card_id.startswith(key + "-") and card_id not in cards,
                  f"{card_id}: question ID must be unique and start with {key}-")
            check(prompt and prompt not in prompts and card["answer"].strip(),
                  f"{card_id}: empty or duplicate question or missing answer")
            check(card["subject"] in {"th", "en"}, f"{card_id}: subject must be th or en")
            check(all(ref in sources for ref in card["refs"]), f"{card_id}: unknown source reference")
            if "topic" in card:
                check(card["topic"] in topics, f"{card_id}: unknown topic")
            if deck["kind"] == "assessment":
                check(card.get("topic") in topics, f"{card_id}: add an assessment topic")
                mock_only_ids.add(card_id)
            if "passage" in card:
                check(card["subject"] == "en" and isinstance(card["passage"], str) and card["passage"].strip(),
                      f"{card_id}: add a non-empty English reading passage")
            if deck["kind"] in {"study", "assessment"}:
                options = card["options"]
                check(len(options) == len(set(options)) == 3 and all(option.strip() for option in options)
                      and card["answer"] in options, f"{card_id}: give three distinct choices and a matching answer")
                check(card.get("explanation", "").strip(), f"{card_id}: add an explanation")
                check(card["subject"] == "en" or card["refs"], f"{card_id}: cite the factual basis")
                if "distractors" in card:
                    expected = set(options) - {card["answer"]}
                    reasons = card["distractors"]
                    check(isinstance(reasons, dict) and set(reasons) == expected
                          and all(reason.strip() for reason in reasons.values()),
                          f"{card_id}: write an explanation for each distractor")
            cards[card_id] = {**card, "level": deck.get("level")}
            prompts.add(prompt)
        deck_ids.add(key)
        if deck["kind"] != "assessment":
            decks.append({**deck, "cards": [card["id"] for card in questions]})

    timed_ids = set()
    for mock in read_json(CONTENT / "mocks.json"):
        key, ids = mock["id"], mock["cards"]
        check(KEY.fullmatch(key) and key not in deck_ids, f"{key}: invalid or duplicate mock ID")
        check(mock["kind"] == "mock" and mock["title"].strip() and mock["level"] in {1, 2, 3},
              f"{key}: invalid mock metadata")
        check(ids and len(set(ids)) == len(ids), f"{key}: add distinct question IDs")
        check(all(card_id in cards and cards[card_id].get("options") for card_id in ids),
              f"{key}: every question needs an existing multiple-choice card")
        check({cards[card_id]["subject"] for card_id in ids} == {"th", "en"},
              f"{key}: include both exam subjects")
        if "sections" in mock:
            sections = mock["sections"]
            check(sections == [{"subject": "th", "minutes": 120}, {"subject": "en", "minutes": 90}],
                  f"{key}: timed sections must follow the Part A order and durations")
            subjects = [cards[card_id]["subject"] for card_id in ids]
            check(subjects == sorted(subjects, reverse=True) and subjects.count("th") == subjects.count("en"),
                  f"{key}: list equal Thai and English sections in that order")
            check(set(ids) <= mock_only_ids and not timed_ids.intersection(ids),
                  f"{key}: timed mocks require distinct assessment-only questions")
            timed_ids.update(ids)
        else:
            check(not mock_only_ids.intersection(ids), f"{key}: assessment-only questions belong in timed mocks")
        deck_ids.add(key)
        decks.append(mock)
    check(timed_ids == mock_only_ids, "every assessment-only question must belong to one timed mock")

    payload = json.dumps({"cards": cards, "decks": decks, "sources": sources, "topics": topics},
                         ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
    html = (ROOT / "web" / "page.html").read_text(encoding="utf-8")
    return (html.replace("/* STYLES */", (ROOT / "web" / "style.css").read_text(encoding="utf-8"), 1)
            .replace("<!-- STUDY_DATA -->", payload, 1)
            .replace("/* APP_CODE */", (ROOT / "web" / "app.js").read_text(encoding="utf-8"), 1))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify the committed HTML matches its sources")
    args = parser.parse_args()
    try:
        generated = build()
    except (ValueError, KeyError, TypeError, OSError) as error:
        parser.exit(1, f"Build failed: {error}\n")
    target = ROOT / "index.html"
    if args.check:
        if not target.exists() or target.read_text(encoding="utf-8") != generated:
            parser.exit(1, "index.html is out of date. Run python3 build.py.\n")
        print("index.html matches its sources.")
    else:
        target.write_text(generated, encoding="utf-8")
        print("Built index.html.")
