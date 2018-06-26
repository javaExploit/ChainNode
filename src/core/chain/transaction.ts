import { BufferReader, BufferWriter, Serializable, ErrorCode, SerializableWithHash, stringify } from '../serializable';
import { Encoding } from '../lib/encoding';
import * as Address from '../address';
import * as digest from '../lib/digest';
import { write } from 'fs';
import { read } from 'fs-extra';


export class Transaction extends SerializableWithHash {
    private m_publicKey: Buffer;
    private m_signature: Buffer;
    private m_method: string;
    private m_nonce: number;
    // TODO: 支持更多的input type； array  map 等等
    private m_input?: any;

    constructor() {
        super();
        this.m_publicKey = Encoding.ZERO_KEY;
        this.m_signature = Encoding.ZERO_SIG64;
        this.m_method = '';
        this.m_nonce = -1;
    }

    get address(): string | undefined {
        return Address.addressFromPublicKey(this.m_publicKey);
    }

    get method(): string {
        return this.m_method;
    }

    set method(s: string) {
        this.m_method = s;
    }

    get nonce(): number {
        return this.m_nonce;
    }

    set nonce(n: number) {
        this.m_nonce = n;
    }

    get input() {
        const input = this.m_input;
        return input;
    }

    set input(i: any) {
        this.m_input = stringify(i);
    }

    set publickey(b:  Buffer) {
        this.m_publicKey = b;
    }

    /**
     *  virtual验证交易的签名段
     */
    public verifySignature(): boolean {
        if (!this.m_publicKey) {
            return false;
        }
        return Address.verify(this.m_hash, this.m_signature, this.m_publicKey);
    }

    public sign(privateKey: Buffer|string) {
        let pubkey = Address.publicKeyFromSecretKey(privateKey);
        this.m_publicKey = pubkey!;
        this.updateHash();
        this.m_signature = Address.sign(this.m_hash, privateKey);
    }

    protected _encodeHashContent(writer: BufferWriter): BufferWriter {
        writer.writeVarString(this.m_method);
        writer.writeU32(this.m_nonce);
        writer.writeBytes(this.m_publicKey);
        writer = this._encodeInput(writer);
        return writer;
    }


    public encode(writer: BufferWriter): BufferWriter {
        super.encode(writer);
        writer.writeBytes(this.m_signature);
        return writer;
    }

    protected _decodeHashContent(reader: BufferReader): ErrorCode {
        this.m_method = reader.readVarString();
        this.m_nonce = reader.readU32();
        this.m_publicKey = reader.readBytes(33, false);
        this._decodeInput(reader);
        return ErrorCode.RESULT_OK;
    }

    public decode(reader: BufferReader): ErrorCode {
        super.decode(reader);
        this.m_signature = reader.readBytes(64, false);
        return ErrorCode.RESULT_OK;
    }

    protected _encodeInput(writer: BufferWriter): BufferWriter {
        let input: string;
        if (this.m_input) {
            input = JSON.stringify(this.m_input);
        } else {
            input = JSON.stringify({});
        }
        writer.writeVarString(input);
        return writer;
    }

    protected _decodeInput(reader: BufferReader): ErrorCode {
        this.m_input = JSON.parse(reader.readVarString());
        return ErrorCode.RESULT_OK;
    }
}

export class EventLog implements Serializable {
    private m_event: string;
    private m_params?: any;
    constructor() {
        this.m_event = '';
    }

    set name(n: string) {
        this.m_event = n;
    }

    get name(): string {
        return this.m_event;
    }

    set param(p: any) {
        this.m_params = p;
    }

    get param(): any {
        return this.m_params;
    }

    public encode(writer: BufferWriter): BufferWriter {
        let input: string;
        if (this.m_params) {
            input = JSON.stringify(this.m_params);
        } else {
            input = JSON.stringify({});
        }
        writer.writeVarString(input);
        return writer;
    }

    public decode(reader: BufferReader): ErrorCode {
        this.m_params = JSON.parse(reader.readVarString());
        return ErrorCode.RESULT_OK;
    }
}

export class Receipt implements Serializable {
    private m_transactionHash: string;
    private m_sysEventName: string;
    private m_returnCode: number;
    private m_eventLogs: EventLog[];
    constructor() {
        this.m_transactionHash = '';
        this.m_sysEventName = '';
        this.m_returnCode = 0;
        this.m_eventLogs = new Array<EventLog>();
    }

    set transactionHash(s: string) {
        this.m_transactionHash = s;
    }
    get transactionHash(): string {
        return this.m_transactionHash;
    }

    set sysEventName(n: string) {
        this.m_sysEventName = n;
    }

    get sysEventName(): string {
        return this.m_sysEventName;
    }

    set returnCode(n: number) {
        this.m_returnCode = n;
    }

    get returnCode(): number {
        return this.m_returnCode;
    }

    set eventLogs(logs: EventLog[]) {
        this.m_eventLogs = logs;
    }

    get eventLogs(): EventLog[] {
        const l = this.m_eventLogs;
        return l;
    }

    public encode(writer: BufferWriter): BufferWriter {
        writer.writeVarString(this.m_transactionHash);
        writer.writeVarString(this.m_sysEventName);
        writer.writeI32(this.m_returnCode);
        writer.writeU16(this.m_eventLogs.length);
        for (let log of this.m_eventLogs) {
            writer = log.encode(writer);
        }

        return writer;
    }

    public decode(reader: BufferReader): ErrorCode {
        this.m_transactionHash = reader.readVarString();
        this.m_sysEventName = reader.readVarString();
        this.m_returnCode = reader.readI32();
        let nCount: number = reader.readU16();
        for(let i=0; i < nCount; i++) {
            let log: EventLog = new EventLog();
            log.decode(reader)
            this.m_eventLogs.push(log);
        }

        return ErrorCode.RESULT_OK;
    }
}
