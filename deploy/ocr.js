const {verify} = require("../helper-functions")
const aggregators = require("../config/ocr.json");
const {table} = require("table");
const hre = require("hardhat");
let result = [["desc", "ocr", "proxy"]];
require('dotenv')

module.exports = async function ({
                                     ethers,
                                     getChainId,
                                     getNamedAccounts,
                                     deployments
                                 }) {
    const chainId = await getChainId();
    const {deploy, log} = deployments;

    const {deployer} = await getNamedAccounts();
    const waitBlockConfirmations = 3

    try {
        for (let index = 0; index < aggregators.length; index++) {
            const aggregator = aggregators[index];
            if (aggregator.chainid.toString() === chainId && !aggregator.deploy) {
                console.log(`${index + 1} depoying ${aggregator.description} module`);
                await deploy("AccessControlledOffchainAggregator", {
                    from: deployer,
                    args: [95, 105, 8, aggregator.description],
                    log: true,
                    deterministicDeployment: false,
                    waitConfirmations: waitBlockConfirmations,
                });
                const ocrInstance = await ethers.getContract("AccessControlledOffchainAggregator");

                await deploy("EACAggregatorProxy", {
                    from: deployer,
                    args: [
                        ocrInstance.address,
                        "0x0000000000000000000000000000000000000000",
                    ],
                    log: true,
                    deterministicDeployment: false,
                    waitConfirmations: waitBlockConfirmations,
                });
                const proxyInstance = await ethers.getContract("EACAggregatorProxy");

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
                log("setConfig ", signer, transmitter);
                const setConfigTx = await ocrInstance.setConfig(signer, transmitter);
                await setConfigTx.wait();

                log("add Access ", proxyInstance.address);
                const addAccessTx = await ocrInstance.addAccess(proxyInstance.address);
                await addAccessTx.wait();

                let owner = process.env.OWNER
                const tx = await ocrInstance.transferOwnership(owner);
                await tx.wait();

                console.log("transferOwnership ", owner);
                const proxyTx = await proxyInstance.transferOwnership(owner);
                await proxyTx.wait();

                log("Done!")

                // Verify Contract
                if (chainId !== '322' && chainId !== '321') {
                    log("Verifying AccessControlledOffchainAggregator...")
                    await verify(ocrInstance.address, [95, 105, 8, aggregator.description])
                    log("Verifying... EACAggregatorProxy")
                    await verify(proxyInstance.address, [proxyInstance.address, "0x0000000000000000000000000000000000000000"])
                }

                const params = [aggregator.description, ocrInstance.address, proxyInstance.address];
                result.push(params);
            }
        }
    } catch (error) {
        log(table(result))
        log(error)
    }

    log(table(result))
};

module.exports.tags = ["OCR"];
module.exports.dependencies = [
    "AccessControlledOffchainAggregator",
    "EACAggregatorProxy",
];