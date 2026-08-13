const { createClient } = require('@supabase/supabase-js');

const serviceKey = (process.env.SUPABASE_SERVICE_KEY && !process.env.SUPABASE_SERVICE_KEY.includes('your_service'))
  ? process.env.SUPABASE_SERVICE_KEY
  : process.env.SUPABASE_ANON_KEY;

const supabase = createClient(
  process.env.SUPABASE_URL,
  serviceKey
);

module.exports = { supabase };
