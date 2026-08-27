const https = require('https');

https.get('https://bot-whatsaap-tkjd.onrender.com/ping', (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('PING STATUS:', res.statusCode, 'BODY:', body);
  });
});
