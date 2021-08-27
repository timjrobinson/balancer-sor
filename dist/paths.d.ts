import {
    DisabledOptions,
    SubgraphPoolBase,
    PoolDictionary,
    NewPath,
} from './types';
export declare function getPaths(
    allPools: SubgraphPoolBase[],
    tokenIn: string,
    tokenOut: string,
    maxPools: number,
    disabledOptions?: DisabledOptions,
    currentBlockTimestamp?: number
): [PoolDictionary, NewPath[]];
