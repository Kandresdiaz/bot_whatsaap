const { createClient } = require('@supabase/supabase-js');

const DEFAULT_URL = 'https://rptxtzrwoyuedbjzpqhp.supabase.co';
const DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJwdHh0enJ3b3l1ZWRianpwcWhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxOTQ2OTksImV4cCI6MjA5ODc3MDY5OX0.Mp-Hj5PcSZH-tVIhQNsDkdhWqMRUOFxH0pV8P23eM0E';

async function testKeys() {
  const supabaseAnon = createClient(DEFAULT_URL, DEFAULT_ANON);
  const { data: anonData, error: anonErr } = await supabaseAnon.from('businesses').select('*');
  console.log('ANON KEY RESULT:', anonData, 'Error:', anonErr);
}

testKeys();
