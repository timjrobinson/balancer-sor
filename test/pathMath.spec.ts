// Create paths of different lengths, including long paths using linear pools
// and test getOutputAmountSwapForPath, getSpotPriceAfterSwapForPath,
// getDerivativeSpotPriceAfterSwapForPath
// Each should be the derivative of the previous one
// (( Some error could happen at the last one since derivative
// of spot price has a discontinuity for linear pools, but only at specific points ))

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
    // BAL > [weightedBalWeth] > WETH > [weightedWethStaBal3Id] >
    // STABAL3 > [staBal3Id] > bUSDT > [linearUSDT] > USDT
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
        console.log('longPath limit: ', longPath.limitAmount.toString());
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

    let delta = 10;
    let error = 0.00005;
    let path04 = getSubpath(longPath, 0, 4);
    let path03 = getSubpath(longPath, 0, 3);
    let path02 = getSubpath(longPath, 0, 2);
    let path01 = getSubpath(longPath, 0, 1);
    let path34 = getSubpath(longPath, 3, 4);
    // path limit seems to be working bad: the path returns zero
    // for amounts under the path-limit
    // (the fourth pool returns zero, possibly because it exceeds the pool limit)

    [[path04]] = calculatePathLimits([path04], SwapTypes.SwapExactIn);
    [[path03]] = calculatePathLimits([path03], SwapTypes.SwapExactIn);
    [[path02]] = calculatePathLimits([path02], SwapTypes.SwapExactIn);
    [[path01]] = calculatePathLimits([path01], SwapTypes.SwapExactIn);
    [[path34]] = calculatePathLimits([path34], SwapTypes.SwapExactIn);

    // BAL > [weightedBalWeth] > WETH > [weightedWethStaBal3Id] >
    // STABAL3 > [staBal3Id] > bUSDT > [linearUSDT] > USDT
    console.log('path04 limit: ', path04.limitAmount.toString());
    console.log('path03 limit: ', path03.limitAmount.toString());
    console.log('path02 limit: ', path02.limitAmount.toString());
    console.log('path01 limit: ', path01.limitAmount.toString());
    console.log('path34 limit: ', path34.limitAmount.toString());

    // Tests to perform:
    // (a) inclusion gives a larger limit
    // (b) let amount = limit of longPath = 9724, get output 03 for 9724.
    // This should be the limit for the last pool.

    let WETH_out = getOutputAmountSwapForPath(
        path01,
        SwapTypes.SwapExactIn,
        bnum(9724.91117697),
        BAL.decimals
    );
    console.log(' WETH_out: ', WETH_out.toString());
    let STABAL3_out = getOutputAmountSwapForPath(
        path02,
        SwapTypes.SwapExactIn,
        bnum(9724.91117697),
        BAL.decimals
    );
    console.log('STABAL3_out: ', STABAL3_out.toString());
    let bUSDT_out = getOutputAmountSwapForPath(
        path03,
        SwapTypes.SwapExactIn,
        bnum(9724.91117697),
        BAL.decimals
    );
    console.log('bUSDT_out: ', bUSDT_out.toString());
    let USDT_out = getOutputAmountSwapForPath(
        path04,
        SwapTypes.SwapExactIn,
        bnum(9724.91117697),
        BAL.decimals
    );
    // let USDT_out = getOutputAmountSwapForPath(path34, SwapTypes.SwapExactIn, bnum(94777.251184), 18);
    console.log('USDT_out: ', USDT_out.toString());

    const linearUSDT = path34.pools[0];
    const linearUSDTLimit = linearUSDT.getLimitAmountSwap(
        path34.poolPairData[0],
        SwapTypes.SwapExactIn
    );
    console.log('linearUSDTLimit: ', linearUSDTLimit.toString());

    context('Path spot prices', async () => {
        it('Spot price as derivative of outcome', async () => {
            let inputDecimals = BAL.decimals;
            let amount = bnum(9524);
            checkPathDerivative(
                getOutputAmountSwapForPath,
                getSpotPriceAfterSwapForPath,
                path04,
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
            console.log('pulledPoolLimit: ', pulledPoolLimit.toString());
            for (let j = i; j > 0; j--) {
                pulledPoolLimit = getOutputAmountSwap(
                    pools[j - 1],
                    poolPairData[j - 1],
                    SwapTypes.SwapExactOut,
                    pulledPoolLimit
                );
                if (i == 3) {
                    console.log(
                        'pulledPoolLimit: ',
                        pulledPoolLimit.toString()
                    );
                }
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
    console.log('f1: ', f1.toString());
    console.log('f2: ', f2.toString());

    let incrementalQuotient = f1.minus(f2).div(delta);
    if (inverse) incrementalQuotient = bnum(1).div(incrementalQuotient);

    console.log('incremental quotient: ', incrementalQuotient.toString());

    const der_ans = der(path, swapType, x);
    console.log('der_ans: ', der_ans.toString());
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
