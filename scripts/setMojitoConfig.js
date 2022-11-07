const hre = require("hardhat");
const aggregators = require("../config/ocr.json");
const {assert} = require("chai");

async function main() {

    let chainId = await hre.getChainId()
    for (let index = 0; index < aggregators.length; index++) {
        const aggregator = aggregators[index]
        if (aggregator.chainId.toString() === chainId&&!aggregator.deploy) {
            console.log(`${index + 1} setMojitoConfig ${aggregator.description} module`);
            const ocrAggregator = await hre.ethers.getContractFactory("AccessControlledOffchainAggregator");
            const ocrInstance = ocrAggregator.attach(aggregator.ocr_address);
            console.log(`params`,aggregator.mojitoConfig)
            const setMojitoConfigTx = await ocrInstance.setMojitoConfig(
                aggregator.mojitoConfig.available,
                aggregator.mojitoConfig.pairA,
                aggregator.mojitoConfig.pairABaseUnit,
            );
            await setMojitoConfigTx.wait();
            const mojitoConfig = await ocrInstance.getMojitoConfig()
            console.log(`result`,mojitoConfig)
            assert.equal(aggregator.mojitoConfig.available, mojitoConfig.available)
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });