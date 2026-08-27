const { supabase } = require('./db/supabase');

const isUuid = (str) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

const getValidUserUuids = (userId) => {
  const set = new Set();
  if (isUuid(userId)) set.add(userId);
  set.add('00000000-0000-0000-0000-000000000001');
  return Array.from(set);
};

async function testGetRoute(userId) {
  const validUuids = getValidUserUuids(userId);
  console.log(`Testing GET /api/business/${userId} with validUuids:`, validUuids);

  try {
    let { data, error } = await supabase
      .from('businesses')
      .select('*')
      .in('user_id', validUuids)
      .order('created_at', { ascending: false })
      .limit(1);

    console.log('Query result:', data, 'Error:', error);

    let business = (data && data.length > 0) ? data[0] : null;

    if (!business) {
      console.log('Fallback query running...');
      const { data: fallback, error: fbErr } = await supabase
        .from('businesses')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);
      console.log('Fallback result:', fallback, 'Error:', fbErr);
      if (fallback && fallback.length > 0) {
        business = fallback[0];
      }
    }

    console.log('FINAL BUSINESS FOUND:', business);
  } catch (e) {
    console.error('CATCH ERROR:', e.message);
  }
}

async function run() {
  await testGetRoute('0b8c0710-b97a-4e2d-acf8-b7f33dcd5b3d');
  await testGetRoute('admin');
}

run();
