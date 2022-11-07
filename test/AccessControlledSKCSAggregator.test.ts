import { ethers } from 'hardhat'
import { assert, expect } from 'chai'
import {
  BigNumber,
  constants,
  Contract,
  ContractFactory,
  ContractTransaction,
  Signer,
} from 'ethers'
import { getUsers, Personas } from './test-helpers/setup'
import { bigNumEquals } from './test-helpers/matchers'
import { publicAbi } from './test-helpers/helpers'

let personas: Personas
let acskcsAggregatorFactory: ContractFactory
let ocrTestFactory: ContractFactory
let mockSKCSFactory: ContractFactory
let mockV2AggregatorFactory: ContractFactory

before(async () => {
  personas = (await getUsers()).personas

  mockSKCSFactory = await ethers.getContractFactory(
    'contracts/tests/MockSKCS.sol:MockSKCS',
  )

  mockV2AggregatorFactory = await ethers.getContractFactory(
    'contracts/tests/MockV2Aggregator.sol:MockV2Aggregator',
  )

  acskcsAggregatorFactory = await ethers.getContractFactory(
    'contracts/skcs/AccessControlledSKCSAggregator.sol:AccessControlledSKCSAggregator',
  )
  ocrTestFactory = await ethers.getContractFactory(
    'contracts/tests/OCRTestHelper.sol:OCRTestHelper',
  )
})

describe('AccessControlledSKCSAggregator', () => {
  const _lowerBoundExchangeRate = ethers.utils.parseEther('1.0')
  const _upperBoundExchangeRate = ethers.utils.parseEther('1.2')
  const roundId = 1
  const answer = 1000000000
  const skcsUsdAnswer = BigNumber.from(answer).mul(11).div(10)
  const decimals = 8
  const description = 'sKCS / USD'
  const typeAndVersion = 'AccessControlledSKCSAggregator 1.0.0'

  let aggregator: Contract
  let aggregatorTest: Contract
  let mockSKCS: Contract
  let mockKcsUsdAggregator: Contract

  beforeEach(async () => {
    mockSKCS = await mockSKCSFactory.connect(personas.Carol).deploy()

    mockKcsUsdAggregator = await mockV2AggregatorFactory
      .connect(personas.Carol)
      .deploy(answer)

    aggregator = await acskcsAggregatorFactory
      .connect(personas.Carol)
      .deploy(
        mockSKCS.address,
        mockKcsUsdAggregator.address,
        _lowerBoundExchangeRate,
        _upperBoundExchangeRate,
      )
  })

  it('has a limited public interface [ @skip-coverage ]', () => {
    publicAbi(aggregator, [
      'checkEnabled',
      'decimals',
      'description',
      'exchangeRateCurrent',
      'getAnswer',
      'getRoundData',
      'getTimestamp',
      'hasAccess',
      'kcsUsdAggregator',
      'kcsUsdPriceCurrent',
      'latestAnswer',
      'latestRound',
      'latestRoundData',
      'latestTimestamp',
      'lowerBoundExchangeRate',
      'maxUpperBoundExchangeRate',
      'minLowerBoundExchangeRate',
      'owner',
      'sKCS',
      'typeAndVersion',
      'upperBoundExchangeRate',
      'version',
      // write
      '_setExchangeRateRange',
      '_setNewSKCS',
      'acceptOwnership',
      'addAccess',
      'disableAccessCheck',
      'enableAccessCheck',
      'removeAccess',
      'transferOwnership',
    ])
  })

  describe('#constructor', () => {
    it('sets the decimals', async () => {
      bigNumEquals(BigNumber.from(decimals), await aggregator.decimals())
    })

    it('sets the description', async () => {
      assert.equal(description, await aggregator.description())
    })

    it('sets the version to 1', async () => {
      bigNumEquals(1, await aggregator.version())
    })

    it('sets the typeAndVersion', async () => {
      assert.equal(typeAndVersion, await aggregator.typeAndVersion())
    })

    it('sets the owner', async () => {
      assert.equal(await personas.Carol.getAddress(), await aggregator.owner())
    })

    it('latestAnswer and getAnswer', async () => {
      // exchange rate = 1.1
      bigNumEquals(await aggregator.latestAnswer(), skcsUsdAnswer)
      bigNumEquals(await aggregator.getAnswer(BigNumber.from(1)), skcsUsdAnswer)
    })

    it('latestRound', async () => {
      bigNumEquals(await aggregator.latestRound(), BigNumber.from(roundId))
    })

    it('latestTimestamp and getTimestamp', async () => {
      const blockNumber = await ethers.provider.getBlockNumber()
      const block = await ethers.provider.getBlock(blockNumber ?? '')
      assert.equal(await aggregator.latestTimestamp(), block.timestamp)

      bigNumEquals(
        await aggregator.getTimestamp(BigNumber.from(1)),
        block.timestamp,
      )
    })

    it('latestRoundData and getRoundData', async () => {
      const blockNumber = await ethers.provider.getBlockNumber()
      const block = await ethers.provider.getBlock(blockNumber ?? '')

      const round = await aggregator.latestRoundData()
      bigNumEquals(BigNumber.from(1), round.roundId)
      bigNumEquals(skcsUsdAnswer, round.answer)
      bigNumEquals(block.timestamp, round.startedAt)
      bigNumEquals(block.timestamp, round.updatedAt)
      bigNumEquals(BigNumber.from(1), round.answeredInRound)

      const round2 = await aggregator.getRoundData(BigNumber.from(1))
      bigNumEquals(BigNumber.from(1), round2.roundId)
      bigNumEquals(skcsUsdAnswer, round2.answer)
      bigNumEquals(block.timestamp, round2.startedAt)
      bigNumEquals(block.timestamp, round2.updatedAt)
      bigNumEquals(BigNumber.from(1), round2.answeredInRound)
    })
  })
})
