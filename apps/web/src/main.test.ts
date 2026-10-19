import { expect, test } from 'vitest';
import mainSource from './main.tsx?raw';

const DOM_ROUTER_PROVIDER_IMPORT = "import { RouterProvider } from 'react-router/dom';";

test('the application mounts the router through the dom entry so navigations can flush synchronously', () => {
  expect(mainSource).toContain(DOM_ROUTER_PROVIDER_IMPORT);
});
