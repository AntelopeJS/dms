# Third-party data

`dbip-country-lite.mmdb` is the [DB-IP](https://db-ip.com) IP to Country Lite
database, licensed under the
[Creative Commons Attribution 4.0 International License](https://creativecommons.org/licenses/by/4.0/).

IP Geolocation by [DB-IP](https://db-ip.com).

The file is not kept in the repository: `scripts/fetch-country-database.mjs`
downloads the current edition when the package is packed for a release. The DMS
reads it to tell which country a sign-in came from; see `auth.signInCountry` in
the configuration reference.
