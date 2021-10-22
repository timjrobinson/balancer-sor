// TO DO: complete metaStablePool and stableMath functions following the
// case exact bpt in for token out.
// Make tests for stableMath following what has been done for linearMath (math.spec.ts).

// Create paths of different lengths, including long paths using linear pools
// and test getOutputAmountSwapForPath, getSpotPriceAfterSwapForPath,
// getDerivativeSpotPriceAfterSwapForPath
// Each should be the derivative of the previous one
// (( Some error could happen at the last one since derivative
// of spot price has a discontinuity for linear pools, but only at specific points ))

// Test exactIn and exactOut.

import { assert } from 'chai';
import { NewPath, SwapTypes } from '../src/types';
import {
    calculatePathLimits,
    getLimitAmountSwapForPath,
} from '../src/routeProposal/pathLimits';
import smallLinear from './testData/linearPools/smallLinear.json';
import { Zero, One } from '@ethersproject/constants';
import { parseFixed, BigNumber, formatFixed } from '@ethersproject/bignumber';
import { BigNumber as OldBigNumber, bnum } from '../src/utils/bignumber';
import { BAL, DAI, USDC, WETH, USDT } from './lib/constants';
import { getPaths } from './linear.spec';
import { getOutputAmountSwap } from '../src/pools';
import {
    createPath,
    getPathsUsingStaBalPool,
} from '../src/routeProposal/filtering';
import {
    getOutputAmountSwapForPath,
    getSpotPriceAfterSwapForPath,
} from '../src/router/helpersClass';

describe('path-math:Tests path quantities derived from underlying pools quantities', () => {
    const tokenIn = BAL.address;
    const tokenOut = USDT.address;
    const maxPools = 10;

    let [paths] = getPaths(
        tokenIn,
        tokenOut,
        SwapTypes.SwapExactIn,
        smallLinear.pools,
        maxPools
    );

    let longPath = paths[0];

    assert.equal(longPath.swaps.length, 4, 'path length expected to be 4');
    it('Test path limits for long paths', async () => {
        let pathLimit = getLimitAmountSwapForPath(
            longPath,
            SwapTypes.SwapExactIn
        );
        let expectedPathLimit = getExpectedPathLimit(
            longPath,
            SwapTypes.SwapExactIn
        );
        let PRECISION: BigNumber = One.mul(10 ** 10);
        assert.approximately(
            expectedPathLimit.mul(PRECISION).div(pathLimit).toNumber(),
            PRECISION.toNumber(),
            1,
            'incorrect limit'
        );
        pathLimit = getLimitAmountSwapForPath(longPath, SwapTypes.SwapExactOut);
        expectedPathLimit = getExpectedPathLimit(
            longPath,
            SwapTypes.SwapExactOut
        );
        assert.approximately(
            expectedPathLimit.mul(PRECISION).div(pathLimit).toNumber(),
            PRECISION.toNumber(),
            1,
            'incorrect limit'
        );
    });

    let delta = 100;
    let error = 0.000011;
    let path = getSubpath(longPath, 0, 3); // 0, 4 not working for some reason.
    [[path]] = calculatePathLimits([path], SwapTypes.SwapExactIn);

    context('Path spot prices', async () => {
        it('Spot price as derivative of outcome', async () => {
            let inputDecimals = BAL.decimals;
            let amount = bnum(188580);
            checkPathDerivative(
                getOutputAmountSwapForPath,
                getSpotPriceAfterSwapForPath,
                path,
                SwapTypes.SwapExactIn,
                amount,
                BAL.decimals,
                delta,
                error,
                true
            );
        });
    });
});

function getExpectedPathLimit(path: NewPath, swapType: SwapTypes): BigNumber {
    const poolPairData = path.poolPairData;
    let length = poolPairData.length;
    let decimals: number;
    const pools = path.pools;
    let limit: OldBigNumber = bnum(Infinity);
    if (swapType == SwapTypes.SwapExactIn) {
        decimals = poolPairData[0].decimalsIn;
        for (let i = 0; i < 4; i++) {
            let poolLimit = pools[i].getLimitAmountSwap(
                poolPairData[i],
                SwapTypes.SwapExactIn
            );
            let pulledPoolLimit = poolLimit;
            for (let j = i; j > 0; j--) {
                pulledPoolLimit = getOutputAmountSwap(
                    pools[j - 1],
                    poolPairData[j - 1],
                    SwapTypes.SwapExactOut,
                    pulledPoolLimit
                );
            }
            limit = pulledPoolLimit.lt(limit) ? pulledPoolLimit : limit;
        }
    } else {
        // SwapExactOut
        decimals = poolPairData[length - 1].decimalsOut;
        for (let i = 0; i < 4; i++) {
            let poolLimit = pools[i].getLimitAmountSwap(
                poolPairData[i],
                SwapTypes.SwapExactOut
            );
            let pushedPoolLimit = poolLimit;
            for (let j = i + 1; j < length; j++) {
                pushedPoolLimit = getOutputAmountSwap(
                    pools[j],
                    poolPairData[j],
                    SwapTypes.SwapExactIn,
                    pushedPoolLimit
                );
            }
            limit = pushedPoolLimit.lt(limit) ? pushedPoolLimit : limit;
        }
    }
    return parseFixed(limit.dp(decimals).toString(), decimals);
}

function checkPathDerivative(
    fn: (
        path: NewPath,
        swapType: SwapTypes,
        amount: OldBigNumber,
        inputDecimals: number
    ) => OldBigNumber,
    der: (
        path: NewPath,
        swapType: SwapTypes,
        amount: OldBigNumber
    ) => OldBigNumber,
    path: NewPath,
    swapType: SwapTypes,
    amount: OldBigNumber,
    inputDecimals: number,
    delta: number,
    error: number,
    inverse: boolean = false
) {
    let x = amount;

    console.log('x+delta, x');
    console.log(x.toString());
    console.log(x.plus(delta).toString());
    let f1 = fn(path, swapType, x.plus(delta), inputDecimals);
    let f2 = fn(path, swapType, x, inputDecimals);

    let incrementalQuotient = f1.minus(f2).div(delta);
    if (inverse) incrementalQuotient = bnum(1).div(incrementalQuotient);

    console.log('incremental quotient: ', incrementalQuotient.toString());

    const der_ans = der(path, swapType, x);
    assert.approximately(
        incrementalQuotient.div(der_ans).toNumber(),
        1,
        error,
        'wrong result'
    );
}

function getSubpath(path: NewPath, startIndex: number, endIndex: number) {
    let pools = path.pools.slice(startIndex, endIndex);
    let poolPairData = path.poolPairData.slice(startIndex, endIndex);
    let tokens: string[] = [poolPairData[0].tokenIn];
    for (let eachPoolPairData of poolPairData) {
        tokens.push(eachPoolPairData.tokenOut);
    }
    return createPath(tokens, pools);
}
