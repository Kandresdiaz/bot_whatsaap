const https = require('https');

https.get('https://bot-whatsaap-tkjd.onrender.com/api/business/0b8c0710-b97a-4e2d-acf8-b7f33dcd5b3d', (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('STATUS:', res.statusCode);
    console.log('RESPONSE:', body);
  });
}).on('error', (e) => {
  console.error('ERROR:', e.message);
});
