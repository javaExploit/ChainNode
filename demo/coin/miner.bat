node ./dist/blockchain-sdk/src/tool/host.js miner ^
--genesis "./data/coin/genesis" ^
--coinbase 12LKjfgQW26dQZMxcJdkj2iVP2rtJSzT88 ^
--dataDir "./data/coin/miner" ^
--net tcp --host localhost --port 12312 --minOutbound 0 ^
--rpchost localhost --rpcport 18089 ^
--loggerConsole --loggerLevel debug ^
--executor interprocess ^
--feelimit 10 