import React from 'react';
import { Link } from 'wouter';

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground">
      <div className="text-center border border-border bg-card p-8 rounded shadow-xl">
        <h1 className="text-4xl font-mono font-bold text-destructive mb-4">404</h1>
        <p className="mb-6 text-muted-foreground font-mono">Market not found</p>
        <Link href="/" className="inline-block px-4 py-2 bg-primary text-primary-foreground font-bold uppercase text-sm rounded hover:bg-primary/90 transition-colors">
          Return to Exchange
        </Link>
      </div>
    </div>
  );
}
