-- Field reading for an enumerator trial: submissions (public + enumerator), consent, GPS (F2), pace,
-- duplicates, fraud, onboarding signals, email. READ-ONLY (sets default_transaction_read_only).
--
-- Run (from the repo root; both times are UTC):
--   ssh root@oslsr-home-app "docker exec -i oslsr-postgres psql -U oslsr_user -d oslsr_db \
--     -v t0='2026-09-30 14:36:10+00' -v since='<previous reading, UTC>'" < scripts/field-reading.sql
--
-- t0   = trial start (trial 2: 2026-09-30 14:36:10 UTC). since = the previous reading, for the deltas.
-- Rules baked in (handoff §2au): every negated text predicate is coalesce()d; headline counts are reconciled two
-- ways (3b: source column vs users/roles join). A count that does not reconcile is a finding, not noise.
-- ⛔ OUTPUT IS PII: 5c/9c print respondent names, 9b phone suffixes, 3/5/8 staff logins. Read it in the terminal;
-- never commit it or paste it into chat groups. Emails in 12 are masked.
-- Born 2026-10-13 (docs/adjudication-session-2026-10-13-to-14.md).
SET default_transaction_read_only = on;
\pset footer off
\echo '=== 0. now'
SELECT now() AT TIME ZONE 'Africa/Lagos' AS now_wat;

\echo '=== 1. registry by source (respondents) + submissions by source'
SELECT source, count(*) total,
  count(*) FILTER (WHERE created_at >= :'t0') since_t0,
  count(*) FILTER (WHERE created_at >= :'since') since_last_reading
FROM respondents GROUP BY 1 ORDER BY 1;
SELECT source, count(*) total,
  count(*) FILTER (WHERE created_at >= :'t0') since_t0,
  count(*) FILTER (WHERE created_at >= :'since') since_last_reading,
  count(*) FILTER (WHERE NOT processed) unprocessed,
  count(*) FILTER (WHERE processing_error IS NOT NULL) with_error,
  count(*) FILTER (WHERE respondent_id IS NULL) no_respondent
FROM submissions GROUP BY 1 ORDER BY 1;

\echo '=== 2. daily submissions since T0 (WAT), public vs enumerator, consent=no, gps'
SELECT (created_at AT TIME ZONE 'Africa/Lagos')::date d, source,
  count(*) n,
  count(*) FILTER (WHERE raw_data->>'consent_basic'='no') declined,
  count(*) FILTER (WHERE gps_latitude IS NOT NULL) gps,
  count(DISTINCT submitter_id) submitters
FROM submissions WHERE created_at >= :'t0' AND source<>'backfill'
GROUP BY 1,2 ORDER BY 1,2;

\echo '=== 3. Part E verbatim (enumerators, excl operator accounts)'
WITH enum AS (SELECT u.* FROM users u JOIN roles r ON r.id=u.role_id
  WHERE r.name='enumerator' AND u.email NOT LIKE 'lawalkolade%' AND u.status<>'deactivated')
SELECT split_part(e.email,'@',1) who, e.status,
  CASE WHEN e.status='invited' AND e.invited_at+interval '48 hours'<now() THEN 'EXPIRED' END link,
  e.photo_status photo, to_char(e.last_login_at+interval '1 hour','DD Mon HH24:MI') last_login,
  (SELECT count(*) FROM submissions s WHERE s.submitter_id=e.id::text AND s.created_at>=:'t0') subs_t0,
  (SELECT count(*) FROM submissions s WHERE s.submitter_id=e.id::text AND s.created_at>=:'since') subs_new,
  (SELECT count(*) FROM submissions s WHERE s.submitter_id=e.id::text AND s.created_at>=:'t0'
     AND s.raw_data->>'consent_basic'='no') declined,
  (SELECT count(*) FROM submissions s WHERE s.submitter_id=e.id::text AND s.created_at>=:'since'
     AND s.raw_data->>'consent_basic'='no') declined_new,
  (SELECT count(*) FROM submissions s JOIN respondents rp ON rp.id=s.respondent_id WHERE s.submitter_id=e.id::text
     AND s.created_at>=:'t0' AND upper(coalesce(rp.last_name,'')) LIKE '%ZZSMOKE%') zz,
  (SELECT to_char(max(s.created_at) AT TIME ZONE 'Africa/Lagos','DD Mon HH24:MI') FROM submissions s WHERE s.submitter_id=e.id::text) last_sub_wat
FROM enum e ORDER BY subs_t0 DESC, 1;

\echo '=== 3b. reconcile: enumerator-role submissions since T0 counted via users join vs source column'
SELECT
 (SELECT count(*) FROM submissions s JOIN users u ON u.id::text=s.submitter_id JOIN roles r ON r.id=u.role_id
   WHERE r.name='enumerator' AND s.created_at>=:'t0') via_role_all,
 (SELECT count(*) FROM submissions s JOIN users u ON u.id::text=s.submitter_id JOIN roles r ON r.id=u.role_id
   WHERE r.name='enumerator' AND u.email LIKE 'lawalkolade%' AND s.created_at>=:'t0') via_role_operator,
 (SELECT count(*) FROM submissions WHERE source='enumerator' AND created_at>=:'t0') via_source,
 (SELECT count(*) FROM submissions s WHERE s.source='enumerator' AND s.created_at>=:'t0'
   AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id::text=s.submitter_id)) enum_source_orphan_submitter;

\echo '=== 4. F2 GPS line since T0 (enumerator submissions, excl operator)'
SELECT count(*) subs, count(*) FILTER (WHERE s.gps_latitude IS NOT NULL) gps,
  round(100.0*count(*) FILTER (WHERE s.gps_latitude IS NOT NULL)/nullif(count(*),0),1) pct,
  count(DISTINCT s.submitter_id) enumerators,
  count(*) FILTER (WHERE s.gps_unavailable_reason IS NOT NULL) waived
FROM submissions s JOIN users u ON u.id::text=s.submitter_id JOIN roles r ON r.id=u.role_id
WHERE r.name='enumerator' AND u.email NOT LIKE 'lawalkolade%' AND s.created_at>=:'t0';

\echo '=== 6. NIN carried by respondent row (reconcile vs raw_data)'
SELECT s.source, count(*) n, count(*) FILTER (WHERE coalesce(rp.nin,'')<>'') resp_nin,
  count(*) FILTER (WHERE rp.status='pending_nin_capture') pending_nin,
  count(*) FILTER (WHERE mp.id IS NOT NULL) marketplace
FROM submissions s LEFT JOIN respondents rp ON rp.id=s.respondent_id
LEFT JOIN marketplace_profiles mp ON mp.respondent_id=rp.id
WHERE s.created_at>=:'t0' AND s.source IN ('public','enumerator') GROUP BY 1;

\echo '=== 7. declined consent: all-time by source, and was a name / NIN / marketplace attached'
SELECT s.source, count(*) declined,
  count(*) FILTER (WHERE s.created_at>=:'t0') since_t0,
  count(*) FILTER (WHERE s.created_at>=:'since') since_last,
  count(*) FILTER (WHERE coalesce(rp.first_name,'')<>'' OR coalesce(rp.last_name,'')<>'') named,
  count(*) FILTER (WHERE coalesce(rp.nin,'')<>'') with_nin,
  count(*) FILTER (WHERE coalesce(rp.phone_number,'')<>'') with_phone,
  count(*) FILTER (WHERE mp.id IS NOT NULL) marketplace,
  to_char(max(s.created_at) AT TIME ZONE 'Africa/Lagos','DD Mon HH24:MI') latest_wat
FROM submissions s LEFT JOIN respondents rp ON rp.id=s.respondent_id
LEFT JOIN marketplace_profiles mp ON mp.respondent_id=rp.id
WHERE s.raw_data->>'consent_basic'='no' GROUP BY 1;
\echo '--- consent_basic value distribution since T0 (non-backfill), incl NULL'
SELECT source, coalesce(raw_data->>'consent_basic','<null>') consent, count(*)
FROM submissions WHERE created_at>=:'t0' AND source<>'backfill' GROUP BY 1,2 ORDER BY 1,2;

\echo '--- enumerator subs since T0 WITHOUT a fraud_detections row'
SELECT count(*) FROM submissions s WHERE s.source='enumerator' AND s.created_at>=:'t0'
 AND NOT EXISTS (SELECT 1 FROM fraud_detections f WHERE f.submission_id=s.id);

\echo '=== 9. duplicates since T0 (non-backfill): same phone, same NIN, same name pair either order'
SELECT 'phone' k, rp.phone_number v, count(*) n, string_agg(DISTINCT s.source,',') src FROM respondents rp JOIN submissions s ON s.respondent_id=rp.id
 WHERE s.source IN ('public','enumerator') AND rp.phone_number IS NOT NULL
 GROUP BY 2 HAVING count(*)>1 AND max(s.created_at)>=:'t0'
UNION ALL
SELECT 'nin', rp.nin, count(*), string_agg(DISTINCT s.source,',') FROM respondents rp JOIN submissions s ON s.respondent_id=rp.id
 WHERE s.source IN ('public','enumerator') AND coalesce(rp.nin,'')<>''
 GROUP BY 2 HAVING count(*)>1 AND max(s.created_at)>=:'t0'
UNION ALL
SELECT 'name', least(upper(rp.first_name),upper(rp.last_name))||' / '||greatest(upper(rp.first_name),upper(rp.last_name)), count(*), string_agg(DISTINCT s.source,',')
 FROM respondents rp JOIN submissions s ON s.respondent_id=rp.id
 WHERE s.source IN ('public','enumerator') AND coalesce(rp.first_name,'')<>'' AND coalesce(rp.last_name,'')<>''
   AND upper(coalesce(rp.last_name,'')) NOT LIKE '%ZZSMOKE%'
 GROUP BY 2 HAVING count(*)>1 AND max(s.created_at)>=:'t0'
ORDER BY 1,3 DESC;
\echo '--- respondents with >1 submission (all-time, non-backfill)'
SELECT count(*) FROM (SELECT respondent_id FROM submissions WHERE source IN ('public','enumerator') AND respondent_id IS NOT NULL GROUP BY 1 HAVING count(*)>1) x;

\echo '=== 10. public side since T0: accounts, drafts, completions'
SELECT count(*) public_users_created FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='public_user' AND u.created_at>=:'t0';
SELECT (created_at AT TIME ZONE 'Africa/Lagos')::date d, count(*) drafts FROM wizard_drafts WHERE created_at>=:'t0' GROUP BY 1 ORDER BY 1;

\echo '=== 11. staff-signin defect: public_user accounts whose address = an enumerator address without +test'
SELECT split_part(p.email,'@',1) public_acct, to_char(p.created_at AT TIME ZONE 'Africa/Lagos','DD Mon HH24:MI') created_wat, e.status enum_status
FROM users p JOIN roles rp ON rp.id=p.role_id AND rp.name='public_user'
JOIN users e ON lower(regexp_replace(e.email,'\+[^@]*@','@'))=lower(p.email) AND e.id<>p.id
JOIN roles re ON re.id=e.role_id AND re.name IN ('enumerator','supervisor')
ORDER BY p.created_at;

\echo '=== 12. email since last reading + suppressions'
SELECT event_type, count(*) FROM email_events WHERE occurred_at>=:'since' GROUP BY 1 ORDER BY 2 DESC;
SELECT regexp_replace(email,'^(.{3})[^@]*','\1***') email, reason, severity, bounce_count, to_char(suppressed_at,'YYYY-MM-DD HH24:MI') FROM email_suppressions WHERE suppressed_at>=:'t0'::timestamptz - interval '30 days' ORDER BY suppressed_at;

\echo '=== 13. staff audit actions since last reading (who touched accounts)'
SELECT action, count(*) FROM audit_logs WHERE created_at>=:'since'
 AND (action LIKE 'user.%' OR action LIKE 'invitation.%' OR action LIKE 'staff.%' OR action LIKE '%delete%' OR action LIKE '%teardown%')
GROUP BY 1 ORDER BY 2 DESC;

\echo '=== 5. pace per enumerator since T0'
SELECT split_part(u.email,'@',1) who, count(*) n,
  round(((percentile_cont(0.5) WITHIN GROUP (ORDER BY s.completion_time_seconds))/60.0)::numeric,1) med_min,
  count(*) FILTER (WHERE s.completion_time_seconds < 60) sub_min,
  count(*) FILTER (WHERE s.completion_time_seconds < 120) sub_2min,
  count(*) FILTER (WHERE s.completion_time_seconds IS NULL) no_time,
  count(DISTINCT (s.created_at AT TIME ZONE 'Africa/Lagos')::date) days
FROM submissions s JOIN users u ON u.id::text=s.submitter_id
WHERE s.source='enumerator' AND s.created_at>=:'t0' GROUP BY 1 ORDER BY n DESC;

\echo '=== 5b. HYPOTHESIS: declined surveys are the short ones. completion time by consent'
SELECT raw_data->>'consent_basic' consent, count(*) n,
  round(((percentile_cont(0.5) WITHIN GROUP (ORDER BY completion_time_seconds)))::numeric,0) med_sec,
  min(completion_time_seconds) min_s, max(completion_time_seconds) max_s,
  count(*) FILTER (WHERE completion_time_seconds<60) sub_min,
  round(avg(jsonb_array_length(coalesce(NULL,'[]'::jsonb)))) _,
  round(avg((SELECT count(*) FROM jsonb_object_keys(raw_data)))::numeric,1) avg_keys
FROM submissions WHERE source='enumerator' AND created_at>=:'t0' GROUP BY 1;

\echo '=== 5c. the declined rows: who, when, secs, keys, gps, named, marketplace'
SELECT split_part(u.email,'@',1) who, to_char(s.created_at AT TIME ZONE 'Africa/Lagos','MM-DD HH24:MI') wat,
  s.completion_time_seconds secs, (SELECT count(*) FROM jsonb_object_keys(s.raw_data)) keys,
  (s.gps_latitude IS NOT NULL) gps, nullif(trim(coalesce(rp.first_name,'')||' '||coalesce(rp.last_name,'')),'') name,
  (mp.id IS NOT NULL) mkt, rp.status, left(s.id::text,8) sid
FROM submissions s JOIN users u ON u.id::text=s.submitter_id
LEFT JOIN respondents rp ON rp.id=s.respondent_id LEFT JOIN marketplace_profiles mp ON mp.respondent_id=rp.id
WHERE s.source='enumerator' AND s.raw_data->>'consent_basic'='no' AND s.created_at>=:'since' OR (s.raw_data->>'consent_basic'='no' AND mp.id IS NOT NULL AND s.source='enumerator')
ORDER BY s.created_at;

\echo '=== 5d. which raw_data keys does a declined enumerator row carry (top)'
SELECT k, count(*) FROM submissions s, jsonb_object_keys(s.raw_data) k
WHERE s.source='enumerator' AND s.raw_data->>'consent_basic'='no' GROUP BY 1 ORDER BY 2 DESC LIMIT 25;

\echo '=== 7b. public declined-consent rows: when, named, nin, marketplace'
SELECT to_char(s.created_at AT TIME ZONE 'Africa/Lagos','YYYY-MM-DD HH24:MI') wat, (coalesce(rp.nin,'')<>'') nin,
  (mp.id IS NOT NULL) mkt, rp.consent_marketplace cm, s.raw_data->>'consent_marketplace' raw_cm, left(s.id::text,8) sid
FROM submissions s LEFT JOIN respondents rp ON rp.id=s.respondent_id LEFT JOIN marketplace_profiles mp ON mp.respondent_id=rp.id
WHERE s.source='public' AND s.raw_data->>'consent_basic'='no' ORDER BY s.created_at;

\echo '=== 8. fraud since T0'
SELECT coalesce(split_part(u.email,'@',1), f.enumerator_id::text) who, f.severity, count(*),
  count(*) FILTER (WHERE f.reviewed_at IS NOT NULL) reviewed
FROM fraud_detections f JOIN submissions s ON s.id=f.submission_id
LEFT JOIN users u ON u.id::text=f.enumerator_id::text
WHERE s.created_at>=:'t0' GROUP BY 1,2 ORDER BY 1,2;

\echo '=== 9b. duplicate phones: is the phone the ENUMERATOR''s own / a fellow staff phone?'
WITH d AS (SELECT rp.phone_number ph FROM respondents rp JOIN submissions s ON s.respondent_id=rp.id
  WHERE s.source IN ('public','enumerator') AND rp.phone_number IS NOT NULL GROUP BY 1
  HAVING count(*)>1 AND max(s.created_at)>=:'t0')
SELECT right(d.ph,4) ph4, s.source, split_part(coalesce(u.email,'-'),'@',1) who,
  to_char(s.created_at AT TIME ZONE 'Africa/Lagos','MM-DD HH24:MI') wat,
  upper(left(coalesce(rp.first_name,''),1)||'. '||coalesce(rp.last_name,'')) name,
  s.raw_data->>'consent_basic' c,
  (SELECT split_part(x.email,'@',1) FROM users x WHERE x.phone IS NOT NULL AND right(regexp_replace(x.phone,'\D','','g'),10)=right(d.ph,10) LIMIT 1) staff_phone_owner
FROM d JOIN respondents rp ON rp.phone_number=d.ph JOIN submissions s ON s.respondent_id=rp.id
LEFT JOIN users u ON u.id::text=s.submitter_id ORDER BY d.ph, s.created_at;

\echo '=== 9c. NIN duplicate 44696752722'
SELECT s.source, split_part(coalesce(u.email,'-'),'@',1) who, to_char(s.created_at AT TIME ZONE 'Africa/Lagos','MM-DD HH24:MI') wat,
  upper(coalesce(rp.first_name,'')||' '||coalesce(rp.last_name,'')) name, left(rp.id::text,8) rid
FROM respondents rp JOIN submissions s ON s.respondent_id=rp.id LEFT JOIN users u ON u.id::text=s.submitter_id
WHERE rp.nin='44696752722';

\echo '=== 10b. public submissions with processing_error'
SELECT to_char(created_at AT TIME ZONE 'Africa/Lagos','YYYY-MM-DD HH24:MI') wat, left(processing_error,140) err FROM submissions WHERE processing_error IS NOT NULL;

\echo '=== 10c. public since T0 detail'
SELECT to_char(s.created_at AT TIME ZONE 'Africa/Lagos','MM-DD HH24:MI') wat, s.completion_time_seconds secs, rp.status, (coalesce(rp.nin,'')<>'') nin, (mp.id IS NOT NULL) mkt, s.raw_data->>'consent_basic' c, l.name lga
FROM submissions s LEFT JOIN respondents rp ON rp.id=s.respondent_id LEFT JOIN marketplace_profiles mp ON mp.respondent_id=rp.id LEFT JOIN lgas l ON l.id::text=rp.lga_id
WHERE s.source='public' AND s.created_at>=:'t0' ORDER BY s.created_at;

\echo '=== 12b. what were the 153 emails since last reading'
SELECT coalesce(campaign_id::text,'<none>') campaign, count(*) FROM email_events WHERE occurred_at>=:'since' AND event_type='sent' GROUP BY 1;
SELECT to_char(date_trunc('day',occurred_at),'MM-DD') d, count(*) FROM email_events WHERE occurred_at>=:'since' AND event_type='sent' GROUP BY 1 ORDER BY 1;
SELECT action, count(*) FROM audit_logs WHERE created_at>=:'since' GROUP BY 1 ORDER BY 2 DESC LIMIT 20;

\echo '=== 12c. bounce rate of emails captured BY ENUMERATORS (respondent emails in raw_data)'
WITH em AS (SELECT DISTINCT lower(s.raw_data->>'email') e FROM submissions s WHERE s.source='enumerator' AND coalesce(s.raw_data->>'email','')<>'')
SELECT count(*) captured, count(*) FILTER (WHERE e IN (SELECT lower(email) FROM email_suppressions)) suppressed FROM em;
WITH em AS (SELECT DISTINCT lower(s.raw_data->>'email') e FROM submissions s WHERE s.source='public' AND coalesce(s.raw_data->>'email','')<>'')
SELECT 'public' src, count(*) captured, count(*) FILTER (WHERE e IN (SELECT lower(email) FROM email_suppressions)) suppressed FROM em;

\echo '=== 14. gap: enumerator submissions per WAT day 10-08..10-13, and logins'
SELECT split_part(u.email,'@',1) who, to_char(a.created_at AT TIME ZONE 'Africa/Lagos','MM-DD HH24:MI') wat, a.action
FROM audit_logs a JOIN users u ON u.id=a.actor_id JOIN roles r ON r.id=u.role_id
WHERE r.name='enumerator' AND a.created_at>='2026-10-09 23:00:00+00' ORDER BY a.created_at LIMIT 40;
