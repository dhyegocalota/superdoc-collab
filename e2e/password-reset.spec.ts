import { AppRoute, AUTH_ERROR_MESSAGE, PASSWORD_RESET_DONE_MESSAGE, PASSWORD_RESET_INVALID_MESSAGE } from '../libs/types/src';
import {
  acceptInvite,
  DEMO_PASSWORD,
  expect,
  expectSignedInAs,
  generateInvite,
  openedContext,
  signedInAdmin,
  signIn,
  test,
  uniqueEmail,
} from './fixtures';
import { RESET_PASSWORD_LABEL } from '../apps/web/src/features/admin/admin-copy';
import { chooseUserAction } from './user-actions';

const USERS_TABLE_NAME = 'Users';
const INVITED_NAME = 'Reset';
const RESET_LINK_TEXTBOX_NAME = 'Password reset link';
const NEW_PASSWORD_LABEL = 'New password';
const CHANGE_PASSWORD_BUTTON_NAME = 'Change password';
const NEW_PASSWORD = 'a-brand-new-password';

test("the admin resets a user's password with a one-time link", async ({ browser }) => {
  const admin = await signedInAdmin({ browser });
  await admin.page.goto(AppRoute.Admin);
  const email = uniqueEmail('reset');
  const invited = await acceptInvite({ browser, url: await generateInvite({ page: admin.page }), name: INVITED_NAME, email });
  await expectSignedInAs({ page: invited.page, name: INVITED_NAME });
  await admin.page.reload();
  await chooseUserAction({
    page: admin.page,
    row: admin.page.getByRole('table', { name: USERS_TABLE_NAME }).getByRole('row', { name: new RegExp(email) }),
    name: INVITED_NAME,
    label: RESET_PASSWORD_LABEL,
  });
  const dialog = admin.page.getByRole('dialog');
  const url = await dialog.getByRole('textbox', { name: RESET_LINK_TEXTBOX_NAME }).inputValue();
  await admin.page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  const visitor = await openedContext({ browser });
  await visitor.page.goto(url);
  await visitor.page.getByLabel(NEW_PASSWORD_LABEL).fill(NEW_PASSWORD);
  await visitor.page.getByRole('button', { name: CHANGE_PASSWORD_BUTTON_NAME }).click();
  await expect(visitor.page).toHaveURL(AppRoute.SignIn);
  await expect(visitor.page.getByText(PASSWORD_RESET_DONE_MESSAGE)).toBeVisible();
  await signIn({ page: visitor.page, email, password: NEW_PASSWORD });
  await expectSignedInAs({ page: visitor.page, name: INVITED_NAME });

  const oldPassword = await openedContext({ browser });
  await oldPassword.page.goto(AppRoute.SignIn);
  await signIn({ page: oldPassword.page, email, password: DEMO_PASSWORD });
  await expect(oldPassword.page.getByText(AUTH_ERROR_MESSAGE)).toBeVisible();

  const again = await openedContext({ browser });
  await again.page.goto(url);
  await again.page.getByLabel(NEW_PASSWORD_LABEL).fill(NEW_PASSWORD);
  await again.page.getByRole('button', { name: CHANGE_PASSWORD_BUTTON_NAME }).click();
  await expect(again.page.getByText(PASSWORD_RESET_INVALID_MESSAGE)).toBeVisible();
});
