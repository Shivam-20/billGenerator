const http = require('http');
const app = require('./server'); // This starts the server on PORT 3000

// Helper to make requests
function makeRequest(path, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: '/api' + path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });

        req.on('error', reject);

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function runTests() {
    console.log('Waiting for server to start...');
    await new Promise(r => setTimeout(r, 2000)); // Wait for server to bind

    console.log('\n=== Testing API Endpoints ===');

    // Test 1: Health
    try {
        const res = await makeRequest('/health');
        console.log(`[${res.status === 200 ? 'PASS' : 'FAIL'}] GET /health`);
    } catch (e) {
        console.error('[FAIL] GET /health', e.message);
    }

    // Test 2: Defaults
    try {
        const res = await makeRequest('/defaults');
        console.log(`[${res.status === 200 ? 'PASS' : 'FAIL'}] GET /defaults`);
    } catch (e) {
        console.error('[FAIL] GET /defaults', e.message);
    }

    // Test 3: Generate Invoice (Empty) - Should fail or return default? 
    // Code says: "if (!req.body) return 400". But valid JSON "{}" is req.body = {}.
    try {
        const res = await makeRequest('/generate-invoice', 'POST', {});
        // Should be 200 because pdfGenerator handles empty object by using defaults
        console.log(`[${res.status === 200 ? 'PASS' : 'FAIL'}] POST /generate-invoice (Empty)`);
    } catch (e) {
        console.error('[FAIL] POST /generate-invoice', e.message);
    }

    console.log('\nTests completed. Press Ctrl+C to exit (Server needs manual kill)');
    process.exit(0);
}

runTests();
