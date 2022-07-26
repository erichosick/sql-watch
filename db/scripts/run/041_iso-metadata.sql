WITH import (doc) AS (
  VALUES ('
[
  {
    "label": "Afar",
    "language_alpha2_id": "aa"
  },
  {
    "label": "Abkhazian",
    "language_alpha2_id": "ab"
  },
  {
    "label": "Avestan",
    "language_alpha2_id": "ae"
  },
  {
    "label": "Afrikaans",
    "language_alpha2_id": "af"
  }
]
'::json)
  )
INSERT INTO iso.language_alpha2 (language_alpha2_id, label)
SELECT
  final.language_alpha2_id,
  final.label
FROM import
CROSS JOIN LATERAL json_populate_recordset(null::iso.language_alpha2, doc) as final
ON CONFLICT DO NOTHING;
