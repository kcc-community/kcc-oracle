const aggregators = require("../config/ocr.json");
const {table} = require("table");
const hre = require("hardhat");
let result = [["proxy", "ocr"]];
require('dotenv')

async function main() {

    for (let index = 0; index < aggregators.length; index++) {
        const aggregator = aggregators[index];
        if (aggregator.chainId.toString() === '322' && !aggregator.deploy) {
            console.log(` ${aggregator.description} confirmAggregator`)

            const mojitoOracleProxy = await hre.ethers.getContractFactory("EACAggregatorProxy");
            const proxyInstance = mojitoOracleProxy.attach(aggregator.proxy_address);

            const proposeAggregatorTx =await proxyInstance.confirmAggregator(aggregator.ocr_address);
            await proposeAggregatorTx.wait();

            const params = [proxyInstance.address, aggregator.ocr_address];
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