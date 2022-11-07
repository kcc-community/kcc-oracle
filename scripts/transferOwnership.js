const hre = require("hardhat");
const aggregators = require("../config/ocr.json");
require('dotenv')

async function main() {

    for (let index = 0; index < aggregators.length; index++) {
        const aggregator = aggregators[index]
        let owner = process.env.OWNER
        console.log(`${index + 1} transferOwnership ${aggregator.description} module`)
        const ocrAggregator = await hre.ethers.getContractFactory("AccessControlledOffchainAggregator")
        const ocrInstance = ocrAggregator.attach(aggregator.ocr_address);
        console.log("transferOwnership ", owner);
        const tx = await ocrInstance.transferOwnership(owner);
        await tx.wait();

        const eacAggregator = await hre.ethers.getContractFactory("EACAggregatorProxy")
        const proxyInstance = eacAggregator.attach(aggregator.proxy_address);
        console.log("transferOwnership ", owner);
        const proxyTx = await proxyInstance.transferOwnership(owner);
        await proxyTx.wait();
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });