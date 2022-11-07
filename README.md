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

## License

[MIT](LICENSE)