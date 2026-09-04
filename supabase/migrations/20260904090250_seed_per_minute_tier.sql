-- Seeds the ladder every site starts on: one open-ended band, charged by the
-- minute. penalty_percent is meaningless for this basis and stores 100, read
-- as "one hundred percent of one minute's wage".
insert into public.late_penalty_rules
  (site_id, shift_id, label, from_minutes, to_minutes, penalty_percent, basis, is_active)
select s.id, null, 'Late arrival — per minute', 0, null, 100, 'minute', true
  from public.sites s
 where not exists (
   select 1 from public.late_penalty_rules r
    where r.site_id = s.id and r.basis = 'minute'
 );
