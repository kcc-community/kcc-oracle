const mojitoInfoList = require("../config/mojito_twap.json");
const config = require("../config/config.json");
const {table} = require("table");
const hre = require("hardhat");
let result = [["base", "quote"]];
require('dotenv')

async function main() {

    let chainId=321
    let number = 0;
    let mojitoOracleAddr
    if (chainId===321){
        mojitoOracleAddr=config.mainnet.mojitoOracle
    }else if (chainId===322){
        mojitoOracleAddr=config.testnet.mojitoOracle
    }

    const mojitoOracle = await hre.ethers.getContractFactory("MojitoOracle");
    const moInstance = mojitoOracle.attach(mojitoOracleAddr);

    for (let index = 0; index < mojitoInfoList.length; index++) {
        const mojitoInfo = mojitoInfoList[index];

        if (mojitoInfo.set===false&&mojitoInfo.chainId===chainId) {

            console.log(`Step ${number}: set ${mojitoInfo.feedConfig.base}-${mojitoInfo.feedConfig.quote} config`);

            const setFeedConfigTx = await moInstance.setFeedConfig(
                mojitoInfo.feedConfig.base,
                mojitoInfo.feedConfig.quote,
                mojitoInfo.feedConfig.tokenA,
                mojitoInfo.feedConfig.tokenB,
                mojitoInfo.feedConfig.tokenC,
                mojitoInfo.feedConfig.tokenABaseUnit,
                mojitoInfo.feedConfig.tokenCBaseUnit
            );


            console.log("setFeedConfig ", mojitoInfo.feedConfig);

            await setFeedConfigTx.wait();

            const params = [mojitoInfo.feedConfig.base, mojitoInfo.feedConfig.quote];
            result.push(params);

            console.log("Done!")
        }
    }

    console.log(table(result))
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });