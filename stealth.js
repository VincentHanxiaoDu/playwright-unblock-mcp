/**
 * Stealth mode initialization script for Playwright MCP.
 * Applies common anti-detection techniques to make the browser appear more human-like.
 *
 * Based on techniques from rebrowser-patches and puppeteer-extra-plugin-stealth.
 * Note: This provides basic stealth capabilities. For maximum protection,
 * consider using residential proxies and realistic fingerprints.
 */

// Hide webdriver property
Object.defineProperty(navigator, 'webdriver', {
  get: () => undefined,
});

// Override the permissions API to hide automation
const originalQuery = window.navigator.permissions.query;
window.navigator.permissions.query = (parameters) => (
  parameters.name === 'notifications' ?
    Promise.resolve({ state: Notification.permission }) :
    originalQuery(parameters)
);

// Hide automation-related Chrome properties
if (window.chrome) {
  window.chrome.runtime = {
    PlatformOs: { MAC: 'mac', WIN: 'win', ANDROID: 'android', CROS: 'cros', LINUX: 'linux', OPENBSD: 'openbsd' },
    PlatformArch: { ARM: 'arm', X86_32: 'x86-32', X86_64: 'x86-64' },
    PlatformNaclArch: { ARM: 'arm', X86_32: 'x86-32', X86_64: 'x86-64' },
    RequestUpdateCheckStatus: { THROTTLED: 'throttled', NO_UPDATE: 'no_update', UPDATE_AVAILABLE: 'update_available' },
    OnInstalledReason: { INSTALL: 'install', UPDATE: 'update', CHROME_UPDATE: 'chrome_update', SHARED_MODULE_UPDATE: 'shared_module_update' },
    OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
  };
}

// Fix iframe contentWindow detection
const originalAttachShadow = Element.prototype.attachShadow;
Element.prototype.attachShadow = function(init) {
  if (init && init.mode === 'closed') {
    init.mode = 'open';
  }
  return originalAttachShadow.call(this, init);
};

// Make plugins array non-empty (headless detection)
Object.defineProperty(navigator, 'plugins', {
  get: () => {
    const plugins = [
      { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
      { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
    ];
    plugins.item = (i) => plugins[i] || null;
    plugins.namedItem = (name) => plugins.find(p => p.name === name) || null;
    plugins.refresh = () => {};
    return plugins;
  },
});

// Make languages array realistic
Object.defineProperty(navigator, 'languages', {
  get: () => ['en-US', 'en'],
});

// Hide automation in user agent data
if (navigator.userAgentData) {
  const originalBrands = navigator.userAgentData.brands;
  Object.defineProperty(navigator.userAgentData, 'brands', {
    get: () => originalBrands.filter(b => !b.brand.includes('Headless')),
  });
}

// Prevent detection via stack traces (sourceURL detection)
const originalError = Error;
window.Error = function(...args) {
  const error = new originalError(...args);
  if (error.stack) {
    error.stack = error.stack.replace(/pptr:|playwright:|__playwright/g, 'app');
  }
  return error;
};
window.Error.prototype = originalError.prototype;
window.Error.captureStackTrace = originalError.captureStackTrace;

// Override toString to hide native code modifications
const originalFunctionToString = Function.prototype.toString;
Function.prototype.toString = function() {
  if (this === window.navigator.permissions.query) {
    return 'function query() { [native code] }';
  }
  return originalFunctionToString.call(this);
};

console.debug('[stealth] Anti-detection measures applied');
