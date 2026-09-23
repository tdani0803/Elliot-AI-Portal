#!/usr/bin/env node
// Onboard a new ElliotAI client: creates their login (and emails them an invite to set a
// password) plus their business record. This is the "admin panel" — it's just you.
//
//   node --env-file=.env scripts/create-client.mjs \
//     --email owner@acmeroofing.com.au \
//     --business "Acme Roofing" \
//     --avg-job-value 2500 \
//     --assistant-id <vapi-assistant-id> \
//     [--conversion-rate 0.3]
//
// Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and PORTAL_URL in the environment.

import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    business: { type: 'string' },
    'avg-job-value': { type: 'string' },
    'assistant-id': { type: 'string' },
    'conversion-rate': { type: 'string', default: '0.3' },
  },
});

const email = values.email?.trim();
const business = values.business?.trim();
const avgJobValue = Number(values['avg-job-value']);
const conversionRate = Number(values['conversion-rate']);
const assistantId = values['assistant-id']?.trim();

const problems = [];
if (!email) problems.push('--email is required');
if (!business) problems.push('--business is required');
if (!(avgJobValue >= 0)) problems.push('--avg-job-value must be a number (e.g. 2500)');
if (!(conversionRate > 0 && conversionRate <= 1)) problems.push('--conversion-rate must be between 0 and 1 (e.g. 0.3)');
if (!assistantId) problems.push('--assistant-id is required (the Vapi assistant that answers their calls)');
for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'PORTAL_URL']) {
  if (!process.env[key]) problems.push(`${key} is not set`);
}
if (problems.length) {
  console.error(problems.map((p) => `✗ ${p}`).join('\n'));
  process.exit(1);
}

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
  redirectTo: new URL('/reset-password.html', process.env.PORTAL_URL).href,
});
if (inviteError) {
  console.error(`✗ Could not invite ${email}: ${inviteError.message}`);
  process.exit(1);
}

const { data: client, error: clientError } = await admin
  .from('clients')
  .insert({
    user_id: invite.user.id,
    business_name: business,
    avg_job_value: avgJobValue,
    conversion_rate: conversionRate,
    vapi_assistant_id: assistantId,
  })
  .select('id')
  .single();
if (clientError) {
  console.error(`✗ Invited ${email}, but could not create the business record: ${clientError.message}`);
  console.error('  Fix the problem, then delete the user in Supabase → Authentication and run this again.');
  process.exit(1);
}

console.log(`✓ ${business} is set up (client id ${client.id}).`);
console.log(`✓ Invite emailed to ${email} — they click it, pick a password, and they're in.`);
