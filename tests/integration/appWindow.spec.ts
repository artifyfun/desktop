import { expect } from '@playwright/test';

import { test } from './testExtensions';

test('App window has title', async ({ app }) => {
  const window = await app.firstWindow();
  await expect(window).toHaveTitle('ComfyUI');
});

test('App quits when window is closed', async ({ app }) => {
  const window = await app.firstWindow();

  await window.close();
  await app.app.waitForEvent('close');
});

test('App can quit when graph has unsaved changes', async ({ graphCanvas, installWizard, installedApp }) => {
  await installWizard.stepThroughOnboarding();
  await graphCanvas.expectLoaded();

  // Create a workflow and add unsaved changes
  await installedApp.createBlankWorkflow();
  await installedApp.saveWorkflow();
  await installedApp.addFirstNodeResult();

  // Wait for change tracker
  await installedApp.window.waitForTimeout(1024);

  // Ensure beforeunload dialog is not raised and app can quit normally
  // (https://github.com/Comfy-Org/desktop/issues/688)
  await installedApp.window.close({
    runBeforeUnload: true,
  });
  await installedApp.window.waitForEvent('close');
});
