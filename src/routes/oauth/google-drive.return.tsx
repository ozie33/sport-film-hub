import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { completeDriveConnect } from "@/lib/drive/drive.functions";

export const Route = createFileRoute("/oauth/google-drive/return")({
  ssr: false,
  component: DriveOAuthReturn,
  head: () => ({
    meta: [
      { title: "Finishing your Google Drive connection" },
      {
        name: "description",
        content: "Completing the secure Google Drive connection for your film library.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const CONNECTOR_ID = "google_drive";

function DriveOAuthReturn() {
  const [message, setMessage] = useState("Finishing your Google Drive connection…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const notify = (
      type: "appUserConnectorOAuthComplete" | "appUserConnectorOAuthFailed",
    ) => {
      window.opener?.postMessage({ type, connectorId: CONNECTOR_ID }, window.location.origin);
      window.close();
    };

    if (params.get("success") !== "true") {
      setMessage(params.get("error") ?? "The Google Drive connection was cancelled.");
      notify("appUserConnectorOAuthFailed");
      return;
    }
    const code = params.get("code");
    if (!code) {
      if (params.get("offline_access_allowed") === "false") {
        notify("appUserConnectorOAuthComplete");
        return;
      }
      setMessage("Google returned no connection code. Try connecting again.");
      notify("appUserConnectorOAuthFailed");
      return;
    }
    void completeDriveConnect({ data: { code } })
      .then(() => notify("appUserConnectorOAuthComplete"))
      .catch(() => {
        setMessage("We could not finish the Google Drive connection.");
        notify("appUserConnectorOAuthFailed");
      });
  }, []);

  return (
    <main className="grid min-h-screen place-items-center bg-background p-6 text-center">
      <div className="space-y-3">
        <Loader2 className="mx-auto size-6 animate-spin text-primary" />
        <h1 className="text-lg font-semibold">Google Drive</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </main>
  );
}
