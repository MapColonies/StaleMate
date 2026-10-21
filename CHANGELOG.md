# Changelog

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
