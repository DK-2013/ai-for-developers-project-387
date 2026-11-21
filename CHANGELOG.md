# Changelog

## [0.6.1](https://github.com/DK-2013/ai-for-developers-project-387/compare/v0.6.0...v0.6.1) (2026-11-21)


### Bug Fixes

* **lighthouse:** apply the vanished-finding rule with no findings ([#40](https://github.com/DK-2013/ai-for-developers-project-387/issues/40)) ([720a438](https://github.com/DK-2013/ai-for-developers-project-387/commit/720a43874702eb950bbc39588bf40665df9b1106))
* **lighthouse:** extract findings after failed budgets ([#40](https://github.com/DK-2013/ai-for-developers-project-387/issues/40)) ([ce7fc31](https://github.com/DK-2013/ai-for-developers-project-387/commit/ce7fc31833beb748ed20189cbf81820a3195e220))
* **lighthouse:** upload hidden reports and filter issues by label ([#40](https://github.com/DK-2013/ai-for-developers-project-387/issues/40)) ([7208356](https://github.com/DK-2013/ai-for-developers-project-387/commit/720835683407954e5bc13c11b0e6caeab8f91ad1))

## [0.6.0](https://github.com/DK-2013/ai-for-developers-project-387/compare/v0.5.0...v0.6.0) (2026-11-21)


### Features

* **bookings:** let guests enter and review description ([#25](https://github.com/DK-2013/ai-for-developers-project-387/issues/25)) ([f2680f4](https://github.com/DK-2013/ai-for-developers-project-387/commit/f2680f4ef22f7119a1746fdb3f0d0b7928feb659))
* **bookings:** round-trip optional description through API ([#24](https://github.com/DK-2013/ai-for-developers-project-387/issues/24)) ([79bfe74](https://github.com/DK-2013/ai-for-developers-project-387/commit/79bfe74b35d81f85c6c9c25ebf88f97d6be2c5ad))
* **bookings:** show booking description to owner ([#26](https://github.com/DK-2013/ai-for-developers-project-387/issues/26)) ([2924691](https://github.com/DK-2013/ai-for-developers-project-387/commit/29246912ac9bee5533ae56370e26be478e8b487e))


### Bug Fixes

* **bookings:** accept 2000 code points in description field ([d0bcce3](https://github.com/DK-2013/ai-for-developers-project-387/commit/d0bcce3869801fcffefdd084556d115b48aa1ec1))
* **bookings:** cap description at 1000 characters ([c2bcff6](https://github.com/DK-2013/ai-for-developers-project-387/commit/c2bcff6ae2ea46de059509503262713a047c8c03))

## [0.5.0](https://github.com/DK-2013/ai-for-developers-project-387/compare/v0.4.0...v0.5.0) (2026-11-21)


### Features

* **web:** show slot counts in the booking calendar ([#17](https://github.com/DK-2013/ai-for-developers-project-387/issues/17)) ([64bce97](https://github.com/DK-2013/ai-for-developers-project-387/commit/64bce97c7d273b9d78557f4f8535e123e8b51cc4))


### Bug Fixes

* **ci:** count the /oc budget only on pull requests ([9c2afdd](https://github.com/DK-2013/ai-for-developers-project-387/commit/9c2afdded03092ff175d096d9053e2493dae0611))
* **ci:** grant pull-requests write for the /oc budget comment ([105eeca](https://github.com/DK-2013/ai-for-developers-project-387/commit/105eeca64f49ba06e0cc6186db6e615b8ab4041a))
* **ci:** keep triage read-only and pin OpenCode ([6d42f0a](https://github.com/DK-2013/ai-for-developers-project-387/commit/6d42f0a2b716204b1bc8e43bc254c4d3313216c0))
* **ci:** publish review outcome without a git checkout ([183961f](https://github.com/DK-2013/ai-for-developers-project-387/commit/183961faa2fdd297123d6fe7a7f963861cd757f8))
* **web:** keep day numbers stable and tint slot dots ([#17](https://github.com/DK-2013/ai-for-developers-project-387/issues/17)) ([c21481e](https://github.com/DK-2013/ai-for-developers-project-387/commit/c21481ed688a25f973dc66e2bc660914e6d0094d))

## [0.4.0](https://github.com/DK-2013/ai-for-developers-project-387/compare/v0.3.1...v0.4.0) (2026-11-19)


### Features

* pass booking window bounds to guest view ([#13](https://github.com/DK-2013/ai-for-developers-project-387/issues/13)) ([2eb6137](https://github.com/DK-2013/ai-for-developers-project-387/commit/2eb6137a7220df433aa9f86b5dfdcd7155f1a1aa))
* show weekly calendar and one day of slots ([#14](https://github.com/DK-2013/ai-for-developers-project-387/issues/14)) ([34a224d](https://github.com/DK-2013/ai-for-developers-project-387/commit/34a224df1511868afd449b4054a749e66f42c200))
* start without a database and drop the embedded image ([4f89baa](https://github.com/DK-2013/ai-for-developers-project-387/commit/4f89baa352f5e35c2e361f1ecd7375d1cf271b2f))
* switch booking days without losing valid selection ([#15](https://github.com/DK-2013/ai-for-developers-project-387/issues/15)) ([c767484](https://github.com/DK-2013/ai-for-developers-project-387/commit/c7674842ad590008d37958899e54a41af861f6bf))


### Bug Fixes

* align calendar columns and cover same-day reselect ([#15](https://github.com/DK-2013/ai-for-developers-project-387/issues/15)) ([65b21b1](https://github.com/DK-2013/ai-for-developers-project-387/commit/65b21b1a1fb0e5d3effb29759924e337a60fe566))
* gh workflow ([a51b890](https://github.com/DK-2013/ai-for-developers-project-387/commit/a51b890e3ea6cbe3f705f9894d3917bb1b9f3d1a))
* gh workflow ([72d55ea](https://github.com/DK-2013/ai-for-developers-project-387/commit/72d55ea18847833e2a359bbc86ac0be50a55a2c1))
