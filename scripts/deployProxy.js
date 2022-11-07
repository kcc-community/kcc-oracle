const AggregatorProxy = artifacts.require("EACAggregatorProxy");

let addressFactory = {};

module.exports = async function(callback) {
    try {
        await deployer.deploy(AggregatorProxy, "0x48f2fFb2B72d48FBE0A1758B8BF48cB9e1696E70",'0x0000000000000000000000000000000000000000');
        const aggregatorProxyInstance = await AggregatorProxy.deployed();
        addressFactory['EACAggregatorProxy']=aggregatorProxyInstance.address;
        console.log(addressFactory);
        callback();
    } catch (e) {
        callback(e);
    }
}