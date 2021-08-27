import { ALLOW_ADD_REMOVE } from './config';
import {
    DisabledOptions,
    SubgraphPoolBase,
    PoolDictionary,
    SwapPairType,
    NewPath,
    Swap,
    PoolBase,
    PoolPairBase,
} from './types';
import { WeightedPool } from './pools/weightedPool/weightedPool';
import { StablePool } from './pools/stablePool/stablePool';
import { ElementPool } from './pools/elementPool/elementPool';
import { MetaStablePool } from './pools/metaStablePool/metaStablePool';
import { ZERO } from './bmath';

import disabledTokensDefault from './disabled-tokens.json';

function composePaths(paths: NewPath[]): NewPath {
    let id: string = '';
    let swaps: Swap[] = [];
    let poolPairData: PoolPairBase[] = [];
    let pools: PoolBase[] = [];
    for (let path of paths) {
        id += path.id;
        swaps = swaps.concat(path.swaps);
        poolPairData = poolPairData.concat(path.poolPairData);
        pools = pools.concat(path.pools);
    }
    const path: NewPath = {
        id: id,
        swaps: swaps,
        poolPairData: poolPairData,
        limitAmount: ZERO,
        pools: pools,
    };
    return path;
}

function createDirectPath(
    pool: PoolBase,
    tokenIn: string,
    tokenOut: string
): NewPath {
    const swap: Swap = {
        pool: pool.id,
        tokenIn: tokenIn,
        tokenOut: tokenOut,
        tokenInDecimals: 18, // TO DO - Add decimals here
        tokenOutDecimals: 18,
    };
    const poolPairData = pool.parsePoolPairData(tokenIn, tokenOut);
    const path: NewPath = {
        id: pool.id,
        swaps: [swap],
        limitAmount: ZERO,
        poolPairData: [poolPairData],
        pools: [pool],
    };
    return path;
}

function buildPoolBasePools(
    tokenIn: string,
    tokenOut: string,
    allPools: SubgraphPoolBase[],
    currentBlockTimestamp: number
) {
    let pools: PoolBase[] = [];
    for (let pool of allPools) {
        /*  This is a filter to optimize when using maxLength = 2
        let isOfInterest = false;
        for (let token of pool.tokensList){
            if (token === tokenIn || token === tokenOut) isOfInterest = true;
        }
        if (!isOfInterest) continue;*/

        if (pool.tokensList.length === 0 || pool.tokens[0].balance === '0') {
            continue;
        }
        let newPool: WeightedPool | StablePool | ElementPool;

        if (pool.poolType === 'Weighted')
            newPool = new WeightedPool(
                pool.id,
                pool.address,
                pool.swapFee,
                pool.totalWeight,
                pool.totalShares,
                pool.tokens,
                pool.tokensList
            );
        else if (pool.poolType === 'Stable')
            newPool = new StablePool(
                pool.id,
                pool.address,
                pool.amp,
                pool.swapFee,
                pool.totalShares,
                pool.tokens,
                pool.tokensList
            );
        else if (pool.poolType === 'Element') {
            newPool = new ElementPool(
                pool.id,
                pool.address,
                pool.swapFee,
                pool.totalShares,
                pool.tokens,
                pool.tokensList,
                pool.expiryTime,
                pool.unitSeconds,
                pool.principalToken,
                pool.baseToken
            );
            newPool.setCurrentBlockTimestamp(currentBlockTimestamp);
        } else if (pool.poolType === 'MetaStable') {
            newPool = new MetaStablePool(
                pool.id,
                pool.address,
                pool.amp,
                pool.swapFee,
                pool.totalShares,
                pool.tokens,
                pool.tokensList
            );
        } else if (pool.poolType === 'LiquidityBootstrapping') {
            // If an LBP doesn't have its swaps paused we treat it like a regular Weighted pool.
            // If it does we just ignore it.
            if (pool.swapEnabled === true)
                newPool = new WeightedPool(
                    pool.id,
                    pool.address,
                    pool.swapFee,
                    pool.totalWeight,
                    pool.totalShares,
                    pool.tokens,
                    pool.tokensList
                );
            else continue;
        } else {
            console.error(
                `Unknown pool type or type field missing: ${pool.poolType} ${pool.id}`
            );
            continue;
        }
        pools.push(newPool);
    }
    return pools;
}

export function getPaths(
    allPools: SubgraphPoolBase[],
    tokenIn: string,
    tokenOut: string,
    maxPools: number,
    disabledOptions: DisabledOptions = {
        isOverRide: false,
        disabledTokens: [],
    },
    currentBlockTimestamp: number = 0
): [PoolDictionary, NewPath[]] {
    let poolsDictionary: PoolDictionary = {};
    let paths: NewPath[] = [];

    let pools: PoolBase[] = buildPoolBasePools(
        tokenIn,
        tokenOut,
        allPools,
        currentBlockTimestamp
    ); // 7 ms
    // Construct a dictionary that stores for each token the set of 1-paths whose
    // source is the token. This may include BPTs.
    // This takes long (~1sec) if there are many pools (~1000)

    let start = new Date().getTime();

    let elementaryPathsDict: { [tokenIn: string]: Set<NewPath> };
    elementaryPathsDict = {};

    console.log('allPools.length: ', allPools.length);
    let poolCounter = 0;
    for (let pool of pools) {
        let tokensList = pool.tokensList;
        // To do: add BPTs when necessary
        for (let i = 0; i < tokensList.length; i++) {
            for (let j = i + 1; j < tokensList.length; j++) {
                let tokenA = tokensList[i];
                let tokenB = tokensList[j];
                if (elementaryPathsDict[tokenA] == null)
                    elementaryPathsDict[tokenA] = new Set();
                if (elementaryPathsDict[tokenB] == null)
                    elementaryPathsDict[tokenB] = new Set();
                elementaryPathsDict[tokenA].add(
                    createDirectPath(pool, tokenA, tokenB)
                );
                elementaryPathsDict[tokenB].add(
                    createDirectPath(pool, tokenB, tokenA)
                );
            }
        }
        poolCounter++;
    }
    console.log('poolCounter: ', poolCounter);
    let elapsed = new Date().getTime() - start;
    console.log('Tiempo: ', elapsed); // milisegundos

    start = new Date().getTime();
    // Construct all the paths joining tokenIn and TokenOut up to length maxLength
    // We only consider paths that do not use the same pool twice.

    let maxLength = +process.env.MAX_LENGTH;
    console.log('maxLength is: ', maxLength);
    let openPaths: Set<NewPath>[] = [];
    if (elementaryPathsDict[tokenIn]) {
        openPaths.push(elementaryPathsDict[tokenIn]);
    } else {
        openPaths.push(new Set());
    }
    for (let i = 0; i < maxLength - 1; i++) {
        openPaths.push(new Set());
        for (let path of openPaths[i]) {
            let lastToken = path.poolPairData[i].tokenOut;
            if (lastToken === tokenOut) {
                paths.push(path);
            } else {
                for (let step of elementaryPathsDict[lastToken]) {
                    if (path.pools.includes(step.pools[0])) continue; // checks that this pool is not already used by the path
                    if (i === maxLength - 2) {
                        // This clause avoids large use of memory compared to doing one more step
                        if (step.poolPairData[0].tokenOut !== tokenOut)
                            continue;
                        else {
                            paths.push(composePaths([path, step]));
                        }
                    } else {
                        openPaths[i + 1].add(composePaths([path, step]));
                    }
                }
            }
        }
    }
    elapsed = new Date().getTime() - start;
    console.log('Paths construction: ', elapsed, 'ms');
    return [poolsDictionary, paths];
}
