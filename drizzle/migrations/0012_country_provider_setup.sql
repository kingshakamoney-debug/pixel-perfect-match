CREATE TABLE public.countries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK (length(btrim(name)) > 0),
 code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z]{2}$'),
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.countries TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.countries TO authenticated;
GRANT ALL ON public.countries TO service_role;
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read countries" ON public.countries FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin write countries" ON public.countries FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
ALTER TABLE public.providers ADD COLUMN country_id uuid REFERENCES public.countries(id) ON DELETE RESTRICT;
CREATE INDEX providers_country_id_idx ON public.providers(country_id);
INSERT INTO public.countries (name, code)
SELECT DISTINCT CASE slug WHEN 'ghana-nla' THEN 'Ghana' WHEN 'golden-chance' THEN 'Nigeria' END,
 CASE slug WHEN 'ghana-nla' THEN 'GH' WHEN 'golden-chance' THEN 'NG' END
FROM public.providers WHERE slug IN ('ghana-nla', 'golden-chance');
UPDATE public.providers p SET country_id = c.id FROM public.countries c WHERE (p.slug = 'ghana-nla' AND c.code = 'GH') OR (p.slug = 'golden-chance' AND c.code = 'NG');
CREATE FUNCTION public.require_provider_country() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF NEW.country_id IS NULL THEN RAISE EXCEPTION 'Select a country before adding a provider'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER require_provider_country BEFORE INSERT OR UPDATE OF country_id ON public.providers FOR EACH ROW EXECUTE FUNCTION public.require_provider_country();