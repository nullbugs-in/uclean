-- The analysis findings an admin confirms on the booking card are the store's
-- record of what the product analysis found. They are finalised in the invoice
-- form and travel with the invoice, so a nullable text column on `invoices`
-- (one invoice per order by design) is the natural home.
alter table public.invoices
  add column analysis_note text;

comment on column public.invoices.analysis_note is
  'Product-analysis findings confirmed by the admin when the booking left picked_up; finalised on the invoice form.';
