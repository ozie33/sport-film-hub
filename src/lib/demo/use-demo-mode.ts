import { useProfile, useUpdateProfile } from "@/lib/data/queries";

/**
 * Demo mode is a per-user preview preference. It never writes demo rows into
 * the database — screens swap in in-memory sample data and show a demo label.
 */
export function useDemoMode() {
  const { data: profile, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();

  return {
    isLoading,
    demoMode: profile?.demo_mode ?? false,
    setDemoMode: (value: boolean) => updateProfile.mutate({ demo_mode: value }),
    isSaving: updateProfile.isPending,
  };
}
