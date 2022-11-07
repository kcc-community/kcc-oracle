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
let acocrAggregatorFactory: ContractFactory
let ocrTestFactory: ContractFactory
let mojitoOracleTestFactory: ContractFactory
let witnetPriceTestFactory: ContractFactory

before(async () => {
  personas = (await getUsers()).personas
  acocrAggregatorFactory = await ethers.getContractFactory(
    'contracts/AccessControlledOffchainAggregator.sol:AccessControlledOffchainAggregator',
  )
  ocrTestFactory = await ethers.getContractFactory(
    'contracts/tests/OCRTestHelper.sol:OCRTestHelper',
  )
  mojitoOracleTestFactory = await ethers.getContractFactory(
    'contracts/tests/MockMojitoOracle.sol:MockMojitoOracle',
  )
  witnetPriceTestFactory = await ethers.getContractFactory(
    'contracts/tests/MockWitnetPriceRouter.sol:MockWitnetPriceRouter',
  )
})

describe('AccessControlledOffchainAggregator', () => {
  const minLowerBoundAnchorRatio = 80
  const maxUpperBoundAnchorRatio = 120
  const lowerBoundAnchorRatio = 95
  const upperBoundAnchorRatio = 105
  const decimals = 8
  const answerBaseUnit = 1e8
  const validateAnswerEnabled = false
  const description = 'KCS / USDT'
  const typeAndVersion = 'AccessControlledOffchainAggregator 1.0.0'
  const initConfigCount = BigNumber.from(0)
  const max = BigNumber.from(2).pow(32)
  const testKey =
    '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a'

  let aggregator: Contract
  let aggregatorTest: Contract
  let configBlockNumber: BigNumber
  let mojitoOracleTest: Contract
  let witnetPriceTest: Contract

  async function setOCRConfig(
    aggregator: Contract,
    owner: Signer,
    signers: Signer[],
    transmitters: Signer[],
  ): Promise<ContractTransaction> {
    return aggregator.connect(owner).setConfig(
      signers.map(async (_signers) => await _signers.getAddress()),
      transmitters.map(
        async (_transmitters) => await _transmitters.getAddress(),
      ),
    )
  }

  async function transmitOCR(
    aggregator: Contract,
    privateKey: string,
    transmitter: Signer,
    median: number,
    observationsTimestamp: number,
  ): Promise<ContractTransaction> {
    const bytesData = ethers.utils.defaultAbiCoder.encode(
      ['uint192', 'uint32'],
      [median, observationsTimestamp],
    )
    let messageHashBytes = ethers.utils.keccak256(bytesData)

    // https://github.com/ethers-io/ethers.js/issues/555
    // https://github.com/ethers-io/ethers.js/issues/555#issuecomment-509830076
    let wallet = new ethers.utils.SigningKey(privateKey)
    let flatSig = wallet.signDigest(messageHashBytes)

    const sig = ethers.utils.splitSignature(flatSig)

    return await aggregator
      .connect(transmitter)
      .transmit(bytesData, sig.r, sig.s, BigNumber.from(sig.v).sub(27))
  }

  async function transmitForce(
    aggregator: Contract,
    owner: Signer,
    median: number,
  ): Promise<ContractTransaction> {
    return await aggregator.connect(owner).transmitWithForce(median)
  }

  async function getCurrentTimeStamp(): Promise<number> {
    return (await ethers.provider.getBlock('latest')).timestamp
  }

  async function transmitOCRErr(
    aggregator: Contract,
    privateKey: string,
    transmitter: Signer,
    median: number,
    observationsTimestamp: number,
  ): Promise<ContractTransaction> {
    const bytesData = ethers.utils.defaultAbiCoder.encode(
      ['uint256', 'uint256', 'uint256', 'uint32'],
      [median, median, median, observationsTimestamp],
    )
    let messageHashBytes = ethers.utils.keccak256(bytesData)

    // https://github.com/ethers-io/ethers.js/issues/555
    // https://github.com/ethers-io/ethers.js/issues/555#issuecomment-509830076
    let wallet = new ethers.utils.SigningKey(privateKey)
    let flatSig = wallet.signDigest(messageHashBytes)

    const sig = ethers.utils.splitSignature(flatSig)
    return await aggregator
      .connect(transmitter)
      .transmit(bytesData, sig.r, sig.s, BigNumber.from(sig.v).sub(27))
  }

  beforeEach(async () => {
    mojitoOracleTest = await mojitoOracleTestFactory
      .connect(personas.Carol)
      .deploy()

    witnetPriceTest = await witnetPriceTestFactory
      .connect(personas.Carol)
      .deploy()

    aggregator = await acocrAggregatorFactory
      .connect(personas.Carol)
      .deploy(
        lowerBoundAnchorRatio,
        upperBoundAnchorRatio,
        decimals,
        description,
        mojitoOracleTest.address,
        witnetPriceTest.address,
        validateAnswerEnabled,
      )
    assert.equal(answerBaseUnit, await aggregator.answerBaseUnit())
  })

  it('has a limited public interface [ @skip-coverage ]', () => {
    publicAbi(aggregator, [
      'addAccess',
      'answerBaseUnit',
      'checkEnabled',
      'decimals',
      'description',
      'disableAccessCheck',
      'disableAnswerValidate',
      'enableAccessCheck',
      'enableAnswerValidate',
      'getAnswer',
      'getRoundData',
      'getMojitoConfig',
      'getMojitoPrice',
      'getTimestamp',
      'getTransmitters',
      'getWitnetConfig',
      'getWitnetPrice',
      'hasAccess',
      'latestAnswer',
      'latestConfigDetails',
      'latestRound',
      'latestRoundData',
      'latestTimestamp',
      'latestTransmissionDetails',
      'lowerBoundAnchorRatio',
      'mojitoOracle',
      'upperBoundAnchorRatio',
      'owner',
      'removeAccess',
      'setAnchorRatio',
      'setConfig',
      'transmit',
      'transmitWithForce',
      'typeAndVersion',
      'validateAnswerEnabled',
      'version',
      'witnetOracle',
      // Owned methods:
      'acceptOwnership',
      'owner',
      'setMojitoConfig',
      'setMojitoOracle',
      'setWitnetConfig',
      'setWitnetOracle',
      'transferOwnership',
    ])
  })

  describe('#constructor', () => {
    it('sets the lowerBoundAnchorRatio', async () => {
      assert.equal(
        lowerBoundAnchorRatio,
        await aggregator.lowerBoundAnchorRatio(),
      )
    })

    it('sets the upperBoundAnchorRatio', async () => {
      assert.equal(
        upperBoundAnchorRatio,
        await aggregator.upperBoundAnchorRatio(),
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
  })

  describe('#setAnchorRatio', () => {
    beforeEach(async () => {
      const tx = await aggregator
        .connect(personas.Carol)
        .transferOwnership(await personas.Neil.getAddress())
      await tx.wait()
    })

    describe('first update', () => {
      it('emits a log', async () => {
        configBlockNumber = BigNumber.from(0)
        const tx = await aggregator
          .connect(personas.Carol)
          .setAnchorRatio(lowerBoundAnchorRatio, upperBoundAnchorRatio)
        await expect(tx)
          .to.emit(aggregator, 'AnchorRatioUpdated')
          .withArgs(lowerBoundAnchorRatio, upperBoundAnchorRatio)
      })
    })

    describe('when called by anyone but the owner', () => {
      it('reverts', async () => {
        await expect(
          aggregator
            .connect(personas.Neil)
            .setAnchorRatio(lowerBoundAnchorRatio, upperBoundAnchorRatio),
        ).to.be.revertedWith('Only callable by owner')
      })
    })

    describe('lowerBoundAnchorRatio is out of minLowerBoundAnchorRatio range', () => {
      it('reverts', async () => {
        await expect(
          aggregator
            .connect(personas.Carol)
            .setAnchorRatio(
              BigNumber.from(minLowerBoundAnchorRatio).sub(1),
              upperBoundAnchorRatio,
            ),
        ).to.be.revertedWith(
          'lowerBoundAnchorRatio must greater than or equal to minLowerBoundAnchorRatio',
        )
      })
    })

    describe('upperBoundAnchorRatio is out of maxUpperBoundAnchorRatio range', () => {
      it('reverts', async () => {
        await expect(
          aggregator
            .connect(personas.Carol)
            .setAnchorRatio(
              lowerBoundAnchorRatio,
              BigNumber.from(maxUpperBoundAnchorRatio).add(1),
            ),
        ).to.be.revertedWith(
          'upperBoundAnchorRatio must less than or equal to maxUpperBoundAnchorRatio',
        )
      })
    })

    describe('When upperBoundAnchorRatio not Less than lowerBoundAnchorRatio', () => {
      it('reverts', async () => {
        await expect(
          aggregator.connect(personas.Carol).setAnchorRatio(100, 100),
        ).to.be.revertedWith(
          'upperBoundAnchorRatio must less than lowerBoundAnchorRatio',
        )
      })
    })

    describe('second set config', () => {
      beforeEach(async () => {
        await aggregator
          .connect(personas.Carol)
          .setConfig(
            [
              await personas.Eddy.getAddress(),
              await personas.Nancy.getAddress(),
            ],
            [await personas.Ned.getAddress(), await personas.Neil.getAddress()],
          )
        const configDetails = await aggregator.latestConfigDetails()
        configBlockNumber = configDetails.blockNumber
      })

      it('second update emits a log', async () => {
        const tx = await aggregator
          .connect(personas.Carol)
          .setConfig(
            [
              await personas.Eddy.getAddress(),
              await personas.Nancy.getAddress(),
            ],
            [await personas.Ned.getAddress(), await personas.Neil.getAddress()],
          )
        await expect(tx)
          .to.emit(aggregator, 'ConfigSet')
          .withArgs(
            configBlockNumber,
            initConfigCount.add(2),
            [
              await personas.Eddy.getAddress(),
              await personas.Nancy.getAddress(),
            ],
            [await personas.Ned.getAddress(), await personas.Neil.getAddress()],
          )
      })
    })
  })

  describe('#setConfig', () => {
    beforeEach(async () => {
      const tx = await aggregator
        .connect(personas.Carol)
        .transferOwnership(await personas.Neil.getAddress())
      await tx.wait()
    })

    describe('first update', () => {
      it('emits a log', async () => {
        configBlockNumber = BigNumber.from(0)
        const tx = await aggregator
          .connect(personas.Carol)
          .setConfig(
            [
              await personas.Eddy.getAddress(),
              await personas.Nancy.getAddress(),
            ],
            [await personas.Ned.getAddress(), await personas.Neil.getAddress()],
          )
        await expect(tx)
          .to.emit(aggregator, 'ConfigSet')
          .withArgs(
            configBlockNumber,
            initConfigCount.add(1),
            [
              await personas.Eddy.getAddress(),
              await personas.Nancy.getAddress(),
            ],
            [await personas.Ned.getAddress(), await personas.Neil.getAddress()],
          )
      })
    })

    describe('when called by anyone but the owner', () => {
      it('reverts', async () => {
        await expect(
          aggregator
            .connect(personas.Neil)
            .setConfig(
              [
                await personas.Eddy.getAddress(),
                await personas.Nancy.getAddress(),
              ],
              [
                await personas.Ned.getAddress(),
                await personas.Neil.getAddress(),
              ],
            ),
        ).to.be.revertedWith('Only callable by owner')
      })
    })

    describe('when signers and transmitters length mismatch', () => {
      it('reverts', async () => {
        await expect(
          aggregator
            .connect(personas.Carol)
            .setConfig(
              [
                await personas.Eddy.getAddress(),
                await personas.Nancy.getAddress(),
              ],
              [await personas.Ned.getAddress()],
            ),
        ).to.be.revertedWith('oracle length mismatch')
      })
    })

    describe('When the signer address is duplicated', () => {
      it('reverts', async () => {
        await expect(
          aggregator
            .connect(personas.Carol)
            .setConfig(
              [
                await personas.Eddy.getAddress(),
                await personas.Eddy.getAddress(),
              ],
              [
                await personas.Ned.getAddress(),
                await personas.Neil.getAddress(),
              ],
            ),
        ).to.be.revertedWith('repeated signer address')
      })
    })

    describe('When the transmitter address is duplicated', () => {
      it('reverts', async () => {
        await expect(
          aggregator
            .connect(personas.Carol)
            .setConfig(
              [
                await personas.Eddy.getAddress(),
                await personas.Nancy.getAddress(),
              ],
              [
                await personas.Ned.getAddress(),
                await personas.Ned.getAddress(),
              ],
            ),
        ).to.be.revertedWith('repeated transmitter address')
      })
    })

    describe('second set config', () => {
      beforeEach(async () => {
        await aggregator
          .connect(personas.Carol)
          .setConfig(
            [
              await personas.Eddy.getAddress(),
              await personas.Nancy.getAddress(),
            ],
            [await personas.Ned.getAddress(), await personas.Neil.getAddress()],
          )
        const configDetails = await aggregator.latestConfigDetails()
        configBlockNumber = configDetails.blockNumber
      })

      it('second update emits a log', async () => {
        const tx = await aggregator
          .connect(personas.Carol)
          .setConfig(
            [
              await personas.Eddy.getAddress(),
              await personas.Nancy.getAddress(),
            ],
            [await personas.Ned.getAddress(), await personas.Neil.getAddress()],
          )
        await expect(tx)
          .to.emit(aggregator, 'ConfigSet')
          .withArgs(
            configBlockNumber,
            initConfigCount.add(2),
            [
              await personas.Eddy.getAddress(),
              await personas.Nancy.getAddress(),
            ],
            [await personas.Ned.getAddress(), await personas.Neil.getAddress()],
          )
      })
    })
  })

  describe('return getTransmitters', () => {
    it('emits a log', async () => {
      configBlockNumber = BigNumber.from(0)
      await setOCRConfig(
        aggregator,
        personas.Carol,
        [personas.Eddy, personas.Nancy],
        [personas.Ned, personas.Neil],
      )
      const oracles = await aggregator.getTransmitters()

      let transmitters = [
        await personas.Ned.getAddress(),
        await personas.Neil.getAddress(),
      ]
      for (let i = 0; i < oracles.length; i++) {
        assert.deepEqual(oracles[i], transmitters[i])
      }
    })
  })

  describe('#getTimestamp', () => {
    beforeEach(async () => {
      await setOCRConfig(
        aggregator,
        personas.Carol,
        [personas.Eddy, personas.Nancy],
        [personas.Ned, personas.Neil],
      )
    })
    const observationsTimestamp = BigNumber.from(1645973528).toNumber()
    const median = BigNumber.from(3887649853020).toNumber()

    it('returns the relevant round information', async () => {
      const tx = await transmitOCR(
        aggregator,
        testKey,
        personas.Ned,
        median,
        observationsTimestamp,
      )

      const receipt = await tx.wait()

      const block = await ethers.provider.getBlock(receipt.blockNumber ?? '')

      bigNumEquals(block.timestamp, await aggregator.latestTimestamp())
      const timestamp = await aggregator.getTimestamp(BigNumber.from(1))
      bigNumEquals(block.timestamp, timestamp)
    })

    it('_roundId greater than max', async () => {
      await transmitOCR(
        aggregator,
        testKey,
        personas.Ned,
        median,
        observationsTimestamp,
      )

      bigNumEquals(0, await aggregator.getTimestamp(max))
    })
  })

  describe('#getAnswer', () => {
    beforeEach(async () => {
      await setOCRConfig(
        aggregator,
        personas.Carol,
        [personas.Eddy, personas.Nancy],
        [personas.Ned, personas.Neil],
      )
    })
    const observationsTimestamp = BigNumber.from(1645973528).toNumber()
    const median = BigNumber.from(3887649853020).toNumber()

    it('returns the relevant answer information', async () => {
      await transmitOCR(
        aggregator,
        testKey,
        personas.Ned,
        median,
        observationsTimestamp,
      )

      bigNumEquals(median, await aggregator.getAnswer(BigNumber.from(1)))
    })

    it('getAnswer _roundId greater than max', async () => {
      await transmitOCR(
        aggregator,
        testKey,
        personas.Ned,
        median,
        observationsTimestamp,
      )

      bigNumEquals(0, await aggregator.getAnswer(max.add(1)))
    })
  })

  describe('#getRoundData', () => {
    beforeEach(async () => {
      await setOCRConfig(
        aggregator,
        personas.Carol,
        [personas.Eddy, personas.Nancy],
        [personas.Ned, personas.Neil],
      )
    })
    const observationsTimestamp = BigNumber.from(1645973528).toNumber()
    const median = BigNumber.from(3887649853020).toNumber()

    it('returns the relevant round information', async () => {
      const tx = await transmitOCR(
        aggregator,
        testKey,
        personas.Ned,
        median,
        observationsTimestamp,
      )

      const receipt = await tx.wait()

      const block = await ethers.provider.getBlock(receipt.blockNumber ?? '')

      const round = await aggregator.getRoundData(BigNumber.from(1))
      bigNumEquals(BigNumber.from(1), round.roundId)
      bigNumEquals(median, round.answer)
      bigNumEquals(observationsTimestamp, round.startedAt)
      bigNumEquals(block.timestamp, round.updatedAt)
      bigNumEquals(BigNumber.from(1), round.answeredInRound)
    })

    it('getRoundData _roundId greater than max', async () => {
      await transmitOCR(
        aggregator,
        testKey,
        personas.Ned,
        median,
        observationsTimestamp,
      )

      await expect(aggregator.getRoundData(max.add(1))).to.be.revertedWith(
        'No data present',
      )
    })
  })

  describe('#transmit', async () => {
    const median = BigNumber.from(3887649853020).toNumber()

    beforeEach(async () => {
      const tx = await setOCRConfig(
        aggregator,
        personas.Carol,
        [personas.Eddy, personas.Nancy],
        [personas.Ned, personas.Neil],
      )
      await tx.wait()

      const tx2 = await transmitForce(aggregator, personas.Carol, median)
      await tx2.wait()
    })

    it('success emits a transmit log', async () => {
      const observationsTimestamp = await getCurrentTimeStamp()
      const tx = await transmitOCR(
        aggregator,
        testKey,
        personas.Ned,
        median,
        BigNumber.from(observationsTimestamp).add(1).toNumber(),
      )

      await expect(tx)
        .to.emit(aggregator, 'NewTransmission')
        .withArgs(
          2,
          median,
          await personas.Ned.getAddress(),
          BigNumber.from(observationsTimestamp).add(1).toNumber(),
        )

      const tx2 = await transmitOCR(
        aggregator,
        testKey,
        personas.Ned,
        median,
        //2090-12-30 00:00:00
        BigNumber.from(observationsTimestamp).add(2).toNumber(),
      )
      await expect(tx2)
        .to.emit(aggregator, 'NewRound')
        .withArgs(
          3,
          constants.AddressZero,
          BigNumber.from(observationsTimestamp).add(2).toNumber(),
        )
    })

    it('unauthorized transmitter', async () => {
      await expect(
        transmitOCR(
          aggregator,
          // person.Nancy
          testKey,
          personas.Carol,
          median,
          await getCurrentTimeStamp(),
        ),
      ).to.be.revertedWith('unauthorized transmitter')
    })

    it('transmit message length mismatch', async () => {
      await expect(
        transmitOCRErr(
          aggregator,
          // person.Nancy
          testKey,
          personas.Ned,
          median,
          await getCurrentTimeStamp(),
        ),
      ).to.be.revertedWith('transmit message length mismatch')
    })

    it('signature error', async () => {
      await expect(
        transmitOCR(
          aggregator,
          // personas.Ned,
          '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
          personas.Ned,
          median,
          BigNumber.from(await getCurrentTimeStamp())
            .add(1)
            .toNumber(),
        ),
      ).to.be.revertedWith('signature error')
    })

    it('median is out of min range', async () => {
      await expect(
        transmitOCR(
          aggregator,
          // personas.Nancy,
          testKey,
          personas.Ned,
          BigNumber.from(median)
            .mul(BigNumber.from(lowerBoundAnchorRatio).sub(1))
            .div(100)
            .toNumber(),
          BigNumber.from(await getCurrentTimeStamp())
            .add(1)
            .toNumber(),
        ),
      ).to.be.revertedWith('median is out of min-max range')
    })

    it('median is out of max range', async () => {
      await expect(
        transmitOCR(
          aggregator,
          // personas.Nancy,
          testKey,
          personas.Ned,
          BigNumber.from(median)
            .mul(BigNumber.from(upperBoundAnchorRatio).add(1))
            .div(100)
            .toNumber(),
          BigNumber.from(await getCurrentTimeStamp())
            .add(1)
            .toNumber(),
        ),
      ).to.be.revertedWith('median is out of min-max range')
    })

    it('invalid observations timestamp', async () => {
      await transmitOCR(
        aggregator,
        // personas.Nancy,
        testKey,
        personas.Ned,
        median,
        BigNumber.from(await getCurrentTimeStamp())
          .add(1)
          .toNumber(),
      )

      await expect(
        transmitOCR(
          aggregator,
          // personas.Nancy,
          testKey,
          personas.Ned,
          median,
          BigNumber.from(
            BigNumber.from(await getCurrentTimeStamp()).sub(100),
          ).toNumber(),
        ),
      ).to.be.revertedWith('invalid observations timestamp')
    })
  })

  describe('#transmitWithForce', () => {
    const median = BigNumber.from(3887649853020).toNumber()

    beforeEach(async () => {
      await setOCRConfig(
        aggregator,
        personas.Carol,
        [personas.Eddy, personas.Nancy],
        [personas.Ned, personas.Neil],
      )
    })

    it('success emits a transmit with force log', async () => {
      const tx = await transmitForce(aggregator, personas.Carol, median)

      const block = await ethers.provider.getBlock(tx.blockNumber!)

      await expect(tx)
        .to.emit(aggregator, 'NewTransmission')
        .withArgs(1, median, await personas.Carol.getAddress(), block.timestamp)

      const tx2 = await transmitForce(aggregator, personas.Carol, median)

      const receipt2 = await tx2.wait()

      const block2 = await ethers.provider.getBlock(receipt2.blockHash ?? '')

      await expect(tx2)
        .to.emit(aggregator, 'NewRound')
        .withArgs(2, constants.AddressZero, block2.timestamp)
    })
  })

  describe('#latestTimestamp', () => {
    beforeEach(async () => {
      await setOCRConfig(
        aggregator,
        personas.Carol,
        [personas.Eddy, personas.Nancy],
        [personas.Ned, personas.Neil],
      )
    })
    const observationsTimestamp = BigNumber.from(1645973528).toNumber()
    const median = BigNumber.from(3887649853020).toNumber()

    it('returns the relevant round information', async () => {
      const tx = await transmitOCR(
        aggregator,
        testKey,
        personas.Ned,
        median,
        observationsTimestamp,
      )

      const block = await ethers.provider.getBlock(tx.blockHash ?? '')

      bigNumEquals(block.timestamp, await aggregator.latestTimestamp())
    })
  })

  describe('#latestRound', () => {
    beforeEach(async () => {
      await setOCRConfig(
        aggregator,
        personas.Carol,
        [personas.Eddy, personas.Nancy],
        [personas.Ned, personas.Neil],
      )
    })
    const observationsTimestamp = BigNumber.from(1645973528).toNumber()
    const median = BigNumber.from(3887649853020).toNumber()

    it('returns the relevant round information', async () => {
      await transmitOCR(
        aggregator,
        testKey,
        personas.Ned,
        median,
        observationsTimestamp,
      )

      bigNumEquals(1, await aggregator.latestRound())
    })
  })

  describe('#latestRoundData', () => {
    describe('return latest round data', () => {
      beforeEach(async () => {
        await setOCRConfig(
          aggregator,
          personas.Carol,
          [personas.Eddy, personas.Nancy],
          [personas.Ned, personas.Neil],
        )
      })
      const observationsTimestamp = BigNumber.from(1645973528).toNumber()
      const median = BigNumber.from(3887649853020).toNumber()

      it('returns the relevant round information', async () => {
        const tx = await transmitOCR(
          aggregator,
          testKey,
          personas.Ned,
          median,
          observationsTimestamp,
        )

        const block = await ethers.provider.getBlock(tx.blockHash!)

        const round = await aggregator.latestRoundData()
        bigNumEquals(BigNumber.from(1), round.roundId)
        bigNumEquals(median, round.answer)
        bigNumEquals(observationsTimestamp, round.startedAt)
        bigNumEquals(block.timestamp, round.updatedAt)
        bigNumEquals(BigNumber.from(1), round.answeredInRound)
      })
    })

    describe('not set config then return latest round data', () => {
      it('returns the relevant round information', async () => {
        const round = await aggregator.latestRoundData()
        bigNumEquals(BigNumber.from(0), round.roundId)
        bigNumEquals(0, round.answer)
        bigNumEquals(0, round.startedAt)
        bigNumEquals(0, round.updatedAt)
        bigNumEquals(BigNumber.from(0), round.answeredInRound)
      })
    })
  })

  describe('#latestTransmissionDetails', () => {
    describe('#return success latest transmission details', () => {
      beforeEach(async () => {
        await setOCRConfig(
          aggregator,
          personas.Carol,
          [personas.Eddy, personas.Nancy],
          [personas.Ned, personas.Neil],
        )
      })
      const observationsTimestamp = BigNumber.from(1645973528).toNumber()
      const median = BigNumber.from(3887649853020).toNumber()

      it('returns the relevant transmission details', async () => {
        const tx = await transmitOCR(
          aggregator,
          testKey,
          personas.Ned,
          median,
          observationsTimestamp,
        )

        const receipt = await tx.wait()

        const block = await ethers.provider.getBlock(receipt.blockNumber ?? '')

        const round = await aggregator.latestTransmissionDetails()
        bigNumEquals(await personas.Neil.getAddress(), round.nextTransmitter)
        bigNumEquals(
          await personas.Ned.getAddress(),
          round.afterNextTransmitter,
        )
        bigNumEquals(BigNumber.from(1), round.nextIndex)
        bigNumEquals(BigNumber.from(2), round.transmittersLength)
        bigNumEquals(BigNumber.from(1), round.roundId)
        bigNumEquals(median, round.answer)
        bigNumEquals(observationsTimestamp, round.startedAt)
        bigNumEquals(block.timestamp, round.updatedAt)
      })
    })

    describe('#not set config', async () => {
      it('returns the empty transmission details', async () => {
        const round = await aggregator.latestTransmissionDetails()
        bigNumEquals(constants.AddressZero, round.nextTransmitter)
        bigNumEquals(constants.AddressZero, round.afterNextTransmitter)
        bigNumEquals(0, round.nextIndex)
        bigNumEquals(0, round.transmittersLength)
        bigNumEquals(0, round.roundId)
        bigNumEquals(0, round.answer)
        bigNumEquals(0, round.startedAt)
        bigNumEquals(0, round.updatedAt)
      })
    })

    describe('#second set config ', () => {
      const observationsTimestamp = BigNumber.from(1645973528).toNumber()
      const median = BigNumber.from(3887649853020).toNumber()

      beforeEach(async () => {
        await setOCRConfig(
          aggregator,
          personas.Carol,
          [personas.Eddy, personas.Nancy],
          [personas.Ned, personas.Neil],
        )
      })

      it('second set empty config', async () => {
        await transmitOCR(
          aggregator,
          testKey,
          personas.Ned,
          median,
          observationsTimestamp,
        )

        await setOCRConfig(aggregator, personas.Carol, [], [])

        const round1 = await aggregator.latestTransmissionDetails()
        bigNumEquals(constants.AddressZero, round1.nextTransmitter)
        bigNumEquals(constants.AddressZero, round1.afterNextTransmitter)
        bigNumEquals(0, round1.nextIndex)
        bigNumEquals(0, round1.transmittersLength)
        bigNumEquals(1, round1.roundId)
        bigNumEquals(median, round1.answer)
        bigNumEquals(observationsTimestamp, round1.startedAt)

        await setOCRConfig(
          aggregator,
          personas.Carol,
          [personas.Eddy, personas.Nancy, personas.Norbert],
          [personas.Ned, personas.Neil, personas.Nick],
        )

        const round = await aggregator.latestTransmissionDetails()
        bigNumEquals(await personas.Neil.getAddress(), round.nextTransmitter)
        bigNumEquals(
          await personas.Nick.getAddress(),
          round.afterNextTransmitter,
        )
        bigNumEquals(1, round.nextIndex)
        bigNumEquals(3, round.transmittersLength)
        bigNumEquals(1, round.roundId)
        bigNumEquals(median, round.answer)
        bigNumEquals(observationsTimestamp, round.startedAt)

        const nextObservationsTimestamp = BigNumber.from(round.updatedAt)
          .add(1)
          .toNumber()
        await transmitOCR(
          aggregator,
          testKey,
          personas.Nick,
          median,
          nextObservationsTimestamp,
        )

        const round2 = await aggregator.latestTransmissionDetails()
        bigNumEquals(await personas.Ned.getAddress(), round2.nextTransmitter)
        bigNumEquals(
          await personas.Neil.getAddress(),
          round2.afterNextTransmitter,
        )
        bigNumEquals(0, round2.nextIndex)
        bigNumEquals(3, round2.transmittersLength)
        bigNumEquals(2, round2.roundId)
        bigNumEquals(median, round2.answer)
        bigNumEquals(nextObservationsTimestamp, round2.startedAt)
      })

      it('set transmitter length 4 to 2, current index is 3', async () => {
        const tx1 = await setOCRConfig(
          aggregator,
          personas.Carol,
          [personas.Eddy, personas.Nancy, personas.Norbert, personas.Nelly],
          [personas.Ned, personas.Neil, personas.Nick, personas.Default],
        )
        await tx1.wait()

        const round = await aggregator.latestTransmissionDetails()
        bigNumEquals(await personas.Ned.getAddress(), round.nextTransmitter)
        bigNumEquals(
          await personas.Neil.getAddress(),
          round.afterNextTransmitter,
        )
        bigNumEquals(0, round.nextIndex)
        bigNumEquals(4, round.transmittersLength)
        bigNumEquals(0, round.roundId)
        bigNumEquals(0, round.answer)
        bigNumEquals(0, round.startedAt)

        await setOCRConfig(
          aggregator,
          personas.Carol,
          [personas.Eddy, personas.Nancy],
          [personas.Ned, personas.Neil],
        )

        const round2 = await aggregator.latestTransmissionDetails()
        bigNumEquals(await personas.Ned.getAddress(), round2.nextTransmitter)
        bigNumEquals(
          await personas.Neil.getAddress(),
          round2.afterNextTransmitter,
        )
        bigNumEquals(0, round2.nextIndex)
        bigNumEquals(2, round2.transmittersLength)
        bigNumEquals(0, round2.roundId)
        bigNumEquals(0, round2.answer)
        bigNumEquals(0, round2.startedAt)
      })

      describe('#revert ', () => {
        beforeEach(async () => {
          aggregatorTest = await ocrTestFactory
            .connect(personas.Carol)
            .deploy(aggregator.address)
        })

        it('only callable by eoa', async () => {
          await transmitOCR(
            aggregator,
            testKey,
            personas.Ned,
            median,
            observationsTimestamp,
          )

          await expect(
            aggregatorTest.latestTransmissionDetails(),
          ).to.be.revertedWith('Only callable by EOA')
        })
      })
    })
  })
})
