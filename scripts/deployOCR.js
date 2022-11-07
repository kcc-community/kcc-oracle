const AccessControlledOffchainAggregator = artifacts.require("AccessControlledOffchainAggregator");
const AggregatorProxy = artifacts.require("EACAggregatorProxy");

let addressFactory = {};

module.exports = async function(callback) {
    try {
        let aggregatorInstance=await AccessControlledOffchainAggregator.at("0x48f2fFb2B72d48FBE0A1758B8BF48cB9e1696E70")

        await aggregatorInstance.addTransmitters(["0x7B11d35E15E1DA2fA92cA1Ecc17E32b02B9d29AA"]);

        await deployer.deploy(AggregatorProxy, "0x48f2fFb2B72d48FBE0A1758B8BF48cB9e1696E70",'0x0000000000000000000000000000000000000000');
        const aggregatorProxyInstance = await AggregatorProxy.deployed();
        addressFactory['EACAggregatorProxy']=aggregatorProxyInstance.address;

        await aggregatorInstance.addAccess(aggregatorProxyInstance.address);

        console.log(addressFactory);
        callback();
    } catch (e) {
        callback(e);
    }
}