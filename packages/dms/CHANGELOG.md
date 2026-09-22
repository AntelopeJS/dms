# Changelog

## v0.3.8

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.3.7...v0.3.8)

### 🚀 Enhancements

- **table-view:** Name page-mode form routes after the table view ([#29](https://github.com/AntelopeJS/dms/pull/29))

### 🩹 Fixes

- **realtime:** Publish a menu burst once when its trailing timer runs late ([#34](https://github.com/AntelopeJS/dms/pull/34))
- **table-view:** Resolve route param filter defaults against the table's page ([#35](https://github.com/AntelopeJS/dms/pull/35))
- **table-view:** Resolve page-mode form redirects against the form route ([#37](https://github.com/AntelopeJS/dms/pull/37))

### 💅 Refactors

- **table-view:** Serialize the resolved form page URLs ([#28](https://github.com/AntelopeJS/dms/pull/28))

### 🏡 Chore

- **agents:** Install Node 24 in setup script ([#27](https://github.com/AntelopeJS/dms/pull/27))
- **playground:** Derive api URLs from config variables ([#31](https://github.com/AntelopeJS/dms/pull/31))

### 🤖 CI

- Run the integration suite in CI ([#36](https://github.com/AntelopeJS/dms/pull/36))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.3.7

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.3.6...v0.3.7)

### 🩹 Fixes

- **ui:** Let Grid drop columns instead of overflowing its container ([#26](https://github.com/AntelopeJS/dms/pull/26))

### 🏡 Chore

- Make playground orb setup reliable ([#23](https://github.com/AntelopeJS/dms/pull/23))
- **playground:** Use dms frontend 0.2.1 ([#24](https://github.com/AntelopeJS/dms/pull/24))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.3.6

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.3.5...v0.3.6)

### 🩹 Fixes

- **frontend:** Match sidebar search design ([#21](https://github.com/AntelopeJS/dms/pull/21))

### 🏡 Chore

- Migrate dms frontend commands to ajs plugin ([#22](https://github.com/AntelopeJS/dms/pull/22))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.3.5

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.3.4...v0.3.5)

### 💅 Refactors

- **frontend:** Import the SDK through #dms/frontend-module ([#20](https://github.com/AntelopeJS/dms/pull/20))

### 🏡 Chore

- Align community files with the organization defaults ([#19](https://github.com/AntelopeJS/dms/pull/19))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.3.4

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.3.3...v0.3.4)

### 🏡 Chore

- **dms:** Drop the pages export and require interface-dms 0.1.0 ([#18](https://github.com/AntelopeJS/dms/pull/18))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.3.3

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.1.0...v0.3.3)

## v0.3.2

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.0.4...v0.3.2)

## v0.3.1

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.3.0...v0.3.1)

### 🏡 Chore

- Require @antelopejs/core 1.7 ([#14](https://github.com/AntelopeJS/dms/pull/14))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.3.0

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.2.2...v0.3.0)

### 🩹 Fixes

- **deps:** ⚠️  Stop shipping AntelopeJS core as a runtime dependency ([#13](https://github.com/AntelopeJS/dms/pull/13))

#### ⚠️ Breaking Changes

- **deps:** ⚠️  Stop shipping AntelopeJS core as a runtime dependency ([#13](https://github.com/AntelopeJS/dms/pull/13))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.2.2

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.0.3...v0.2.2)

## v0.2.1

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.2.0...v0.2.1)

### 🩹 Fixes

- **dev-reload:** Always notify the client after a reload ([#10](https://github.com/AntelopeJS/dms/pull/10))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.2.0

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.1.0...v0.2.0)

### 🩹 Fixes

- **dms:** ⚠️  Self-declare the runtime package and gate the frontend endpoints on the configured secret ([#8](https://github.com/AntelopeJS/dms/pull/8))

### 🤖 CI

- **release:** Accept the self-declared runtime name in implements ([#9](https://github.com/AntelopeJS/dms/pull/9))

#### ⚠️ Breaking Changes

- **dms:** ⚠️  Self-declare the runtime package and gate the frontend endpoints on the configured secret ([#8](https://github.com/AntelopeJS/dms/pull/8))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.1.0

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.0.2...v0.1.0)

### 🩹 Fixes

- **release:** ⚠️  Publish with pnpm and depend on the interface by range ([#7](https://github.com/AntelopeJS/dms/pull/7))

### 📖 Documentation

- Describe the single interface package and the Vue frontend module contract ([#6](https://github.com/AntelopeJS/dms/pull/6))

#### ⚠️ Breaking Changes

- **release:** ⚠️  Publish with pnpm and depend on the interface by range ([#7](https://github.com/AntelopeJS/dms/pull/7))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.0.2

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.0.2...v0.0.2)

### 🩹 Fixes

- **dms:** Isolate the package contract check from the workspace NODE_PATH ([#5](https://github.com/AntelopeJS/dms/pull/5))

### 🏡 Chore

- **release:** Build the interface package before releasing the runtime ([#4](https://github.com/AntelopeJS/dms/pull/4))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

