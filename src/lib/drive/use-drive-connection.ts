import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { openConnectorPopup, waitForConnectorOAuth } from "@/integrations/lovable/appUserConnectorClient";
import { disconnectDrive, getDriveConnectionState, startDriveConnect } from "@/lib/drive/drive.functions";

export const DRIVE_CONNECTION_KEY = ["drive-connection"];

export function useDriveConnection() {
  return useQuery({
    queryKey: DRIVE_CONNECTION_KEY,
    queryFn: async () => getDriveConnectionState(),
    staleTime: 30_000,
  });
}

/** Runs consent in a popup — the preview iframe can't host Google's page. */
export function useConnectDrive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const popup = openConnectorPopup();
      if (!popup) throw new Error("Allow popups for this site, then try connecting again.");
      try {
        const { authorizationUrl } = await startDriveConnect();
        const completion = waitForConnectorOAuth(popup, "google_drive");
        popup.location.href = authorizationUrl;
        await completion;
      } catch (error) {
        popup.close();
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DRIVE_CONNECTION_KEY });
      queryClient.invalidateQueries({ queryKey: ["drive-files"] });
      queryClient.invalidateQueries({ queryKey: ["video-provider-connections"] });
    },
  });
}

export function useDisconnectDrive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => disconnectDrive(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DRIVE_CONNECTION_KEY });
      queryClient.invalidateQueries({ queryKey: ["video-provider-connections"] });
    },
  });
}
