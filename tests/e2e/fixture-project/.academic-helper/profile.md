---
fieldOfStudy: "פילוסופיה של ימי הביניים"
citationStyle: "inline-parenthetical"
targetLanguage: "Hebrew"
analyzedArticles: []
---

# Researcher Profile — E2E Fixture

This is a deterministic test profile used by the write-pipeline end-to-end smoke test. It is NOT
a real researcher profile.

## Tools

```json
{
  "zotero": { "enabled": false, "mode": "local" },
  "notebookLM": { "enabled": false },
  "rag": { "enabled": false }
}
```

## Style Fingerprint

```json
{
  "sentenceLength": { "mean": 24, "stdev": 7 },
  "paragraphStructure": { "length": { "mean": 95, "stdev": 25 } },
  "vocabularyComplexity": "high-academic",
  "toneDescriptors": ["formal", "analytical", "expository"],
  "citationDensity": 2.0,
  "transitionCategories": ["causal", "contrastive", "additive"],
  "sampleExcerpts": [
    "הגותו של אוגוסטינוס מציבה את שאלת הזמן במרכז הדיון הפילוסופי, ומעבירה אותו מן המישור הקוסמולוגי אל המישור הנפשי."
  ]
}
```

## Article Structure

```json
{
  "introPattern": "פתיחה הממקמת את הבעיה, ניסוח התזה, ותיאור מהלך המאמר",
  "conclusionPattern": "סיכום הטיעונים, חזרה לתזה, והרחבת ההשלכות",
  "paragraphParts": ["משפט מוביל", "פיתוח מבוסס-מקור", "משפט מקשר"]
}
```

## Banned Terms

```json
[]
```
