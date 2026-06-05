-- "Top KPIs": a curated subset of key results shown above Town Hall on Home.
-- Same KRs as Priorities — is_kpi just flags which ones surface as headline KPIs.
alter table key_results add column if not exists is_kpi boolean not null default false;
