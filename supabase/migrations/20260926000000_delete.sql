-- ElliotAI Client Portal — let clients delete their own calls (test calls, time-wasters).
-- Run AFTER the earlier updates. Safe to run more than once.

drop policy if exists "Delete own calls" on public.calls;
create policy "Delete own calls"
  on public.calls for delete to authenticated
  using (client_id in (select public.my_client_ids()));

grant delete on public.calls to authenticated;
