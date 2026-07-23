import React, { Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { Loader2 } from 'lucide-react';

// ── Lazy-load every page so only the current route's code is fetched ──────────
// This prevents all 500KB+ of page source (emberswap, exchange, ledger, etc.)
// from being downloaded and parsed on startup.
const Dashboard         = React.lazy(() => import('@/pages/dashboard'));
const Setup             = React.lazy(() => import('@/pages/setup'));
const Send              = React.lazy(() => import('@/pages/send'));
const Mining            = React.lazy(() => import('@/pages/mining'));
const Blocks            = React.lazy(() => import('@/pages/blocks'));
const Ledger            = React.lazy(() => import('@/pages/ledger'));
const BlockDetail       = React.lazy(() => import('@/pages/block-detail'));
const Transactions      = React.lazy(() => import('@/pages/transactions'));
const TransactionDetail = React.lazy(() => import('@/pages/transaction-detail'));
const Contracts         = React.lazy(() => import('@/pages/contracts'));
const Privacy           = React.lazy(() => import('@/pages/privacy'));
const Exchange          = React.lazy(() => import('@/pages/exchange'));
const Contacts          = React.lazy(() => import('@/pages/contacts'));
const OnRamp            = React.lazy(() => import('@/pages/onramp'));
const Community         = React.lazy(() => import('@/pages/community'));
const EmberSwap         = React.lazy(() => import('@/pages/emberswap'));
const Tokens            = React.lazy(() => import('@/pages/tokens'));
const TokenDetail       = React.lazy(() => import('@/pages/token-detail'));
const Downloads         = React.lazy(() => import('@/pages/downloads'));
const NotFound          = React.lazy(() => import('@/pages/not-found'));

const queryClient = new QueryClient();

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/setup" component={Setup} />
        <Route path="/send" component={Send} />
        <Route path="/mining" component={Mining} />
        <Route path="/ledger" component={Ledger} />
        <Route path="/blocks" component={Blocks} />
        <Route path="/blocks/:number" component={BlockDetail} />
        <Route path="/transactions" component={Transactions} />
        <Route path="/transactions/:hash" component={TransactionDetail} />
        <Route path="/contracts" component={Contracts} />
        <Route path="/privacy" component={Privacy} />
        <Route path="/exchange" component={Exchange} />
        <Route path="/contacts" component={Contacts} />
        <Route path="/onramp" component={OnRamp} />
        <Route path="/community" component={Community} />
        <Route path="/emberswap" component={EmberSwap} />
        <Route path="/tokens" component={Tokens} />
        <Route path="/tokens/:address" component={TokenDetail} />
        <Route path="/downloads" component={Downloads} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
