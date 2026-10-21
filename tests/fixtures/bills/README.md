# Synthetic bill fixtures

Every file here is **made up**. The names, addresses, account numbers, meter numbers (MPRN/GPRN),
invoice numbers and amounts are invented to resemble the wording and layout of Irish bills and
receipts as they come out of a PDF text layer or OCR. None is a real customer document.

Never add real bills. When tuning a parser on a real bill, redact it first (names, addresses,
account/meter/IBAN numbers) and keep only the wording around each value.

Each `.txt` file has a matching expectation in
`src/modules/money/documents/server/parsers/parsers.test.ts`.
