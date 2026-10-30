# Architecture and design notes

This file explains how the proof of concept is built and why. For setup and
the mapping table, see the [README](README.md).

## Components

| Component | Technology | Port in the container | Port on the host (127.0.0.1) |
|---|---|---|---|
| Engine | Open Integration Engine 4.5.2 (`openintegrationengine/engine:4.5.2-ubuntu-jre`), built-in Derby database | 8443 (Administrator and REST API), 6661 (MLLP) | 18444, 6661 |
| Channel | `ADT_to_FHIR_Patient` (`mirth-config/adt_to_fhir_channel.xml`) | runs inside the engine | |
| FHIR app | Node.js 22, Express 4 (`fhir-app/`) | 3000 | 3000 |
| Test sender | Node.js script, no dependencies (`test-hl7-sender.js`) | runs on the host | |

The engine and the FHIR app share one Docker network. The channel reaches the
app by its container name, `fhir-logic-service`.

## Message flow

1. The sender opens a TCP connection to port 6661 and sends one HL7 v2 message
   in an MLLP frame (start byte `0x0B`, end bytes `0x1C 0x0D`).
2. The engine parses the message into its XML form.
3. The destination filter checks MSH-9. Only ADT A01, A04, A05, A08, A28 and
   A31 pass. Other messages stop here with the status FILTERED.
4. The destination transformer reads every repetition of PID-3, PID-5, PID-11
   and PID-13, and PID-7 and PID-8, and writes them as JSON into the channel map
   variable `fhirPayload`. It also adds MSH-10 (message control ID), MSH-9 and
   the delimiters from MSH-1 and MSH-2.
5. The HTTP Sender posts the JSON to `http://fhir-logic-service:3000/convert/patient`.
6. The FHIR app maps the JSON to a FHIR R4 Patient and returns it with HTTP 200
   and the content type `application/fhir+json`. A message it cannot use (for
   example, no patient name) gets HTTP 400 with a FHIR OperationOutcome.
7. The engine stores the response and builds the ACK from the destination
   status: SENT gives AA, FILTERED gives AR, ERROR gives AE.
8. The sender reads the ACK until the end of the MLLP frame and checks MSA-1.

## Design decisions

**The channel copies; the app maps.** The channel only picks the fields and
copies their values. Decoding and code mapping happen in
`fhir-app/src/patient-mapper.js`. Reasons: all rules are in one place, they
have unit tests (`node --test`), and the channel script stays short. Channel
JavaScript runs in the engine's Rhino engine with E4X, which is hard to test
outside the engine.

**Escape sequences are decoded with the message's own delimiters.** The engine
keeps `\F\`, `\S\`, `\T\`, `\R\` and `\E\` as they are in its XML form. The
channel sends MSH-1 and MSH-2 in the `delimiters` field, so the app decodes
correctly even when a sender uses other delimiter characters.

**Repeating fields are read one repetition at a time.** In the engine, a
repeating field is a list. Reading `msg['PID']['PID.3']['PID.3.1']` on a list
gives the XML of all repetitions, not one value. The transformer loops over the
repetitions instead.

**The MRN is the PID-3 repetition with type code MR.** The app does not guess:
without an MR repetition, the Patient has no identifier, and the app logs a
warning with the message ID.

**`Identifier.system` must be a URI.** PID-3.4.1 is usually a short name such as
`INFOGLEAM`, which is not a URI. The app uses PID-3.4.2 only when PID-3.4.3 says
it is a URI, an ISO OID or a UUID. Otherwise it uses a configurable system
(`MRN_SYSTEM`, default `https://example.org/fhir/mrn`) and keeps the short name
in `assigner.display`.

**Partial birth dates keep their precision.** FHIR `date` allows `YYYY`,
`YYYY-MM` and `YYYY-MM-DD`, so an HL7 date with only a year or a year and month
is kept, not dropped. Each date is checked against the calendar, including leap
years.

**Code maps follow the HL7 V2-to-FHIR guide.** Gender, name type, address type,
telecom use and equipment type use the concept maps of the
[HL7 V2-to-FHIR implementation guide](https://hl7.org/fhir/uv/v2mappings/).
For example, gender `N` (not applicable) maps to `other`, as in that guide.

**The app is a converter, not a FHIR server.** It stores nothing, so it answers
200 (not 201 Created) and the Patient has no `id` and no `meta`. A FHIR server
would set them when it stores the resource. The path `/convert/patient` makes
this clear; `POST /fhir/Patient` would look like a FHIR create.

**The ACK shows the end result.** The source answers "after destinations
completed", the filter is on the destination, and the destination queue is off.
So AA means "converted", AR means "filtered" and AE means "error". With the
filter on the source, the engine answers AE for a filtered message, because no
destination ran. A production interface would usually turn the queue on instead,
so that messages are kept and retried; the ACK then means "received and stored".

**The channel file is a 4.5.2 export.** The Administrator converts channels from
older versions but refuses channels from newer ones. The 4.5.2 file was tested on
OIE 4.5.2, OIE 4.7.0 and Mirth Connect 4.5.2.

**No patient data in logs.** The app logs only MSH-10, cleaned so it cannot
break a log line. Error answers do not contain internal details. The channel
logs nothing. Message content in the engine database is encrypted, but the
"Development" storage mode keeps all of it, which is right for a demo only.

**Local-only defaults.** All ports are bound to 127.0.0.1, the images are pinned
(`openintegrationengine/engine:4.5.2-ubuntu-jre`, `node:22-alpine`), the app
runs as the unprivileged `node` user, and `npm ci --omit=dev` installs exactly
the versions in `package-lock.json`. When the app runs outside Docker, it
listens on 127.0.0.1 unless `HOST` is set.

## What a production version would add

See "Security notes" in the README. In short: TLS and authentication on both
connections, an external database, message pruning, the destination queue,
a real FHIR server with profile validation, monitoring and alerts.
