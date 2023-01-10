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
import { Personas, getUsers } from '../test-helpers/setup'
import { bigNumEquals } from '../test-helpers/matchers'
import { publicAbi } from '../test-helpers/helpers'

let personas: Personas
let ocrAggregatorFactory: ContractFactory
let mojitoOracleTestFactory: ContractFactory
let pythOracleTestFactory: ContractFactory
let witnetOracleTestFactory: ContractFactory

before(async () => {
  personas = (await getUsers()).personas
  ocrAggregatorFactory = await ethers.getContractFactory(
    'contracts/v0.7/OffchainAggregator.sol:OffchainAggregator',
  )
  mojitoOracleTestFactory = await ethers.getContractFactory(
    'contracts/v0.7/tests/MockMojitoOracle.sol:MockMojitoOracle',
  )
  pythOracleTestFactory = await ethers.getContractFactory(
    'contracts/v0.7/tests/MockPyth.sol:MockPyth',
  )
  witnetOracleTestFactory = await ethers.getContractFactory(
    'contracts/v0.7/tests/MockWitnetPriceRouter.sol:MockWitnetPriceRouter',
  )
})

describe('OffchainAggregator', () => {
  const lowerBoundAnchorRatio = 95
  const upperBoundAnchorRatio = 105
  const decimals = 8
  const description = 'KCS / USDT'
  const answerBaseUnit = 1e8
  const validateAnswerEnabled = true
  const typeAndVersion = 'OffchainAggregator 1.0.0'
  const initConfigCount = BigNumber.from(0)
  const testKey =
    '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a'

  let aggregator: Contract
  let configBlockNumber: BigNumber
  let mojitoOracleTest: Contract
  let pythOracleTest: Contract
  let witnetOracleTest: Contract

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

  beforeEach(async () => {
    mojitoOracleTest = await mojitoOracleTestFactory
      .connect(personas.Carol)
      .deploy()

    pythOracleTest = await pythOracleTestFactory
      .connect(personas.Carol)
      .deploy()

    witnetOracleTest = await witnetOracleTestFactory
      .connect(personas.Carol)
      .deploy()

    aggregator = await ocrAggregatorFactory
      .connect(personas.Carol)
      .deploy(
        lowerBoundAnchorRatio,
        upperBoundAnchorRatio,
        decimals,
        description,
        mojitoOracleTest.address,
        pythOracleTest.address,
        witnetOracleTest.address,
        validateAnswerEnabled,
      )
    assert.equal(answerBaseUnit, await aggregator.answerBaseUnit())
  })

  it('has a limited public interface [ @skip-coverage ]', () => {
    publicAbi(aggregator, [
      'answerBaseUnit',
      'decimals',
      'description',
      'disableAnswerValidate',
      'enableAnswerValidate',
      'getAnswer',
      'getRoundData',
      'getTimestamp',
      'getTransmitters',
      'getMojitoConfig',
      'getMojitoPrice',
      'getPythConfig',
      'getPythPrice',
      'getWitnetConfig',
      'getWitnetPrice',
      'latestAnswer',
      'latestConfigDetails',
      'latestRound',
      'latestRoundData',
      'latestTimestamp',
      'latestTransmissionDetails',
      'mojitoOracle',
      'lowerBoundAnchorRatio',
      'upperBoundAnchorRatio',
      'owner',
      'setAnchorRatio',
      'setConfig',
      'transmit',
      'transmitWithForce',
      'typeAndVersion',
      'validateAnswerEnabled',
      'version',
      'witnetOracle',
      'pythOracle',
      // Owned methods:
      'acceptOwnership',
      'owner',
      'setMojitoConfig',
      'setMojitoOracle',
      'setPythConfig',
      'setPythOracle',
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

  describe('#transmit', () => {
    beforeEach(async () => {
      await setOCRConfig(
        aggregator,
        personas.Carol,
        [personas.Eddy, personas.Nancy],
        [personas.Ned, personas.Neil],
      )
      const configDetails = await aggregator.latestConfigDetails()
      configBlockNumber = configDetails.blockNumber
    })
    const observationsTimestamp = BigNumber.from(1645973528).toNumber()
    // 8 decimal
    const median = BigNumber.from(3000010045008).toNumber()
    // 18 decimal
    const priceFormMojito = '30000100006789000000000'
    // 6 decimal
    const priceFormWitnet = BigNumber.from(30000103406).toNumber()
    describe('first transmit', () => {
      it('emits a log', async () => {
        await aggregator.disableAnswerValidate()
        const tx = await transmitOCR(
          aggregator,
          testKey,
          personas.Ned,
          median,
          observationsTimestamp,
        )
        await expect(tx)
          .to.emit(aggregator, 'NewTransmission')
          .withArgs(
            1,
            median,
            await personas.Ned.getAddress(),
            observationsTimestamp,
          )
      })
    })

    describe('set correct mojito (mojito.tokenB == address(0)) anchor price and transmit', () => {
      beforeEach(async () => {
        const kcsToken = '0x4446Fc4eb47f2f6586f9fAAb68B3498F86C07521'
        const usdcToken = '0x980a5AfEf3D17aD98635F6C5aebCBAedEd3c3430'
        const kcsUsdtPairHash =
          '0x31debffc453c5d04a78431e7bc28098c606d2bbeea22f10a35809924a201a977'

        await mojitoOracleTest
          .connect(personas.Carol)
          .updatePrice(priceFormMojito)

        const tx = await aggregator
          .connect(personas.Carol)
          .setMojitoConfig(true, kcsUsdtPairHash, constants.WeiPerEther)
        await expect(tx)
          .to.emit(aggregator, 'MojitoConfigSet')
          .withArgs(true, kcsUsdtPairHash, constants.WeiPerEther)

        const mojitoConfig = await aggregator.getMojitoConfig()
        assert.equal(true, mojitoConfig.available)
        assert.equal(kcsUsdtPairHash, mojitoConfig.pairA)
        bigNumEquals(constants.WeiPerEther, mojitoConfig.pairABaseUnit)
        bigNumEquals(
          BigNumber.from(3000010000678),
          await aggregator.getMojitoPrice(),
        )
      })

      it('emits a log', async () => {
        const tx = await transmitOCR(
          aggregator,
          testKey,
          personas.Ned,
          median,
          observationsTimestamp,
        )
        await expect(tx)
          .to.emit(aggregator, 'NewTransmission')
          .withArgs(
            1,
            median,
            await personas.Ned.getAddress(),
            observationsTimestamp,
          )
      })
    })

    describe('set correct mojito price (mojito.tokenB != address(0)) and transmit', () => {
      beforeEach(async () => {
        // btc - usdc = 1btc>kcs->usdc
        const btcToken = '0xfA93C12Cd345c658bc4644D1D4E1B9615952258C'
        const kcsToken = '0x4446Fc4eb47f2f6586f9fAAb68B3498F86C07521'
        const usdcToken = '0x980a5AfEf3D17aD98635F6C5aebCBAedEd3c3430'
        const kcsUsdtPairHash =
          '0x31debffc453c5d04a78431e7bc28098c606d2bbeea22f10a35809924a201a977'

        await mojitoOracleTest
          .connect(personas.Carol)
          .updatePrice(priceFormMojito)

        const tx = await aggregator
          .connect(personas.Carol)
          .setMojitoConfig(true, kcsUsdtPairHash, constants.WeiPerEther)
        await expect(tx)
          .to.emit(aggregator, 'MojitoConfigSet')
          .withArgs(true, kcsUsdtPairHash, constants.WeiPerEther)

        const mojitoConfig = await aggregator.getMojitoConfig()
        assert.equal(true, mojitoConfig.available)
        assert.equal(kcsUsdtPairHash, mojitoConfig.pairA)
        bigNumEquals(
          BigNumber.from(3000010000678),
          await aggregator.getMojitoPrice(),
        )
      })

      it('emits a log', async () => {
        const tx = await transmitOCR(
          aggregator,
          testKey,
          personas.Ned,
          median,
          observationsTimestamp,
        )
        await expect(tx)
          .to.emit(aggregator, 'NewTransmission')
          .withArgs(
            1,
            median,
            await personas.Ned.getAddress(),
            observationsTimestamp,
          )
      })
    })

    describe('set incorrect mojito price (mojito.tokenB != address(0)) and transmit', () => {
      beforeEach(async () => {
        // btc - usdc = 1btc>kcs->usdc
        const btcToken = '0xfA93C12Cd345c658bc4644D1D4E1B9615952258C'
        const kcsToken = '0x4446Fc4eb47f2f6586f9fAAb68B3498F86C07521'
        const usdcToken = '0x980a5AfEf3D17aD98635F6C5aebCBAedEd3c3430'
        const kcsUsdtPairHash =
          '0x31debffc453c5d04a78431e7bc28098c606d2bbeea22f10a35809924a201a977'

        await mojitoOracleTest
          .connect(personas.Carol)
          .updatePrice(constants.WeiPerEther)

        const tx = await aggregator
          .connect(personas.Carol)
          .setMojitoConfig(true, kcsUsdtPairHash, constants.WeiPerEther)
        await expect(tx)
          .to.emit(aggregator, 'MojitoConfigSet')
          .withArgs(true, kcsUsdtPairHash, constants.WeiPerEther)

        const mojitoConfig = await aggregator.getMojitoConfig()
        assert.equal(true, mojitoConfig.available)
        assert.equal(kcsUsdtPairHash, mojitoConfig.pairA)
        bigNumEquals(
          BigNumber.from(100000000),
          await aggregator.getMojitoPrice(),
        )
      })

      it('emits a log', async () => {
        const tx = await transmitOCR(
          aggregator,
          testKey,
          personas.Ned,
          median,
          observationsTimestamp,
        )

        const receipt = await tx.wait()

        const block = await ethers.provider.getBlock(receipt.blockNumber ?? '')

        await expect(tx)
          .to.emit(aggregator, 'AnswerGuarded')
          .withArgs(1, median, BigNumber.from(100000000), 0, 0, block.timestamp)
      })
    })

    describe('set correct pyth price and transmit', () => {
      beforeEach(async () => {
        const stalenessSeconds = 600
        const kcsPriceFeedId =
          '0xac541125cba1f87cd7048ed465faaca653784605e05fc1ee90b979f0a4eb57a2'
        const priceFormPyth = BigNumber.from(3000010045008).toNumber()

        await pythOracleTest
          .connect(personas.Carol)
          .setPrice(kcsPriceFeedId, priceFormPyth)

        const tx = await aggregator
          .connect(personas.Carol)
          .setPythConfig(true, stalenessSeconds, kcsPriceFeedId, 8)
        await expect(tx)
          .to.emit(aggregator, 'PythConfigSet')
          .withArgs(true, stalenessSeconds, kcsPriceFeedId, 8)

        const pythConfig = await aggregator.getPythConfig()
        assert.equal(stalenessSeconds, pythConfig.stalenessSeconds)
        assert.equal(kcsPriceFeedId, pythConfig.priceFeedId)
        bigNumEquals(priceFormPyth, await aggregator.getPythPrice())
      })

      it('emits a log', async () => {
        const tx = await transmitOCR(
          aggregator,
          testKey,
          personas.Ned,
          median,
          observationsTimestamp,
        )
        await expect(tx)
          .to.emit(aggregator, 'NewTransmission')
          .withArgs(
            1,
            median,
            await personas.Ned.getAddress(),
            observationsTimestamp,
          )
      })
    })

    describe('set correct witnet price (witnetPriceFeed.pairB == "") and transmit', () => {
      beforeEach(async () => {
        const kcsToken = '0x4446Fc4eb47f2f6586f9fAAb68B3498F86C07521'
        const usdcToken = '0x980a5AfEf3D17aD98635F6C5aebCBAedEd3c3430'
        const kcsUsdtPairHash =
          '0x31debffc453c5d04a78431e7bc28098c606d2bbeea22f10a35809924a201a977'

        await mojitoOracleTest
          .connect(personas.Carol)
          .updatePrice(priceFormMojito)

        await witnetOracleTest
          .connect(personas.Carol)
          .updatePrice(priceFormWitnet)

        const tx = await aggregator
          .connect(personas.Carol)
          .setMojitoConfig(false, kcsUsdtPairHash, constants.WeiPerEther)
        await expect(tx)
          .to.emit(aggregator, 'MojitoConfigSet')
          .withArgs(false, kcsUsdtPairHash, constants.WeiPerEther)

        const mojitoConfig = await aggregator.getMojitoConfig()
        assert.equal(false, mojitoConfig.available)
        assert.equal(kcsUsdtPairHash, mojitoConfig.pairA)
        bigNumEquals(BigNumber.from(0), await aggregator.getMojitoPrice())

        const tx2 = await aggregator
          .connect(personas.Carol)
          .setWitnetConfig(
            true,
            kcsUsdtPairHash,
            constants.HashZero,
            BigNumber.from(10).pow(6),
            0,
          )
        await expect(tx2)
          .to.emit(aggregator, 'WitnetConfigSet')
          .withArgs(
            true,
            kcsUsdtPairHash,
            constants.HashZero,
            BigNumber.from(10).pow(6),
            0,
          )

        const witnetConfig = await aggregator.getWitnetConfig()
        assert.equal(true, witnetConfig.available)
        assert.equal(kcsUsdtPairHash, witnetConfig.pairA)
        bigNumEquals(BigNumber.from(10).pow(6), witnetConfig.pairABaseUnit)
        // 8 decimals
        bigNumEquals(
          BigNumber.from(priceFormWitnet).mul(100),
          await aggregator.getWitnetPrice(),
        )
      })

      it('emits a log', async () => {
        const tx = await transmitOCR(
          aggregator,
          testKey,
          personas.Ned,
          median,
          observationsTimestamp,
        )
        await expect(tx)
          .to.emit(aggregator, 'NewTransmission')
          .withArgs(
            1,
            median,
            await personas.Ned.getAddress(),
            observationsTimestamp,
          )
      })
    })

    describe('set incorrect witnet price (witnetPriceFeed.pairB != "") and transmit', () => {
      beforeEach(async () => {
        // mjt->usdc = mjt/kcs - kcs/usdt
        const mjtKcsPairHash =
          '0x2dcfd5546926b857978957b40dcd5164cc788079b46ce9c1abbaedac07f96837'
        const kcsUsdtPairHash =
          '0x31debffc453c5d04a78431e7bc28098c606d2bbeea22f10a35809924a201a977'

        await mojitoOracleTest
          .connect(personas.Carol)
          .updatePrice(priceFormMojito)

        await witnetOracleTest
          .connect(personas.Carol)
          .updatePrice(priceFormWitnet)

        bigNumEquals(BigNumber.from(0), await aggregator.getMojitoPrice())

        const tx2 = await aggregator
          .connect(personas.Carol)
          .setWitnetConfig(
            true,
            mjtKcsPairHash,
            kcsUsdtPairHash,
            BigNumber.from(10).pow(6),
            BigNumber.from(10).pow(6),
          )
        await expect(tx2)
          .to.emit(aggregator, 'WitnetConfigSet')
          .withArgs(
            true,
            mjtKcsPairHash,
            kcsUsdtPairHash,
            BigNumber.from(10).pow(6),
            BigNumber.from(10).pow(6),
          )

        const witnetConfig = await aggregator.getWitnetConfig()
        assert.equal(true, witnetConfig.available)
        assert.equal(mjtKcsPairHash, witnetConfig.pairA)
        assert.equal(kcsUsdtPairHash, witnetConfig.pairB)
        bigNumEquals(BigNumber.from(10).pow(6), witnetConfig.pairABaseUnit)
        bigNumEquals(BigNumber.from(10).pow(6), witnetConfig.pairBBaseUnit)
        // 8 decimals
        let witnetPrice = BigNumber.from(priceFormWitnet)
          .mul(priceFormWitnet)
          .mul(answerBaseUnit)
          .div(witnetConfig.pairABaseUnit)
          .div(witnetConfig.pairBBaseUnit)
        bigNumEquals(witnetPrice, await aggregator.getWitnetPrice())

        // console.log(witnetPrice.toString())
        // console.log(await aggregator.validateAnswerEnabled())

        await transmitOCR(
          aggregator,
          testKey,
          personas.Ned,
          median,
          observationsTimestamp,
        )
      })

      it('emits a log', async () => {
        const tx = await transmitOCR(
          aggregator,
          testKey,
          personas.Ned,
          median,
          observationsTimestamp,
        )

        const receipt = await tx.wait()

        const block = await ethers.provider.getBlock(receipt.blockNumber ?? '')

        const witnetConfig = await aggregator.getWitnetConfig()

        await expect(tx)
          .to.emit(aggregator, 'AnswerGuarded')
          .withArgs(
            1,
            median,
            0,
            0,
            BigNumber.from(priceFormWitnet)
              .mul(priceFormWitnet)
              .mul(answerBaseUnit)
              .div(witnetConfig.pairABaseUnit)
              .div(witnetConfig.pairBBaseUnit),
            block.timestamp,
          )
      })
    })

    describe('not set anchor price and transmit', () => {
      beforeEach(async () => {
        await mojitoOracleTest
          .connect(personas.Carol)
          .updatePrice(priceFormMojito)

        await witnetOracleTest
          .connect(personas.Carol)
          .updatePrice(priceFormWitnet)

        bigNumEquals(BigNumber.from(0), await aggregator.getMojitoPrice())

        bigNumEquals(BigNumber.from(0), await aggregator.getWitnetPrice())

        // console.log(witnetPrice.toString())
        // console.log(await aggregator.validateAnswerEnabled())

        await transmitOCR(
          aggregator,
          testKey,
          personas.Ned,
          median,
          observationsTimestamp,
        )
      })

      it('emits a log', async () => {
        const tx = await transmitOCR(
          aggregator,
          testKey,
          personas.Ned,
          median,
          observationsTimestamp,
        )

        const receipt = await tx.wait()

        const block = await ethers.provider.getBlock(receipt.blockNumber ?? '')

        const witnetConfig = await aggregator.getWitnetConfig()

        await expect(tx)
          .to.emit(aggregator, 'AnswerGuarded')
          .withArgs(1, median, 0, 0, 0, block.timestamp)
      })
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

      await aggregator.connect(personas.Carol).disableAnswerValidate()

      assert.equal(await aggregator.validateAnswerEnabled(), false)
    })
    const observationsTimestamp = BigNumber.from(1645973528).toNumber()
    const median = BigNumber.from(3887649853020).toNumber()
    describe('return latestRound', () => {
      it('emits a log', async () => {
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

  describe('#setMojitoOracle', () => {
    describe('when called by a non-owner', () => {
      it('reverts', async () => {
        await expect(
          aggregator
            .connect(personas.Eddy)
            .setMojitoOracle(mojitoOracleTest.address),
        ).to.be.revertedWith('Only callable by owner')
      })
    })

    describe('set mojito oracle success', () => {
      it('emits a success log', async () => {
        let mojitoOracleTest2 = await mojitoOracleTestFactory
          .connect(personas.Carol)
          .deploy()

        await aggregator
          .connect(personas.Carol)
          .setMojitoOracle(mojitoOracleTest2.address)
      })
    })
  })

  describe('#setPythOracle', () => {
    describe('when called by a non-owner', () => {
      it('reverts', async () => {
        await expect(
          aggregator
            .connect(personas.Eddy)
            .setPythOracle(pythOracleTest.address),
        ).to.be.revertedWith('Only callable by owner')
      })
    })

    describe('set pyth oracle success', () => {
      it('emits a success log', async () => {
        let pythPriceTest2 = await pythOracleTestFactory
          .connect(personas.Carol)
          .deploy()
        await aggregator
          .connect(personas.Carol)
          .setPythOracle(pythPriceTest2.address)
      })
    })
  })

  describe('#setWitnetOracle', () => {
    describe('when called by a non-owner', () => {
      it('reverts', async () => {
        await expect(
          aggregator
            .connect(personas.Eddy)
            .setWitnetOracle(witnetOracleTest.address),
        ).to.be.revertedWith('Only callable by owner')
      })
    })

    describe('set witnet oracle success', () => {
      it('emits a success log', async () => {
        let witnetPriceTest2 = await witnetOracleTestFactory
          .connect(personas.Carol)
          .deploy()
        await aggregator
          .connect(personas.Carol)
          .setWitnetOracle(witnetPriceTest2.address)
      })
    })
  })

  describe('#disableAnswerValidate', () => {
    describe('when called by a non-owner', () => {
      it('reverts', async () => {
        await expect(
          aggregator.connect(personas.Eddy).disableAnswerValidate(),
        ).to.be.revertedWith('Only callable by owner')
        assert.isTrue(await aggregator.validateAnswerEnabled())
      })
    })

    describe('when called by the owner', () => {
      beforeEach(async () => {
        await aggregator.disableAnswerValidate()
      })

      it('sets validateAnswerEnabled to false', async () => {
        await aggregator.disableAnswerValidate()
        assert.isFalse(await aggregator.validateAnswerEnabled())
      })

      it('reverts', async () => {
        await expect(
          aggregator.connect(personas.Eddy).disableAnswerValidate(),
        ).to.be.revertedWith('')
      })
    })
  })

  describe('#enableAnswerValidate', () => {
    describe('when called by a non-owner', () => {
      it('reverts', async () => {
        await expect(
          aggregator.connect(personas.Eddy).enableAnswerValidate(),
        ).to.be.revertedWith('Only callable by owner')
        assert.isTrue(await aggregator.validateAnswerEnabled())
      })
    })

    describe('when called by the owner', () => {
      beforeEach(async () => {
        await aggregator.disableAnswerValidate()
        await aggregator.enableAnswerValidate()
      })

      it('sets validateAnswerEnabled to true', async () => {
        await aggregator.enableAnswerValidate()
        assert.isTrue(await aggregator.validateAnswerEnabled())
      })

      it('reverts', async () => {
        await expect(
          aggregator.connect(personas.Eddy).enableAnswerValidate(),
        ).to.be.revertedWith('')
      })
    })
  })
})
