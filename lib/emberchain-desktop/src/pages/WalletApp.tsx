import { useState } from "react";
import Layout from "../components/Layout";
import Overview from "./Overview";
import Send from "./Send";
import Transactions from "./Transactions";
import Mining from "./Mining";
import Settings from "./Settings";

export type Page = "overview" | "send" | "transactions" | "mining" | "settings";

export default function WalletApp() {
  const [page, setPage] = useState<Page>("overview");

  const content: Record<Page, JSX.Element> = {
    overview: <Overview onNavigate={setPage} />,
    send: <Send />,
    transactions: <Transactions />,
    mining: <Mining />,
    settings: <Settings />,
  };

  return (
    <Layout currentPage={page} onNavigate={setPage}>
      {content[page]}
    </Layout>
  );
}
