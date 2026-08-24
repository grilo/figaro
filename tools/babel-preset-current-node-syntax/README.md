# Babel 8 compatibility copy

This is a behavior-equivalent compatibility copy of the MIT-licensed
[`babel-preset-current-node-syntax` 1.2.0](https://github.com/nicolo-ribaudo/babel-preset-current-node-syntax)
source used transitively by Jest 30. The package adds an exact regular
dependency on Babel 7.29.7 so its Babel 7-only syntax plugins resolve their own
compatible peer instead of invalidating Figaro's root Babel 8 graph.

Remove this copy once Jest's preset dependency publishes the equivalent peer
isolation. Keep the source version, license, lockfile, dependency-policy test,
and this explanation synchronized.
