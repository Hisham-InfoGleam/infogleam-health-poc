# Sample HL7 v2 messages

All messages in this folder are synthetic test data: no real patients, no real
providers, no real organisations. Do not add real HL7 messages to this repository.

| File | Message | What it tests | Expected ACK (MSA-1) |
|---|---|---|---|
| `sample_adt.hl7` | ADT^A01 (admission) | A simple patient: one identifier, one name, gender U, full birth date, one address, one phone | AA |
| `sample_adt_a08_repeats.hl7` | ADT^A08 (patient update) | Repeating fields: two PID-3 identifiers (the MR one is used), two names (legal and maiden), two addresses (home and mailing), a phone built from its parts and an e-mail address; the escape sequence `\T\` in the street; a birth date with year and month only | AA |
| `sample_lab_result.hl7` | ORU^R01 (lab result) | A message type the channel does not convert | AR (filtered) |

The real FHIR output for the two ADT samples is in
`fhir-app/test/fixtures/` (`*.patient.json`), next to the JSON that the channel
sent to the FHIR app (`*.channel.json`).

## Sending a sample

Start the stack and deploy the channel first (see the main [README](../README.md)). Then:

```bash
npm run test:send-hl7       # samples/sample_adt.hl7
npm run test:send-repeats   # samples/sample_adt_a08_repeats.hl7
npm run test:send-oru       # samples/sample_lab_result.hl7, expects AR
```

Or call the sender yourself:

```bash
node test-hl7-sender.js samples/sample_adt.hl7 --host localhost --port 6661
```

The sender wraps the message in MLLP framing, waits for the complete ACK and
exits with code 0 only when MSA-1 is `AA` or `CA` (or the codes given with
`--expect`). It prints the ACK, never the message.

You can also paste a sample into the Administrator ("Send Message" on the
deployed channel). The Administrator is at `https://localhost:18444`.

## Message format

- Segments end with a carriage return. The files use normal line endings; the
  sender and the engine convert them.
- Delimiters: field `|`, component `^`, repetition `~`, escape `\`, subcomponent `&`.
- Version: HL7 v2.5 (MSH-12).
