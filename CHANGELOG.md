# Changelog

## [1.3.0](https://github.com/MapColonies/StaleMate/compare/v1.2.0...v1.3.0) (2026-10-22)


### 🎉 Features

* **stalemate-ui:** pin the Table's PR column and give it the spare width ([24278d1](https://github.com/MapColonies/StaleMate/commit/24278d1d3222adf1c58b7ae7695edb0a8be01df7)), closes [#56](https://github.com/MapColonies/StaleMate/issues/56)
* **stalemate-ui:** scroll the Table inside the page, with sticky headers ([2a7d566](https://github.com/MapColonies/StaleMate/commit/2a7d56642412eb052d41fecd08e39421fe0899be)), closes [#55](https://github.com/MapColonies/StaleMate/issues/55)

## [1.2.0](https://github.com/MapColonies/StaleMate/compare/v1.1.0...v1.2.0) (2026-10-21)


### 🎉 Features

* **stalemate-ui:** count the Viewer's new Notifications on a bell in the header ([48cc019](https://github.com/MapColonies/StaleMate/commit/48cc019a12eafd0d8342bb109a5d9d5eff4bd710)), closes [#50](https://github.com/MapColonies/StaleMate/issues/50)
* **stalemate-ui:** default the Inbox and Board to newest first and remember the order ([a3b7198](https://github.com/MapColonies/StaleMate/commit/a3b7198e3e02010b77e0a8fc20bb6f5d7f13d2c0)), closes [#44](https://github.com/MapColonies/StaleMate/issues/44)
* **stalemate-ui:** default the Table to newest first, remember its sort, and add Reset sort ([c5f8bca](https://github.com/MapColonies/StaleMate/commit/c5f8bcaaf84f02259906e737b1dd3267232e1c15)), closes [#45](https://github.com/MapColonies/StaleMate/issues/45)
* **stalemate-ui:** keep polling from a background tab while OS notifications are on ([3dda978](https://github.com/MapColonies/StaleMate/commit/3dda978d3553dd2addd32c33874e10b79d6c2c31)), closes [#54](https://github.com/MapColonies/StaleMate/issues/54)
* **stalemate-ui:** keep the Viewer's Notifications in sync across tabs ([e96f0ac](https://github.com/MapColonies/StaleMate/commit/e96f0ac566eadd1b6aeb787930f05d262c8761f0)), closes [#52](https://github.com/MapColonies/StaleMate/issues/52)
* **stalemate-ui:** list the Viewer's Notifications in a drawer to dismiss them ([23f65d8](https://github.com/MapColonies/StaleMate/commit/23f65d89caf2805d2d35b12f9327bedde7754357)), closes [#51](https://github.com/MapColonies/StaleMate/issues/51)
* **stalemate-ui:** send the Viewer's new Notifications to the OS from the drawer's checkbox ([5f9571e](https://github.com/MapColonies/StaleMate/commit/5f9571ee66dd38c2aedff1d99a0d0f4446445a14)), closes [#53](https://github.com/MapColonies/StaleMate/issues/53)
* **stalemate-ui:** serve the UI so a reload always gets the deployed build ([9cde325](https://github.com/MapColonies/StaleMate/commit/9cde3259d65b4e3e49645db0d24346e650d41bbe)), closes [#46](https://github.com/MapColonies/StaleMate/issues/46)
* **stalemate-ui:** tell the Viewer a new version is deployed and offer a Reload ([c0b1bed](https://github.com/MapColonies/StaleMate/commit/c0b1bedcb846f179601c51e4041ef6a4e0c59730)), closes [#47](https://github.com/MapColonies/StaleMate/issues/47)


### 📝 Documentation

* **global:** define Notification and record deriving Notifications in the browser ([ad46197](https://github.com/MapColonies/StaleMate/commit/ad461979d16b583cf80fa1ec029493e8034ab411))

## [1.1.0](https://github.com/MapColonies/StaleMate/compare/v1.0.0...v1.1.0) (2026-10-21)


### 🎉 Features

* **stalemate-api:** give the probes slack, raise the CPU limit to 1 core ([83c062a](https://github.com/MapColonies/StaleMate/commit/83c062a5a9819476992e8037a0aacc88b1c37ac3)), closes [#33](https://github.com/MapColonies/StaleMate/issues/33)
* **stalemate-api:** let the chart mount an existing Secret for the GitHub App key ([011e3c6](https://github.com/MapColonies/StaleMate/commit/011e3c659f84e328d9abb413ee461da58a26878b)), closes [#38](https://github.com/MapColonies/StaleMate/issues/38)
* **stalemate-ui:** give the UI an SVG favicon ([0052d36](https://github.com/MapColonies/StaleMate/commit/0052d36990d2287f28decff7f672dcac695fb93d)), closes [#39](https://github.com/MapColonies/StaleMate/issues/39)


### 🐛 Bug Fixes

* **stalemate-api:** ship no Team-specific extra days off by default ([037c846](https://github.com/MapColonies/StaleMate/commit/037c846378e8b326fdf2b991fcbe56fb72e7aaf0)), closes [#40](https://github.com/MapColonies/StaleMate/issues/40)


### ⚡ Performance Improvements

* **stalemate-api:** cache the Snapshot response per minute, with ETag and 304 ([02040dc](https://github.com/MapColonies/StaleMate/commit/02040dc0b6b0ddabc6c9c1ac07ce175c0a332b31)), closes [#37](https://github.com/MapColonies/StaleMate/issues/37)
* **stalemate-api:** count Working Days from a cumulative table ([a4e944d](https://github.com/MapColonies/StaleMate/commit/a4e944dafd8b80938e00471722ca49e9844bc245)), closes [#31](https://github.com/MapColonies/StaleMate/issues/31)
* **stalemate-api:** derive Tracked PRs at sweep time, count only clocks per request ([7aabab4](https://github.com/MapColonies/StaleMate/commit/7aabab488a4d8da14daa0849c9958b962b9103a1)), closes [#35](https://github.com/MapColonies/StaleMate/issues/35)
* **stalemate-api:** re-read Tracked PRs by Idle Time tier ([f12b643](https://github.com/MapColonies/StaleMate/commit/f12b643b157b2fbfa46876116ac2874f80b33fe6)), closes [#36](https://github.com/MapColonies/StaleMate/issues/36)
* **stalemate-ui:** poll the Snapshot at most every 10 s while busy ([c2c4f39](https://github.com/MapColonies/StaleMate/commit/c2c4f39896c9b039742656541ad5b30ade0cfcd2)), closes [#32](https://github.com/MapColonies/StaleMate/issues/32)

## 1.0.0 (2026-10-21)


### 🎉 Features

* **global:** link each PR's Jira Ticket, and leave the Jira check out of Check Status ([70d1e2d](https://github.com/MapColonies/StaleMate/commit/70d1e2df389859c42d56822f9904b50daa519ca5))
* **global:** say why it's the Viewer's turn, and flag PRs that conflict ([dafafbb](https://github.com/MapColonies/StaleMate/commit/dafafbb6b3fd178ef096c5336c47eb39ab9a26fb))
* **global:** scaffold the monorepo and pin the seams ([565ae10](https://github.com/MapColonies/StaleMate/commit/565ae10b7f94e69ef71e61a1f244e4a62cbe70af)), closes [#13](https://github.com/MapColonies/StaleMate/issues/13)
* **global:** show only a PR's strongest Inclusion Reason, naming the Viewer ([ee272b3](https://github.com/MapColonies/StaleMate/commit/ee272b371b7ad0dc56113625fe9ab0a49626a691))
* **stalemate-api:** add the working-day calendar ([72b5a53](https://github.com/MapColonies/StaleMate/commit/72b5a53a427fe192e91385817a13d4eb8e5dbb8a)), closes [#14](https://github.com/MapColonies/StaleMate/issues/14)
* **stalemate-api:** derive Age, Idle Time and Urgency ([6132089](https://github.com/MapColonies/StaleMate/commit/6132089f7bb65bd75d1db93f198490ca2dd0a629)), closes [#17](https://github.com/MapColonies/StaleMate/issues/17)
* **stalemate-api:** derive Review Status and Check Status ([6fb2ef1](https://github.com/MapColonies/StaleMate/commit/6fb2ef1be9e226062200ee5b3cc181bb2e690785)), closes [#15](https://github.com/MapColonies/StaleMate/issues/15)
* **stalemate-api:** derive Waiting On and No Reviewer ([ba461db](https://github.com/MapColonies/StaleMate/commit/ba461db39d41ae7100fd950e2c6379a36cbcb3d0)), closes [#16](https://github.com/MapColonies/StaleMate/issues/16)
* **stalemate-api:** say when the next sweep starts ([15f09f5](https://github.com/MapColonies/StaleMate/commit/15f09f51a1dc515f41522b224d023c013cf7cb4f))
* **stalemate-api:** send the refresh cooldown with the Snapshot ([5b2a09a](https://github.com/MapColonies/StaleMate/commit/5b2a09a7310b300d90c95af464654d863e339331))
* **stalemate-api:** serve the Snapshot from the fixture provider ([1202595](https://github.com/MapColonies/StaleMate/commit/12025957828668e6f62f11f7204acbd7c34c7b7c)), closes [#18](https://github.com/MapColonies/StaleMate/issues/18)
* **stalemate-api:** sweep GitHub with the GitHub provider ([9efa918](https://github.com/MapColonies/StaleMate/commit/9efa918d12c5b09da2e0007bb10853ba7f04165e)), closes [#19](https://github.com/MapColonies/StaleMate/issues/19)
* **stalemate-ui:** add the Board view ([0700380](https://github.com/MapColonies/StaleMate/commit/0700380082cccb0c08bc5d65acaa3488a96b92ab)), closes [#23](https://github.com/MapColonies/StaleMate/issues/23)
* **stalemate-ui:** add the dashboard shell ([2d24396](https://github.com/MapColonies/StaleMate/commit/2d243961534d5b5158706f80bd7d8e425d917463)), closes [#20](https://github.com/MapColonies/StaleMate/issues/20)
* **stalemate-ui:** add the Inbox view ([37a9a66](https://github.com/MapColonies/StaleMate/commit/37a9a66c66a39c917df37c8bf3a4dc4b6bae03ce)), closes [#22](https://github.com/MapColonies/StaleMate/issues/22)
* **stalemate-ui:** add the Table view and the shared PR cells ([7df227e](https://github.com/MapColonies/StaleMate/commit/7df227e3426f163f949d2c15b6e8690aea0164e3)), closes [#21](https://github.com/MapColonies/StaleMate/issues/21)
* **stalemate-ui:** let the Board order its columns, and scroll each one ([12a9e57](https://github.com/MapColonies/StaleMate/commit/12a9e576d32343e9a8c50f868dec08a14123c0a1))
* **stalemate-ui:** let the Inbox order its buckets ([055ef5c](https://github.com/MapColonies/StaleMate/commit/055ef5c821e0f3ef09516fe0fae26303f8106d32))


### 🐛 Bug Fixes

* **stalemate-api:** name the sync failures more plainly ([37e708e](https://github.com/MapColonies/StaleMate/commit/37e708e30bd3aefc2e1dbb5f68360591e7f2bad3))
* **stalemate-ui:** keep the Inbox's rows one height ([10b9a24](https://github.com/MapColonies/StaleMate/commit/10b9a24c80689dbb9eea9346cce9f31d49ef9f19))
* **stalemate-ui:** leave Bot PRs out of the header's No Reviewer count ([af7fa74](https://github.com/MapColonies/StaleMate/commit/af7fa746078fa50b9bec9c382263a0b8d5702e8f))
* **stalemate-ui:** line up the Inbox's Waiting On names ([c9eb906](https://github.com/MapColonies/StaleMate/commit/c9eb90625f6843248e62aae857cb6b8c7431aa65))
* **stalemate-ui:** tell a restarting API from an unreachable one, and show new Snapshots sooner ([215f740](https://github.com/MapColonies/StaleMate/commit/215f7408a970553fbe52d005f1cfed4ddc72ba9b))
* **stalemate-ui:** tighten the UI's wording ([fd5efa2](https://github.com/MapColonies/StaleMate/commit/fd5efa263f5c902e0a8d71fa5814d9b13aa4f517))


### ⚡ Performance Improvements

* **stalemate-api:** ask the threads query for only the threads each PR has ([51dba6e](https://github.com/MapColonies/StaleMate/commit/51dba6ebb0ebcfbf1de800264fdb0f327747e752))


### 📝 Documentation

* add ADRs for derived Review Status and full GraphQL sweep ([1604c7c](https://github.com/MapColonies/StaleMate/commit/1604c7c49ffc4d2ad912e5548dfca96d1f7db0de))
* add domain glossary and ADR 0001 (GitHub App backend poller) ([d46d0a4](https://github.com/MapColonies/StaleMate/commit/d46d0a4665820084c103d26786f02d14c6c6b39f))
* add Snapshot to the domain glossary ([abfc2fe](https://github.com/MapColonies/StaleMate/commit/abfc2fe57ce8be2d94cee51ebf5875239f2ab0ee))
* add Working Day, Urgency, Nobody's Turn and Out-of-date Snapshot to the glossary ([22ae32c](https://github.com/MapColonies/StaleMate/commit/22ae32ca95c5d75e05651979f58d549a1f362ad9))
* define Review Status values, Answered and Awaiting Re-review ([e2da9e2](https://github.com/MapColonies/StaleMate/commit/e2da9e28267adfed086ad1ba4683766c47f1ca25))
* replace Waiting Time with Age and Idle Time, Nobody's Turn with No Reviewer ([7eb6b92](https://github.com/MapColonies/StaleMate/commit/7eb6b9232aeeb48b9deaa4bf5013e3ab534bb4e8))
* sharpen Team Repo and Tracked PR boundaries, fix Working Day ([96b1ea2](https://github.com/MapColonies/StaleMate/commit/96b1ea20301cb3e66abb2436180ea788a03613cc))
