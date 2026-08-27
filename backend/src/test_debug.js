const https = require('https');

function get(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', err => resolve({ error: err.message }));
  });
}

async function run() {
  console.log('Fetching /api/business/admin ...');
  console.log(await get('https://bot-whatsaap-tkjd.onrender.com/api/business/admin'));

  console.log('Fetching /api/business/0b8c0710-b97a-4e2d-acf8-b7f33dcd5b3d ...');
  console.log(await get('https://bot-whatsaap-tkjd.onrender.com/api/business/0b8c0710-b97a-4e2d-acf8-b7f33dcd5b3d'));

  console.log('Fetching /api/business/8fd9a59d-77d7-4db7-8637-9aaebca1158e ...');
  console.log(await get('https://bot-whatsaap-tkjd.onrender.com/api/business/8fd9a59d-77d7-4db7-8637-9aaebca1158e'));
}

run();
