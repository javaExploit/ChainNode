import { BigNumber } from 'bignumber.js';
import { ErrorCode } from '../error_code';
const assert = require('assert');
import {isValidAddress} from '../address';
import { LoggerInstance, initLogger, LoggerOptions } from '../lib/logger_util';

import { Storage } from '../storage';
import { TransactionContext, EventContext, ViewContext, ChainInstanceOptions, ChainGlobalOptions, Chain, Block, BlockHeader, IReadableStorage, BlockExecutor, ViewExecutor} from '../chain';
import { ValueBlockHeader } from './block';
import { ValueTransaction } from './transaction';
import { ValueBlockExecutor} from './executor';
import * as ValueContext from './context';
import {ValuePendingTransactions} from './pending';

export type ValueTransactionContext = {
    value: BigNumber;
    getBalance: (address: string) => Promise<BigNumber>;
    transferTo: (address: string, amount: BigNumber) => Promise<ErrorCode>;
} & TransactionContext;

export type ValueEventContext = {
    getBalance: (address: string) => Promise<BigNumber>;
    transferTo: (address: string, amount: BigNumber) => Promise<ErrorCode>;
} & EventContext;

export type ValueViewContext = {
    getBalance: (address: string) => Promise<BigNumber>;
} & ViewContext;

export type ValueChainGlobalOptions = ChainGlobalOptions;
export type ValueChainInstanceOptions = ChainInstanceOptions;

export class ValueChain extends Chain {
    constructor(options: LoggerOptions) {
        super(options);
    }

    public async newBlockExecutor(block: Block, storage: Storage): Promise<{err: ErrorCode, executor?: BlockExecutor}> {
        let kvBalance = (await storage.getKeyValue(Chain.dbSystem, ValueChain.kvBalance)).kv!;
        let ve = new ValueContext.Context(kvBalance);
        let externContext = Object.create(null);
        externContext.getBalance = (address: string): Promise<BigNumber> => {
            return ve.getBalance(address);
        };
        externContext.transferTo = (address: string, amount: BigNumber): Promise<ErrorCode> => {
            return ve.transferTo(ValueChain.sysAddress, address, amount);
        };
        let executor = new ValueBlockExecutor({logger: this.logger, block, storage, handler: this.handler, externContext, globalOptions: this.m_globalOptions!});
        return {err: ErrorCode.RESULT_OK, executor};
    }

    public async newViewExecutor(header: BlockHeader, storage: IReadableStorage, method: string, param: Buffer|string|number|undefined): Promise<{err: ErrorCode, executor?: ViewExecutor}> {
        let dbSystem = (await storage.getReadableDataBase(Chain.dbSystem)).value!;
        let kvBalance = (await dbSystem.getReadableKeyValue(ValueChain.kvBalance)).kv!;
        let ve = new ValueContext.ViewContext(kvBalance);
        let externContext = Object.create(null);
        externContext.getBalance = (address: string): Promise<BigNumber> => {
            return ve.getBalance(address);
        };
        let executor = new ViewExecutor({logger: this.logger, header, storage, method, param, handler: this.handler, externContext});
        return {err: ErrorCode.RESULT_OK, executor};
    }

    protected _getBlockHeaderType(): new () => BlockHeader {
        return ValueBlockHeader;
    }
    
    protected _getTransactionType() {
        return ValueTransaction;
    }

    protected _createPending(): ValuePendingTransactions {
        return new ValuePendingTransactions({ storageManager: this.m_storageManager!, logger: this.logger, txlivetime: this.m_globalOptions!.txlivetime});
    }

    async onCreateGenesisBlock(block: Block, storage: Storage, genesisOptions?: any): Promise<ErrorCode> {
        let err = await super.onCreateGenesisBlock(block, storage, genesisOptions);
        if (err) {
            return err;
        } 
        let dbr = await storage.getReadWritableDatabase(Chain.dbSystem);
        if (dbr.err) {
            assert(false, `value chain create genesis failed for no system database`);
            return dbr.err;
        }
        const dbSystem = dbr.value!;
        let gkvr = await dbSystem.getReadWritableKeyValue(Chain.kvConfig);
        if (gkvr.err) {
            return gkvr.err;
        }
        let rpr = await gkvr.kv!.rpush('features', 'value');
        if (rpr.err) {
            return rpr.err;
        }
        if (!genesisOptions || !isValidAddress(genesisOptions.coinbase)) {
            this.m_logger.error(`create genesis failed for genesisOptioins should has valid coinbase`);
            return ErrorCode.RESULT_INVALID_PARAM;
        }
        (block.header as ValueBlockHeader).coinbase = genesisOptions.coinbase;
        let kvr = await dbSystem.createKeyValue(ValueChain.kvBalance);
        // 在这里给用户加钱
        if (genesisOptions && genesisOptions.preBalances) {
            // 这里要给几个账户放钱
            let kvBalance = kvr.kv!;
            for (let index = 0; index < genesisOptions.preBalances.length; index++) {
                // 按照address和amount预先初始化钱数
                await kvBalance.set(genesisOptions.preBalances[index].address, new BigNumber(genesisOptions.preBalances[index].amount));
            }
        }
        return kvr.err;
    }

    // 存储每个address的money，其中有一个默认的系统账户
    public static kvBalance: string = 'balance'; // address<--->blance

    public static sysAddress: string = '0';
}