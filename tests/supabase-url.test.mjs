import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normaliseSupabaseUrl } from '../src/lib/supabase-url.js';

test('normaliseSupabaseUrl turns any copied Supabase address into the project URL', () => {
  const want = 'https://abcdefgh.supabase.co';
  for (const input of [
    'https://abcdefgh.supabase.co',
    'https://abcdefgh.supabase.co/',
    'https://abcdefgh.supabase.co/rest/v1/',
    '  https://abcdefgh.supabase.co/rest/v1  ',
    'abcdefgh.supabase.co',
    '"https://abcdefgh.supabase.co"',
    'https://supabase.com/dashboard/project/abcdefgh/settings/api',
  ]) {
    assert.equal(normaliseSupabaseUrl(input), want, input);
  }
});
