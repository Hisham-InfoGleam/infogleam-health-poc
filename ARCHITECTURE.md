# Architecture Diagram - InfoGleam Health HL7 → FHIR

## System Architecture

```
┌───────────────────────────────────────────────────────────────────────────┐
│                      INFOGLEAM HEALTH HL7 → FHIR                           │
│                  HL7 v2.5 → Mirth Connect → FHIR R4                       │
└───────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                          DATA FLOW DIAGRAM                              │
└─────────────────────────────────────────────────────────────────────────┘

   STEP 1              STEP 2              STEP 3              STEP 4
   ──────              ──────              ──────              ──────

┌──────────┐      ┌──────────────┐    ┌──────────────┐    ┌───────────┐
│ Hospital │      │    Mirth     │    │    Mirth     │    │   FHIR    │
│   EMR    │─────>│   Listener   │───>│ Transformer  │───>│  Service  │
│ (Source) │ HL7  │  Port 9001   │    │ (JavaScript) │HTTP│ (Node.js) │
└──────────┘      └──────────────┘    └──────────────┘    └───────────┘
     │                   │                    │                   │
     │                   │                    │                   │
     v                   v                    v                   v
  Raw HL7          Parse Message        Extract Fields      Create FHIR
  Message          MSH, PID, PV1       lastName, firstName   Patient JSON
  (Pipe delim)     Segments            gender, DOB           Resource


┌─────────────────────────────────────────────────────────────────────────┐
│                       DOCKER CONTAINER LAYOUT                           │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                      Host Machine (Windows)                             │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │              Docker Network: infogleam-network                    │ │
│  │                                                                   │ │
│  │  ┌─────────────────────────┐  ┌──────────────────────────────┐  │ │
│  │  │ Container: mirth-connect│  │ Container: fhir-logic-service│  │ │
│  │  │  ┌──────────────────┐   │  │  ┌────────────────────────┐  │  │ │
│  │  │  │ Mirth Connect    │   │  │  │  Node.js Express      │  │  │ │
│  │  │  │ (Java)           │   │  │  │  FHIR Transformer     │  │  │ │
│  │  │  │                  │   │  │  │                        │  │  │ │
│  │  │  │ ┌──────────────┐ │   │  │  │  Routes:              │  │  │ │
│  │  │  │ │Apache Derby  │ │   │  │  │  POST /fhir/Patient   │  │  │ │
│  │  │  │ │(Embedded DB) │ │   │  │  │  GET  /health         │  │  │ │
│  │  │  │ └──────────────┘ │   │  │  │                        │  │  │ │
│  │  │  │                  │   │  │  └────────────────────────┘  │  │ │
│  │  │  │ Ports:           │◄──┼──┼──HTTP on port 3000           │  │ │
│  │  │  │ • 8080 Web UI    │   │  │                              │  │ │
│  │  │  │ • 8443 Admin     │   │  │  Health: /health             │  │ │
│  │  │  │ • 9001 HL7       │   │  │  Logs: console.log()         │  │ │
│  │  │  └──────────────────┘   │  │                              │  │ │
│  │  └─────────────────────────┘  └──────────────────────────────┘  │ │
│  │                                                                   │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  Port Mapping:                                                          │
│  • 18082 → 8080 (Mirth Web Dashboard)                                  │
│  • 18444 → 8443 (Mirth Administrator)                                  │
│  • 19002 → 9001 (HL7 LLP Listener)                                     │
│  • 3000 → 3000 (FHIR HTTP API)                                         │
└─────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────┐
│                      MESSAGE TRANSFORMATION                             │
└─────────────────────────────────────────────────────────────────────────┘

INPUT (HL7 v2.5 ADT^A01):
─────────────────────────
MSH|^~\&|HOSPITAL_SYSTEM|INFOGLEAM_REF|...
PID|1||TEST000001^^^INFOGLEAM^MR||PATIENT^TEST^A||19700101|U|||...
PV1|1|I|4W^401^01^INFOGLEAM|||9999^PROVIDER^TEST^^^DR|||...

         │
         │ Mirth Transformer (JavaScript)
         │ • Parse HL7 segments
         │ • Extract PID fields
         │ • Format dates
         │ • Map gender codes
         v

INTERMEDIATE (JSON):
────────────────────
{
   "patientId": "TEST000001",
   "firstName": "TEST",
   "lastName": "PATIENT",
   "gender": "U",
   "birthDate": "1970-01-01",
  ...
}

         │
         │ FHIR Service (Node.js)
         │ • Validate data
         │ • Map to FHIR R4 schema
         │ • Add metadata
         │ • Generate identifiers
         v

OUTPUT (FHIR R4 Patient):
─────────────────────────
{
  "resourceType": "Patient",
  "id": "patient-1736674245123",
  "meta": {
    "versionId": "1",
    "lastUpdated": "2026-01-12T10:30:45.123Z",
    "source": "InfoGleam-Mirth-Integration"
  },
  "identifier": [{
      "system": "https://example.org/fhir/patients",
         "value": "TEST000001"
  }],
  "name": [{
    "use": "official",
      "family": "PATIENT",
      "given": ["TEST"]
  }],
  "gender": "male",
   "birthDate": "1970-01-01"
}


┌─────────────────────────────────────────────────────────────────────────┐
│                      MIRTH CHANNEL DESIGN                               │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  Channel: ADT_to_FHIR_Patient                                        │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────┐      ┌──────────────┐      ┌──────────────────┐    │
│  │  Source    │      │ Transformer  │      │  Destination     │    │
│  │  Connector │─────>│   Step(s)    │─────>│   Connector      │    │
│  └────────────┘      └──────────────┘      └──────────────────┘    │
│                                                                      │
│  Type: LLP          Type: JavaScript        Type: HTTP Sender       │
│  Listener           Step                    (POST)                  │
│                                                                      │
│  Config:            Logic:                  Config:                 │
│  • Host: 0.0.0.0    • Parse HL7             • URL:                  │
│  • Port: 9001       • Extract fields          http://fhir-logic-   │
│  • Protocol: MLLP   • Format data             service:3000/        │
│  • Encoding: UTF-8  • Create JSON             fhir/Patient         │
│                     • Error handling        • Method: POST          │
│                                             • Content-Type:         │
│                                               application/json      │
│                                                                      │
│  Filter (Optional):                                                 │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ // Only process ADT^A01 messages                           │    │
│  │ var msgType = msg['MSH']['MSH.9']['MSH.9.1'].toString();   │    │
│  │ var trigger = msg['MSH']['MSH.9']['MSH.9.2'].toString();   │    │
│  │ return (msgType == 'ADT' && trigger == 'A01');             │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────┐
│                      DEPLOYMENT ARCHITECTURE                            │
└─────────────────────────────────────────────────────────────────────────┘

Development (Current):              Production (Future):
──────────────────────              ─────────────────────

┌─────────────────┐                ┌──────────────────────────────┐
│ Docker Desktop  │                │ Kubernetes Cluster           │
│ (Local Machine) │                │                              │
│                 │                │  ┌────────────────────────┐  │
│  • Mirth (1)    │                │  │ Mirth Pods (3 replicas)│  │
│  • FHIR (1)     │                │  │ + Load Balancer        │  │
│  • Derby DB     │                │  └────────────────────────┘  │
│                 │                │                              │
│  Single Node    │                │  ┌────────────────────────┐  │
└─────────────────┘                │  │ FHIR Pods (5 replicas) │  │
                                   │  │ + Auto-scaling         │  │
                                   │  └────────────────────────┘  │
                                   │                              │
                                   │  ┌────────────────────────┐  │
                                   │  │ PostgreSQL Cluster     │  │
                                   │  │ (HA with replication)  │  │
                                   │  └────────────────────────┘  │
                                   │                              │
                                   │  + Monitoring (Prometheus)   │
                                   │  + Logging (ELK Stack)       │
                                   │  + Security (mTLS, OAuth2)   │
                                   └──────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────┐
│                      STANDARDS COMPLIANCE                               │
└─────────────────────────────────────────────────────────────────────────┘

✅ HL7 v2.5 Specification
   • MLLP Protocol (Minimal Lower Layer Protocol)
   • Standard segment structure (MSH, PID, PV1)
   • Field delimiters (|), Component separators (^)

✅ FHIR R4 Specification
   • RESTful API design
   • JSON resource format
   • Required elements: resourceType, id, meta
   • Conformance with Patient resource profile

✅ Integration Standards
   • HTTP/HTTPS transport
   • JSON content type
   • Error handling with proper status codes
   • Health check endpoints

✅ Security Best Practices (for production)
   • Container isolation
   • Network segmentation
   • Audit logging
   • Encryption in transit and at rest


┌─────────────────────────────────────────────────────────────────────────┐
│                      KEY TECHNOLOGIES                                   │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Mirth Connect   │  │    Node.js 18    │  │   Docker 24.x    │
│                  │  │                  │  │                  │
│  • Java-based    │  │  • Express 4.x   │  │  • Compose 2.x   │
│  • Enterprise    │  │  • Async/await   │  │  • Multi-stage   │
│  • Open source   │  │  • ES modules    │  │  • Health checks │
│  • NextGen       │  │  • Lightweight   │  │  • Networks      │
└──────────────────┘  └──────────────────┘  └──────────────────┘

┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   Apache Derby   │  │  HL7 v2.5        │  │   FHIR R4        │
│                  │  │                  │  │                  │
│  • Embedded DB   │  │  • Legacy format │  │  • Modern API    │
│  • Zero config   │  │  • Pipe-delimited│  │  • JSON/REST     │
│  • Java-based    │  │  • Widely used   │  │  • HL7 standard  │
│  • For dev only  │  │  • Since 1987    │  │  • Since 2019    │
└──────────────────┘  └──────────────────┘  └──────────────────┘


┌─────────────────────────────────────────────────────────────────────────┐
│                      TESTING WORKFLOW                                   │
└─────────────────────────────────────────────────────────────────────────┘

1. START SERVICES
   └─> npm start
   └─> docker compose up -d
           ├─> Pull images
           ├─> Build containers
           └─> Start services

2. CONFIGURE MIRTH
   └─> http://localhost:18082
       └─> Create channel
           ├─> Source: LLP Listener
           ├─> Transformer: JavaScript
           └─> Destination: HTTP Sender

3. SEND TEST MESSAGE
   └─> npm run test:send-hl7
       └─> test-hl7-sender.js
           ├─> Read samples/sample_adt.hl7
           ├─> Connect to localhost:19002
           ├─> Send via MLLP protocol
           └─> Receive ACK

4. VERIFY OUTPUT
   └─> npm run logs:fhir
       └─> docker logs -f fhir-logic-service
           ├─> See incoming JSON from Mirth
           ├─> See FHIR transformation
           └─> Verify Patient resource created

5. VALIDATE FHIR
   └─> https://validator.fhir.org/
       └─> Copy JSON output
           └─> Paste and validate
               └─> ✅ Conformance check


┌─────────────────────────────────────────────────────────────────────────┐
│                      PROJECT METADATA                                   │
└─────────────────────────────────────────────────────────────────────────┘

Project Name:    InfoGleam Health HL7 → FHIR Reference
Version:         1.0.0
Created:         January 12, 2026
Status:          Reference Implementation (Not Production)
License:         MIT

Purpose:         Reference HL7 to FHIR transformation patterns
                using Mirth Connect integration engine

Target Audience: Healthcare IT professionals, System integrators,
                Hospital CIOs, Developer community

Use Cases:       • Legacy system modernization
                • EHR interoperability
                • Cloud migration
                • Standards compliance

Repository:      [Add your GitHub URL here]
Documentation:   README.md, QUICKSTART.md
Support:         [Add your contact email here]

Built with ❤️ for the healthcare IT community
