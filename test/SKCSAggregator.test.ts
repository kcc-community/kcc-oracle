import { ethers } from 'hardhat'
import { assert, expect } from 'chai'
import {
  Contract,
  constants,
  ContractFactory,
  BigNumber,
  Signer,
  ContractTransaction,
} from 'ethers'
import { Personas, getUsers } from './test-helpers/setup'
import { bigNumEquals } from './test-helpers/matchers'
import { publicAbi } from './test-helpers/helpers'

let personas: Personas
let skcsAggregatorFactory: ContractFactory
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

  skcsAggregatorFactory = await ethers.getContractFactory(
    'contracts/skcs/SKCSAggregator.sol:SKCSAggregator',
  )
})

describe('SKCSAggregator', () => {
  const _lowerBoundExchangeRate = ethers.utils.parseEther('1.0')
  const _upperBoundExchangeRate = ethers.utils.parseEther('1.2')
  const minLowerBoundExchangeRate = ethers.utils.parseEther('1.0')
  const maxUpperBoundExchangeRate = ethers.utils.parseEther('2.0')
  const roundId = 1
  const decimals = 8
  const answer = 1000000000
  const skcsUsdAnswer = BigNumber.from(answer).mul(11).div(10)
  const description = 'sKCS / USD'
  const typeAndVersion = 'SKCSAggregator 1.0.0'

  let aggregator: Contract
  let mockSKCS: Contract
  let mockSKCS2: Contract
  let mockKcsUsdAggregator: Contract

  beforeEach(async () => {
    mockSKCS = await mockSKCSFactory.connect(personas.Carol).deploy()

    mockSKCS2 = await mockSKCSFactory.connect(personas.Carol).deploy()

    mockKcsUsdAggregator = await mockV2AggregatorFactory
      .connect(personas.Carol)
      .deploy(answer)

    aggregator = await skcsAggregatorFactory
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
      'decimals',
      'description',
      'exchangeRateCurrent',
      'getAnswer',
      'getRoundData',
      'getTimestamp',
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
      'transferOwnership',
    ])
  })

  describe('#constructor', () => {
    it('sets the lowerBoundExchangeRate', async () => {
      bigNumEquals(
        _lowerBoundExchangeRate,
        await aggregator.lowerBoundExchangeRate(),
      )
    })

    it('sets the upperBoundExchangeRate', async () => {
      bigNumEquals(
        _upperBoundExchangeRate,
        await aggregator.upperBoundExchangeRate(),
      )
    })

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

  describe('#transferOwnership', () => {
    describe('when the admin tries to transfer the admin', () => {
      it('works', async () => {
        await expect(
          aggregator
            .connect(personas.Carol)
            .transferOwnership(await personas.Neil.getAddress()),
        )
          .to.emit(aggregator, 'OwnershipTransferRequested')
          .withArgs(
            await personas.Carol.getAddress(),
            await personas.Neil.getAddress(),
          )
        assert.equal(
          await personas.Carol.getAddress(),
          await aggregator.owner(),
        )
      })
    })

    describe('when the non-admin owner tries to update the admin', () => {
      it('reverts', async () => {
        await expect(
          aggregator
            .connect(personas.Eddy)
            .transferOwnership(await personas.Neil.getAddress()),
        ).to.be.revertedWith('Only callable by owner')
      })
    })
  })

  describe('#acceptOwnership', () => {
    beforeEach(async () => {
      const tx = await aggregator
        .connect(personas.Carol)
        .transferOwnership(await personas.Neil.getAddress())
      await tx.wait()
    })

    describe('when the new admin tries to accept', () => {
      it('works', async () => {
        await expect(aggregator.connect(personas.Neil).acceptOwnership())
          .to.emit(aggregator, 'OwnershipTransferred')
          .withArgs(
            await personas.Carol.getAddress(),
            await personas.Neil.getAddress(),
          )
        assert.equal(await personas.Neil.getAddress(), await aggregator.owner())
      })
    })

    describe('when someone other than the new admin tries to accept', () => {
      it('reverts', async () => {
        await expect(
          aggregator.connect(personas.Eddy).acceptOwnership(),
        ).to.be.revertedWith('Must be proposed owner')
      })
    })
  })

  describe('#setExchangeRateRange', () => {
    describe('first update', () => {
      it('emits a log', async () => {
        const tx = await aggregator
          .connect(personas.Carol)
          ._setExchangeRateRange(
            _lowerBoundExchangeRate,
            _upperBoundExchangeRate,
          )
        await expect(tx)
          .to.emit(aggregator, 'ExchangeRateRangeUpdated')
          .withArgs(_lowerBoundExchangeRate, _upperBoundExchangeRate)
      })
    })

    describe('when called by anyone but the owner', () => {
      it('reverts', async () => {
        await expect(
          aggregator
            .connect(personas.Neil)
            ._setExchangeRateRange(
              _lowerBoundExchangeRate,
              _upperBoundExchangeRate,
            ),
        ).to.be.revertedWith('Only callable by owner')
      })
    })

    describe('lowerBoundExchangeRate is out of minLowerBoundExchangeRate range', () => {
      it('reverts', async () => {
        await expect(
          aggregator
            .connect(personas.Carol)
            ._setExchangeRateRange(
              BigNumber.from(minLowerBoundExchangeRate).sub(1),
              _upperBoundExchangeRate,
            ),
        ).to.be.revertedWith(
          'lowerBoundExchangeRate must greater than or equal to minLowerBoundExchangeRate',
        )
      })
    })

    describe('upperBoundExchangeRate is out of maxUpperBoundExchangeRate range', () => {
      it('reverts', async () => {
        await expect(
          aggregator
            .connect(personas.Carol)
            ._setExchangeRateRange(
              _lowerBoundExchangeRate,
              BigNumber.from(maxUpperBoundExchangeRate).add(1),
            ),
        ).to.be.revertedWith(
          'upperBoundExchangeRate must less than or equal to maxUpperBoundExchangeRate',
        )
      })
    })

    describe('When upperBoundAnchorRatio not Less than lowerBoundAnchorRatio', () => {
      it('reverts', async () => {
        await expect(
          aggregator
            .connect(personas.Carol)
            ._setExchangeRateRange(
              minLowerBoundExchangeRate,
              _lowerBoundExchangeRate,
            ),
        ).to.be.revertedWith(
          'upperBoundExchangeRate must Less than lowerBoundExchangeRate',
        )
      })
    })
  })

  describe('#latestAnswer', () => {
    describe('when exchangeRate not greater than or equal to lowerBoundExchangeRate', () => {
      it('reverts', async () => {
        await aggregator
          .connect(personas.Carol)
          ._setExchangeRateRange(
            ethers.utils.parseEther('1.2'),
            ethers.utils.parseEther('1.25'),
          )
        await expect(
          aggregator.connect(personas.Carol).latestAnswer(),
        ).to.be.revertedWith(
          'exchangeRate must greater than or equal to lowerBoundExchangeRate',
        )
      })
    })

    describe('when exchangeRate not less than or equal to upperBoundExchangeRate', () => {
      it('reverts', async () => {
        await aggregator
          .connect(personas.Carol)
          ._setExchangeRateRange(
            ethers.utils.parseEther('1.0'),
            ethers.utils.parseEther('1.05'),
          )
        await expect(
          aggregator.connect(personas.Carol).latestAnswer(),
        ).to.be.revertedWith(
          'exchangeRate must less than or equal to upperBoundExchangeRate',
        )
      })
    })
  })

  describe('#setsetNewSKCS', () => {
    describe('first update', () => {
      it('emits a log', async () => {
        const tx = await aggregator
          .connect(personas.Carol)
          ._setNewSKCS(mockSKCS2.address)
        await expect(tx)
          .to.emit(aggregator, 'NewSKCSUpdated')
          .withArgs(mockSKCS.address, mockSKCS2.address)
      })
    })

    describe('when called by anyone but the owner', () => {
      it('reverts', async () => {
        await expect(
          aggregator.connect(personas.Neil)._setNewSKCS(mockSKCS.address),
        ).to.be.revertedWith('Only callable by owner')
      })
    })
  })
})
