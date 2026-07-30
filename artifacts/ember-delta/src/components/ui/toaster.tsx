// Empty components to satisfy Toaster / Tooltip imports if not generated, 
// using simple mock implementations since shadcn might not be fully installed.
import React from 'react';

export function Toaster() {
  return null;
}

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
