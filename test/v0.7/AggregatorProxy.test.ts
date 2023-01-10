import { ethers } from 'hardhat'
import { numToBytes32, publicAbi } from '../test-helpers/helpers'
import { assert } from 'chai'
import { BigNumber, constants, Contract, ContractFactory, Signer } from 'ethers'
import { Personas, getUsers } from '../test-helpers/setup'
import { bigNumEquals, evmRevert } from '../test-helpers/matchers'

let personas: Personas
let defaultAccount: Signer

let aggregatorFactory: ContractFactory
let historicAggregatorFactory: ContractFactory
let aggregatorFacadeFactory: ContractFactory
let aggregatorProxyFactory: ContractFactory
let ocrAggregatorFactory: ContractFactory
let reverterFactory: ContractFactory

before(async () => {
  const users = await getUsers()

  personas = users.personas
  defaultAccount = users.roles.defaultAccount

  aggregatorFactory = await ethers.getContractFactory(
    'contracts/v0.7/tests/MockV3Aggregator.sol:MockV3Aggregator',
    defaultAccount,
  )
  historicAggregatorFactory = await ethers.getContractFactory(
    'contracts/v0.7/tests/MockV2Aggregator.sol:MockV2Aggregator',
    defaultAccount,
  )
  aggregatorFacadeFactory = await ethers.getContractFactory(
    'contracts/v0.7/tests/AggregatorFacade.sol:AggregatorFacade',
    defaultAccount,
  )
  historicAggregatorFactory = await ethers.getContractFactory(
    'contracts/v0.7/tests/MockV2Aggregator.sol:MockV2Aggregator',
    defaultAccount,
  )
  aggregatorProxyFactory = await ethers.getContractFactory(
    'contracts/v0.7/AggregatorProxy.sol:AggregatorProxy',
    defaultAccount,
  )
  ocrAggregatorFactory = await ethers.getContractFactory(
    'contracts/v0.7/AccessControlledOffchainAggregator.sol:AccessControlledOffchainAggregator',
    defaultAccount,
  )
  reverterFactory = await ethers.getContractFactory(
    'contracts/v0.7/tests/Reverter.sol:Reverter',
    defaultAccount,
  )
})

describe('AggregatorProxy', () => {
  const response = numToBytes32(54321)
  const response2 = numToBytes32(67890)
  const decimals = 18
  const phaseBase = BigNumber.from(2).pow(64)
  const maxId = BigNumber.from(2).pow(BigNumber.from(64).add(16)).sub(1)
  const lowerBoundAnchorRatio = 95
  const upperBoundAnchorRatio = 105
  const answerBaseUnit = 1e8
  const validateAnswerEnabled = false

  let aggregator: Contract
  let aggregator2: Contract
  let historicAggregator: Contract
  let proxy: Contract
  let ocr: Contract
  let reverter: Contract

  beforeEach(async () => {
    aggregator = await aggregatorFactory
      .connect(defaultAccount)
      .deploy(decimals, response)
    ocr = await ocrAggregatorFactory
      .connect(personas.Carol)
      .deploy(
        lowerBoundAnchorRatio,
        upperBoundAnchorRatio,
        8,
        'TEST / USDT',
        constants.AddressZero,
        constants.AddressZero,
        validateAnswerEnabled,
      )
    proxy = await aggregatorProxyFactory
      .connect(defaultAccount)
      .deploy(aggregator.address)
    await ocr.addAccess(proxy.address)
  })

  it('has a limited public interface [ @skip-coverage ]', () => {
    publicAbi(proxy, [
      'aggregator',
      'confirmAggregator',
      'decimals',
      'description',
      'getAnswer',
      'getRoundData',
      'getTimestamp',
      'latestAnswer',
      'latestRound',
      'latestRoundData',
      'latestTimestamp',
      'phaseAggregators',
      'phaseId',
      'proposeAggregator',
      'proposedAggregator',
      'proposedGetRoundData',
      'proposedLatestRoundData',
      'version',
      // Ownable methods:
      'acceptOwnership',
      'owner',
      'transferOwnership',
    ])
  })

  describe('constructor', () => {
    it('sets the proxy phase and aggregator', async () => {
      bigNumEquals(1, await proxy.phaseId())
      assert.equal(aggregator.address, await proxy.phaseAggregators(1))
    })
  })

  describe('#latestRound', () => {
    it('pulls the rate from the aggregator', async () => {
      bigNumEquals(phaseBase.add(1), await proxy.latestRound())
    })
  })

  describe('#latestAnswer', () => {
    it('pulls the rate from the aggregator', async () => {
      bigNumEquals(response, await proxy.latestAnswer())
      const latestRound = await proxy.latestRound()
      bigNumEquals(response, await proxy.getAnswer(latestRound))
    })

    describe('after being updated to another contract', () => {
      beforeEach(async () => {
        aggregator2 = await aggregatorFactory
          .connect(defaultAccount)
          .deploy(decimals, response2)
        bigNumEquals(response2, await aggregator2.latestAnswer())

        await proxy.proposeAggregator(aggregator2.address)
        await proxy.confirmAggregator(aggregator2.address)
      })

      it('pulls the rate from the new aggregator', async () => {
        bigNumEquals(response2, await proxy.latestAnswer())
        const latestRound = await proxy.latestRound()
        bigNumEquals(response2, await proxy.getAnswer(latestRound))
      })
    })

    describe('when the relevant info is not available', () => {
      beforeEach(async () => {
        await proxy.proposeAggregator(ocr.address)
        await proxy.confirmAggregator(ocr.address)
      })

      it('does not revert when called with a non existent ID', async () => {
        const actual = await proxy.latestAnswer()
        bigNumEquals(0, actual)
      })
    })
  })

  describe('#getAnswer', () => {
    describe('when the relevant round is not available', () => {
      beforeEach(async () => {
        await proxy.proposeAggregator(ocr.address)
        await proxy.confirmAggregator(ocr.address)
      })

      it('does not revert when called with a non existent ID', async () => {
        const proxyId = phaseBase.mul(await proxy.phaseId()).add(1)
        const actual = await proxy.getAnswer(proxyId)
        bigNumEquals(0, actual)
      })

      it('does not revert when called with a roundId with greater than maxId', async () => {
        const proxyId = maxId.add(1)
        const actual = await proxy.getAnswer(proxyId)
        bigNumEquals(0, actual)
      })
    })

    describe('when the answer reverts in a non-predicted way', () => {
      it('reverts', async () => {
        reverter = await reverterFactory.connect(defaultAccount).deploy()
        await proxy.proposeAggregator(reverter.address)
        await proxy.confirmAggregator(reverter.address)
        assert.equal(reverter.address, await proxy.aggregator())

        const proxyId = phaseBase.mul(await proxy.phaseId())

        await evmRevert(proxy.getAnswer(proxyId), 'Raised by Reverter.sol')
      })
    })

    describe('after being updated to another contract', () => {
      let preUpdateRoundId: BigNumber
      let preUpdateAnswer: BigNumber

      beforeEach(async () => {
        preUpdateRoundId = await proxy.latestRound()
        preUpdateAnswer = await proxy.latestAnswer()

        aggregator2 = await aggregatorFactory
          .connect(defaultAccount)
          .deploy(decimals, response2)
        bigNumEquals(response2, await aggregator2.latestAnswer())

        await proxy.proposeAggregator(aggregator2.address)
        await proxy.confirmAggregator(aggregator2.address)
      })

      it('reports answers for previous phases', async () => {
        const actualAnswer = await proxy.getAnswer(preUpdateRoundId)
        bigNumEquals(preUpdateAnswer, actualAnswer)
      })
    })

    describe('when the relevant info is not available', () => {
      it('returns 0', async () => {
        const actual = await proxy.getAnswer(phaseBase.mul(777))
        bigNumEquals(0, actual)
      })
    })

    describe('when the round ID is too large', () => {
      const overflowRoundId = BigNumber.from(2)
        .pow(255)
        .add(phaseBase) // get the original phase
        .add(1) // get the original round
      it('returns 0', async () => {
        const actual = await proxy.getTimestamp(overflowRoundId)
        bigNumEquals(0, actual)
      })
    })
  })

  describe('#latestRoundData', () => {
    describe('when pointed at a Historic Aggregator', () => {
      beforeEach(async () => {
        historicAggregator = await historicAggregatorFactory
          .connect(defaultAccount)
          .deploy(response2)
        await proxy.proposeAggregator(historicAggregator.address)
        await proxy.confirmAggregator(historicAggregator.address)
      })

      it('reverts', async () => {
        await evmRevert(proxy.latestRoundData())
      })

      describe('when pointed at an Aggregator Facade', () => {
        beforeEach(async () => {
          const facade = await aggregatorFacadeFactory
            .connect(defaultAccount)
            .deploy(
              historicAggregator.address,
              17,
              'DOGE/ZWL: Aggregator Facade',
            )
          await proxy.proposeAggregator(facade.address)
          await proxy.confirmAggregator(facade.address)
        })

        it('does not revert', async () => {
          const aggId = await historicAggregator.latestRound()
          const phaseId = phaseBase.mul(await proxy.phaseId())
          const proxyId = phaseId.add(aggId)

          const round = await proxy.latestRoundData()
          bigNumEquals(proxyId, round.id)
          bigNumEquals(response2, round.answer)
          const nowSeconds = new Date().valueOf() / 1000
          assert.isAbove(round.updatedAt.toNumber(), nowSeconds - 120)
          bigNumEquals(round.updatedAt, round.startedAt)
          bigNumEquals(proxyId, round.answeredInRound)
        })

        it('uses the decimals set in the constructor', async () => {
          bigNumEquals(17, await proxy.decimals())
        })

        it('uses the description set in the constructor', async () => {
          assert.equal('DOGE/ZWL: Aggregator Facade', await proxy.description())
        })

        it('sets the version to 2', async () => {
          bigNumEquals(2, await proxy.version())
        })
      })
    })

    describe('when pointed at a OCRAggregator', () => {
      beforeEach(async () => {
        aggregator2 = await aggregatorFactory
          .connect(defaultAccount)
          .deploy(decimals, response2)

        await proxy.proposeAggregator(aggregator2.address)
        await proxy.confirmAggregator(aggregator2.address)
      })

      it('does not revert', async () => {
        const aggId = phaseBase.sub(2)
        await aggregator2
          .connect(personas.Carol)
          .updateRoundData(aggId, response2, 77, 42)

        const phaseId = phaseBase.mul(await proxy.phaseId())
        const proxyId = phaseId.add(aggId)

        const round = await proxy.latestRoundData()
        bigNumEquals(proxyId, round.id)
        bigNumEquals(response2, round.answer)
        bigNumEquals(42, round.startedAt)
        bigNumEquals(77, round.updatedAt)
        bigNumEquals(proxyId, round.answeredInRound)
      })

      it('uses the decimals of the aggregator', async () => {
        bigNumEquals(18, await proxy.decimals())
      })

      it('uses the description of the aggregator', async () => {
        assert.equal('BTC / ETH', await proxy.description())
      })

      it('uses the version of the aggregator', async () => {
        bigNumEquals(0, await proxy.version())
      })
    })
  })

  describe('#proposeAggregator', () => {
    beforeEach(async () => {
      await proxy.transferOwnership(await personas.Carol.getAddress())
      await proxy.connect(personas.Carol).acceptOwnership()

      aggregator2 = await aggregatorFactory
        .connect(defaultAccount)
        .deploy(decimals, 1)

      assert.equal(aggregator.address, await proxy.aggregator())
    })

    describe('when called by the owner', () => {
      it('sets the address of the proposed aggregator', async () => {
        await proxy
          .connect(personas.Carol)
          .proposeAggregator(aggregator2.address)

        assert.equal(aggregator2.address, await proxy.proposedAggregator())
      })

      it('emits an AggregatorProposed event', async () => {
        const tx = await proxy
          .connect(personas.Carol)
          .proposeAggregator(aggregator2.address)
        const receipt = await tx.wait()
        const eventLog = receipt?.events

        assert.equal(eventLog?.length, 1)
        assert.equal(eventLog?.[0].event, 'AggregatorProposed')
        assert.equal(eventLog?.[0].args?.[0], aggregator.address)
        assert.equal(eventLog?.[0].args?.[1], aggregator2.address)
      })
    })

    describe('when called by a non-owner', () => {
      it('does not update', async () => {
        await evmRevert(
          proxy.connect(personas.Neil).proposeAggregator(aggregator2.address),
          'Only callable by owner',
        )

        assert.equal(aggregator.address, await proxy.aggregator())
      })
    })
  })

  describe('#confirmAggregator', () => {
    beforeEach(async () => {
      await proxy.transferOwnership(await personas.Carol.getAddress())
      await proxy.connect(personas.Carol).acceptOwnership()

      aggregator2 = await aggregatorFactory
        .connect(defaultAccount)
        .deploy(decimals, 1)

      assert.equal(aggregator.address, await proxy.aggregator())
    })

    describe('when called by the owner', () => {
      beforeEach(async () => {
        await proxy
          .connect(personas.Carol)
          .proposeAggregator(aggregator2.address)
      })

      it('sets the address of the new aggregator', async () => {
        await proxy
          .connect(personas.Carol)
          .confirmAggregator(aggregator2.address)

        assert.equal(aggregator2.address, await proxy.aggregator())
      })

      it('increases the phase', async () => {
        bigNumEquals(1, await proxy.phaseId())

        await proxy
          .connect(personas.Carol)
          .confirmAggregator(aggregator2.address)

        bigNumEquals(2, await proxy.phaseId())
      })

      it('increases the round ID', async () => {
        bigNumEquals(phaseBase.add(1), await proxy.latestRound())

        await proxy
          .connect(personas.Carol)
          .confirmAggregator(aggregator2.address)

        bigNumEquals(phaseBase.mul(2).add(1), await proxy.latestRound())
      })

      it('sets the proxy phase and aggregator', async () => {
        assert.equal(
          '0x0000000000000000000000000000000000000000',
          await proxy.phaseAggregators(2),
        )

        await proxy
          .connect(personas.Carol)
          .confirmAggregator(aggregator2.address)

        assert.equal(aggregator2.address, await proxy.phaseAggregators(2))
      })

      it('when set invalid proposed aggregator', async () => {
        await evmRevert(
          proxy.connect(personas.Carol).confirmAggregator(aggregator.address),
          'Invalid proposed aggregator',
        )
      })

      it('emits an AggregatorConfirmed event', async () => {
        const tx = await proxy
          .connect(personas.Carol)
          .confirmAggregator(aggregator2.address)
        const receipt = await tx.wait()
        const eventLog = receipt?.events

        assert.equal(eventLog?.length, 1)
        assert.equal(eventLog?.[0].event, 'AggregatorConfirmed')
        assert.equal(eventLog?.[0].args?.[0], aggregator.address)
        assert.equal(eventLog?.[0].args?.[1], aggregator2.address)
      })
    })

    describe('when called by a non-owner', () => {
      beforeEach(async () => {
        await proxy
          .connect(personas.Carol)
          .proposeAggregator(aggregator2.address)
      })

      it('does not update', async () => {
        await evmRevert(
          proxy.connect(personas.Neil).confirmAggregator(aggregator2.address),
          'Only callable by owner',
        )

        assert.equal(aggregator.address, await proxy.aggregator())
      })
    })
  })

  describe('#proposedGetRoundData', () => {
    beforeEach(async () => {
      aggregator2 = await aggregatorFactory
        .connect(defaultAccount)
        .deploy(decimals, response2)
    })

    describe('when an aggregator has been proposed', () => {
      beforeEach(async () => {
        await proxy
          .connect(defaultAccount)
          .proposeAggregator(aggregator2.address)
        assert.equal(await proxy.proposedAggregator(), aggregator2.address)
      })

      it('returns the data for the proposed aggregator', async () => {
        const roundId = await aggregator2.latestRound()
        const round = await proxy.proposedGetRoundData(roundId)
        bigNumEquals(roundId, round.id)
        bigNumEquals(response2, round.answer)
      })

      describe('after the aggregator has been confirmed', () => {
        beforeEach(async () => {
          await proxy
            .connect(defaultAccount)
            .confirmAggregator(aggregator2.address)
          assert.equal(await proxy.aggregator(), aggregator2.address)
        })

        it('reverts', async () => {
          const roundId = await aggregator2.latestRound()
          await evmRevert(
            proxy.proposedGetRoundData(roundId),
            'No proposed aggregator present',
          )
        })
      })
    })
  })

  describe('#proposedLatestRoundData', () => {
    beforeEach(async () => {
      aggregator2 = await aggregatorFactory
        .connect(defaultAccount)
        .deploy(decimals, response2)
    })

    describe('when an aggregator has been proposed', () => {
      beforeEach(async () => {
        await proxy
          .connect(defaultAccount)
          .proposeAggregator(aggregator2.address)
        assert.equal(await proxy.proposedAggregator(), aggregator2.address)
      })

      it('returns the data for the proposed aggregator', async () => {
        const roundId = await aggregator2.latestRound()
        const round = await proxy.proposedLatestRoundData()
        bigNumEquals(roundId, round.id)
        bigNumEquals(response2, round.answer)
      })

      describe('after the aggregator has been confirmed', () => {
        beforeEach(async () => {
          await proxy
            .connect(defaultAccount)
            .confirmAggregator(aggregator2.address)
          assert.equal(await proxy.aggregator(), aggregator2.address)
        })

        it('reverts', async () => {
          await evmRevert(
            proxy.proposedLatestRoundData(),
            'No proposed aggregator present',
          )
        })
      })
    })
  })
})
