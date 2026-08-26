import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rptxtzrwoyuedbjzpqhp.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJwdHh0enJ3b3l1ZWRianpwcWhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjAxMDExOTAsImV4cCI6MjAzNTY3NzE5MH0.Q6X_placeholder';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
