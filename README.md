<p align="center">
  <a href="https://circleci.com/gh/balancer-labs/balancer-sor">
    <img src="https://circleci.com/gh/balancer-labs/balancer-sor.svg?style=svg&circle-token=33636208d3161f79ff283b29c8dba9841bda8931" />
  </a>
  <a href="https://coveralls.io/github/balancer-labs/balancer-sor">
    <img src="https://coveralls.io/repos/github/balancer-labs/balancer-sor/badge.svg?t=7avwwt" />
  </a>
  <a href="https://www.gnu.org/licenses/gpl-3.0">
    <img src="https://img.shields.io/badge/License-GPLv3-green.svg" />
  </a>
  <a href="https://www.npmjs.com/package/@balancer-labs/sor">
    <img src="https://img.shields.io/badge/npm-v0.2.4-blue.svg?style=flat-square" />
  </a>
</p>

<h1 align=center><code>Smart Order Router (SOR)</code></h1>

## Math times test

This branch aims to compare the times taken by different implementations
of pools' numeric computations.

In particular we compare Paraswap's implementation for weighted and stable pools with
SOR current implementation.

Tests can be found at test/mathTimes.spec.ts.
The code by paraswap was included at src/paraswap.

Our tests perform computations of _out given in_, print the time taken
at each implementation and also the results, so that we know
that we are simulating the same swap at both sides.

The code of this test was written in a way that it is very easy to
try different parameters, either balances, amounts, weights or amp factor.

The conclusion so far is that Paraswap implementation is faster only by a factor
of 2.2. The SDK is considerably slower for weighted pools: an extra 3.5 factor,
while this factor is only 1.15 for stable pools.

To run these tests use for instance `$ yarn test -f mathTimes`
