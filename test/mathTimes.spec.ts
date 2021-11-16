// TS_NODE_PROJECT='tsconfig.testing.json' npx mocha -r ts-node/register test/math.spec.ts
import { bnum } from '../src/utils/bignumber';
import { BAL, WETH } from './lib/constants';
import singleWeightedPool from './testData/weightedPools/singlePoolWithSwapEnabled.json';
import singleStablePool from './testData/stablePools/stableMathTimes.json';
import {
    WeightedPool,
    WeightedPoolPairData,
} from '../src/pools/weightedPool/weightedPool';
import * as WeightedMath from '../src/pools/weightedPool/weightedMath';
import { StablePool } from '../src/pools/stablePool/stablePool';
import * as StableMath from '../src/pools/stablePool/stableMath';
import * as ParaswapPool from '../src/paraswap/balancer-v2-pool';
import { BigNumber, parseFixed } from '@ethersproject/bignumber';
import { MathSol } from '../src/paraswap/balancer-v2-math';
import { SwapTypes } from '../src/types';

describe('mathTimes tests', () => {
    const repetitions = 50000;
    context('weighted-time', () => {
        // This will use a weighted pool with two tokens,
        // balanceIn, balanceOut, weightIn, weightOut, swapType, amount.
        compareWeighted(
            100000,
            200000,
            500,
            50,
            100,
            SwapTypes.SwapExactIn,
            repetitions
        );
    });

    context('stable-time', () => {
        // This will use a stable pool with balances
        // (balance in, balance out, third balance) where third balance = balance out
        compareStable(200000, 200000, 5000, 10, repetitions);
        // The fee is zero
    });
});

function compareWeighted(
    balIn: number,
    balOut: number,
    weightIn: number,
    weightOut: number,
    amount: number,
    swapType: SwapTypes,
    repetitions: number
) {
    const weightedPool = WeightedPool.fromPool(singleWeightedPool.pools[0]);
    const weightedPoolPairData = weightedPool.parsePoolPairData(
        WETH.address,
        BAL.address
    );
    weightedPoolPairData.balanceIn = parseFixed(balIn.toString(), 18);
    weightedPoolPairData.balanceOut = parseFixed(balOut.toString(), 18);
    weightedPoolPairData.weightIn = BigNumber.from(weightIn);
    weightedPoolPairData.weightOut = BigNumber.from(weightOut);

    let weightedPoolSwapFunction;
    let weightedPoolMathFunction;
    if (swapType == SwapTypes.SwapExactIn) {
        weightedPoolSwapFunction = weightedPool._exactTokenInForTokenOut;
        weightedPoolMathFunction = WeightedMath._exactTokenInForTokenOut;
    } else {
        weightedPoolSwapFunction = weightedPool._tokenInForExactTokenOut;
        weightedPoolMathFunction = WeightedMath._tokenInForExactTokenOut;
    }

    let start = new Date().getTime();
    let end = new Date().getTime();
    for (let i = 0; i < repetitions; i++) {
        weightedPoolSwapFunction(weightedPoolPairData, bnum(100), true);
    }
    end = new Date().getTime();
    console.log('SOR weightedPool, exact true (SDK): ', end - start);

    start = new Date().getTime();

    for (let i = 0; i < repetitions; i++) {
        weightedPoolSwapFunction(weightedPoolPairData, bnum(100), false);
    }
    end = new Date().getTime();
    console.log('SOR weightedPool, exact false (SOR): ', end - start);

    let sorResult;
    start = new Date().getTime();
    for (let i = 0; i < repetitions; i++) {
        sorResult = weightedPoolMathFunction(bnum(100), weightedPoolPairData);
    }
    end = new Date().getTime();
    const sorTime = end - start;
    console.log('SOR WeightedMath: ', end - start);

    const balanceIn = BigInt(weightedPoolPairData.balanceIn.toString());
    const balanceOut = BigInt(weightedPoolPairData.balanceOut.toString());
    const bigIntAmount = BigInt(amount) * BigInt(1000000000000000000);
    const bigIntweightIn = BigInt(weightIn);
    const bigIntweightOut = BigInt(weightOut);

    let paraswapResult;
    let paraswapTime;
    if (swapType == SwapTypes.SwapExactIn) {
        start = new Date().getTime();
        for (let i = 0; i < repetitions; i++) {
            const amountAfterFee = _subtractSwapFeeAmount(
                bigIntAmount,
                BigInt(10000000000000000)
            );
            const amountsIn = [amountAfterFee, BigInt(0)];
            paraswapResult = ParaswapPool.WeightedMath._calcOutGivenIn(
                balanceIn,
                bigIntweightIn,
                balanceOut,
                bigIntweightOut,
                amountsIn
            );
        }
        end = new Date().getTime();
        paraswapTime = end - start;
        console.log('Paraswap WeightedMath: ', end - start);
    } else {
        console.log('Paraswap does not have exact out implemented');
    }
    console.log(
        'SOR weightedMath/Paraswap weightedMath: ',
        sorTime / paraswapTime,
        '\n'
    );

    console.log('weighted sor result:      ', sorResult.toString());
    console.log(
        'weighted paraswap result: ',
        bnum(paraswapResult[0].toString())
            .div(10 ** 18)
            .toString(),
        '\n'
    );
}

function compareStable(
    balIn: number,
    balOut: number,
    amount: number,
    ampNumber: number,
    repetitions: number
) {
    const stablePool = StablePool.fromPool(singleStablePool.pools[0]);
    const stablePoolPairData = stablePool.parsePoolPairData(
        '0x6b175474e89094c44da98b954eedeac495271d0f',
        '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
    );

    stablePoolPairData.balanceIn = parseFixed(balIn.toString(), 18);
    stablePoolPairData.balanceOut = parseFixed(balOut.toString(), 18);
    stablePoolPairData.allBalances = [bnum(balIn), bnum(balOut), bnum(balOut)];
    stablePoolPairData.amp = BigNumber.from(ampNumber);

    stablePoolPairData.allBalancesScaled = [
        stablePoolPairData.balanceIn,
        stablePoolPairData.balanceOut,
        stablePoolPairData.balanceOut,
    ];

    let start = new Date().getTime();
    for (let i = 0; i < repetitions; i++) {
        stablePool._exactTokenInForTokenOut(
            stablePoolPairData,
            bnum(amount),
            true
        );
    }
    let end = new Date().getTime();
    console.log('SOR stablePool, exact true (SDK): ', end - start);

    start = new Date().getTime();
    for (let i = 0; i < repetitions; i++) {
        stablePool._exactTokenInForTokenOut(
            stablePoolPairData,
            bnum(amount),
            false
        );
    }
    end = new Date().getTime();
    console.log('SOR stablePool, exact false (SDK): ', end - start);

    let sorResult;
    start = new Date().getTime();
    for (let i = 0; i < repetitions; i++) {
        sorResult = StableMath._exactTokenInForTokenOut(
            bnum(amount),
            stablePoolPairData
        );
    }
    end = new Date().getTime();
    const sorTime = end - start;
    console.log('SOR StableMath: ', end - start);

    const balanceIn = BigInt(stablePoolPairData.balanceIn.toString());
    const balanceOut = BigInt(stablePoolPairData.balanceOut.toString());
    const bigIntAmount = BigInt(amount) * BigInt(1000000000000000000);
    const amountsIn = [bigIntAmount, BigInt(0), BigInt(0)];
    // It seems that Paraswap has an error at line 186 of balancer-v2-pool.ts
    // that makes us put the following 9
    const amp = BigInt(ampNumber * 9);
    let paraswapResult;
    start = new Date().getTime();
    for (let i = 0; i < repetitions; i++) {
        paraswapResult = ParaswapPool.StableMath._calcOutGivenIn(
            amp,
            [balanceIn, balanceOut, balanceOut],
            0,
            1,
            amountsIn
        );
    }
    end = new Date().getTime();
    const paraswapTime = end - start;
    console.log('Paraswap StableMath: ', end - start);
    console.log(
        'SOR stableMath/Paraswap stableMath: ',
        sorTime / paraswapTime,
        '\n'
    );

    console.log('Stable SOR result:       ', sorResult.toString());
    console.log(
        'Stable Paraswap result:  ',
        bnum(paraswapResult[0].toString())
            .div(10 ** 18)
            .toString()
    );
}

// function copied from inside a class by Paraswap
function _subtractSwapFeeAmount(
    amount: bigint,
    _swapFeePercentage: bigint
): bigint {
    // This returns amount - fee amount, so we round up (favoring a higher fee amount).
    const feeAmount = MathSol.mulUpFixed(amount, _swapFeePercentage);
    return amount - feeAmount;
}
