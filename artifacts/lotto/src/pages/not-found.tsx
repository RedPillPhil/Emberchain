import { Link } from 'wouter';

export default function NotFound() {
  return (
    <div className="max-w-lg mx-auto px-4 py-24 text-center">
      <h1 className="text-2xl font-bold mb-2">Not found</h1>
      <p className="text-muted-foreground mb-6">This page does not exist in Ember Lotto.</p>
      <Link href="/" className="text-primary hover:underline">
        Back to lotto
      </Link>
    </div>
  );
}
