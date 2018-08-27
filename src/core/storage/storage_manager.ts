
import * as fs from 'fs-extra';
import * as path from 'path';

import { isString } from 'util';

import { ErrorCode } from '../error_code';
import {LoggerInstance} from '../lib/logger_util';

import {StorageSnapshotManagerOptions, StorageDumpSnapshot} from './dump_snapshot';
import {IReadableStorage, Storage, StorageOptions} from './storage';
import {SnapshotManager} from './log_snapshot_manager';
import {StorageLogger} from './logger';

export type StorageManagerOptions = {
    path: string;
    storageType: new (options: StorageOptions) => Storage;
    logger: LoggerInstance;
} & StorageSnapshotManagerOptions;

export class StorageManager {
    constructor(options: StorageManagerOptions) {
        this.m_path = options.path;
        this.m_storageType = options.storageType;
        this.m_logger = options.logger;
        this.m_snapshotManager = new SnapshotManager(options);
    }
    private m_path: string;
    private m_storageType: new (options: StorageOptions) => Storage;
    private m_snapshotManager: SnapshotManager;
    private m_logger: LoggerInstance;
    private m_views: Map<string, {storage: Storage, ref: number}> = new Map();

    public async init(): Promise<ErrorCode> {
        let err = await this.m_snapshotManager.init();
        if (err) {
            return err;
        }

        return ErrorCode.RESULT_OK;
    }

    uninit() {
        this.m_snapshotManager.uninit();
    }

    async createSnapshot(from: Storage, blockHash: string, remove?: boolean): Promise<{err: ErrorCode, snapshot?: StorageDumpSnapshot}> {
        let csr = await this.m_snapshotManager.createSnapshot(from, blockHash);
        if (csr.err) {
            return csr;
        }
        // assert((await csr.snapshot!.messageDigest()).value !== (await from.messageDigest()).value);
        if (remove) {
            await from.remove();
        }
        return csr;
    }

    public async getSnapshot(blockHash: string): Promise<{err: ErrorCode, snapshot?: StorageDumpSnapshot}> {
        return await this.m_snapshotManager.getSnapshot(blockHash);
    }

    public async createStorage(name: string, from?: Storage|string): Promise<{err: ErrorCode, storage?: Storage}> {
        let storage = new this.m_storageType({
            filePath: path.join(this.m_path, name),
            logger: this.m_logger}
        );
        await storage.remove();
        let err: ErrorCode;
        if (!from) {
            this.m_logger.info(`create storage ${name}`);
            err = await storage.init();
        } else if (isString(from)) {
            this.m_logger.info(`create storage ${name} from snapshot ${from}`);
            let ssr = await this._getSnapshotStorage(from);
            if (ssr.err) {
                this.m_logger.error(`get snapshot failed for ${from}`);
                err = ssr.err;
            } else {
                fs.copyFileSync(ssr.storage!.filePath, storage.filePath);
                this.releaseSnapshotView(from);
                err = await storage.init();
            }
        } else if (from instanceof Storage) {
            this.m_logger.info(`create storage ${name} from snapshot ${storage.filePath}`);
            fs.copyFileSync(from.filePath, storage.filePath);
            err = await storage.init();
        } else {
            this.m_logger.error(`create storage ${name} with invalid from ${from}`);
            return {err: ErrorCode.RESULT_INVALID_PARAM};
        }
        if (err) {
            this.m_logger.error(`create storage ${name} failed for ${err}`); 
            return {err};
        }
        return {err: ErrorCode.RESULT_OK, storage};
    }

    protected async _getSnapshotStorage(blockHash: string): Promise<{err: ErrorCode, storage?: Storage}> {
        let stub = this.m_views.get(blockHash);
        if (stub) {
            ++stub.ref;
            if (stub.storage.isInit) {
                return {err: ErrorCode.RESULT_OK, storage: stub.storage};
            } else {
                return new Promise<{err: ErrorCode, storage?: Storage}>((resolve) => {
                    stub!.storage!.once('init', (err: ErrorCode) => {
                        if (err) {
                            resolve({err});
                        } else {
                            resolve({err, storage: stub!.storage});
                        }
                    });
                });
            }
        }

        stub = {
            storage: new this.m_storageType({
                filePath: this.m_snapshotManager.getSnapshotFilePath(blockHash),
                logger: this.m_logger}),
            ref: 1
        };
        this.m_views.set(blockHash, stub);

        let sr = await this.m_snapshotManager.getSnapshot(blockHash);
        if (sr.err) {
            this.m_logger.error(`get snapshot failed for ${sr.err}`);
            this.m_views.delete(blockHash);
            return {err: sr.err};
        }

        let ret = new Promise<{err: ErrorCode, storage?: Storage}>((resolve) => {
            stub!.storage.once('init', (err) => {
                if (err) {
                    this.m_snapshotManager.releaseSnapshot(blockHash);
                    this.m_views.delete(blockHash);
                    resolve({err});
                } else {
                    resolve({err, storage: stub!.storage});
                }
            });
        });
        
        stub!.storage.init(true);

        return ret;
    }

    public async getSnapshotView(blockHash: string): Promise<{err: ErrorCode, storage?: IReadableStorage}> {
        return await this._getSnapshotStorage(blockHash);
    }

    // 根据block hash 获取redo log内容
    // 提供给chain_node层引用
    public getRedoLog(blockHash: string): StorageLogger|undefined {
        return this.m_snapshotManager.getRedoLog(blockHash);
    }

    // 对象形式的redo log（通过网络请求, 然后解析buffer获得) 写入至本地文件
    // 提供给chain层引用
    public writeRedoLog(blockHash: string, log: StorageLogger) {
        this.m_snapshotManager.writeRedoLog(blockHash, log);
    }

    public async releaseSnapshotView(blockHash: string): Promise<void> {
        let stub = this.m_views.get(blockHash);
        if (stub) {
            --stub.ref;
            if (!stub.ref) {
                this.m_views.delete(blockHash);
                // 这里await也不能保证互斥， 可能在uninit过程中再次创建，只能靠readonly保证在一个path上创建多个storage 实例
                await stub.storage.uninit();
                this.m_snapshotManager.releaseSnapshot(blockHash);
            }
        }
    }

    public recycleSnapShot() {
        return this.m_snapshotManager.recycle();
    }
}