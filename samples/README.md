# Sample HL7 Messages for Testing

This folder contains sample HL7 messages for testing the InfoGleam Health PoC integration.

## Privacy / PHI

All sample messages in this folder contain **synthetic, anonymized demo data** (not real patients, not real providers). Do **not** paste or commit real HL7 messages containing PHI into this repo.

## Files

### 1. sample_adt.hl7
**Message Type:** ADT^A01 (Patient Admission)
**Use Case:** Patient registration/admission workflow

**Patient Details:**
- Name: Test A Patient
- MRN: DEMO000001
- DOB: January 1, 1970
- Gender: Unknown (U)
- Address: 100 Demo Street, Testville, USA
- Phone: (555)0100

### 2. sample_lab_result.hl7
**Message Type:** ORU^R01 (Observation Result/Lab Result)
**Use Case:** Laboratory results transmission

**Lab Panel:** Complete Blood Count (CBC)
- WBC: 7.5 (Normal)
- RBC: 4.8 (Normal)
- Hemoglobin: 14.2 (Normal)
- Hematocrit: 42.1 (Normal)
- Platelet Count: 245 (Normal)

## How to Use These Files

### Method 1: Via Mirth Administrator (GUI)
1. Open Mirth Administrator at `http://localhost:18444`
2. Navigate to your channel
3. Click "Send Message" button
4. Copy the content from one of these files
5. Paste into the message window
6. Click "Send"

### Method 2: Via HL7 TCP Client (Command Line)
```bash
# Using the test script in the root folder
npm run test:send-hl7
```

### Method 3: Using netcat (if installed)
```bash
# Send ADT message
cat samples/sample_adt.hl7 | nc localhost 19002
```

## Expected Output

When you send these messages through Mirth to the FHIR service, you should see:
1. Mirth console logs showing message received
2. FHIR service console logs showing transformation
3. A valid FHIR R4 Patient resource returned

## Message Format Notes

- Field delimiter: `|`
- Component separator: `^`
- Repetition separator: `~`
- Escape character: `\`
- Sub-component separator: `&`

All messages follow HL7 v2.5 specification.
