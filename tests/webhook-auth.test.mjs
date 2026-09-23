import assert from 'node:assert/strict';
import { test } from 'node:test';
import handler from '../netlify/functions/vapi-webhook.mjs';

process.env.VAPI_WEBHOOK_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';

const body = JSON.stringify({ message: { type: 'status-update' } });
const post = (url, headers = {}) => handler(new Request(url, { method: 'POST', body, headers }));

test('rejects requests without the secret', async () => {
  assert.equal((await post('https://x/api/vapi-webhook')).status, 401);
  assert.equal((await post('https://x/api/vapi-webhook?secret=wrong')).status, 401);
});

test('accepts the secret in the header or in the URL', async () => {
  assert.equal((await post('https://x/api/vapi-webhook', { 'x-vapi-secret': 'test-secret' })).status, 200);
  assert.equal((await post('https://x/api/vapi-webhook?secret=test-secret')).status, 200);
});
