import { expect, assert } from 'chai'
import { BigNumber, Contract, BigNumberish, Signer } from 'ethers'
import { ethers } from 'hardhat'
import { toBytes32String, reset } from '../test-helpers/helpers'
import { bigNumEquals } from '../test-helpers/matchers'

describe('VRFV2Wrapper', () => {
  const pointOneWKCS = BigNumber.from(1e12).mul(BigNumber.from('100000'))
  const oneHundredWKCS = BigNumber.from('100000000000000000000')
  const oneHundredGwei = BigNumber.from('100000000000')
  const fiftyGwei = BigNumber.from('50000000000')

  // Configuration

  // This value is the worst-case gas overhead from the wrapper contract under the following
  // conditions, plus some wiggle room:
  //   - 10 words requested
  //   - Refund issued to consumer
  const wrapperGasOverhead = BigNumber.from(60_000)
  const coordinatorGasOverhead = BigNumber.from(52_000)
  const wrapperPremiumPercentage = 10
  const maxNumWords = 10
  const weiPerUnitNative = ethers.utils.parseEther('1')
  const flatFee = pointOneWKCS

  let wrapper: Contract
  let wrapper2: Contract
  let coordinator: Contract
  let coordinator2: Contract
  let wrapperToken: Contract
  let wrongWrapperToken: Contract
  let consumer: Contract
  let consumer2: Contract
  let consumerWrongWrapperToken: Contract
  let consumerRevert: Contract
  let consumerOutOfGas: Contract

  let owner: Signer
  let requester: Signer
  let consumerOwner: Signer
  let withdrawRecipient: Signer

  // This should match implementation in VRFV2Wrapper::calculateGasPriceInternal
  const calculatePrice = (
    gasLimit: BigNumberish,
    _wrapperGasOverhead: BigNumberish = wrapperGasOverhead,
    _coordinatorGasOverhead: BigNumberish = coordinatorGasOverhead,
    _gasPriceWei: BigNumberish = oneHundredGwei,
    _weiPerUnitNative: BigNumberish = weiPerUnitNative,
    _wrapperPremium: BigNumberish = wrapperPremiumPercentage,
    _flatFee: BigNumberish = flatFee,
  ): BigNumber => {
    const totalGas = BigNumber.from(0)
      .add(gasLimit)
      .add(_wrapperGasOverhead)
      .add(_coordinatorGasOverhead)
    const baseFee = BigNumber.from('1000000000000000000')
      .mul(_gasPriceWei)
      .mul(totalGas)
      .div(_weiPerUnitNative)
    const withPremium = baseFee
      .mul(BigNumber.from(100).add(_wrapperPremium))
      .div(100)
    return withPremium.add(_flatFee)
  }

  before(async () => {
    await reset()
  })

  beforeEach(async () => {
    const accounts = await ethers.getSigners()
    owner = accounts[0]
    requester = accounts[1]
    consumerOwner = accounts[2]
    withdrawRecipient = accounts[3]

    const coordinatorFactory = await ethers.getContractFactory(
      'VRFCoordinatorV2Mock',
      owner,
    )
    coordinator = await coordinatorFactory.deploy(
      pointOneWKCS,
      1e9, // 0.000000001 WKCS per gas
      true,
    )
    coordinator2 = await coordinatorFactory.deploy(
      pointOneWKCS,
      1e9, // 0.000000001 WKCS per gas
      false,
    )
    const wkcsFactory = await ethers.getContractFactory('WKCS', owner)
    wrapperToken = await wkcsFactory.deploy()
    wrongWrapperToken = await wkcsFactory.deploy()

    const wrapperFactory = await ethers.getContractFactory(
      'VRFV2Wrapper',
      owner,
    )
    wrapper = await wrapperFactory.deploy(
      wrapperToken.address,
      coordinator.address,
    )

    wrapper2 = await wrapperFactory.deploy(
      wrapperToken.address,
      coordinator2.address,
    )

    const consumerFactory = await ethers.getContractFactory(
      'VRFV2WrapperConsumerExample',
      consumerOwner,
    )
    consumer = await consumerFactory.deploy(
      wrapperToken.address,
      wrapper.address,
    )
    consumer2 = await consumerFactory.deploy(
      wrapperToken.address,
      wrapper2.address,
    )
    consumerWrongWrapperToken = await consumerFactory.deploy(
      wrongWrapperToken.address,
      wrapper.address,
    )
    consumerRevert = await consumerFactory.deploy(
      wrapperToken.address,
      wrapper.address,
    )

    const revertingConsumerFactory = await ethers.getContractFactory(
      'VRFV2WrapperRevertingConsumerExample',
      consumerOwner,
    )
    consumerRevert = await revertingConsumerFactory.deploy(
      wrapperToken.address,
      wrapper.address,
    )

    const outOfGasConsumerFactory = await ethers.getContractFactory(
      'VRFV2WrapperOutOfGasConsumerExample',
      consumerOwner,
    )
    consumerOutOfGas = await outOfGasConsumerFactory.deploy(
      wrapperToken.address,
      wrapper.address,
    )
  })

  const configure = async (): Promise<void> => {
    await expect(
      wrapper
        .connect(owner)
        .setConfig(
          wrapperGasOverhead,
          coordinatorGasOverhead,
          wrapperPremiumPercentage,
          toBytes32String('keyHash'),
          maxNumWords,
        ),
    ).to.not.be.reverted
  }

  const configure2 = async (): Promise<void> => {
    await expect(
      wrapper2
        .connect(owner)
        .setConfig(
          wrapperGasOverhead,
          coordinatorGasOverhead,
          wrapperPremiumPercentage,
          toBytes32String('keyHash'),
          maxNumWords,
        ),
    ).to.not.be.reverted
  }

  const fund = async (address: string, amount: BigNumber): Promise<void> => {
    await expect(
      wrapperToken.connect(owner).deposit({
        value: amount,
      }),
    ).to.not.be.reverted
    await expect(wrapperToken.connect(owner).transfer(address, amount)).to.not
      .be.reverted
  }

  const fundSub = async (): Promise<void> => {
    await expect(coordinator.connect(owner).fundSubscription(1, oneHundredWKCS))
      .to.not.be.reverted
  }

  const fundSub2 = async (): Promise<void> => {
    await expect(
      coordinator2.connect(owner).fundSubscription(1, oneHundredWKCS),
    ).to.not.be.reverted
  }

  describe('calculatePrice', async () => {
    // Note: This is a meta-test for the calculatePrice func above. It is then assumed correct for
    // the remainder of the tests
    it('can calculate price at 50 gwei, 100k limit', async () => {
      const result = calculatePrice(
        100_000,
        wrapperGasOverhead,
        coordinatorGasOverhead,
        fiftyGwei,
        weiPerUnitNative,
        wrapperPremiumPercentage,
        flatFee,
      )
      bigNumEquals(BigNumber.from('111660000000000000'), result)
    })

    it('can calculate price at 50 gwei, 200k limit', async () => {
      const result = calculatePrice(
        200_000,
        wrapperGasOverhead,
        coordinatorGasOverhead,
        fiftyGwei,
        weiPerUnitNative,
        wrapperPremiumPercentage,
        flatFee,
      )
      bigNumEquals(BigNumber.from('117160000000000000'), result)
    })

    it('can calculate price at 200 gwei, 100k limit', async () => {
      const result = calculatePrice(
        200_000,
        wrapperGasOverhead,
        coordinatorGasOverhead,
        oneHundredGwei,
        weiPerUnitNative,
        wrapperPremiumPercentage,
        flatFee,
      )
      bigNumEquals(BigNumber.from('134320000000000000'), result)
    })

    it('can calculate price at 200 gwei, 100k limit, 25% premium', async () => {
      const result = calculatePrice(
        200_000,
        wrapperGasOverhead,
        coordinatorGasOverhead,
        oneHundredGwei,
        weiPerUnitNative,
        25,
        flatFee,
      )
      bigNumEquals(BigNumber.from('139000000000000000'), result)
    })
  })

  describe('#setConfig/#getConfig', async () => {
    it('can be configured', async () => {
      await configure()

      const resp = await wrapper.connect(requester).getConfig()
      bigNumEquals(BigNumber.from('100000'), resp[0]) // fulfillmentFlatFeePPM
      bigNumEquals(wrapperGasOverhead, resp[1]) // wrapperGasOverhead
      bigNumEquals(coordinatorGasOverhead, resp[2]) // coordinatorGasOverhead
      bigNumEquals(wrapperPremiumPercentage, resp[3]) // wrapperPremiumPercentage
      assert.equal(resp[4], toBytes32String('keyHash')) // keyHash
      bigNumEquals(10, resp[5]) // maxNumWords
    })

    it('can be reconfigured', async () => {
      await configure()

      await expect(
        wrapper.connect(owner).setConfig(
          140_000, // wrapperGasOverhead
          195_000, // coordinatorGasOverhead
          9, // wrapperPremiumPercentage
          toBytes32String('keyHash2'), // keyHash
          9, // maxNumWords
        ),
      ).to.not.be.reverted

      const resp = await wrapper.connect(requester).getConfig()
      bigNumEquals(BigNumber.from('100000'), resp[0]) // fulfillmentFlatFeePPM
      bigNumEquals(140_000, resp[1]) // wrapperGasOverhead
      bigNumEquals(195_000, resp[2]) // coordinatorGasOverhead
      bigNumEquals(9, resp[3]) // wrapperPremiumPercentage
      assert.equal(resp[4], toBytes32String('keyHash2')) // keyHash
      bigNumEquals(9, resp[5]) // maxNumWords
    })

    it('cannot be configured by a non-owner', async () => {
      await expect(
        wrapper.connect(requester).setConfig(
          10_000, // wrapperGasOverhead
          10_000, // coordinatorGasOverhead
          10, // wrapperPremiumPercentage
          toBytes32String('keyHash'), // keyHash
          10, // maxNumWords
        ),
      ).to.be.reverted
    })
  })

  describe('#calculatePrice', async () => {
    it('cannot calculate price when not configured', async () => {
      await expect(wrapper.connect(requester).calculateRequestPrice(100_000)).to
        .be.reverted
    })
    it('can calculate price at 50 gwei, 100k gas', async () => {
      await configure()
      const expected = calculatePrice(
        100_000,
        wrapperGasOverhead,
        coordinatorGasOverhead,
        fiftyGwei,
        weiPerUnitNative,
        wrapperPremiumPercentage,
        flatFee,
      )
      const resp = await wrapper
        .connect(requester)
        .calculateRequestPrice(100_000, { gasPrice: fiftyGwei })
      bigNumEquals(expected, resp)
    })

    it('can calculate price at 100 gwei, 100k gas', async () => {
      await configure()
      const expected = calculatePrice(
        100_000,
        wrapperGasOverhead,
        coordinatorGasOverhead,
        oneHundredGwei,
        weiPerUnitNative,
        wrapperPremiumPercentage,
        flatFee,
      )
      const resp = await wrapper
        .connect(requester)
        .calculateRequestPrice(100_000, { gasPrice: oneHundredGwei })
      bigNumEquals(expected, resp)
    })

    it('can calculate price at 100 gwei, 200k gas', async () => {
      await configure()
      const expected = calculatePrice(
        200_000,
        wrapperGasOverhead,
        coordinatorGasOverhead,
        oneHundredGwei,
        weiPerUnitNative,
        wrapperPremiumPercentage,
        flatFee,
      )
      const resp = await wrapper
        .connect(requester)
        .calculateRequestPrice(200_000, { gasPrice: oneHundredGwei })
      bigNumEquals(expected, resp)
    })
  })

  describe('#estimatePrice', async () => {
    it('cannot estimate price when not configured', async () => {
      await expect(
        wrapper
          .connect(requester)
          .estimateRequestPrice(100_000, oneHundredGwei),
      ).to.be.reverted
    })
    it('can estimate price at 50 gwei, 100k gas', async () => {
      await configure()
      const expected = calculatePrice(
        100_000,
        wrapperGasOverhead,
        coordinatorGasOverhead,
        fiftyGwei,
        weiPerUnitNative,
        wrapperPremiumPercentage,
        flatFee,
      )
      const resp = await wrapper
        .connect(requester)
        .estimateRequestPrice(100_000, fiftyGwei)
      bigNumEquals(expected, resp)
    })

    it('can estimate price at 100 gwei, 100k gas', async () => {
      await configure()
      const expected = calculatePrice(
        100_000,
        wrapperGasOverhead,
        coordinatorGasOverhead,
        oneHundredGwei,
        weiPerUnitNative,
        wrapperPremiumPercentage,
        flatFee,
      )
      const resp = await wrapper
        .connect(requester)
        .estimateRequestPrice(100_000, oneHundredGwei)
      bigNumEquals(expected, resp)
    })

    it('can estimate price at 100 gwei, 200k gas', async () => {
      await configure()
      const expected = calculatePrice(
        200_000,
        wrapperGasOverhead,
        coordinatorGasOverhead,
        oneHundredGwei,
        weiPerUnitNative,
        wrapperPremiumPercentage,
        flatFee,
      )
      const resp = await wrapper
        .connect(requester)
        .estimateRequestPrice(200_000, oneHundredGwei)
      bigNumEquals(expected, resp)
    })
  })

  describe('#fulfillRandomWords', async () => {
    it('cannot request randomness when not configured', async () => {
      await expect(
        consumer.connect(consumerOwner).makeRequest(80_000, 3, 2, {
          gasPrice: oneHundredGwei,
          gasLimit: 1_000_000,
        }),
      ).to.be.reverted
    })

    it('can request and fulfill randomness', async () => {
      await configure()
      await fund(consumer.address, oneHundredWKCS)
      await fundSub()

      await expect(
        consumer.connect(consumerOwner).makeRequest(100_000, 3, 20, {
          gasPrice: oneHundredGwei,
          gasLimit: 1_000_000,
        }),
      ).to.be.revertedWith('numWords too high')

      await expect(
        consumer.connect(consumerOwner).makeRequest(100_000, 3, 1, {
          gasPrice: oneHundredGwei,
          gasLimit: 1_000_000,
        }),
      ).to.emit(coordinator, 'RandomWordsRequested')

      const price = calculatePrice(100_000)

      // Check that the wrapper has the paid amount
      bigNumEquals(price, await wrapperToken.balanceOf(wrapper.address))

      const { paid, fulfilled } = await consumer.s_requests(1 /* requestId */)
      bigNumEquals(price, paid)
      expect(fulfilled).to.be.false

      // fulfill the request
      await expect(
        coordinator
          .connect(owner)
          .fulfillRandomWordsWithOverride(2, wrapper.address, [123], {
            gasLimit: 1_000_000,
          }),
      ).to.be.revertedWith('nonexistent request')

      // fulfill the request
      await expect(
        coordinator
          .connect(owner)
          .fulfillRandomWordsWithOverride(1, wrapper.address, [123], {
            gasLimit: 1_000_000,
          }),
      )
        .to.emit(coordinator, 'RandomWordsFulfilled')
        .to.emit(consumer, 'WrappedRequestFulfilled')
        .withArgs(1, [123], BigNumber.from(price))

      const expectedBalance = price
      const diff = expectedBalance
        .sub(await wrapperToken.balanceOf(wrapper.address))
        .abs()
      expect(diff.lt(pointOneWKCS)).to.be.true
    })

    it('can request and fulfill randomness no payment', async () => {
      await configure2()
      await fund(consumer2.address, oneHundredWKCS)
      await fundSub2()

      await expect(
        consumer2.connect(consumerOwner).makeRequest(100_000, 3, 1, {
          gasPrice: oneHundredGwei,
          gasLimit: 1_000_000,
        }),
      ).to.emit(coordinator2, 'RandomWordsRequested')

      const price = calculatePrice(100_000)

      // Check that the wrapper has the paid amount
      assert.notEqual(price, await wrapperToken.balanceOf(wrapper2.address))

      const { paid, fulfilled } = await consumer2.s_requests(1 /* requestId */)
      bigNumEquals(price, paid)
      expect(fulfilled).to.be.false

      // fulfill the request
      await expect(
        coordinator2
          .connect(owner)
          .fulfillRandomWordsWithOverride(1, wrapper2.address, [123], {
            gasLimit: 1_000_000,
          }),
      )
        .to.emit(coordinator2, 'RandomWordsFulfilled')
        .to.emit(consumer2, 'WrappedRequestFulfilled')
        .withArgs(1, [123], BigNumber.from(price))

      const expectedBalance = price
      const diff = expectedBalance
        .sub(await wrapperToken.balanceOf(wrapper2.address))
        .abs()
      expect(diff.lt(pointOneWKCS)).to.be.false
    })

    it('does not revert if consumer runs out of gas', async () => {
      await configure()
      await fund(consumerOutOfGas.address, oneHundredWKCS)
      await fundSub()

      await expect(
        consumerOutOfGas.connect(consumerOwner).makeRequest(100_000, 3, 1, {
          gasPrice: oneHundredGwei,
          gasLimit: 1_000_000,
        }),
      ).to.emit(coordinator, 'RandomWordsRequested')

      const price = calculatePrice(100_000)

      // Check that the wrapper has the paid amount
      bigNumEquals(price, await wrapperToken.balanceOf(wrapper.address))

      // fulfill the request
      await expect(
        coordinator
          .connect(owner)
          .fulfillRandomWordsWithOverride(1, wrapper.address, [123], {
            gasLimit: 1_000_000,
          }),
      )
        .to.emit(coordinator, 'RandomWordsFulfilled')
        .to.emit(wrapper, 'WrapperFulfillmentFailed')
    })

    it('does not revert if consumer reverts', async () => {
      await configure()
      await fund(consumerRevert.address, oneHundredWKCS)
      await fundSub()

      await expect(
        consumerRevert.connect(consumerOwner).makeRequest(100_000, 3, 1, {
          gasPrice: oneHundredGwei,
          gasLimit: 1_000_000,
        }),
      ).to.emit(coordinator, 'RandomWordsRequested')

      const price = calculatePrice(100_000)

      // Check that the wrapper has the paid amount
      bigNumEquals(price, await wrapperToken.balanceOf(wrapper.address))

      // fulfill the request
      await expect(
        coordinator
          .connect(owner)
          .fulfillRandomWordsWithOverride(1, wrapper.address, [123]),
      )
        .to.emit(coordinator, 'RandomWordsFulfilled')
        .to.emit(wrapper, 'WrapperFulfillmentFailed')

      const expectedBalance = price
      const diff = expectedBalance
        .sub(await wrapperToken.balanceOf(wrapper.address))
        .abs()

      expect(diff.lt(pointOneWKCS)).to.be.true
    })
  })

  describe('#disable/#enable', async () => {
    it('can only calculate price when enabled', async () => {
      await configure()
      await expect(wrapper.connect(requester).disable()).to.be.revertedWith(
        'Only callable by owner',
      )
      await expect(wrapper.connect(owner).disable()).to.not.be.reverted
      await expect(
        wrapper.connect(consumerOwner).calculateRequestPrice(100_000, {
          gasPrice: oneHundredGwei,
          gasLimit: 1_000_000,
        }),
      ).to.be.reverted
      await expect(wrapper.connect(requester).enable()).to.be.revertedWith(
        'Only callable by owner',
      )
      await expect(wrapper.connect(owner).enable()).to.not.be.reverted
      await expect(
        wrapper.connect(consumerOwner).calculateRequestPrice(100_000, {
          gasPrice: oneHundredGwei,
          gasLimit: 1_000_000,
        }),
      ).to.not.be.reverted
    })

    it('can only estimate price when enabled', async () => {
      await configure()

      await expect(wrapper.connect(owner).disable()).to.not.be.reverted
      await expect(
        wrapper
          .connect(consumerOwner)
          .estimateRequestPrice(100_000, oneHundredGwei),
      ).to.be.reverted

      await expect(wrapper.connect(owner).enable()).to.not.be.reverted
      await expect(
        wrapper
          .connect(consumerOwner)
          .estimateRequestPrice(100_000, oneHundredGwei),
      ).to.not.be.reverted
    })

    it('can be configured while disabled', async () => {
      await expect(wrapper.connect(owner).disable()).to.not.be.reverted
      await configure()
    })

    it('can only request randomness when enabled', async () => {
      await configure()
      await fund(consumer.address, oneHundredWKCS)
      await fundSub()

      await expect(wrapper.connect(owner).disable()).to.not.be.reverted
      await expect(
        consumer.connect(consumerOwner).makeRequest(100_000, 3, 1, {
          gasPrice: oneHundredGwei,
          gasLimit: 1_000_000,
        }),
      ).to.be.reverted

      await expect(wrapper.connect(owner).enable()).to.not.be.reverted
      await expect(
        consumer.connect(consumerOwner).makeRequest(100_000, 3, 1, {
          gasPrice: oneHundredGwei,
          gasLimit: 1_000_000,
        }),
      ).to.not.be.reverted
    })

    it('can fulfill randomness when disabled', async () => {
      await configure()
      await fund(consumer.address, oneHundredWKCS)
      await fundSub()

      await expect(
        consumer.connect(consumerOwner).makeRequest(100_000, 3, 1, {
          gasPrice: oneHundredGwei,
          gasLimit: 1_000_000,
        }),
      ).to.not.be.reverted
      await expect(wrapper.connect(owner).disable()).to.not.be.reverted

      await expect(
        coordinator
          .connect(owner)
          .fulfillRandomWordsWithOverride(1, wrapper.address, [123], {
            gasLimit: 1_000_000,
          }),
      )
        .to.emit(coordinator, 'RandomWordsFulfilled')
        .to.emit(consumer, 'WrappedRequestFulfilled')
    })
  })

  describe('#withdraw', async () => {
    it('can withdraw funds to the owner', async () => {
      await configure()
      await fund(wrapper.address, oneHundredWKCS)
      const recipientAddress = await withdrawRecipient.getAddress()

      // Withdraw half the funds
      await expect(
        wrapper
          .connect(owner)
          .withdraw(recipientAddress, oneHundredWKCS.div(2)),
      ).to.not.be.reverted
      bigNumEquals(
        oneHundredWKCS.div(2),
        await wrapperToken.balanceOf(recipientAddress),
      )
      bigNumEquals(
        oneHundredWKCS.div(2),
        await wrapperToken.balanceOf(wrapper.address),
      )

      // Withdraw the rest
      await expect(
        wrapper
          .connect(owner)
          .withdraw(recipientAddress, oneHundredWKCS.div(2)),
      ).to.not.be.reverted
      bigNumEquals(
        oneHundredWKCS,
        await wrapperToken.balanceOf(recipientAddress),
      )
      bigNumEquals(0, await wrapperToken.balanceOf(wrapper.address))
    })

    it('cannot withdraw funds to non owners', async () => {
      await configure()
      await fund(wrapper.address, oneHundredWKCS)
      const recipientAddress = await withdrawRecipient.getAddress()

      await expect(
        wrapper
          .connect(consumerOwner)
          .withdraw(recipientAddress, oneHundredWKCS.div(2)),
      ).to.be.reverted
    })
  })
})
