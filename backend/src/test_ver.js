const https = require('https');

https.get('https://bot-whatsaap-tkjd.onrender.com/api/debug/version', (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('VERSION RESPONSE:', body);
  });
});
