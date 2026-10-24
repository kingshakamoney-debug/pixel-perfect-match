ALTER TABLE public.profiles ADD COLUMN handle text;
UPDATE public.profiles SET handle = 'member_' || replace(user_id::text, '-', '') WHERE handle IS NULL;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_handle_format CHECK (handle IS NOT NULL AND handle ~ '^[a-z0-9_]{3,40}$');
CREATE UNIQUE INDEX profiles_handle_unique ON public.profiles(handle);
CREATE OR REPLACE FUNCTION public.normalize_profile_handle() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.handle IS DISTINCT FROM OLD.handle THEN
    RAISE EXCEPTION 'User handles cannot be changed';
  END IF;
  NEW.handle := lower(btrim(NEW.handle));
  RETURN NEW;
END $$;
CREATE TRIGGER profiles_handle_normalize BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.normalize_profile_handle();
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE chosen_handle text;
BEGIN
  chosen_handle := lower(btrim(new.raw_user_meta_data->>'handle'));
  IF chosen_handle IS NULL THEN
    chosen_handle := 'member_' || replace(new.id::text, '-', '');
  END IF;
  IF chosen_handle !~ '^[a-z0-9_]{3,40}$' THEN
    RAISE EXCEPTION 'Handle must be 3–40 letters, numbers or underscores';
  END IF;
  INSERT INTO public.profiles(user_id, display_name, handle) VALUES (new.id, chosen_handle, chosen_handle);
  INSERT INTO public.user_roles(user_id, role) VALUES (new.id, 'member');
  RETURN new;
END $$;
CREATE FUNCTION public.is_handle_available(_handle text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT lower(btrim(_handle)) ~ '^[a-z0-9_]{3,40}$' AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE handle = lower(btrim(_handle)));
$$;
REVOKE ALL ON FUNCTION public.is_handle_available(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_handle_available(text) TO anon, authenticated, service_role;
COMMENT ON COLUMN public.profiles.handle IS 'Unique normalized stable member handle, reserved for future referral attribution. Legacy and social accounts receive a generated handle.';