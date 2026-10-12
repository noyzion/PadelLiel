import { LogOut } from 'lucide-react';
import { logoutAction } from '@/app/(auth)/actions';
import { Button } from '@/components/ui/button';

export function LogoutButton({ variant = 'ghost', className }: { variant?: 'ghost' | 'secondary'; className?: string }) {
  return (
    <form action={logoutAction}>
      <Button type="submit" variant={variant} size="sm" className={className}>
        <LogOut className="size-4" aria-hidden="true" />
        התנתקות
      </Button>
    </form>
  );
}
