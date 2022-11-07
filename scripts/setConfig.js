const hre = require("hardhat");
const aggregators = require("../config/ocr.json");

async function main() {

    let chainId = await hre.getChainId()
    let signer;
    let transmitter;
    if (chainId==='322'){
        signer = [
            '0xC48ec77Fe358284bc4F70172BDb09CB891b86532',
            '0x1ef2e6ca56E0621E1145c910fe3E4a62EBFa7E3B',
            '0xFA40FE626A31b751BF5e19CEAda46B2b925e7e1b'
        ]
        transmitter= [
            '0xF5cb89A64BD49d88cf05819dc232103A15400EA1',
            '0x977ab71E93E75e25e4D13a5e11bcd1ad01516cA2',
            '0x93E06cb6B4C51132A98616f226aAe91578FEB6A3',
        ]
    }else if (chainId==='321') {
        signer = [
            '0x138DAdE4AA1a058EC3dc9d15597A19459838EC11',
            '0xf7aC6c90b0b5288b96ceFd86df7edc8999C43f12',
            '0x05eC6fe957Afc7EC61aB860139846c2ee43B5413'
        ]
        transmitter= [
            '0x306BBa4971c5eF86d6E1A178BaaD0155ad4A30Aa',
            '0x29Cac4a08240A254aC5f721baDeEC92c59d535BB',
            '0x02D6624Ab59E3f884130138Ee0Ae7E2D73A295CC'
        ]
    }


    for (let index = 0; index < aggregators.length; index++) {
        const aggregator = aggregators[index]
        if (aggregator.chainId.toString() === chainId) {
            console.log(`${index + 1} setConfig ${aggregator.description} module`);
            const ocrAggregator = await hre.ethers.getContractFactory("AccessControlledOffchainAggregator");
            const ocrInstance = ocrAggregator.attach(aggregator.ocr_address);

            console.log("setConfig ", signer, transmitter);
            const setConfigTx = await ocrInstance.setConfig(signer, transmitter);
            await setConfigTx.wait();
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });