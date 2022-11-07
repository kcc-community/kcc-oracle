import { ethers } from 'hardhat'
import { numToBytes32, publicAbi } from './test-helpers/helpers'
import { assert } from 'chai'
import { BigNumber, constants, Contract, ContractFactory, Signer } from 'ethers'
import { Personas, getUsers } from './test-helpers/setup'
import { bigNumEquals, evmRevert } from './test-helpers/matchers'

let personas: Personas
let defaultAccount: Signer

let mockMojitoOracleFactoryFactory: ContractFactory
let mojitoOracleFactory: ContractFactory
let mockMojitoOracleFactory: ContractFactory
let mojitoOracleProxyFactory: ContractFactory

before(async () => {
  const users = await getUsers()

  personas = users.personas
  defaultAccount = users.roles.defaultAccount

  mojitoOracleProxyFactory = await ethers.getContractFactory(
    'contracts/mojito/MojitoOracleProxy.sol:MojitoOracleProxy',
    defaultAccount,
  )

  mojitoOracleFactory = await ethers.getContractFactory(
    'contracts/mojito/MojitoOracle.sol:MojitoOracle',
    defaultAccount,
  )

  mockMojitoOracleFactory = await ethers.getContractFactory(
    'contracts/tests/MockMojitoOracle.sol:MockMojitoOracle',
    defaultAccount,
  )

  mockMojitoOracleFactoryFactory = await ethers.getContractFactory(
    'contracts/tests/MockMojitoFactory.sol:MockMojitoFactory',
    defaultAccount,
  )
})

describe('MojitoOracleProxy', () => {
  let mojitoOracle: Contract
  let mojitoOracle2: Contract
  let mockMojitoOracle2: Contract
  let mockMojitoFactory: Contract
  let mojitoOracleProxy: Contract

  const caption = 'Price-KCS/USDT-18'

  beforeEach(async () => {
    mockMojitoFactory = await mockMojitoOracleFactoryFactory
      .connect(defaultAccount)
      .deploy()

    mojitoOracle = await mockMojitoOracleFactory
      .connect(defaultAccount)
      .deploy()

    mojitoOracleProxy = await mojitoOracleProxyFactory
      .connect(defaultAccount)
      .deploy(mojitoOracle.address)
  })

  it('has a limited public interface [ @skip-coverage ]', () => {
    publicAbi(mojitoOracleProxy, [
      'currencyPairId',
      'getMojitoTwap',
      'lookupERC2362ID',
      'mojitoOracle',
      'proposedGetMojitoTwap',
      'proposedMojitoOracle',
      'confirmMojitoOracle',
      'proposeMojitoOracle',
      // Ownable methods:
      'acceptOwnership',
      'owner',
      'transferOwnership',
    ])
  })

  describe('constructor', () => {
    it('sets the mojito oracle', async () => {
      assert.equal(mojitoOracle.address, await mojitoOracleProxy.mojitoOracle())
    })
  })

  describe('#getMojitoTwap', () => {
    beforeEach(async () => {
      await mojitoOracle
        .connect(defaultAccount)
        .updatePrice(constants.WeiPerEther)
    })

    it('returns the data for the mojito oracle', async () => {
      const price = await mojitoOracleProxy.getMojitoTwap(
        await mojitoOracleProxy.currencyPairId(caption),
      )
      bigNumEquals(constants.WeiPerEther, price)
    })
  })

  describe('#proposedMojitoOracle', () => {
    beforeEach(async () => {
      await mojitoOracleProxy.transferOwnership(
        await personas.Carol.getAddress(),
      )
      await mojitoOracleProxy.connect(personas.Carol).acceptOwnership()

      mojitoOracle2 = await mojitoOracleFactory
        .connect(defaultAccount)
        .deploy(mockMojitoFactory.address)

      assert.equal(mojitoOracle.address, await mojitoOracleProxy.mojitoOracle())
    })

    describe('when called by the owner', () => {
      it('sets the address of the proposed mojito oracle', async () => {
        await mojitoOracleProxy
          .connect(personas.Carol)
          .proposeMojitoOracle(mojitoOracle2.address)

        assert.equal(
          mojitoOracle2.address,
          await mojitoOracleProxy.proposedMojitoOracle(),
        )
      })

      it('emits an MojitoOracleProposed event', async () => {
        const tx = await mojitoOracleProxy
          .connect(personas.Carol)
          .proposeMojitoOracle(mojitoOracle2.address)
        const receipt = await tx.wait()
        const eventLog = receipt?.events

        assert.equal(eventLog?.length, 1)
        assert.equal(eventLog?.[0].event, 'MojitoOracleProposed')
        assert.equal(eventLog?.[0].args?.[0], mojitoOracle.address)
        assert.equal(eventLog?.[0].args?.[1], mojitoOracle2.address)
      })
    })

    describe('when called by a non-owner', () => {
      it('does not update', async () => {
        await evmRevert(
          mojitoOracleProxy
            .connect(personas.Neil)
            .proposeMojitoOracle(mojitoOracle2.address),
          'Only callable by owner',
        )

        assert.equal(
          mojitoOracle.address,
          await mojitoOracleProxy.mojitoOracle(),
        )
      })
    })
  })

  describe('#confirmMojitoOracle', () => {
    beforeEach(async () => {
      await mojitoOracleProxy.transferOwnership(
        await personas.Carol.getAddress(),
      )
      await mojitoOracleProxy.connect(personas.Carol).acceptOwnership()

      mojitoOracle2 = await mojitoOracleFactory
        .connect(defaultAccount)
        .deploy(mockMojitoFactory.address)

      assert.equal(mojitoOracle.address, await mojitoOracleProxy.mojitoOracle())
    })

    describe('when called by the owner', () => {
      beforeEach(async () => {
        await mojitoOracleProxy
          .connect(personas.Carol)
          .proposeMojitoOracle(mojitoOracle2.address)
      })

      it('sets the address of the new mojito oracle', async () => {
        await mojitoOracleProxy
          .connect(personas.Carol)
          .confirmMojitoOracle(mojitoOracle2.address)

        assert.equal(
          mojitoOracle2.address,
          await mojitoOracleProxy.mojitoOracle(),
        )
      })

      it('emits an AggregatorConfirmed event', async () => {
        const tx = await mojitoOracleProxy
          .connect(personas.Carol)
          .confirmMojitoOracle(mojitoOracle2.address)
        const receipt = await tx.wait()
        const eventLog = receipt?.events

        assert.equal(eventLog?.length, 1)
        assert.equal(eventLog?.[0].event, 'MojitoOracleConfirmed')
        assert.equal(eventLog?.[0].args?.[0], mojitoOracle.address)
        assert.equal(eventLog?.[0].args?.[1], mojitoOracle2.address)
      })

      it('when set invalid proposed aggregator', async () => {
        await evmRevert(
          mojitoOracleProxy
            .connect(personas.Carol)
            .confirmMojitoOracle(mojitoOracle.address),
          'Invalid proposed mojito oracle',
        )
      })
    })

    describe('when called by a non-owner', () => {
      beforeEach(async () => {
        await mojitoOracleProxy
          .connect(personas.Carol)
          .proposeMojitoOracle(mojitoOracle2.address)
      })

      it('does not update', async () => {
        await evmRevert(
          mojitoOracleProxy
            .connect(personas.Neil)
            .confirmMojitoOracle(mojitoOracle2.address),
          'Only callable by owner',
        )

        assert.equal(
          mojitoOracle.address,
          await mojitoOracleProxy.mojitoOracle(),
        )
      })
    })
  })

  describe('#proposedGetMojitoTwap', () => {
    beforeEach(async () => {
      mockMojitoOracle2 = await mockMojitoOracleFactory
        .connect(defaultAccount)
        .deploy()
      await mockMojitoOracle2
        .connect(defaultAccount)
        .updatePrice(constants.WeiPerEther)
    })

    describe('when an mojito oracle has been proposed', () => {
      beforeEach(async () => {
        await mojitoOracleProxy
          .connect(defaultAccount)
          .proposeMojitoOracle(mockMojitoOracle2.address)

        assert.equal(
          await mojitoOracleProxy.proposedMojitoOracle(),
          mockMojitoOracle2.address,
        )
      })

      it('returns the data for the proposed mojito oracle', async () => {
        const price = await mojitoOracleProxy.proposedGetMojitoTwap(
          await mojitoOracleProxy.currencyPairId(caption),
        )
        bigNumEquals(constants.WeiPerEther, price)
      })

      describe('after the mojito oracle has been confirmed', () => {
        beforeEach(async () => {
          await mojitoOracleProxy
            .connect(defaultAccount)
            .confirmMojitoOracle(mockMojitoOracle2.address)
          assert.equal(
            await mojitoOracleProxy.mojitoOracle(),
            mockMojitoOracle2.address,
          )
          const pairId = await mojitoOracleProxy.currencyPairId(caption)
          assert.equal(caption, await mojitoOracleProxy.lookupERC2362ID(pairId))
        })

        it('reverts', async () => {
          const pairId = await mojitoOracleProxy.currencyPairId(caption)
          await evmRevert(
            mojitoOracleProxy.proposedGetMojitoTwap(pairId),
            'No proposed mojito oracle present',
          )
        })
      })
    })
  })
})
