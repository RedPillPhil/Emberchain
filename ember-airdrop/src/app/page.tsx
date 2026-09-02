import { Suspense } from "react";
import { AirdropPage } from "@/components/airdrop-page";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-orange-100/60">Loading airdrop…</div>}>
      <AirdropPage />
    </Suspense>
  );
}
