import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

console.log('Testing Supabase Client connection...');
console.log('URL:', process.env.SUPABASE_URL);

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  try {
    const { data, error } = await supabase.from('products').select('*').limit(1);
    if (error) {
      console.log('Query result:', error.message, error.code);
    } else {
      console.log('✅ Query succeeded! Products found:', data.length);
    }
  } catch (err) {
    console.error('Exception:', err.message);
  }
}

test();
