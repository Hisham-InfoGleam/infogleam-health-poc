# 🏥 InfoGleam Health - HL7 to FHIR Reference Implementation

[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)
[![Mirth Connect](https://img.shields.io/badge/Mirth-Connect-green.svg)](https://www.nextgen.com/products-and-services/integration-engine)
[![FHIR R4](https://img.shields.io/badge/FHIR-R4-orange.svg)](https://www.hl7.org/fhir/)
[![Node.js](https://img.shields.io/badge/Node.js-18-brightgreen.svg)](https://nodejs.org/)

An open, community-friendly reference implementation that shows how to transform HL7 v2.5 messages into FHIR R4 resources using **Mirth Connect** as the integration engine.
---

## 🎯 What This Project Provides

This project provides:

✅ **HL7 Message Ingestion** - Receive ADT (Admission, Discharge, Transfer) messages via LLP protocol  
✅ **Enterprise Integration** - Use Mirth Connect as a healthcare message broker  
✅ **FHIR Transformation** - Convert legacy HL7 to modern FHIR R4 Patient resources  
✅ **Microservices Architecture** - Containerized services with Docker  
✅ **Operational Patterns** - Health checks, proper networking, logging  

## 🔒 Privacy / PHI

This repo is designed to be safe to share publicly:
- Included HL7 samples are **synthetic** and **anonymized**.
- Do **not** commit real HL7 messages, screenshots, logs, or exports that contain PHI.


---

## ⚠️ Disclaimer (Educational / No Warranty)

This project is for learning and reference.
- Not intended for production use without proper engineering, testing, and security review.
- No warranty is provided.
- Licensed under the MIT License (see LICENSE).

---

## 🏗️ Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   HL7 Source    │         │  Mirth Connect   │         │  FHIR Service   │
│  (Hospital EMR) │──LLP───>│  (Integration    │──HTTP──>│  (Node.js App)  │
│   Port 19002    │         │    Engine)       │         │   Port 3000     │
└─────────────────┘         └──────────────────┘         └─────────────────┘
                                   │                              │
                                   │                              │
                            ┌──────▼──────┐              ┌───────▼────────┐
                            │ Apache Derby│              │  FHIR R4 JSON  │
                            │  (Embedded) │              │   Patient      │
                            └─────────────┘              │   Resource     │
                                                         └────────────────┘
```

### Component Breakdown

| Component | Technology | Port | Purpose |
|-----------|-----------|------|---------|
| **Mirth Connect** | Java-based Integration Engine | 18082, 18444, 19002 | Receives HL7, transforms, routes messages |
| **FHIR Service** | Node.js + Express | 3000 | Converts extracted data to FHIR JSON |
| **Database** | Apache Derby (embedded) | N/A | Stores Mirth metadata & message archives |
| **Network** | Docker Bridge | N/A | Isolated container communication |

---

## 📁 Project Structure

```
infogleam-health-poc/
├── fhir-app/                   # FHIR transformation microservice
│   ├── src/
│   │   └── index.js            # Express server with FHIR mapping logic
│   ├── Dockerfile              # Container build instructions
│   ├── package.json            # Node.js dependencies
│   └── .dockerignore           # Build optimization
├── mirth-config/               # Mirth Connect configuration
│   ├── README.md               # Detailed channel setup guide
│   └── adt_to_fhir_channel.xml # Pre-configured channel template
├── samples/                    # Synthetic HL7 samples for testing
│   ├── sample_adt.hl7          # Patient admission message
│   ├── sample_lab_result.hl7   # Laboratory results message
│   └── README.md               # Sample data documentation
├── docker-compose.yml          # Multi-container orchestration
├── package.json                # Root project metadata
└── README.md                   # This file
```

---

## 🚀 Quick Start (5 Minutes)

### Prerequisites

- ✅ Docker Desktop installed and running
- ✅ 4GB RAM available for containers
- ✅ Ports 3000, 18082, 18444, 19002 available

### Step 1: Start All Services

```powershell
# From project root directory
docker compose up -d
```

**Wait 60 seconds** for Mirth Connect to fully initialize.

### Step 2: Verify Containers

```powershell
docker ps
```

You should see:
- ✅ `mirth-connect` (status: up)
- ✅ `fhir-logic-service` (status: up)

### Step 3: Configure Mirth Channel

1. **Access Mirth Administrator:**
   - Open: `http://localhost:18082`
   - Click "Launch Mirth Administrator"
   - Login: `admin` / `admin` @ `https://localhost:18444`

2. **Create Channel:**
   - Follow detailed instructions in [`mirth-config/README.md`](mirth-config/README.md)
   - Or import the template: `mirth-config/adt_to_fhir_channel.xml`

3. **Deploy Channel:**
   - Click the green ▶️ button
   - Status should show ✅ green

### Step 4: Send Test Message

**Option A: Via Mirth GUI**
```
1. Right-click channel → "Send Message"
2. Copy content from samples/sample_adt.hl7
3. Click "Send"
```

**Option B: Via Command Line**
```powershell
# Install test dependencies
npm install

# Send test message
npm run test:send-hl7
```

### Step 5: View Results

```powershell
# Watch FHIR service logs
docker logs -f fhir-logic-service
```

**Expected Output:**
```json
{
  "resourceType": "Patient",
  "id": "patient-1736674245123",
  "name": [{
      "family": "PATIENT",
      "given": ["TEST"]
  }],
  "gender": "male",
   "birthDate": "1970-01-01"
}
```

---

## 🧪 Testing Workflow

### End-to-End Test Script

```powershell
# 1. Start services
docker compose up -d

# 2. Wait for healthy status
docker compose ps

# 3. Send test message
npm run test:send-hl7

# 4. Check transformation
docker logs fhir-logic-service | Select-String "FHIR"

# 5. View Mirth statistics
# Open http://localhost:18082 → Dashboard
```

### Manual Testing with Sample Data

| Test Case | File | Expected Result |
|-----------|------|-----------------|
| Patient Admission | `samples/sample_adt.hl7` | FHIR Patient resource created |
| Lab Results | `samples/sample_lab_result.hl7` | (Future: FHIR Observation) |

---

## 🔧 Troubleshooting

### Container Won't Start

```powershell
# Check logs
docker logs mirth-connect
docker logs fhir-logic-service

# Restart services
docker-compose restart
```

### Connection Refused: fhir-logic-service

**Problem:** Mirth using `localhost:3000` instead of container name  
**Solution:** In HTTP Sender URL, use `http://fhir-logic-service:3000/fhir/Patient`

### HL7 Message Not Parsing

**Problem:** Line break encoding issues  
**Solution:** Ensure segments separated by `\r` (carriage return). In Mirth, use "Send Message" feature instead of copy-paste.

### Port Already in Use

```powershell
# Find process using port 18082
netstat -ano | findstr :18082

# Kill process (replace PID)
taskkill /PID <PID> /F
```

---

## 🎓 Learning Resources

### HL7 v2.x
- **Specification:** [HL7 v2.5 Documentation](http://www.hl7.org)
- **Tutorial:** [HL7 Soup Guide](https://www.hl7soup.com)

### FHIR R4
- **Official Docs:** [hl7.org/fhir](https://www.hl7.org/fhir/)
- **Patient Resource:** [FHIR Patient](https://www.hl7.org/fhir/patient.html)

### Mirth Connect
- **User Guide:** [NextGen Integration Engine](https://www.nextgen.com/products-and-services/integration-engine)
- **Community:** [Mirth Connect Forums](https://forums.mirthcorp.com/)

---

## 🚢 Production Considerations

### What This Reference **Does NOT** Include:
- ❌ Authentication/Authorization (OAuth2, SMART on FHIR)
- ❌ External database (PostgreSQL/MySQL)
- ❌ Message persistence/retry logic
- ❌ Horizontal scaling/load balancing
- ❌ Monitoring/alerting (Prometheus/Grafana)

### Ideas for Production Hardening:
1. **Security:** Implement mTLS, API keys, RBAC
2. **Database:** Migrate from Derby to PostgreSQL cluster
3. **Observability:** Add ELK stack or Datadog integration
4. **High Availability:** Kubernetes deployment with 3+ Mirth replicas
5. **Compliance:** HIPAA audit logging, PHI encryption at rest

---

## 📝 License

MIT License - Free for educational and commercial use.
This project is provided as an **educational resource** for the healthcare developer community.

Use it freely to learn, build, and improve healthcare interoperability.
---

## 👨‍💻 Author

**InfoGleam Health Systems**  
*Healthcare Interoperability Specialists*
*Hisham Alrashdan*
For questions or consulting inquiries, contact: hisham@infogleam.com

---

## 🌟 Credits

- **Mirth Connect** by NextGen Healthcare
- **HL7 Standards** by Health Level Seven International
- **FHIR** by HL7.org

---

**Built with love for the healthcare community by [InfoGleam](https://infogleam.com)**
