#!/bin/bash

node ./dist/blockchain-sdk/src/tool/host.js miner --genesis "./data/dposbft/genesis"   --dataDir "./data/dposbft/miner1" --loggerConsole --loggerLevel debug --minerSecret 64d8284297f40dc7475b4e53eb72bc052b41bef62fecbd3d12c5e99b623cfc11   --rpchost 192.168.31.68 --rpcport 18089 --feelimit 100 --net bdt --host 192.168.31.68 --port "13101|13000" --peerid 1EYLLvMtXGeiBJ7AZ6KJRP2BdAQ2Bof79 --sn SN_PEER_TEST@40.73.66.144@10000@10001 --bdt_log_level info --txServer --minOutbound 0  --forceClean
