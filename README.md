# KCC-Oracle

## Quickstart

- install

```shell
git clone https://github.com/kcc-community/kcc-oracle.git
cd kcc-oracle
cp .env.example .env
yarn install
```

- compile

```shell
yarn compile
```

- deploy

```shell
yarn km:deploy
yarn kt:deploy
```

- test

```shell
yarn test
```

- flatten

```shell
mkdir flat
npx hardhat flatten <path-to-contract> >> <flat-contract-name>.sol
npx hardhat flatten contracts/EACAggregatorProxy.sol >> flat/EACAggregatorProxy.sol
npx hardhat flatten contracts/AccessControlledOffchainAggregator.sol >> flat/AccessControlledOffchainAggregator.sol
```

## Contract addresses

- KCC Mainnet Feed addresses

| Pair (Base/Quote) | Decimals | Data Feed Contract (Proxy Address)                                                                                                  |
|-------------------|----------|-------------------------------------------------------------------------------------------------------------------------------------|
| BTC/USD           | 8        | [0xFAce3f85602A8dc013217b61a97a9AFE7B2F276F](https://scan.kcc.io/address/0xFAce3f85602A8dc013217b61a97a9AFE7B2F276F/read-contract)  |
| ETH/USD           | 8        | [0x72E10386eBE0E3175f62BF3Edfc9A64aC3c5918a](https://scan.kcc.io/address/0x72E10386eBE0E3175f62BF3Edfc9A64aC3c5918a/read-contract)  |
| KCS/USD           | 8        | [0xAFC9c849b1a784955908d91EE43A3203fBC1f950](https://scan.kcc.io/address/0xAFC9c849b1a784955908d91EE43A3203fBC1f950/read-contract)  |
| SKCS/USD          | 8        | [0xdB4b34b3Fc38D828DFE5D9D34CcF0f5f15c09684](https://scan.kcc.io/address/0xdB4b34b3Fc38D828DFE5D9D34CcF0f5f15c09684/read-contract)  |
| MJT/USD           | 8        | [0x5eF7D0B6C63c9F0b0b056416B2dBA95cC02473a3](https://scan.kcc.io/address/0x5eF7D0B6C63c9F0b0b056416B2dBA95cC02473a3/read-contract)  |
| USDT/USD          | 8        | [0x001c1a168ba2a36D01a99542740C375c51615161](https://scan.kcc.io/address/0x001c1a168ba2a36D01a99542740C375c51615161/read-contract)  |
| USDC/USD          | 8        | [0x1A165db46d431804B0082eb5BEbc307ffb97e31b](https://scan.kcc.io/address/0x1A165db46d431804B0082eb5BEbc307ffb97e31b/read-contract)  |

- KCC Testnet Feed addresses

| Pair (Base/Quote) | Decimals | Data Feed Contract (Proxy Address)                                                                                                                |
|-------------------|----------|---------------------------------------------------------------------------------------------------------------------------------------------------|
| BTC/USD           | 8        | [0xBb3423a913a9a69aD7Dba09B62abdFDE4643BAe4](https://scan-testnet.kcc.network/address/0xBb3423a913a9a69aD7Dba09B62abdFDE4643BAe4/read-contract)   |
| ETH/USD           | 8        | [0x22337a9a305E081c0C801dd7B7b8eCF4966660bB](https://scan-testnet.kcc.network/address/0x22337a9a305E081c0C801dd7B7b8eCF4966660bB/read-contract)   |
| KCS/USD           | 8        | [0xae3DB39196012a7bF6D38737192F260cdFE1E7Ec](https://scan-testnet.kcc.network/address/0xae3DB39196012a7bF6D38737192F260cdFE1E7Ec/read-contract)   |
| SKCS/USD          | 8        | [0xAAf1A426D4b5D57c55E67f6eCc2918c698D94359](https://scan-testnet.kcc.network/address/0xAAf1A426D4b5D57c55E67f6eCc2918c698D94359/read-contract)   |
| MJT/USD           | 8        | [0x11Eb72402ABA2031dAc555F158e23614009b1b6f](https://scan-testnet.kcc.network/address/0x11Eb72402ABA2031dAc555F158e23614009b1b6f/read-contract)   |
| USDT/USD          | 8        | [0x2bE470B8BD3CF5655dcC666CDe37E3E4D6cf3168](https://scan-testnet.kcc.network/address/0x2bE470B8BD3CF5655dcC666CDe37E3E4D6cf3168/read-contract)   |
| USDC/USD          | 8        | [0x91b66dAd926FaC824da9390D1aF6f68db391A5c0](https://scan-testnet.kcc.network/address/0x91b66dAd926FaC824da9390D1aF6f68db391A5c0/read-contract)   |


## License

[MIT](LICENSE)