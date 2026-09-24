// One data API for the dashboard: Supabase in production, in-memory sample data in demo mode.
import { DEMO_MODE, supabase } from './supabase.js';

const BASE_CALL_COLUMNS =
  'id, call_started_at, duration_seconds, caller_name, callback_number, address, issue, details, urgency';
const PRO_CALL_COLUMNS = `${BASE_CALL_COLUMNS}, job_type, summary, recording_url, lead_status, won_value, notes, assigned_to, status_updated_at`;
const BASE_CLIENT_COLUMNS = 'id, business_name, avg_job_value, conversion_rate';
const PRO_CLIENT_COLUMNS = `${BASE_CLIENT_COLUMNS}, monthly_fee, timezone, business_hours, review_url`;
const ALERT_CLIENT_COLUMNS = `${PRO_CLIENT_COLUMNS}, callback_urgent_minutes, callback_standard_minutes, calendar_token`;
const MAX_CALLS = 3000;

// "column does not exist" / "relation does not exist" => the pro_features migration isn't run yet.
const isMissingSchema = (error) => /column|relation|schema cache|does not exist/i.test(error?.message ?? '');

function supabaseSource() {
  let pro = true;
  let alerts = true;

  async function select(table, proCols, baseCols, build) {
    if (pro) {
      const { data, error } = await build(supabase.from(table).select(proCols));
      if (!error) return data;
      if (!isMissingSchema(error)) throw error;
      pro = false;
    }
    const { data, error } = await build(supabase.from(table).select(baseCols));
    if (error) throw error;
    return data;
  }

  return {
    get pro() {
      return pro;
    },
    get alerts() {
      return alerts && pro;
    },
    async client() {
      // Newest features first; fall back if the matching database update hasn't been run.
      if (alerts) {
        const { data, error } = await supabase.from('clients').select(ALERT_CLIENT_COLUMNS).maybeSingle();
        if (!error) return data;
        if (!isMissingSchema(error)) throw error;
        alerts = false;
      }
      return select('clients', PRO_CLIENT_COLUMNS, BASE_CLIENT_COLUMNS, (q) => q.maybeSingle());
    },
    // Quietly note that a lead's alert was seen, so no backup text is sent.
    async markAlertOpened(id) {
      if (!alerts) return;
      await supabase.from('calls').update({ alert_opened_at: new Date().toISOString() }).eq('id', id).is('alert_opened_at', null);
    },
    async members() {
      if (!pro) return [];
      const { data, error } = await supabase.from('client_members').select('display_name').order('display_name');
      if (error) return [];
      return data;
    },
    async calls() {
      return select('calls', PRO_CALL_COLUMNS, BASE_CALL_COLUMNS, (q) =>
        q.order('call_started_at', { ascending: false }).limit(MAX_CALLS),
      );
    },
    async transcript(id) {
      const { data, error } = await supabase.from('calls').select('transcript').eq('id', id).maybeSingle();
      if (error) throw error;
      return data?.transcript ?? null;
    },
    async updateCall(id, patch) {
      const { error } = await supabase.from('calls').update(patch).eq('id', id);
      if (error) throw error;
    },
    // Returns how many were actually deleted (0 if the delete permission update isn't run yet).
    async deleteCalls(ids) {
      const { data, error } = await supabase.from('calls').delete().in('id', ids).select('id');
      if (error) throw error;
      return data?.length ?? 0;
    },
    async bookings() {
      if (!pro) return [];
      const since = new Date(Date.now() - 60 * 86400000).toISOString();
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .gte('starts_at', since)
        .order('starts_at', { ascending: true })
        .limit(1000);
      if (error) return [];
      return data;
    },
    async saveBooking(booking) {
      const { id, ...fields } = booking;
      const query = id
        ? supabase.from('bookings').update(fields).eq('id', id).select().single()
        : supabase.from('bookings').insert(fields).select().single();
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    async deleteBooking(id) {
      const { error } = await supabase.from('bookings').delete().eq('id', id);
      if (error) throw error;
    },
    subscribe(onChange, onStatus) {
      // RLS applies to realtime too: only this business's rows arrive.
      const channel = supabase
        .channel('dashboard')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, onChange);
      if (pro) channel.on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, onChange);
      channel.subscribe((status) => onStatus?.(status === 'SUBSCRIBED'));
    },
    async signOut() {
      await supabase.auth.signOut();
    },
    async hasSession() {
      const { data } = await supabase.auth.getSession();
      return Boolean(data.session);
    },
  };
}

async function demoSource() {
  const { demoClient, demoCalls, demoBookings, demoMembers } = await import('./demo.js');
  const calls = demoCalls.map((c) => ({ ...c }));
  let bookings = demoBookings.map((b) => ({ ...b }));
  const pause = () => new Promise((r) => setTimeout(r, 120));
  return {
    pro: true,
    alerts: true,
    markAlertOpened: async () => {},
    client: async () => demoClient,
    members: async () => demoMembers,
    calls: async () => calls,
    transcript: async (id) => calls.find((c) => c.id === id)?.transcript ?? null,
    async deleteCalls(ids) {
      await pause();
      for (const id of ids) calls.splice(calls.findIndex((c) => c.id === id), 1);
      return ids.length;
    },
    async updateCall(id, patch) {
      await pause();
      const call = calls.find((c) => c.id === id);
      if (patch.lead_status && patch.lead_status !== call.lead_status) call.status_updated_at = new Date().toISOString();
      Object.assign(call, patch);
    },
    bookings: async () => bookings,
    async saveBooking(booking) {
      await pause();
      if (booking.id) {
        bookings = bookings.map((b) => (b.id === booking.id ? { ...b, ...booking } : b));
        return bookings.find((b) => b.id === booking.id);
      }
      const saved = { ...booking, id: `demo-b-${Date.now()}`, source: booking.source ?? 'manual', status: booking.status ?? 'booked' };
      bookings.push(saved);
      return saved;
    },
    async deleteBooking(id) {
      bookings = bookings.filter((b) => b.id !== id);
    },
    subscribe: () => {},
    signOut: async () => {},
    hasSession: async () => true,
  };
}

export async function createDataSource() {
  return DEMO_MODE ? demoSource() : supabaseSource();
}
