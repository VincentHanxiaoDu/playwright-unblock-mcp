#!/usr/bin/env node
/**
 * Applies rebrowser-patches to playwright-core to avoid automation detection.
 * Based on https://github.com/nicholasleblanc/rebrowser-patches
 *
 * This script patches playwright-core to:
 * 1. Conditionally disable Runtime.enable CDP command (main detection vector)
 * 2. Use alternative methods to get execution contexts
 * 3. Customize utility world name
 */

const fs = require('fs');
const path = require('path');

const PLAYWRIGHT_CORE_PATH = path.join(__dirname, '..', 'node_modules', 'playwright-core', 'lib', 'server');

// Check if already patched
const PATCH_MARKER = '// REBROWSER_PATCHED';

function readFile(relativePath) {
  const fullPath = path.join(PLAYWRIGHT_CORE_PATH, relativePath);
  return fs.readFileSync(fullPath, 'utf-8');
}

function writeFile(relativePath, content) {
  const fullPath = path.join(PLAYWRIGHT_CORE_PATH, relativePath);
  fs.writeFileSync(fullPath, content, 'utf-8');
}

function isPatched(content) {
  return content.includes(PATCH_MARKER);
}

// ============================================
// Patch 1: crConnection.js - Add rebrowser methods to CRSession
// ============================================
function patchCrConnection() {
  const filePath = 'chromium/crConnection.js';
  let content = readFile(filePath);

  if (isPatched(content)) {
    console.log(`[rebrowser-patches] ${filePath} already patched, skipping`);
    return;
  }

  // Add new methods at the end of CRSession class (before the closing brace)
  // Find the dispose method's closing and insert before class closing
  const insertPoint = `    this._callbacks.clear();
  }
}
class CDPSession`;

  const replacement = `    this._callbacks.clear();
  }
  ${PATCH_MARKER}
  // Rebrowser patches: alternative execution context methods
  async __re__emitExecutionContext({ world, targetId, frame = null }) {
    const fixMode = process.env["REBROWSER_PATCHES_RUNTIME_FIX_MODE"] || "addBinding";
    const utilityWorldName = process.env["REBROWSER_PATCHES_UTILITY_WORLD_NAME"] !== "0"
      ? (process.env["REBROWSER_PATCHES_UTILITY_WORLD_NAME"] || "util")
      : "__playwright_utility_world__";

    process.env["REBROWSER_PATCHES_DEBUG"] && console.log(\`[rebrowser-patches][crSession] targetId = \${targetId}, world = \${world}, frame = \${frame ? "Y" : "N"}, fixMode = \${fixMode}\`);

    let getWorldPromise;
    if (fixMode === "addBinding") {
      if (world === "utility") {
        getWorldPromise = this.__re__getIsolatedWorld({
          client: this,
          frameId: targetId,
          worldName: utilityWorldName
        }).then((contextId) => ({
          id: contextId,
          name: "__playwright_utility_world__",
          auxData: { frameId: targetId, isDefault: false }
        }));
      } else if (world === "main") {
        getWorldPromise = this.__re__getMainWorld({
          client: this,
          frameId: targetId,
          isWorker: frame === null
        }).then((contextId) => ({
          id: contextId,
          name: "",
          auxData: { frameId: targetId, isDefault: true }
        }));
      }
    } else if (fixMode === "alwaysIsolated") {
      getWorldPromise = this.__re__getIsolatedWorld({
        client: this,
        frameId: targetId,
        worldName: utilityWorldName
      }).then((contextId) => ({
        id: contextId,
        name: "",
        auxData: { frameId: targetId, isDefault: true }
      }));
    }

    const contextPayload = await getWorldPromise;
    this.emit("Runtime.executionContextCreated", { context: contextPayload });
  }

  async __re__getMainWorld({ client, frameId, isWorker = false }) {
    let contextId;
    const randomName = [...Array(Math.floor(Math.random() * 11) + 10)].map(() => Math.random().toString(36)[2]).join("");

    process.env["REBROWSER_PATCHES_DEBUG"] && console.log(\`[rebrowser-patches][getMainWorld] binding name = \${randomName}\`);

    await client.send("Runtime.addBinding", { name: randomName });

    const bindingCalledHandler = ({ name, payload, executionContextId }) => {
      process.env["REBROWSER_PATCHES_DEBUG"] && console.log("[rebrowser-patches][bindingCalledHandler]", { name, payload, executionContextId });
      if (contextId > 0) return;
      if (name !== randomName) return;
      if (payload !== frameId) return;
      contextId = executionContextId;
      client.off("Runtime.bindingCalled", bindingCalledHandler);
    };

    client.on("Runtime.bindingCalled", bindingCalledHandler);

    if (isWorker) {
      await client.send("Runtime.evaluate", {
        expression: \`this['\${randomName}']('\${frameId}')\`
      });
    } else {
      await client.send("Page.addScriptToEvaluateOnNewDocument", {
        source: \`document.addEventListener('\${randomName}', (e) => self['\${randomName}'](e.detail.frameId))\`,
        runImmediately: true
      });
      const createIsolatedWorldResult = await client.send("Page.createIsolatedWorld", {
        frameId,
        worldName: randomName,
        grantUniveralAccess: true
      });
      await client.send("Runtime.evaluate", {
        expression: \`document.dispatchEvent(new CustomEvent('\${randomName}', { detail: { frameId: '\${frameId}' } }))\`,
        contextId: createIsolatedWorldResult.executionContextId
      });
    }

    process.env["REBROWSER_PATCHES_DEBUG"] && console.log(\`[rebrowser-patches][getMainWorld] result:\`, { contextId });
    return contextId;
  }

  async __re__getIsolatedWorld({ client, frameId, worldName }) {
    const createIsolatedWorldResult = await client.send("Page.createIsolatedWorld", {
      frameId,
      worldName,
      grantUniveralAccess: true
    });
    process.env["REBROWSER_PATCHES_DEBUG"] && console.log(\`[rebrowser-patches][getIsolatedWorld] result:\`, createIsolatedWorldResult);
    return createIsolatedWorldResult.executionContextId;
  }
}
class CDPSession`;

  content = content.replace(insertPoint, replacement);
  writeFile(filePath, content);
  console.log(`[rebrowser-patches] Patched ${filePath}`);
}

// ============================================
// Patch 2: crDevTools.js - Conditionally disable Runtime.enable
// ============================================
function patchCrDevTools() {
  const filePath = 'chromium/crDevTools.js';
  let content = readFile(filePath);

  if (isPatched(content)) {
    console.log(`[rebrowser-patches] ${filePath} already patched, skipping`);
    return;
  }

  // Replace session.send("Runtime.enable") with conditional version
  content = content.replace(
    /session\.send\("Runtime\.enable"\)/g,
    `${PATCH_MARKER} (process.env["REBROWSER_PATCHES_RUNTIME_FIX_MODE"] === "0" ? session.send("Runtime.enable") : Promise.resolve())`
  );

  writeFile(filePath, content);
  console.log(`[rebrowser-patches] Patched ${filePath}`);
}

// ============================================
// Patch 3: crPage.js - Conditionally disable Runtime.enable
// ============================================
function patchCrPage() {
  const filePath = 'chromium/crPage.js';
  let content = readFile(filePath);

  if (isPatched(content)) {
    console.log(`[rebrowser-patches] ${filePath} already patched, skipping`);
    return;
  }

  // Replace this._client.send("Runtime.enable", {})
  content = content.replace(
    /this\._client\.send\("Runtime\.enable", \{\}\)/g,
    `${PATCH_MARKER} (process.env["REBROWSER_PATCHES_RUNTIME_FIX_MODE"] === "0" ? this._client.send("Runtime.enable", {}) : Promise.resolve())`
  );

  // Replace session._sendMayFail("Runtime.enable")
  content = content.replace(
    /session\._sendMayFail\("Runtime\.enable"\)/g,
    `${PATCH_MARKER} (process.env["REBROWSER_PATCHES_RUNTIME_FIX_MODE"] === "0" ? session._sendMayFail("Runtime.enable") : Promise.resolve())`
  );

  // Modify worker creation to pass targetId and session
  content = content.replace(
    /const worker = new import_page\.Worker\(this\._page, url\);/g,
    `${PATCH_MARKER} const worker = new import_page.Worker(this._page, url, event.targetInfo.targetId, session);`
  );

  writeFile(filePath, content);
  console.log(`[rebrowser-patches] Patched ${filePath}`);
}

// ============================================
// Patch 4: crServiceWorker.js - Conditionally disable Runtime.enable
// ============================================
function patchCrServiceWorker() {
  const filePath = 'chromium/crServiceWorker.js';
  let content = readFile(filePath);

  if (isPatched(content)) {
    console.log(`[rebrowser-patches] ${filePath} already patched, skipping`);
    return;
  }

  // Find and replace the Runtime.enable block
  const oldCode = `session.send("Runtime.enable", {}).catch((e) => {
    });`;

  const newCode = `${PATCH_MARKER}
    if (process.env["REBROWSER_PATCHES_RUNTIME_FIX_MODE"] === "0") {
      session.send("Runtime.enable", {}).catch((e) => {});
    }`;

  content = content.replace(oldCode, newCode);

  writeFile(filePath, content);
  console.log(`[rebrowser-patches] Patched ${filePath}`);
}

// ============================================
// Patch 5: frames.js - Modify _context method
// ============================================
function patchFrames() {
  const filePath = 'frames.js';
  let content = readFile(filePath);

  if (isPatched(content)) {
    console.log(`[rebrowser-patches] ${filePath} already patched, skipping`);
    return;
  }

  // Find and replace the _context method
  const oldContext = `_context(world) {
    return this._contextData.get(world).contextPromise.then((contextOrDestroyedReason) => {
      if (contextOrDestroyedReason instanceof js.ExecutionContext)
        return contextOrDestroyedReason;
      throw new Error(contextOrDestroyedReason.destroyedReason);
    });
  }`;

  const newContext = `${PATCH_MARKER}
  _context(world, useContextPromise = false) {
    if (process.env["REBROWSER_PATCHES_RUNTIME_FIX_MODE"] === "0" || this._contextData.get(world).context || useContextPromise) {
      return this._contextData.get(world).contextPromise.then((contextOrDestroyedReason) => {
        if (contextOrDestroyedReason instanceof js.ExecutionContext)
          return contextOrDestroyedReason;
        throw new Error(contextOrDestroyedReason.destroyedReason);
      });
    }
    const crSession = (this._page.delegate._sessions?.get(this._id) || this._page.delegate._mainFrameSession)?._client;
    if (!crSession || !crSession.__re__emitExecutionContext) {
      // Fallback for non-chromium or if method not available
      return this._contextData.get(world).contextPromise.then((contextOrDestroyedReason) => {
        if (contextOrDestroyedReason instanceof js.ExecutionContext)
          return contextOrDestroyedReason;
        throw new Error(contextOrDestroyedReason.destroyedReason);
      });
    }
    return crSession.__re__emitExecutionContext({
      world,
      targetId: this._id,
      frame: this
    }).then(() => {
      return this._context(world, true);
    }).catch((error) => {
      if (error.message && error.message.includes("No frame for given id found")) {
        return { destroyedReason: "Frame was detached" };
      }
      console.error("[rebrowser-patches][frames._context] cannot get world, error:", error);
      // Fallback to original behavior
      return this._contextData.get(world).contextPromise.then((contextOrDestroyedReason) => {
        if (contextOrDestroyedReason instanceof js.ExecutionContext)
          return contextOrDestroyedReason;
        throw new Error(contextOrDestroyedReason.destroyedReason);
      });
    });
  }`;

  content = content.replace(oldContext, newContext);

  // Also need to emit executionContextsCleared on navigation
  const oldOnCommit = 'this._onLifecycleEvent("commit");';
  const newOnCommit = `this._onLifecycleEvent("commit");
    ${PATCH_MARKER} // Emit executionContextsCleared for rebrowser-patches
    if (process.env["REBROWSER_PATCHES_RUNTIME_FIX_MODE"] !== "0") {
      const crSession = (this._page.delegate._sessions?.get(this._id) || this._page.delegate._mainFrameSession)?._client;
      if (crSession) crSession.emit("Runtime.executionContextsCleared");
    }`;

  content = content.replace(oldOnCommit, newOnCommit);

  writeFile(filePath, content);
  console.log(`[rebrowser-patches] Patched ${filePath}`);
}

// ============================================
// Patch 6: page.js - Modify Worker class
// ============================================
function patchPage() {
  const filePath = 'page.js';
  let content = readFile(filePath);

  if (isPatched(content)) {
    console.log(`[rebrowser-patches] ${filePath} already patched, skipping`);
    return;
  }

  // Modify Worker constructor to accept targetId and session
  const oldConstructor = `constructor(parent, url) {
    super(parent, "worker");
    this._executionContextPromise = new import_manualPromise.ManualPromise();
    this._workerScriptLoaded = false;
    this.existingExecutionContext = null;
    this.openScope = new import_utils.LongStandingScope();
    this.url = url;
  }`;

  const newConstructor = `${PATCH_MARKER}
  constructor(parent, url, targetId, session) {
    super(parent, "worker");
    this._executionContextPromise = new import_manualPromise.ManualPromise();
    this._workerScriptLoaded = false;
    this.existingExecutionContext = null;
    this.openScope = new import_utils.LongStandingScope();
    this.url = url;
    this._targetId = targetId;
    this._session = session;
  }`;

  content = content.replace(oldConstructor, newConstructor);

  // Add getExecutionContext method before evaluateExpression
  const oldEvaluate = `async evaluateExpression(expression, isFunction, arg) {
    return js.evaluateExpression(await this._executionContextPromise,`;

  const newEvaluate = `${PATCH_MARKER}
  async getExecutionContext() {
    if (process.env["REBROWSER_PATCHES_RUNTIME_FIX_MODE"] !== "0" && !this.existingExecutionContext && this._session && this._session.__re__emitExecutionContext) {
      await this._session.__re__emitExecutionContext({
        world: "main",
        targetId: this._targetId
      });
    }
    return this._executionContextPromise;
  }

  async evaluateExpression(expression, isFunction, arg) {
    return js.evaluateExpression(await this.getExecutionContext(),`;

  content = content.replace(oldEvaluate, newEvaluate);

  // Also update evaluateExpressionHandle
  content = content.replace(
    /return js\.evaluateExpression\(await this\._executionContextPromise, expression, \{ returnByValue: false/g,
    `${PATCH_MARKER} return js.evaluateExpression(await this.getExecutionContext(), expression, { returnByValue: false`
  );

  // Modify PageBinding.dispatch to handle rebrowser binding calls
  const oldDispatch = `static async dispatch(page, payload, context) {
    const { name, seq, serializedArgs } = JSON.parse(payload);`;

  const newDispatch = `${PATCH_MARKER}
  static async dispatch(page, payload, context) {
    // rebrowser-patches: ignore non-JSON payloads (used for context detection)
    if (process.env["REBROWSER_PATCHES_RUNTIME_FIX_MODE"] !== "0" && !payload.includes("{")) {
      return;
    }
    const { name, seq, serializedArgs } = JSON.parse(payload);`;

  content = content.replace(oldDispatch, newDispatch);

  writeFile(filePath, content);
  console.log(`[rebrowser-patches] Patched ${filePath}`);
}

// ============================================
// Main
// ============================================
function main() {
  console.log('[rebrowser-patches] Applying patches to playwright-core...');

  try {
    patchCrConnection();
    patchCrDevTools();
    patchCrPage();
    patchCrServiceWorker();
    patchFrames();
    patchPage();
    console.log('[rebrowser-patches] All patches applied successfully!');
  } catch (error) {
    console.error('[rebrowser-patches] Error applying patches:', error);
    process.exit(1);
  }
}

main();
