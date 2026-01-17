const net = require('net');
const fs = require('fs');
const path = require('path');

// Configuration
const MIRTH_HOST = 'localhost';
const MIRTH_PORT = 19002;
const HL7_START_BLOCK = '\x0B'; // Vertical Tab (Start of message)
const HL7_END_BLOCK = '\x1C\x0D'; // File Separator + Carriage Return (End of message)

/**
 * Send HL7 message to Mirth Connect via MLLP protocol
 * @param {string} hl7Message - Raw HL7 message content
 * @param {string} host - Mirth server host
 * @param {number} port - Mirth LLP listener port
 */
function sendHL7Message(hl7Message, host = MIRTH_HOST, port = MIRTH_PORT) {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        
        // HL7 v2.x segments should be separated by carriage returns (\r).
        // Normalize file/newline formats (\r\n or \n) to \r to avoid parser issues in MLLP receivers.
        const normalizedMessage = String(hl7Message)
            .replace(/\r\n/g, '\r')
            .replace(/\n/g, '\r');

        // Wrap message in MLLP envelope
        const mllpMessage = HL7_START_BLOCK + normalizedMessage + HL7_END_BLOCK;
        
        console.log('\n╔═══════════════════════════════════════════════════╗');
        console.log('║   InfoGleam HL7 Message Sender                    ║');
        console.log('╚═══════════════════════════════════════════════════╝\n');
        console.log(`📤 Connecting to Mirth: ${host}:${port}`);
        
        // Connect to Mirth
        client.connect(port, host, () => {
            console.log('✅ Connected to Mirth Connect');
            console.log('📨 Sending HL7 message...\n');
            
            // Send message
            client.write(mllpMessage);
        });
        
        // Handle response
        client.on('data', (data) => {
            console.log('✅ Received acknowledgment from Mirth:');
            console.log(data.toString());
            client.destroy(); // Close connection
            resolve(data.toString());
        });
        
        // Handle errors
        client.on('error', (err) => {
            console.error('❌ Connection error:', err.message);
            reject(err);
        });
        
        // Handle close
        client.on('close', () => {
            console.log('\n🔌 Connection closed');
        });
        
        // Timeout after 10 seconds
        client.setTimeout(10000, () => {
            console.error('❌ Connection timeout');
            client.destroy();
            reject(new Error('Connection timeout'));
        });
    });
}

/**
 * Read HL7 file and send to Mirth
 * @param {string} filePath - Path to HL7 file
 */
async function sendHL7File(filePath) {
    try {
        // Read file
        const hl7Message = fs.readFileSync(filePath, 'utf8');
        
        // Show message preview
        const lines = hl7Message
            .replace(/\r\n/g, '\r')
            .replace(/\n/g, '\r')
            .split('\r')
            .slice(0, 5);
        console.log('📄 Message Preview:');
        console.log('─'.repeat(60));
        lines.forEach(line => console.log(line));
        console.log('─'.repeat(60));
        
        // Send message
        await sendHL7Message(hl7Message);
        
        console.log('\n✅ Message sent successfully!');
        console.log('💡 Check FHIR service logs to see the transformation:');
        console.log('   docker logs -f fhir-logic-service\n');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

// CLI Interface
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        // Default: Send sample ADT message
        const defaultFile = path.join(__dirname, 'samples', 'sample_adt.hl7');
        console.log('ℹ️  No file specified. Using default: samples/sample_adt.hl7\n');
        sendHL7File(defaultFile);
    } else {
        // Send specified file
        const filePath = args[0];
        if (!fs.existsSync(filePath)) {
            console.error(`❌ File not found: ${filePath}`);
            process.exit(1);
        }
        sendHL7File(filePath);
    }
}

module.exports = { sendHL7Message, sendHL7File };
