# Roborock map fixtures

Real map files of Roborock vacuums, from the test resources of [Valetudo](https://github.com/Hypfer/Valetudo)
(`backend/test/lib/robots/roborock/res/map/`, commit `9f0e30125474`).

Copyright Sören Beye and the Valetudo contributors, licensed under the Apache License 2.0 (see
[LICENSE-Valetudo](./LICENSE-Valetudo)). Modifications: the uncompressed files (all but S8) were gzipped (as the Xiaomi Cloud serves
them).

The expected values in `roborock_map.test.ts` (rooms, positions, paths) match Valetudo's own parsing of these files.
