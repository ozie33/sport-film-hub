GRANT EXECUTE ON FUNCTION public.owns_game(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owns_playlist(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;