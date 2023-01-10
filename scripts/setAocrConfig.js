const {deployments, ethers, getNamedAccounts} = require("hardhat")
const {get} = deployments;
const aggregators = require("../config/ocr.json");
const {table} = require("table");
let result = [["desc", "ocr"]]

async function main() {
    const {deployer}=await getNamedAccounts()
    let account = ethers.provider.getSigner(deployer)
    let signer = [
        '0xC48ec77Fe358284bc4F70172BDb09CB891b86532',
        '0x1ef2e6ca56E0621E1145c910fe3E4a62EBFa7E3B',
        '0xFA40FE626A31b751BF5e19CEAda46B2b925e7e1b'
    ]
    let transmitter = [
        '0xF5cb89A64BD49d88cf05819dc232103A15400EA1',
        '0x977ab71E93E75e25e4D13a5e11bcd1ad01516cA2',
        '0x93E06cb6B4C51132A98616f226aAe91578FEB6A3'
    ]
    const aggregatorContract = (await get('AccessControlledOffchainAggregator'))
    const proxyContract = (await get('EACAggregatorProxy'))
    let k = 0
    for (let index = 0; index < aggregators.length; index++) {
        const aggregator = aggregators[index];
        if (aggregator.chainId.toString() === "322" && !aggregator.deploy) {
            console.log(`${k + 1} config ${aggregator.description} module`);
            const aggregatorInstance = new ethers.Contract(aggregator.ocr_address, aggregatorContract.abi, ethers.provider);

            // console.log("setConfig... ");
            // const setConfigTx = await aggregatorInstance.connect(account).setConfig(signer, transmitter);
            // await setConfigTx.wait()
            // console.log("setConfig ok ", setConfigTx.hash);
            //
            // console.log("setMojitoConfig... ");
            // const setMojitoConfigTx = await aggregatorInstance.connect(account).setMojitoConfig(
            //     aggregator.mojitoConfig.available,
            //     aggregator.mojitoConfig.pairA,
            //     aggregator.mojitoConfig.pairABaseUnit,
            // );
            // await setMojitoConfigTx.wait()
            // console.log("setMojitoConfig ok ", setMojitoConfigTx.hash);
            //
            // console.log("setPythConfig... ");
            // const setPythConfigTx = await aggregatorInstance.connect(account).setPythConfig(
            //     aggregator.pythConfig.available,
            //     aggregator.pythConfig.stalenessSeconds,
            //     aggregator.pythConfig.priceFeedId,
            //     aggregator.pythConfig.decimals,
            // );
            // await setPythConfigTx.wait()
            // console.log("setPythConfig ok ", setPythConfigTx.hash);
            //
            // console.log("setWitnetConfig... ");
            // const setWitnetConfigTx = await aggregatorInstance.connect(account).setWitnetConfig(
            //     aggregator.witnetConfig.available,
            //     aggregator.witnetConfig.pairA,
            //     aggregator.witnetConfig.pairB,
            //     aggregator.witnetConfig.pairABaseUint,
            //     aggregator.witnetConfig.pairBBaseUint,
            // );
            // await setWitnetConfigTx.wait()
            // console.log("setWitnetConfig ok ", setWitnetConfigTx.hash);
            //
            // console.log("addAccess... ", aggregator.proxy_address);
            // const addAccessTx = await aggregatorInstance.connect(account).addAccess(aggregator.proxy_address);
            // await addAccessTx.wait()
            // console.log("addAccess ok ", addAccessTx.hash);

            const proxyInstance = new ethers.Contract(aggregator.proxy_address, proxyContract.abi, ethers.provider);

            console.log("proposeAggregator... ",aggregator.ocr_address);
            const proposeAggregatorTx = await proxyInstance.connect(account).proposeAggregator(aggregator.ocr_address);
            await proposeAggregatorTx.wait()
            console.log("proposeAggregator ok ", proposeAggregatorTx.hash);

            console.log(`${k + 1} config ${aggregator.description} ok!`);
            const params = [aggregator.description, aggregatorInstance.address];
            result.push(params);
        }
    }
    console.log(table(result));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});