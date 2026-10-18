import { AppRoute, authorColorSlot, UserRole, type AuthorColorSlot } from '@superdoc-collab/types';
import { Plug, Settings, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';
import { UserAvatar, UserAvatarSize } from '@/components/user-avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ADMIN_LINK_LABEL } from '@/features/admin/admin-copy';
import { SignOutMenuItem } from '@/features/auth/sign-out-menu-item';
import { useSession } from '@/features/auth/use-session';
import { CONNECTED_APPS_HEADING } from '@/features/connected-apps/connected-apps-copy';
import { SETTINGS_LINK_LABEL } from '@/features/settings/settings-copy';
import { isThemePreference, ThemePreference, useTheme } from '@/lib/use-theme';
import { THEME_LABEL, THEME_LABELS, accountMenuLabel } from './account-copy';

function keepMenuOpen(event: Event): void {
  event.preventDefault();
}

export function AccountMenu({ colorSlot }: { colorSlot: AuthorColorSlot | null }) {
  const { user } = useSession();
  const { preference, choosePreference } = useTheme();

  function chooseTheme(value: string): void {
    if (!isThemePreference(value)) return;
    choosePreference(value);
  }

  if (!user) return null;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={accountMenuLabel(user.name)}
          className="rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <UserAvatar name={user.name} colorSlot={authorColorSlot(user.id)} size={UserAvatarSize.Large} isAgent={false} isOnline={false} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <span className="block truncate">{user.name}</span>
          <span className="block truncate text-xs font-normal text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to={AppRoute.Settings}>
            <Settings aria-hidden />
            {SETTINGS_LINK_LABEL}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to={AppRoute.ConnectedApps}>
            <Plug aria-hidden />
            {CONNECTED_APPS_HEADING}
          </Link>
        </DropdownMenuItem>
        {user.role === UserRole.Admin && (
          <DropdownMenuItem asChild>
            <Link to={AppRoute.Admin}>
              <ShieldCheck aria-hidden />
              {ADMIN_LINK_LABEL}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{THEME_LABEL}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={preference} onValueChange={chooseTheme}>
          {Object.values(ThemePreference).map((themePreference) => (
            <DropdownMenuRadioItem key={themePreference} value={themePreference} onSelect={keepMenuOpen}>
              {THEME_LABELS[themePreference]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <SignOutMenuItem />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
