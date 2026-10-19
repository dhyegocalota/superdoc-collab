import { AppRoute, authorColorSlot, UserRole, type AuthorColorSlot } from '@superdoc-collab/types';
import { Info, Keyboard, Plug, Settings, ShieldCheck } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { UserAvatar, UserAvatarSize } from '@/components/user-avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ABOUT_LINK_LABEL } from '@/features/about/about-copy';
import { ADMIN_LINK_LABEL } from '@/features/admin/admin-copy';
import { SignOutMenuItem } from '@/features/auth/sign-out-menu-item';
import { useSession } from '@/features/auth/use-session';
import { CONNECTED_APPS_HEADING } from '@/features/connected-apps/connected-apps-copy';
import { SETTINGS_LINK_LABEL } from '@/features/settings/settings-copy';
import { SHORTCUTS_TITLE } from '@/features/shortcuts/shortcuts-copy';
import { ShortcutsDialog } from '@/features/shortcuts/shortcuts-dialog';
import { isThemePreference, ThemePreference, useTheme } from '@/lib/use-theme';
import { ShortcutHint } from '@/features/shortcuts/shortcut-hint';
import { ShortcutId } from '@/features/shortcuts/shortcuts';
import {
  ACCOUNT_SECTION_LABEL,
  HELP_SECTION_LABEL,
  THEME_LABEL,
  THEME_LABELS,
  WORKSPACE_SECTION_LABEL,
  accountMenuLabel,
} from './account-copy';

const SECTION_LABEL_CLASS_NAME = 'text-xs font-normal text-muted-foreground';

function keepMenuOpen(event: Event): void {
  event.preventDefault();
}

export function AccountMenu({ colorSlot, canEditShortcuts = true }: { colorSlot: AuthorColorSlot | null; canEditShortcuts?: boolean }) {
  const { user } = useSession();
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { preference, choosePreference } = useTheme();

  function chooseTheme(value: string): void {
    if (!isThemePreference(value)) return;
    choosePreference(value);
  }

  if (!user) return null;

  const avatarColorSlot = colorSlot === null ? authorColorSlot(user.id) : colorSlot;

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            aria-label={accountMenuLabel(user.name)}
            className="rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <UserAvatar name={user.name} colorSlot={avatarColorSlot} size={UserAvatarSize.Large} isAgent={false} isOnline={false} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <span className="block truncate">{user.name}</span>
            <span className="block truncate text-xs font-normal text-muted-foreground">{user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup aria-label={ACCOUNT_SECTION_LABEL}>
            <DropdownMenuLabel className={SECTION_LABEL_CLASS_NAME}>{ACCOUNT_SECTION_LABEL}</DropdownMenuLabel>
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
          </DropdownMenuGroup>
          {user.role === UserRole.Admin && <DropdownMenuSeparator />}
          {user.role === UserRole.Admin && (
            <DropdownMenuGroup aria-label={WORKSPACE_SECTION_LABEL}>
              <DropdownMenuLabel className={SECTION_LABEL_CLASS_NAME}>{WORKSPACE_SECTION_LABEL}</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link to={AppRoute.Admin}>
                  <ShieldCheck aria-hidden />
                  {ADMIN_LINK_LABEL}
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuGroup aria-label={HELP_SECTION_LABEL}>
            <DropdownMenuLabel className={SECTION_LABEL_CLASS_NAME}>{HELP_SECTION_LABEL}</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link to={AppRoute.About}>
                <Info aria-hidden />
                {ABOUT_LINK_LABEL}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setIsShortcutsOpen(true)}>
              <Keyboard aria-hidden />
              {SHORTCUTS_TITLE}
              <DropdownMenuShortcut>
                <ShortcutHint shortcutId={ShortcutId.ShowShortcuts} />
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className={SECTION_LABEL_CLASS_NAME}>{THEME_LABEL}</DropdownMenuLabel>
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
      <ShortcutsDialog
        isOpen={isShortcutsOpen}
        onOpenChange={setIsShortcutsOpen}
        canEdit={canEditShortcuts}
        superdoc={null}
        returnFocusRef={triggerRef}
      />
    </>
  );
}
