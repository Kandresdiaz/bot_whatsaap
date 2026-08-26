const { createClient } = require('@supabase/supabase-js');

const cleanString = (val) => (val || '').trim().replace(/^['"]|['"]$/g, '');

const DEFAULT_URL = 'https://rptxtzrwoyuedbjzpqhp.supabase.co';
const DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJwdHh0enJ3b3l1ZWRianpwcWhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxOTQ2OTksImV4cCI6MjA5ODc3MDY5OX0.Mp-Hj5PcSZH-tVIhQNsDkdhWqMRUOFxH0pV8P23eM0E';

const rawUrl = cleanString(process.env.SUPABASE_URL);
const rawService = cleanString(process.env.SUPABASE_SERVICE_KEY);
const rawAnon = cleanString(process.env.SUPABASE_ANON_KEY);

const supabaseUrl = rawUrl || DEFAULT_URL;

let supabaseKey = DEFAULT_ANON;
if (rawService && !rawService.includes('your_service')) {
  supabaseKey = rawService;
} else if (rawAnon) {
  supabaseKey = rawAnon;
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = { supabase };
