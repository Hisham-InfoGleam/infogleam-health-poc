# The ADT_to_FHIR_Patient channel

`adt_to_fhir_channel.xml` is a real channel export. The channel was created on
Open Integration Engine (OIE) 4.5.2 and exported with the engine's REST API
(`GET /api/channels/{id}`) on 2026-10-30. The same file was imported and tested
on OIE 4.5.2, OIE 4.7.0 and Mirth Connect 4.5.2.

The file is in the 4.5.2 format on purpose. The Administrator refuses to import
a channel from a newer engine version, but it converts a channel from an older
version. So a 4.5.2 export works on more engines.

To import it, see step 2 of the Quick start in the main [README](../README.md).

## What is in the channel

| Part | Setting |
|---|---|
| Channel ID | `52b4625d-2d31-4653-9f68-c6d2d7930c92` |
| Source | TCP Listener with MLLP framing on `0.0.0.0:6661`, data type HL7 v2.x, UTF-8 |
| Source response | "Auto-generate (Destinations completed)": the ACK is built after the destination has run |
| Destination "FHIR app", filter | JavaScript rule: MSH-9.1 is `ADT` and MSH-9.2 is one of `A01`, `A04`, `A05`, `A08`, `A28`, `A31` |
| Destination "FHIR app", transformer | JavaScript step "Build JSON for the FHIR app": copies the PID fields into the channel map variable `fhirPayload` |
| Destination "FHIR app", connector | HTTP Sender: `POST http://fhir-logic-service:3000/convert/patient`, body `${fhirPayload}`, content type `application/json`, header `Accept: application/fhir+json`, queue off |
| Message storage | "Development" (all content is kept, for learning), encrypted in the engine database |

## ACK codes

| MSA-1 | When | MSA-3 text |
|---|---|---|
| AA | The FHIR app answered with HTTP 200 | (empty) |
| AR | The destination filter did not accept the message | `Message filtered: this channel accepts only ADT A01, A04, A05, A08, A28 and A31.` |
| AE | The FHIR app answered with an error (for example HTTP 400 for a message without a name) or could not be reached | `An Error Occurred Processing Message.` |

The filter and the transformer are on the destination, not on the source, on
purpose. With "Destinations completed", a message that the source filter drops
gets AE, because no destination ran. With the filter on the destination, a
dropped message gets AR and only real errors get AE.

The queue is off so that the ACK shows the result of the conversion. In a real
interface you would usually turn the queue on and answer after the source; the
ACK then means "received and stored", and the engine retries when the FHIR app
is down.

## The JSON that the channel sends

The transformer copies the values exactly as they are in the message. It does
not decode escape sequences and does not map codes; the FHIR app does both, so
all mapping rules are in one place with unit tests. Example: the JSON for
`samples/sample_adt.hl7` is in
[`fhir-app/test/fixtures/sample_adt_a01.channel.json`](../fhir-app/test/fixtures/sample_adt_a01.channel.json).

| JSON field | HL7 v2 source |
|---|---|
| `messageControlId` | MSH-10 (the only value the FHIR app writes to its log) |
| `messageType` | MSH-9.1 `^` MSH-9.2 |
| `delimiters` | MSH-1 and MSH-2, for example `\|^~\&` |
| `identifiers[]` | each PID-3: `value` 3.1, `authority` 3.4.1, `authorityId` 3.4.2, `authorityIdType` 3.4.3, `type` 3.5 |
| `names[]` | each PID-5: `family` 5.1.1, `given` 5.2, `middle` 5.3, `suffix` 5.4, `prefix` 5.5, `type` 5.7 |
| `birthDate` | PID-7.1 |
| `gender` | PID-8.1 |
| `addresses[]` | each PID-11: `street` 11.1.1, `other` 11.2, `city` 11.3, `state` 11.4, `postalCode` 11.5, `country` 11.6, `type` 11.7 |
| `phones[]` | each PID-13: `number` 13.1, `use` 13.2, `equipment` 13.3, `email` 13.4, `countryCode` 13.5, `areaCode` 13.6, `localNumber` 13.7, `extension` 13.8 |

A number like 3.4.2 means a subcomponent: in `PID-3.4` = `NAME&ID&ISO`, 3.4.1
is `NAME`, 3.4.2 is `ID` and 3.4.3 is `ISO`. When a component has no
subcomponents, its whole text counts as subcomponent 1.

## Changing the channel

- **Port:** change the source listener port, and the port mapping in `docker-compose.yml`.
- **FHIR app address:** change the URL of the HTTP Sender. `fhir-logic-service`
  works only when the engine and the app are in the same Docker network, as in
  `docker-compose.yml`.
- After a change, export the channel again (Administrator: Export Channel, or
  `GET /api/channels/{id}`) and replace the file in this folder.

## Troubleshooting

| What you see | What to check |
|---|---|
| AE for every message | Is the FHIR app running (`docker compose ps`)? The error of the destination message shows the reason, for example `UnknownHostException: fhir-logic-service` when the app is not on the same network or not started. |
| No ACK, or connection refused | Is the channel deployed and started? Is port 6661 mapped? |
| Import refused: "originated from a newer version" | The engine is older than 4.5.2. |
