"use client";

import { useEffect, useState } from "react";

/**
 * Whether the browser currently has a network.
 *
 * Starts optimistic and corrects itself after mount: `navigator.onLine` does
 * not exist on the server, and rendering "offline" for one frame on every load
 * would be a lie more often than it would be true.
 *
 * `navigator.onLine` only knows whether an interface is up, not whether
 * anything is reachable — which is exactly the right resolution here. Nothing
 * in this app needs the network, so the flag is used to reassure rather than to
 * gate: it says what still works, and never blocks anything.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return online;
}
