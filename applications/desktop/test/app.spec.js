const { expect } = require('chai');

const CONNECTOME_LOAD_TIMEOUT = 15000; // 15 seconds

async function openWelcomePage() {
  await browser.keys(['Control', 'Shift', 'p']);
  const commandInput = await browser.$('.quick-input-box input');
  await commandInput.waitForDisplayed({ timeout: 5000 });
  await commandInput.setValue('Welcome');
  const welcomeCommand = await browser.$('.quick-input-list-row');
  await welcomeCommand.waitForDisplayed({ timeout: 5000 });
  await browser.keys('Enter');

  const welcome = await browser.$('[data-testid="connectome-welcome"]');
  await welcome.waitForDisplayed({ timeout: 5000 });
  return welcome;
}

describe('Connectome Desktop', function () {
  it('Correct window title', async function () {
    // Wait a bit to make sure workspace is set and title got updated
    await new Promise(r => setTimeout(r, 2000));
    const windowTitle = await browser.getTitle();
    expect(windowTitle).to.include('workspace');
  });

  it('Custom Connectome welcome page', async function () {
    const welcome = await openWelcomePage();
    const welcomeText = await welcome.getText();

    expect(welcomeText).to.include('Connectome');
    expect(welcomeText).to.include('Think, write, and build.');
    expect(welcomeText).to.include('Start');
    expect(welcomeText).to.include('Recent');
    expect(welcomeText).to.include('Quick Tips');
    expect(welcomeText).to.include('Customize');
    expect(welcomeText).to.include('Connectome Project');
    expect(welcomeText).not.to.include('VS Code API Version');
    expect(welcomeText).not.to.include('AI Support');
    expect(welcomeText).not.to.include('[Placeholder');

    await (await welcome.$('.connectome-welcome__logo')).waitForDisplayed();
    await (await welcome.$('.gs-preference')).waitForDisplayed();
    expect(await (await welcome.$('[data-testid="connectome-version"]')).getText()).to.match(/^Connectome(?:\s|$)/);

    const primaryAction = await welcome.$('[data-connectome-welcome-primary="true"]');
    expect(await primaryAction.isFocused()).to.equal(true);

    const expectedLinks = {
      documentation: 'https://github.com/jg-c-elegans/connectome#readme',
      repository: 'https://github.com/jg-c-elegans/connectome',
      issues: 'https://github.com/jg-c-elegans/connectome/issues',
      releases: 'https://github.com/jg-c-elegans/connectome/releases',
    };
    for (const [name, url] of Object.entries(expectedLinks)) {
      const action = await welcome.$(`[data-testid="welcome-action-${name}"]`);
      expect(await action.getAttribute('data-external-url')).to.equal(url);
    }

    const settingsAction = await welcome.$('[data-testid="welcome-action-settings"]');
    await browser.execute(element => element.focus(), settingsAction);
    await browser.keys('Enter');
    await (await browser.$('#settings_widget')).waitForExist({ timeout: 5000 });

    const reopenedWelcome = await openWelcomePage();
    const shortcutsAction = await reopenedWelcome.$('[data-testid="welcome-action-keyboard-shortcuts"]');
    await browser.execute(element => element.focus(), shortcutsAction);
    await browser.keys('Enter');
    await (await browser.$('#keybindings\.view\.widget')).waitForExist({ timeout: 5000 });
  });

  it('Builtin extensions', async function () {
    // Wait a bit to make sure key handlers are registered.
    await new Promise(r => setTimeout(r, 5000));

    // Open extensions view
    await browser.keys(['Control', 'Shift', 'x']);
    const builtinContainer = await browser.$(
      '#vsx-extensions-view-container--vsx-extensions\\:builtin'
    );

    // Expand builtin extensions
    const builtinHeader = await builtinContainer.$('.connectome-header.header');
    await builtinHeader.moveTo({ xOffset: 1, yOffset: 1 });
    await builtinHeader.waitForDisplayed();
    await builtinHeader.waitForClickable();
    await builtinHeader.click();

    // Wait for expansion to finish (plugins may take time to scan, especially with asar packaging)
    const builtin = await browser.$(
      '#vsx-extensions\\:builtin .connectome-TreeContainer'
    );
    await builtin.waitForExist({ timeout: 10000 });

    // Get names of all builtin extensions
    const extensions = await builtin.$$('.connectome-vsx-extension .name');
    const extensionNames = await Promise.all(
      extensions.map(e => e.getText())
    );

    // Exemplary check a few extensions
    expect(extensionNames).to.include('Debugger for Java');
    expect(extensionNames).to.include('TypeScript and JavaScript Language Features (built-in)');
  });

  it('Search in workspace', async function () {
    // Wait a bit to make sure key handlers are registered
    await new Promise(r => setTimeout(r, 5000));

    // Open search view (Ctrl+Shift+F)
    await browser.keys(['Control', 'Shift', 'f']);

    // Wait for search input to appear
    const searchInput = await browser.$('#search-input-field');
    await searchInput.waitForExist({ timeout: 5000 });
    await searchInput.waitForDisplayed();

    // Search for text that exists in the test workspace README.md
    await searchInput.setValue('Test Workspace');

    // Wait for search results to appear
    const searchResults = await browser.$('.t-siw-search-container .resultLine');
    await searchResults.waitForExist({ timeout: 10000, timeoutMsg: 'Search results did not appear. Ripgrep may not be working correctly with asar packaging.' });

    // Verify we got results
    const resultsText = await searchResults.getText();
    expect(resultsText).to.include('Test Workspace');
  });

  it('Quick file open', async function () {
    // Wait a bit to make sure key handlers are registered
    await new Promise(r => setTimeout(r, 5000));

    // Open quick file picker (Ctrl+P)
    await browser.keys(['Control', 'p']);

    // Wait for quick input to appear
    const quickInput = await browser.$('.quick-input-widget');
    await quickInput.waitForExist({ timeout: 5000 });
    await quickInput.waitForDisplayed();

    // Type filename to search for
    const inputBox = await browser.$('.quick-input-box input');
    await inputBox.waitForExist({ timeout: 5000 });
    await inputBox.setValue('README');

    // Wait for file to appear in results
    const fileResult = await browser.$('.quick-input-list-row');
    await fileResult.waitForExist({ timeout: 10000, timeoutMsg: 'Quick file open results did not appear. Ripgrep may not be working correctly with asar packaging.' });

    // Verify README.md appears in results
    const resultLabel = await browser.$('.quick-input-list-label');
    const labelText = await resultLabel.getText();
    expect(labelText.toLowerCase()).to.include('readme');
  });

  it('Integrated terminal', async function () {
    // Wait a bit to make sure key handlers are registered
    await new Promise(r => setTimeout(r, 5000));

    // Create a new terminal (Ctrl+Shift+`) to ensure it is focused and visible,
    // even when the terminal manager uses tabbed layout in the bottom panel.
    await browser.keys(['Control', 'Shift', '`']);

    // Wait for terminal widget to appear
    const terminal = await browser.$('.xterm');
    await terminal.waitForExist({ timeout: 10000, timeoutMsg: 'Terminal did not open. PTY may not be working correctly with asar packaging.' });
    await terminal.waitForDisplayed();

    // Verify terminal is visible
    const isDisplayed = await terminal.isDisplayed();
    expect(isDisplayed).to.equal(true);
  });
});
