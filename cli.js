#!/usr/bin/env node
/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const path = require('path');

// Handle --stealth flag before importing Playwright modules
// This injects anti-detection scripts and sets up environment variables
const stealthIndex = process.argv.findIndex(arg => arg === '--stealth' || arg.startsWith('--stealth='));
if (stealthIndex !== -1) {
  // Inject the stealth init script
  const stealthScriptPath = path.join(__dirname, 'stealth.js');
  process.argv.push('--init-script', stealthScriptPath);

  // Remove the --stealth flag so it doesn't confuse the main program parser
  process.argv.splice(stealthIndex, 1);
}

const { program } = require('playwright-core/lib/utilsBundle');
const { decorateCommand } = require('playwright/lib/mcp/program');

const packageJSON = require('./package.json');
const p = program.version('Version ' + packageJSON.version).name('Playwright MCP');

// Add --stealth option documentation
p.option('--stealth', 'enable stealth mode to bypass bot detection');

decorateCommand(p, packageJSON.version)
void program.parseAsync(process.argv);
