WITH import (doc) AS (
  VALUES ('
[
  {
    "currency_alpha3_id": "afn",
    "currency": "Afghani",
    "entity": "AFGHANISTAN",
    "minor_unit": "2",
    "numeric_code": 971.0,
    "withdrawal_date": null
  },
  {
    "currency_alpha3_id": "eur",
    "currency": "Euro",
    "entity": "\u00c5LAND ISLANDS",
    "minor_unit": "2",
    "numeric_code": 978.0,
    "withdrawal_date": null
  }
]
'::json)
)
INSERT INTO iso.currency_alpha3 (currency_alpha3_id, currency, minor_unit, numeric_code)
SELECT DISTINCT
  final.currency_alpha3_id,
  final.currency AS currency,
  final.minor_unit,
  final.numeric_code
FROM import
CROSS JOIN LATERAL json_populate_recordset(null::iso.currency_alpha3, doc) as final
WHERE final.withdrawal_date IS NULL
ON CONFLICT DO NOTHING;

-- see https://www.postgresql.org/docs/current/sql-cluster.html
CLUSTER VERBOSE iso.currency_alpha3;
