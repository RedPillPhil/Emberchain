import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import Startup from "./pages/Startup";
import WalletApp from "./pages/WalletApp";

export type NodeState = "checking" | "syncing" | "starting" | "ready" | "error" | "no-node";

export interface NodeStatusPayload {
  state: NodeState;
  message: string;
  progress: number;
}

export default function App() {
  const [status, setStatus] = useState<NodeStatusPayload>({
    state: "checking",
    message: "Initialising…",
    progress: 0,
  });

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    listen<NodeStatusPayload>("node-status", (event) => {
      setStatus(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  if (status.state === "ready") {
    return <WalletApp />;
  }

  return <Startup status={status} />;
}
