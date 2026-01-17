const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'healthy', 
        service: 'InfoGleam FHIR Service',
        timestamp: new Date().toISOString()
    });
});

// Main FHIR Patient transformation endpoint
app.post('/fhir/Patient', (req, res) => {
    console.log('=== Received HL7 Data from Mirth ===');
    console.log(JSON.stringify(req.body, null, 2));
    
    try {
        const hl7Data = req.body;
        
        // Validate required fields
        if (!hl7Data.lastName && !hl7Data.firstName) {
            return res.status(400).json({ 
                error: 'Missing required patient identification data' 
            });
        }
        
        // Transform to FHIR R4 Patient Resource
        const fhirPatient = {
            resourceType: "Patient",
            id: hl7Data.patientId || `patient-${Date.now()}`,
            meta: {
                versionId: "1",
                lastUpdated: new Date().toISOString(),
                source: "urn:infogleam:mirth"
            },
            identifier: [
                {
                    system: "http://hospital.infogleam.com/patients",
                    value: hl7Data.patientId || "UNKNOWN"
                }
            ],
            name: [
                {
                    use: "official",
                    family: hl7Data.lastName || "Unknown",
                    given: hl7Data.firstName ? [hl7Data.firstName] : ["Unknown"]
                }
            ],
            gender: mapGender(hl7Data.gender)
        };

        if (hl7Data.birthDate) {
            fhirPatient.birthDate = hl7Data.birthDate;
        }

        if (hl7Data.address) {
            const address = {
                use: "home",
                line: [hl7Data.address]
            };
            if (hl7Data.city) address.city = hl7Data.city;
            if (hl7Data.zipCode) address.postalCode = hl7Data.zipCode;
            if (hl7Data.country) address.country = hl7Data.country;
            fhirPatient.address = [address];
        }

        if (hl7Data.phone) {
            fhirPatient.telecom = [
                {
                    system: "phone",
                    value: hl7Data.phone,
                    use: "home"
                }
            ];
        }
        
        console.log('\n=== ✅ Successfully Transformed to FHIR R4 ===');
        console.log(JSON.stringify(fhirPatient, null, 2));
        console.log('=====================================\n');
        
        res.status(201).json(fhirPatient);
        
    } catch (error) {
        console.error('❌ Error transforming to FHIR:', error.message);
        res.status(500).json({ 
            error: 'FHIR transformation failed', 
            details: error.message 
        });
    }
});

// Helper function to map HL7 gender to FHIR gender
function mapGender(hl7Gender) {
    if (!hl7Gender) return 'unknown';
    
    const genderMap = {
        'M': 'male',
        'F': 'female',
        'O': 'other',
        'U': 'unknown'
    };
    
    return genderMap[hl7Gender.toUpperCase()] || 'unknown';
}

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log('╔═══════════════════════════════════════════════════╗');
    console.log('║   InfoGleam FHIR Transformation Service          ║');
    console.log('║   Status: Running ✓                               ║');
    console.log(`║   Port: ${PORT}                                      ║`);
    console.log('║   Endpoint: POST /fhir/Patient                    ║');
    console.log('╚═══════════════════════════════════════════════════╝\n');
});
