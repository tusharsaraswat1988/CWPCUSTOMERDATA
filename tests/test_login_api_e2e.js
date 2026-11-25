const http = require('http');

async function makeRequest(port, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request({
      hostname: '127.0.0.1',
      port: port,
      path: '/api',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, body: body });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function run() {
  // Require and start server on dynamic port
  const { server } = require('../server.js');
  
  await new Promise((resolve) => {
    if (server.listening) {
      resolve();
    } else {
      server.listen(0, '127.0.0.1', resolve);
    }
  });

  const address = server.address();
  const port = address.port;
  console.log('Testing against server on port:', port);

  // 1. Correct Admin Password
  console.log('\n--- 1. Testing Correct Admin Password ---');
  const resAdminCorrect = await makeRequest(port, {
    action: 'verifyAdminPassword',
    password: 'admin123',
    isAuto: true
  });
  console.log('Status:', resAdminCorrect.status, 'Response:', resAdminCorrect.data);
  if (!resAdminCorrect.data.success || !resAdminCorrect.data.token) {
    throw new Error('Correct admin login failed');
  }
  console.log('✅ Correct admin password verified successfully.');

  // 2. Wrong Admin Password with isAuto: true
  console.log('\n--- 2. Testing Wrong Admin Password with isAuto: true ---');
  for (let i = 0; i < 7; i++) {
    const resAdminWrongAuto = await makeRequest(port, {
      action: 'verifyAdminPassword',
      password: 'wrongpass_' + i,
      isAuto: true
    });
    console.log(`Attempt ${i + 1} Status:`, resAdminWrongAuto.status, 'Success:', resAdminWrongAuto.data.success);
    if (resAdminWrongAuto.status === 429) {
      throw new Error('Rate limit was triggered on isAuto: true! isAuto should protect against lockout');
    }
  }
  console.log('✅ isAuto: true protected against premature lockout during typing pauses.');

  // 3. Admin login still works after isAuto attempts
  const resAdminRetry = await makeRequest(port, {
    action: 'verifyAdminPassword',
    password: 'admin123',
    isAuto: true
  });
  if (!resAdminRetry.data.success) {
    throw new Error('Admin login failed after auto checks');
  }
  console.log('✅ Admin login succeeded immediately with correct password.');

  // 4. Staff PIN verification
  console.log('\n--- 4. Testing Staff PIN Verification ---');
  const resStaffWrong = await makeRequest(port, {
    action: 'verifyStaffPin',
    phone: '9876543210',
    pin: '000000',
    isAuto: true
  });
  console.log('Wrong Staff Status:', resStaffWrong.status, 'Success:', resStaffWrong.data.success);
  if (resStaffWrong.data.success) {
    throw new Error('Wrong PIN unexpectedly succeeded');
  }
  console.log('✅ Staff wrong PIN rejected properly.');

  console.log('\n🎉 ALL LOGIN API TESTS PASSED CLEANLY!\n');
  process.exit(0);
}

run().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
