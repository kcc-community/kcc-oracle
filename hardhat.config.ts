
import 'dotenv/config'
import '@typechain/hardhat'
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'
import 'hardhat-contract-sizer'
import 'hardhat-abi-exporter'
import 'solidity-coverage'
import "hardhat-spdx-license-identifier"
import "hardhat-deploy"
import "hardhat-deploy-ethers"
import "hardhat-gas-reporter"

import { HardhatUserConfig } from "hardhat/types"

const accounts = {
    mnemonic: process.env.MNEMONIC,
};

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
const config: HardhatUserConfig = {
  abiExporter: {
    path: './abi',
  },
  paths: {
    artifacts: './artifacts',
    cache: './cache',
    sources: './contracts',
    tests: './test',
  },
  typechain: {
    outDir: './typechain',
    target: 'ethers-v5',
  },
  defaultNetwork: "hardhat",
  mocha: {
      timeout: 20000,
  },
  namedAccounts: {
      deployer: {
          default: 0,
      },
      dev: {
          // Default to 1
          default: 0,
      },
      treasury: {
          default: 1,
      },
      investor: {
          default: 2,
      },
  },
  networks: {
    hardhat:{

    },
    km: {
        url: "https://rpc-mainnet.kcc.network",
        accounts,
        chainId: 321,
        live: true,
        saveDeployments: true,
        tags: ["staging"],
        gasMultiplier: 2,
        blockGasLimit: 300000
    },
    kt: {
        url: "https://rpc-testnet.kcc.network",
        accounts,
        chainId: 322,
        live: true,
        saveDeployments: true,
        tags: ["staging"],
        timeout: 4000000,
        gasMultiplier: 2,
    },
  },
  solidity: {
    compilers: [
      {
        version: '0.7.6',
        settings: {
           optimizer: {
             enabled: true,
             runs: 20000,
           },
        },
      },
    ],
  },
  spdxLicenseIdentifier: {
    overwrite: false,
    runOnCompile: true,
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: false,
    disambiguatePaths: false,
  },
}

export default config