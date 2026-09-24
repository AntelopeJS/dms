# Changelog

## v0.2.1

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.2.0...v0.2.1)

### 🩹 Fixes

- **table-view:** Derive form route keys from the page permission id ([#43](https://github.com/AntelopeJS/dms/pull/43))

### 🏡 Chore

- **release:** @antelopejs/dms v0.4.0 ([d80807f](https://github.com/AntelopeJS/dms/commit/d80807f))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.2.0

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.1.0...v0.2.0)

### 🚀 Enhancements

- **table-view:** Name page-mode form routes after the table view ([#29](https://github.com/AntelopeJS/dms/pull/29))

### 🩹 Fixes

- **frontend:** Match sidebar search design ([#21](https://github.com/AntelopeJS/dms/pull/21))
- **ui:** Let Grid drop columns instead of overflowing its container ([#26](https://github.com/AntelopeJS/dms/pull/26))
- **realtime:** Publish a menu burst once when its trailing timer runs late ([#34](https://github.com/AntelopeJS/dms/pull/34))
- **table-view:** Resolve route param filter defaults against the table's page ([#35](https://github.com/AntelopeJS/dms/pull/35))
- **table-view:** Resolve page-mode form redirects against the form route ([#37](https://github.com/AntelopeJS/dms/pull/37))

### 💅 Refactors

- **frontend:** Import the SDK through #dms/frontend-module ([#20](https://github.com/AntelopeJS/dms/pull/20))
- **table-view:** Serialize the resolved form page URLs ([#28](https://github.com/AntelopeJS/dms/pull/28))
- **build:** Merge tsconfig.build.json into tsconfig.json ([#39](https://github.com/AntelopeJS/dms/pull/39))
- **package:** ⚠️  Drop moduleResolution node support and pack-based checks ([#41](https://github.com/AntelopeJS/dms/pull/41))

### 🏡 Chore

- **release:** @antelopejs/dms v0.3.3 ([940cb4e](https://github.com/AntelopeJS/dms/commit/940cb4e))
- **dms:** Drop the pages export and require interface-dms 0.1.0 ([#18](https://github.com/AntelopeJS/dms/pull/18))
- **release:** @antelopejs/dms v0.3.4 ([9cf98e7](https://github.com/AntelopeJS/dms/commit/9cf98e7))
- Align community files with the organization defaults ([#19](https://github.com/AntelopeJS/dms/pull/19))
- **release:** @antelopejs/dms v0.3.5 ([2b8a641](https://github.com/AntelopeJS/dms/commit/2b8a641))
- Migrate dms frontend commands to ajs plugin ([#22](https://github.com/AntelopeJS/dms/pull/22))
- **release:** @antelopejs/dms v0.3.6 ([89afebe](https://github.com/AntelopeJS/dms/commit/89afebe))
- Make playground orb setup reliable ([#23](https://github.com/AntelopeJS/dms/pull/23))
- **playground:** Use dms frontend 0.2.1 ([#24](https://github.com/AntelopeJS/dms/pull/24))
- **release:** @antelopejs/dms v0.3.7 ([312c7a7](https://github.com/AntelopeJS/dms/commit/312c7a7))
- **agents:** Install Node 24 in setup script ([#27](https://github.com/AntelopeJS/dms/pull/27))
- **playground:** Derive api URLs from config variables ([#31](https://github.com/AntelopeJS/dms/pull/31))
- **release:** @antelopejs/dms v0.3.8 ([f699953](https://github.com/AntelopeJS/dms/commit/f699953))

### 🤖 CI

- Run the integration suite in CI ([#36](https://github.com/AntelopeJS/dms/pull/36))
- **release:** Release next from a dedicated branch and restore requireCommits ([#38](https://github.com/AntelopeJS/dms/pull/38))
- **release:** Reference the shared release workflows through v1 ([#40](https://github.com/AntelopeJS/dms/pull/40))

#### ⚠️ Breaking Changes

- **package:** ⚠️  Drop moduleResolution node support and pack-based checks ([#41](https://github.com/AntelopeJS/dms/pull/41))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.1.0

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.3.2...v0.1.0)

### 🚀 Enhancements

- ⚠️  Extend another module's page by its id ([#17](https://github.com/AntelopeJS/dms/pull/17))

#### ⚠️ Breaking Changes

- ⚠️  Extend another module's page by its id ([#17](https://github.com/AntelopeJS/dms/pull/17))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.0.4

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.3.1...v0.0.4)

### 🚀 Enhancements

- Let backend modules declare the endpoints /auth/establish may open a session from ([#16](https://github.com/AntelopeJS/dms/pull/16))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.0.3

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.2.1...v0.0.3)

## v0.0.2

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.0.1...v0.0.2)

### 📖 Documentation

- Use the DMS_API_BASE_URL and DMS_CLIENT_BASE_URL names ([#2](https://github.com/AntelopeJS/dms/pull/2))

### 🏡 Chore

- Regenerate lockfiles against the published DMS packages ([#1](https://github.com/AntelopeJS/dms/pull/1))
- **release:** Skip the npm auth pre-flight for trusted publishing ([#3](https://github.com/AntelopeJS/dms/pull/3))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

