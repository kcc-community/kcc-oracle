import { ethers } from 'hardhat'
import { numToBytes32, publicAbi } from '../test-helpers/helpers'
import { assert, expect } from 'chai'
import { BigNumber, constants, Contract, ContractFactory, Signer } from 'ethers'
import { Personas, getUsers } from '../test-helpers/setup'
import { bigNumEquals, evmRevert } from '../test-helpers/matchers'

let personas: Personas
let defaultAccount: Signer

let mojitoOracleFactory: ContractFactory
let mockMojitoOracleFactoryFactory: ContractFactory

before(async () => {
  const users = await getUsers()

  personas = users.personas
  defaultAccount = users.roles.defaultAccount

  mojitoOracleFactory = await ethers.getContractFactory(
    'contracts/v0.7/mojito/MojitoOracle.sol:MojitoOracle',
    defaultAccount,
  )

  mockMojitoOracleFactoryFactory = await ethers.getContractFactory(
    'contracts/v0.7/tests/MockMojitoFactory.sol:MockMojitoFactory',
    defaultAccount,
  )
})

describe('MojitoOracle', () => {
  let mojitoOracle: Contract
  let mockMojitoFactory: Contract

  const caption = 'Price-KCS/USDT-18'
  const base = 'KCS'
  const quote = 'USDT'
  const tokenA = '0x75AA60668aDcbC064049a496B70caAEfa1d272d5'
  const tokenB = constants.AddressZero
  const tokenC = '0xcB9489180A08273Bb93e8162B3f2A5D7A343372F'
  const tokenABaseUnit = constants.WeiPerEther
  const tokenCBaseUnit = constants.WeiPerEther

  beforeEach(async () => {
    mockMojitoFactory = await mockMojitoOracleFactoryFactory
      .connect(defaultAccount)
      .deploy()

    mojitoOracle = await mojitoOracleFactory
      .connect(defaultAccount)
      .deploy(mockMojitoFactory.address)
  })

  it('has a limited public interface [ @skip-coverage ]', () => {
    publicAbi(mojitoOracle, [
      'consult',
      'currencyPairId',
      'DECIMALS',
      'factory',
      'getFeedConfig',
      'getMojitoTwap',
      'getPair',
      'GRANULARITY',
      'lookupERC2362ID',
      'pairObservations',
      'PERIOD',
      'setFeedConfig',
      'update',
      'EXP_SCALE',
      // Ownable methods:
      'acceptOwnership',
      'owner',
      'transferOwnership',
    ])
  })

  describe('constructor', () => {
    it('sets the proxy phase and aggregator', async () => {
      assert.equal(mockMojitoFactory.address, await mojitoOracle.factory())
    })
  })

  describe('#setFeedConfig', () => {
    it('when called by a owner', async () => {
      const tx = await mojitoOracle
        .connect(defaultAccount)
        .setFeedConfig(
          base,
          quote,
          tokenA,
          tokenB,
          tokenC,
          tokenABaseUnit,
          tokenCBaseUnit,
        )
      await expect(tx)
        .to.emit(mojitoOracle, 'FeedConfigSet')
        .withArgs(
          await mojitoOracle.currencyPairId(caption),
          base,
          quote,
          tokenA,
          tokenB,
          tokenC,
          tokenABaseUnit,
          tokenCBaseUnit,
        )
      const feedConfig = await mojitoOracle.getFeedConfig(
        await mojitoOracle.currencyPairId(caption),
      )
      assert.equal('KCS', feedConfig.base)
      assert.equal(tokenA, feedConfig.tokenA)
      assert.equal(tokenC, feedConfig.tokenC)
      bigNumEquals(tokenABaseUnit, feedConfig.tokenABaseUnit)
      bigNumEquals(tokenCBaseUnit, feedConfig.tokenCBaseUnit)

      const _caption = await mojitoOracle.lookupERC2362ID(
        await mojitoOracle.currencyPairId(caption),
      )
      assert.equal(_caption, caption)
    })

    describe('when called by a non-owner', () => {
      it('does not update', async () => {
        await evmRevert(
          mojitoOracle
            .connect(personas.Neil)
            .setFeedConfig(
              base,
              quote,
              tokenA,
              tokenB,
              tokenC,
              tokenABaseUnit,
              tokenCBaseUnit,
            ),
          'Only callable by owner',
        )
      })
    })
  })

  describe('#consult', () => {
    describe('missing historical observation', async () => {
      await evmRevert(
        mojitoOracle
          .connect(personas.Neil)
          .mojitoOracle._consult(tokenA, tokenABaseUnit, tokenB),
        'Missing historical observation',
      )
    })
  })

  describe('#getPair', () => {
    const mockPairAddr = '0xf69F3Bd54Bd3db5D55c6D619196a6551526298D7'
    beforeEach(async () => {
      await mockMojitoFactory.connect(defaultAccount).setPair(mockPairAddr)
    })

    it('get pair addr', async () => {
      const pairAddr = await mojitoOracle.getPair(tokenA, tokenC)
      assert.equal(await mockMojitoFactory.getPair(tokenA, tokenC), pairAddr)
    })
  })

  describe('#getMojitoTwap', () => {
    describe('unsupported currency pair', async () => {
      const pairId = await mojitoOracle.currencyPairId(caption)
      await evmRevert(
        mojitoOracle.connect(personas.Neil).getMojitoTwap(pairId),
        'Unsupported currency pair',
      )
    })
  })
})
