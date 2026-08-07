/**
 * Browser-safe popup helper for app-user OAuth. Contains no secrets — the
 * authorization URL is produced by an authenticated server function.
 */
export function openConnectorPopup(): Window | null {
  return window.open("", "lovable-connector-oauth", "width=620,height=760");
}

export function waitForConnectorOAuth(popup: Window, connectorId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let poll: number | undefined;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      if (poll !== undefined) window.clearInterval(poll);
    };
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; connectorId?: string } | null;
      const type = data?.type;
      if (
        event.origin !== window.location.origin ||
        event.source !== popup ||
        data?.connectorId !== connectorId ||
        (type !== "appUserConnectorOAuthComplete" && type !== "appUserConnectorOAuthFailed")
      ) {
        return;
      }
      cleanup();
      if (type === "appUserConnectorOAuthComplete") {
        resolve();
        return;
      }
      popup.close();
      reject(new Error("The Google Drive connection was not completed."));
    };
    window.addEventListener("message", onMessage);
    poll = window.setInterval(() => {
      if (!popup.closed) return;
      cleanup();
      reject(new Error("The connection window closed before finishing."));
    }, 500);
  });
}
