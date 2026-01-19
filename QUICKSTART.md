# 🚀 Quick Start Guide

## Complete Setup in 3 Commands

```powershell
# 1. Start all services
npm start

# 2. Wait 60 seconds, then configure Mirth
# Open http://localhost:18082 and follow mirth-config/README.md

# 3. Test the integration
npm run test:send-hl7
```

## What Happens Next?

1. **Mirth receives** HL7 message on port 19002
2. **Transforms** patient data using JavaScript
3. **Sends JSON** to FHIR service via HTTP
4. **Node.js creates** valid FHIR R4 Patient resource
5. **Logs output** to console

## View Live Results

```powershell
# Watch FHIR service transformation logs
npm run logs:fhir

# Watch Mirth Connect logs
npm run logs:mirth
```

## Useful Commands

```powershell
# Stop all services
npm stop

# Rebuild containers (after code changes)
npm run rebuild

# Send lab results message
npm run test:send-lab
```

## Troubleshooting

**Q: Containers won't start?**  
A: Check Docker Desktop is running and ports 3000, 18082, 18444, 19002 are free

**Q: Mirth not responding?**  
A: Wait 60-90 seconds after `npm start` for full initialization

**Q: Connection refused error?**  
A: Ensure Mirth channel uses `http://fhir-logic-service:3000` not `localhost`

---

Full documentation: [README.md](README.md)
