const hre = require("hardhat");

async function main() {
    await hre.run("verify:verify", {
        address: "0x332CE11aB4a108b3E5D2041dbe8098470d8cCE6A",
        constructorArguments: [
            115,
            85,
            8,
            "BTC / USD",
        ],
    });

    await hre.run("verify:verify", {
        address: "0xa30381Abba379fc4afA581bDa7Eb1C88F6b0BDbb",
        constructorArguments: [
            "0x332CE11aB4a108b3E5D2041dbe8098470d8cCE6A",
            "0x0000000000000000000000000000000000000000",
        ],
    });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });