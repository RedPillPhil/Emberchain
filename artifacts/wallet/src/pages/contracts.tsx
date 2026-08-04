import { Redirect } from "wouter";

/** Legacy route — merged into Tokens / Contracts page. */
export default function ContractsRedirect() {
  return <Redirect to="/tokens#deploy-tools" />;
}
