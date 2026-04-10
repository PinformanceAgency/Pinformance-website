-- Add page_visits column to sales_data for organic Pinterest WEB_SESSIONS
alter table sales_data add column if not exists page_visits int default 0;
