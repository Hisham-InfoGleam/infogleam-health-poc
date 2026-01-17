# Mirth Channel Configuration Guide

This folder contains configuration files and documentation for setting up Mirth Connect channels.

## Quick Setup Instructions

### 1. Access Mirth Administrator
1. Ensure Docker containers are running: `docker compose up -d`
2. Wait 30-60 seconds for Mirth to fully start
3. Open browser to `http://localhost:18082` (Web dashboard)
4. Click "Launch Mirth Administrator"
5. Login credentials:
   - Server: `https://localhost:18444`
   - Username: `admin`
   - Password: `admin`

### 2. Create HL7 to FHIR Channel

#### Channel Settings
- **Name:** ADT_to_FHIR_Patient
- **Description:** Transforms HL7 ADT messages to FHIR R4 Patient resources

#### Source Connector (HL7 Listener)
- **Connector Type:** LLP Listener
- **Port:** 9001 (mapped to 19002 on host)
- **Data Type:** HL7 v2.x
- **Response:** Auto-generate (after source)

#### Source Transformer
Add a JavaScript transformer step to extract HL7 fields:

```javascript
// Extract patient demographics from HL7 PID segment
var patientId = msg['PID']['PID.3']['PID.3.1'].toString();
var lastName = msg['PID']['PID.5']['PID.5.1'].toString();
var firstName = msg['PID']['PID.5']['PID.5.2'].toString();
var middleName = msg['PID']['PID.5']['PID.5.3'].toString();
var birthDate = msg['PID']['PID.7']['PID.7.1'].toString();
var gender = msg['PID']['PID.8']['PID.8.1'].toString();
var address = msg['PID']['PID.11']['PID.11.1'].toString();
var city = msg['PID']['PID.11']['PID.11.3'].toString();
var zipCode = msg['PID']['PID.11']['PID.11.5'].toString();
var country = msg['PID']['PID.11']['PID.11.6'].toString();
var phone = msg['PID']['PID.13']['PID.13.1'].toString();

// Create JSON payload for FHIR service
var payload = {
    patientId: patientId,
    firstName: firstName,
    lastName: lastName,
    gender: gender,
    birthDate: formatDate(birthDate), // Format: YYYYMMDD -> YYYY-MM-DD
    address: address,
    city: city,
    zipCode: zipCode,
    country: country,
    phone: phone
};

// Helper function to format date
function formatDate(hl7Date) {
    if (hl7Date && hl7Date.length >= 8) {
        var year = hl7Date.substring(0, 4);
        var month = hl7Date.substring(4, 6);
        var day = hl7Date.substring(6, 8);
        return year + '-' + month + '-' + day;
    }
    return null;
}

// Set the transformed message
channelMap.put('fhirPayload', JSON.stringify(payload));
```

#### Destination Connector (HTTP Sender)
- **Connector Type:** HTTP Sender
- **URL:** `http://fhir-logic-service:3000/fhir/Patient`
  - ⚠️ **Important:** Use the container name `fhir-logic-service`, NOT `localhost`
- **Method:** POST
- **Content Type:** application/json
- **Request Body:** `${fhirPayload}`

#### Filter (Optional)
Add a filter to only process ADT^A01 messages:
```javascript
// Only process admission messages
var messageType = msg['MSH']['MSH.9']['MSH.9.1'].toString();
var triggerEvent = msg['MSH']['MSH.9']['MSH.9.2'].toString();
return (messageType == 'ADT' && triggerEvent == 'A01');
```

### 3. Deploy and Test

1. **Deploy Channel:**
   - Click the green play button in Mirth Administrator
   - Status should show green checkmark

2. **Send Test Message:**
   - Right-click on channel → Send Message
   - Copy content from `samples/sample_adt.hl7`
   - Click "Send"

3. **Verify Results:**
   - Check Mirth Dashboard for message count
   - View FHIR service logs:
     ```bash
     docker logs -f fhir-logic-service
     ```
   - You should see FHIR JSON output

### 4. Export Channel (For Sharing)

1. Right-click on channel → Export Channel
2. Save as `adt_to_fhir_channel.xml`
3. Commit to version control

## Troubleshooting

### Issue: Connection Refused to FHIR Service
**Solution:** Ensure both containers are on the same Docker network. Use container name, not `localhost`.

### Issue: Cannot Parse HL7 Message
**Solution:** Verify message has proper line breaks. HL7 segments must be separated by `\r` (carriage return).

### Issue: Mirth Won't Start
**Solution:** 
- Check if port 18082 or 18444 is already in use
- Review Docker logs: `docker logs mirth-poc`
- Wait longer (first start can take 60+ seconds)

## Advanced Configuration

### Database Configuration (Production)
For production, replace Derby with PostgreSQL or MySQL:

```yaml
# In docker-compose.yml, add database environment variables to Mirth:
environment:
  - DATABASE=postgres
  - DATABASE_URL=jdbc:postgresql://postgres:5432/mirthdb
  - DATABASE_USERNAME=mirth
  - DATABASE_PASSWORD=your_secure_password
```

### High Availability Setup
- Deploy multiple Mirth instances behind a load balancer
- Use external database (PostgreSQL/MySQL)
- Implement message queuing (RabbitMQ/Kafka)

## Resources

- [Mirth Connect User Guide](https://www.nextgen.com/products-and-services/integration-engine)
- [HL7 v2.5 Specification](http://www.hl7.org)
- [FHIR R4 Documentation](https://www.hl7.org/fhir/)
