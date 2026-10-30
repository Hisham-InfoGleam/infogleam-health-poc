# InfoGleam Health POC: HL7 v2 ADT to FHIR R4 Patient

A small, tested proof of concept that turns HL7 v2 ADT messages into FHIR R4
Patient resources, using Open Integration Engine (the open-source continuation
of Mirth Connect) and a Node.js app.

All data in this repository is synthetic test data.

## What it does

```
test-hl7-sender.js --(MLLP, port 6661)--> OIE channel "ADT_to_FHIR_Patient"
                                            destination "FHIR app":
                                              filter: ADT A01, A04, A05, A08, A28, A31
                                              transformer: PID fields to JSON
                                              HTTP Sender --(POST JSON)--> fhir-app: POST /convert/patient
                                                                           returns a FHIR R4 Patient
test-hl7-sender.js <--(ACK: AA, AR or AE)-- OIE channel
```

1. A sender sends an HL7 v2 ADT message to the engine over MLLP.
   MLLP is the usual way to send HL7 v2 over TCP: each message is wrapped in
   start and end bytes.
2. The channel accepts only the ADT events that carry patient data:
   A01, A04, A05, A08, A28 and A31. Other messages are filtered.
3. The channel copies the PID fields it needs (PID-3, PID-5, PID-7, PID-8,
   PID-11, PID-13, every repetition) into a small JSON document. It does not
   change the values.
4. The HTTP Sender posts that JSON to the FHIR app.
5. The FHIR app decodes the HL7 escape sequences, maps the codes and returns a
   FHIR R4 Patient as JSON. It does not store anything.
6. The engine answers the sender with an ACK (acknowledgement message).
   Its MSA-1 field says what happened:

| MSA-1 | Meaning |
|---|---|
| AA | The message was converted to a FHIR Patient. |
| AR | The message was filtered (not one of the accepted ADT events). |
| AE | Error, for example the message has no patient name, or the FHIR app is down. |

## Quick start

You need:

- Docker with Compose v2 (the `docker compose` command)
- Node.js 22 or newer, for the test sender and the unit tests
- Free ports on 127.0.0.1: 18444 (engine Administrator and API), 6661 (MLLP), 3000 (FHIR app)

**1. Start the engine and the FHIR app**

```bash
docker compose up -d --build
```

The engine needs about one minute for its first start. It is ready when
`docker compose logs oie` shows `server successfully started`.

**2. Import and deploy the channel**

Option A, with the Administrator (the OIE or Mirth desktop client):

1. Connect the Administrator Launcher to `https://localhost:18444`. The
   certificate is self-signed, so accept the warning.
2. Log in with `admin` / `admin`, then change the password.
3. Go to Channels, choose Import Channel and select
   `mirth-config/adt_to_fhir_channel.xml`.
4. Save the channel and deploy it.

Option B, with the REST API (on Windows PowerShell, type `curl.exe` instead of `curl`):

```bash
curl -k -c cookies.txt -H "X-Requested-With: OpenAPI" -d "username=admin&password=admin" https://localhost:18444/api/users/_login
curl -k -b cookies.txt -H "X-Requested-With: OpenAPI" -H "Content-Type: application/xml" -H "Accept: application/json" --data-binary @mirth-config/adt_to_fhir_channel.xml https://localhost:18444/api/channels
curl -k -b cookies.txt -H "X-Requested-With: OpenAPI" -X POST https://localhost:18444/api/channels/52b4625d-2d31-4653-9f68-c6d2d7930c92/_deploy
```

`-k` accepts the self-signed certificate. Use it only on your own machine.
Delete `cookies.txt` when you are done.

**3. Send the sample messages**

```bash
npm run test:send-hl7       # ADT^A01, expects AA
npm run test:send-repeats   # ADT^A08 with repeating fields and an escape sequence, expects AA
npm run test:send-oru       # ORU^R01 lab result, expects AR (filtered)
```

Each command prints the ACK and exits with code 0 only when MSA-1 is the
expected code.

**4. Look at the result**

The FHIR app log shows only message IDs, never patient data:

```bash
docker compose logs fhir-app
```

To see the FHIR Patient, open the channel's messages in the Administrator
and look at the Response of the destination "FHIR app". You can also call the
FHIR app directly with the JSON the channel sends:

```bash
curl -X POST -H "Content-Type: application/json" --data-binary @fhir-app/test/fixtures/sample_adt_a01.channel.json http://localhost:3000/convert/patient
```

**5. Stop**

```bash
docker compose down      # keeps the engine data (channels, messages)
docker compose down -v   # also deletes the engine data
```

## What is mapped

All text values are decoded first: the HL7 escape sequences `\F\` `\S\` `\T\`
`\R\` `\E\` become the characters they stand for, using the delimiters of the
message itself (MSH-1 and MSH-2). The code tables follow the concept maps of the
[HL7 V2-to-FHIR implementation guide](https://hl7.org/fhir/uv/v2mappings/).

| HL7 v2 field | FHIR R4 Patient | Rule |
|---|---|---|
| PID-3, the repetition with type code PID-3.5 = `MR` | `identifier` | `value` = PID-3.1. `type` = `MR` from code system v2-0203. `system` comes from PID-3.4.2 when PID-3.4.3 is `URI` (used as it is), `ISO` (`urn:oid:` + the OID) or `UUID` (`urn:uuid:` + the UUID); otherwise it is `https://example.org/fhir/mrn` (set your own with the `MRN_SYSTEM` environment variable of the FHIR app). `assigner.display` = PID-3.4.1. If no repetition has type `MR`, the Patient has no identifier. |
| PID-5, every repetition | `name` | `family` = PID-5.1, `given` = PID-5.2 and the middle names in PID-5.3 (split on spaces), `suffix` = PID-5.4, `prefix` = PID-5.5. `use` from PID-5.7: L or R official, D usual, M maiden, N nickname, BAD old, MSK anonymous, NAV or TEMP temp. A message without any name gets AE. |
| PID-7 | `birthDate` | Keeps the precision of the source: `1970` to `1970`, `197003` to `1970-03`, `19700315` (or longer) to `1970-03-15`. The time part is dropped. Dates that do not exist, such as `20230229`, are left out. |
| PID-8 | `gender` | F female, M male, O other, U unknown, A other, N other. Other codes are left out. |
| PID-11, every repetition | `address` | `line` = PID-11.1 and PID-11.2, `city` = PID-11.3, `state` = PID-11.4, `postalCode` = PID-11.5, `country` = PID-11.6. `use` from PID-11.7: H home, B or O work, C temp, BA old, BI billing. |
| PID-13, every repetition | `telecom` | `system` is email when PID-13.4 has an address, PID-13.2 is NET or PID-13.3 is Internet or X.400; then `value` = PID-13.4 (or PID-13.1 when PID-13.4 is empty). Otherwise `system` comes from PID-13.3 (FX fax, BP pager, MD, SAT, TDD or TTY other, anything else phone) and `value` = PID-13.1, or is built from PID-13.5 to PID-13.8. `use` from PID-13.2: PRN home, WPN work, PRS mobile; CP in PID-13.3 gives mobile; an empty PID-13.2 gives home. |

The Patient has no `id` and no `meta`, because the FHIR app does not store it.
A FHIR server gives the id when it stores the resource.

## Example input and real output

Input, the PID segment of `samples/sample_adt.hl7`:

```
PID|1||TEST000001^^^INFOGLEAM^MR||PATIENT^TEST^A||19700101|U|||100 TEST STREET^^TESTVILLE^TS^00000^USA||(555)0100|||S||ACC000001|
```

ACK that the engine sent back:

```
MSH|^~\&|MIRTH|FHIR_SERVICE|HOSPITAL_SYSTEM|INFOGLEAM_REF|20261030091530.095||ACK^A01^ACK|20261030091530.095|P|2.5
MSA|AA|MSG00001
```

FHIR Patient that the FHIR app returned. This is the destination response
stored by OIE 4.5.2 in the test run of 2026-10-30. OIE 4.7.0 and Mirth Connect
4.5.2 returned the same JSON.

```json
{
  "resourceType": "Patient",
  "identifier": [
    {
      "type": {
        "coding": [
          {
            "system": "http://terminology.hl7.org/CodeSystem/v2-0203",
            "code": "MR",
            "display": "Medical record number"
          }
        ]
      },
      "system": "https://example.org/fhir/mrn",
      "value": "TEST000001",
      "assigner": {
        "display": "INFOGLEAM"
      }
    }
  ],
  "name": [
    {
      "family": "PATIENT",
      "given": [
        "TEST",
        "A"
      ]
    }
  ],
  "telecom": [
    {
      "system": "phone",
      "value": "(555)0100",
      "use": "home"
    }
  ],
  "gender": "unknown",
  "birthDate": "1970-01-01",
  "address": [
    {
      "line": [
        "100 TEST STREET"
      ],
      "city": "TESTVILLE",
      "state": "TS",
      "postalCode": "00000",
      "country": "USA"
    }
  ]
}
```

The JSON that the channel sent to the FHIR app for this message is in
`fhir-app/test/fixtures/sample_adt_a01.channel.json` (the same content, with
line breaks added for reading). The second sample
(`samples/sample_adt_a08_repeats.hl7`, with two identifiers, two names, two
addresses, a phone and an e-mail address) has its real input and output in the
same folder.

## Testing

**Unit tests** (no engine needed):

```bash
npm --prefix fhir-app ci
npm test
```

This runs 9 tests for the MLLP sender (framing, an ACK that arrives in pieces,
AA, AE, AR and connection errors) and 28 tests for the FHIR mapping (gender
codes, birth date forms, calendar checks, identifier rules, names, addresses,
phones, escape sequences, HTTP status codes, and that the log has no patient data).

**End-to-end test, done on 2026-10-30.** The channel file in `mirth-config/`
was imported with the REST API and deployed, the samples were sent with
`test-hl7-sender.js`, and the responses stored by the engine were compared with
the files in `fhir-app/test/fixtures/`:

| Engine | Result |
|---|---|
| OIE 4.5.2, image `openintegrationengine/engine:4.5.2-ubuntu-jre` (the one in `docker-compose.yml`) | A01: AA, A08: AA, ORU: AR. Output equal to the fixtures. Also checked: a message without a name gets AE, a stopped FHIR app gives AE, all five escape sequences are decoded, an A03 is filtered (AR). |
| The full `docker compose` stack of this repository | A01: AA, A08: AA, ORU: AR with the `npm run test:send-*` scripts. Output equal to the fixtures. |
| OIE 4.7.0 (built from the official release download) | Same channel file. A01: AA, A08: AA, ORU: AR. Output equal to the fixtures. |
| Mirth Connect 4.5.2, image `nextgenhealthcare/connect:4.5.2` | Same channel file. A01: AA, A08: AA, ORU: AR. Output equal to the fixtures. |

Not tested: the channel import through the Administrator window (only the
REST API was used), BridgeLink, and a check of the output with the official
HL7 FHIR validator.

## Project layout

| Path | What it is |
|---|---|
| `docker-compose.yml` | The engine (OIE 4.5.2) and the FHIR app, local demo only |
| `mirth-config/adt_to_fhir_channel.xml` | The channel, exported from OIE 4.5.2 with the REST API |
| `mirth-config/README.md` | What the channel does, step by step |
| `fhir-app/src/patient-mapper.js` | The HL7 to FHIR mapping rules |
| `fhir-app/src/app.js` | The Express app: `POST /convert/patient` and `GET /health` |
| `fhir-app/src/index.js` | Starts the app |
| `fhir-app/test/` | Unit tests and the real channel input and output for the samples |
| `fhir-app/Dockerfile` | Image for the FHIR app (Node.js 22, runs as the `node` user) |
| `fhir-app/package.json`, `fhir-app/package-lock.json` | The app's one dependency (Express 4), pinned |
| `test-hl7-sender.js` | Sends an HL7 file over MLLP and checks the ACK |
| `test/hl7-sender.test.js` | Unit tests for the sender |
| `package.json` | npm scripts for the demo and the tests (no dependencies) |
| `samples/` | Synthetic HL7 messages, see `samples/README.md` |
| `scripts/prepublish-scan.ps1` | Looks for secrets and PHI-like data before publishing |
| `ARCHITECTURE.md` | Design notes and the reasons behind them |
| `LICENSE` | MIT licence |

## Security notes

This is a local demo for synthetic data:

- All ports are bound to 127.0.0.1, so other machines cannot reach them.
- The engine starts with the default login `admin` / `admin`. Change it at the first login.
- The Administrator and the API use a self-signed certificate.
- The channel keeps the full message content ("Development" storage mode),
  so you can look at every step. The content is encrypted in the engine database.
- The FHIR app logs only the HL7 message control ID (MSH-10), never patient data.
  Error answers do not include internal details.

Before any real use, at least:

- Put MLLP behind TLS or a VPN, and add authentication and TLS to the HTTP call.
- Use your own certificates and strong passwords, and keep the Administrator off public networks.
- Use an external database (for example PostgreSQL) instead of the built-in Derby database.
- Lower the message storage mode and turn on pruning, so PHI is not kept longer than needed.
- Turn on the destination queue, so messages are kept and retried when the FHIR app is down.
  The ACK then means "received and stored", not "converted".
- Send the Patient to a real FHIR server, and validate it against the profiles you need.
- Add monitoring and alerts.

## Status and limits

Status: proof of concept, tested as described above. It is not production software.

Limits:

- Only the Patient resource. Lab results (ORU) are filtered, not converted.
- Only the MRN identifier. Other PID-3 identifier types are not mapped.
- Not mapped: the birth time, PID-14 (business phone), marital status, death
  date, language, race, ethnicity, and the visit data in PV1.
- Only the five basic escape sequences are decoded. Others (`\X..\`, `\H\`,
  `\N\`, `\.br\`) are left as they are.
- The FHIR app does not store anything and has no authentication.

## Background: Mirth Connect and OIE

Mirth Connect was open source (MPL-2.0) up to version 4.5.2. From version 4.6,
NextGen Healthcare releases it under a commercial licence only. The
[Open Integration Engine](https://openintegrationengine.org) (OIE) is a
community fork of the open-source code, also under MPL-2.0. This demo uses the
OIE 4.5.2 image from Docker Hub; the image is not part of this repository.

## Licence

MIT, see [LICENSE](LICENSE).

HL7 and FHIR are registered trademarks of Health Level Seven International.
Mirth is a trademark of NextGen Healthcare.

## Author

Hisham Alrashdan, InfoGleam

- Website: https://infogleam.com
- E-mail: hisham@infogleam.com
- GitHub: https://github.com/Hisham-InfoGleam
