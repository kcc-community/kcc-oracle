import { ethers } from 'hardhat'
import { Signer, Contract, BigNumber } from 'ethers'
import { assert, expect } from 'chai'
import { publicAbi } from '../test-helpers/helpers'
import { randomAddressString } from 'hardhat/internal/hardhat-network/provider/utils/random'

describe('VRFCoordinatorV2', () => {
  let vrfCoordinatorV2: Contract
  let vrfCoordinatorV2TestHelper: Contract
  let wrapperNativeToken: Contract
  let otherToken: Contract
  let blockHashStore: Contract
  let owner: Signer
  let subOwner: Signer
  let subOwnerAddress: string
  let consumer: Signer
  let random: Signer
  let randomAddress: string
  let oracle: Signer
  const typeAndVersion = 'VRFCoordinatorV2 1.0.0'
  type config = {
    minimumRequestBlockConfirmations: number
    maxGasLimit: number
    gasAfterPaymentCalculation: number
    paymentEnabled: boolean
    fulfillmentFlatFeePPM: number
  }
  let c: config

  beforeEach(async () => {
    const accounts = await ethers.getSigners()
    owner = accounts[0]
    subOwner = accounts[1]
    subOwnerAddress = await subOwner.getAddress()
    consumer = accounts[2]
    random = accounts[3]
    randomAddress = await random.getAddress()
    oracle = accounts[4]
    const ltFactory = await ethers.getContractFactory(
      'contracts/v0.4/WKCS.sol:WKCS',
      accounts[0],
    )
    wrapperNativeToken = await ltFactory.deploy()
    otherToken = await ltFactory.deploy()
    const bhFactory = await ethers.getContractFactory(
      'contracts/v0.8/BlockhashStore.sol:BlockhashStore',
      accounts[0],
    )
    blockHashStore = await bhFactory.deploy(await owner.getAddress())
    const vrfCoordinatorV2Factory = await ethers.getContractFactory(
      'contracts/v0.8/VRFCoordinatorV2.sol:VRFCoordinatorV2',
      accounts[0],
    )
    vrfCoordinatorV2 = await vrfCoordinatorV2Factory.deploy(
      wrapperNativeToken.address,
      blockHashStore.address,
    )
    const vrfCoordinatorV2TestHelperFactory = await ethers.getContractFactory(
      'contracts/v0.8/tests/VRFCoordinatorV2TestHelper.sol:VRFCoordinatorV2TestHelper',
      accounts[0],
    )
    vrfCoordinatorV2TestHelper = await vrfCoordinatorV2TestHelperFactory.deploy(
      wrapperNativeToken.address,
      blockHashStore.address,
    )
    await wrapperNativeToken.deposit({ value: ethers.utils.parseEther('2') })
    await wrapperNativeToken.transfer(
      subOwnerAddress,
      BigNumber.from('1000000000000000000'),
    ) // 1 wrapperNative
    await wrapperNativeToken.transfer(
      randomAddress,
      BigNumber.from('1000000000000000000'),
    ) // 1 wrapperNative
    c = {
      minimumRequestBlockConfirmations: 3,
      maxGasLimit: 1000000,
      gasAfterPaymentCalculation:
        21000 + 5000 + 2100 + 20000 + 2 * 2100 - 15000 + 7315,
      paymentEnabled: true,
      fulfillmentFlatFeePPM: 0,
    }
    // Note if you try and use an object, ethers
    // confuses that with an override object and will error.
    // It appears that only arrays work for struct args.
    await vrfCoordinatorV2
      .connect(owner)
      .setConfig(
        c.minimumRequestBlockConfirmations,
        c.maxGasLimit,
        c.gasAfterPaymentCalculation,
        c.paymentEnabled,
        c.fulfillmentFlatFeePPM,
      )

    assert.equal(typeAndVersion, await vrfCoordinatorV2.typeAndVersion())
  })

  it('has a limited public interface [ @skip-coverage ]', async () => {
    publicAbi(vrfCoordinatorV2, [
      // Public constants
      'MIN_NUM_WORDS',
      'MAX_CONSUMERS',
      'MAX_NUM_WORDS',
      'MAX_REQUEST_CONFIRMATIONS',
      // Owner
      'acceptOwnership',
      'transferOwnership',
      'owner',
      'getConfig',
      'getCurrentSubId',
      'setConfig',
      'getRequestConfig',
      'recoverFunds',
      'ownerCancelSubscription',
      'pendingRequestExists',
      'getTotalBalance',
      // Oracle
      'requestRandomWords',
      'getCommitment', // Note we use this to check if a request is already fulfilled.
      'hashOfKey',
      'fulfillRandomWords',
      'registerProvingKey',
      'deregisterProvingKey',
      'oracleWithdraw',
      'getOracleWithdrawableTokens',
      // Subscription management
      'fundSubscriptionNative',
      'fundSubscription',
      'createSubscription',
      'addConsumer',
      'removeConsumer',
      'getSubscription',
      'cancelSubscription',
      'recoverWrongToken',
      'requestSubscriptionOwnerTransfer',
      'acceptSubscriptionOwnerTransfer',
      // Misc
      'typeAndVersion',
      'BLOCKHASH_STORE',
      'WRAPPER_TOKEN',
    ])
  })

  describe('#setConfig', async function () {
    it('only owner can set', async function () {
      await expect(
        vrfCoordinatorV2
          .connect(subOwner)
          .setConfig(
            c.minimumRequestBlockConfirmations,
            c.maxGasLimit,
            c.gasAfterPaymentCalculation,
            c.paymentEnabled,
            c.fulfillmentFlatFeePPM,
          ),
      ).to.be.revertedWith('Only callable by owner')
      // Anyone can read the config.
      const resp = await vrfCoordinatorV2.connect(random).getConfig()
      assert(resp[0] == c.minimumRequestBlockConfirmations)
      assert(resp[1] == c.maxGasLimit)
      assert(resp[2].toString() == c.gasAfterPaymentCalculation.toString())
    })

    it('max req confs', async function () {
      await expect(
        vrfCoordinatorV2
          .connect(owner)
          .setConfig(
            201,
            c.maxGasLimit,
            c.gasAfterPaymentCalculation,
            c.paymentEnabled,
            c.fulfillmentFlatFeePPM,
          ),
      ).to.be.revertedWith('InvalidRequestConfirmations(201, 201, 200)')
    })
  })

  async function createSubscription(): Promise<number> {
    // let consumers: string[] = [await consumer.getAddress()];
    const tx = await vrfCoordinatorV2.connect(subOwner).createSubscription()
    const receipt = await tx.wait()
    const subId = receipt.events[0].args['subId']
    await vrfCoordinatorV2
      .connect(subOwner)
      .addConsumer(subId, await consumer.getAddress())
    return subId
  }

  async function createSubscriptionWithConsumers(
    consumers: string[],
  ): Promise<number> {
    const tx = await vrfCoordinatorV2.connect(subOwner).createSubscription()
    const receipt = await tx.wait()
    const subId = receipt.events[0].args['subId']
    for (let i = 0; i < consumers.length; i++) {
      await vrfCoordinatorV2.connect(subOwner).addConsumer(subId, consumers[i])
    }
    return subId
  }

  describe('#createSubscription', async function () {
    it('can create a subscription', async function () {
      await expect(vrfCoordinatorV2.connect(subOwner).createSubscription())
        .to.emit(vrfCoordinatorV2, 'SubscriptionCreated')
        .withArgs(1, subOwnerAddress)
      const s_currentSubId = await vrfCoordinatorV2.getCurrentSubId()
      assert(s_currentSubId == 1)
      const s = await vrfCoordinatorV2.getSubscription(1)
      assert(s.balance.toString() == '0', 'invalid balance')
      assert(s.owner == subOwnerAddress, 'invalid address')
    })
    it('subscription id increments', async function () {
      await expect(vrfCoordinatorV2.connect(subOwner).createSubscription())
        .to.emit(vrfCoordinatorV2, 'SubscriptionCreated')
        .withArgs(1, subOwnerAddress)
      await expect(vrfCoordinatorV2.connect(subOwner).createSubscription())
        .to.emit(vrfCoordinatorV2, 'SubscriptionCreated')
        .withArgs(2, subOwnerAddress)
    })
    it('cannot create more than the max', async function () {
      const subId = createSubscriptionWithConsumers([])
      for (let i = 0; i < 100; i++) {
        await vrfCoordinatorV2
          .connect(subOwner)
          .addConsumer(subId, randomAddressString())
      }
      await expect(
        vrfCoordinatorV2
          .connect(subOwner)
          .addConsumer(subId, randomAddressString()),
      ).to.be.revertedWith(`TooManyConsumers()`)
    })
  })

  describe('#requestSubscriptionOwnerTransfer', async function () {
    let subId: number
    beforeEach(async () => {
      subId = await createSubscription()
    })
    it('rejects non-owner', async function () {
      await expect(
        vrfCoordinatorV2
          .connect(random)
          .requestSubscriptionOwnerTransfer(subId, randomAddress),
      ).to.be.revertedWith(`MustBeSubOwner("${subOwnerAddress}")`)
    })
    it('owner can request transfer', async function () {
      await expect(
        vrfCoordinatorV2
          .connect(subOwner)
          .requestSubscriptionOwnerTransfer(subId, randomAddress),
      )
        .to.emit(vrfCoordinatorV2, 'SubscriptionOwnerTransferRequested')
        .withArgs(subId, subOwnerAddress, randomAddress)
      // Same request is a noop
      await expect(
        vrfCoordinatorV2
          .connect(subOwner)
          .requestSubscriptionOwnerTransfer(subId, randomAddress),
      ).to.not.emit(vrfCoordinatorV2, 'SubscriptionOwnerTransferRequested')
    })
  })

  describe('#acceptSubscriptionOwnerTransfer', async function () {
    let subId: number
    beforeEach(async () => {
      subId = await createSubscription()
    })
    it('subscription must exist', async function () {
      await expect(
        vrfCoordinatorV2
          .connect(subOwner)
          .acceptSubscriptionOwnerTransfer(1203123123),
      ).to.be.revertedWith(`InvalidSubscription`)
    })
    it('must be requested owner to accept', async function () {
      await expect(
        vrfCoordinatorV2
          .connect(subOwner)
          .requestSubscriptionOwnerTransfer(subId, randomAddress),
      )
      await expect(
        vrfCoordinatorV2
          .connect(subOwner)
          .acceptSubscriptionOwnerTransfer(subId),
      ).to.be.revertedWith(`MustBeRequestedOwner("${randomAddress}")`)
    })
    it('requested owner can accept', async function () {
      await expect(
        vrfCoordinatorV2
          .connect(subOwner)
          .requestSubscriptionOwnerTransfer(subId, randomAddress),
      )
        .to.emit(vrfCoordinatorV2, 'SubscriptionOwnerTransferRequested')
        .withArgs(subId, subOwnerAddress, randomAddress)
      await expect(
        vrfCoordinatorV2.connect(random).acceptSubscriptionOwnerTransfer(subId),
      )
        .to.emit(vrfCoordinatorV2, 'SubscriptionOwnerTransferred')
        .withArgs(subId, subOwnerAddress, randomAddress)
    })
  })

  describe('#addConsumer', async function () {
    let subId: number
    beforeEach(async () => {
      subId = await createSubscription()
    })
    it('subscription must exist', async function () {
      await expect(
        vrfCoordinatorV2
          .connect(subOwner)
          .addConsumer(1203123123, randomAddress),
      ).to.be.revertedWith(`InvalidSubscription`)
    })
    it('must be owner', async function () {
      await expect(
        vrfCoordinatorV2.connect(random).addConsumer(subId, randomAddress),
      ).to.be.revertedWith(`MustBeSubOwner("${subOwnerAddress}")`)
    })
    it('add is idempotent', async function () {
      await vrfCoordinatorV2.connect(subOwner).addConsumer(subId, randomAddress)
      await vrfCoordinatorV2.connect(subOwner).addConsumer(subId, randomAddress)
    })
    it('cannot add more than maximum', async function () {
      // There is one consumer, add another 99 to hit the max
      for (let i = 0; i < 99; i++) {
        await vrfCoordinatorV2
          .connect(subOwner)
          .addConsumer(subId, randomAddressString())
      }
      // Adding one more should fail
      // await vrfCoordinatorV2.connect(subOwner).addConsumer(subId, randomAddress);
      await expect(
        vrfCoordinatorV2.connect(subOwner).addConsumer(subId, randomAddress),
      ).to.be.revertedWith(`TooManyConsumers()`)
      // Same is true if we first create with the maximum
      const consumers: string[] = []
      for (let i = 0; i < 100; i++) {
        consumers.push(randomAddressString())
      }
      subId = await createSubscriptionWithConsumers(consumers)
      await expect(
        vrfCoordinatorV2.connect(subOwner).addConsumer(subId, randomAddress),
      ).to.be.revertedWith(`TooManyConsumers()`)
    })
    it('owner can update', async function () {
      await expect(
        vrfCoordinatorV2.connect(subOwner).addConsumer(subId, randomAddress),
      )
        .to.emit(vrfCoordinatorV2, 'SubscriptionConsumerAdded')
        .withArgs(subId, randomAddress)
    })
  })

  describe('#removeConsumer', async function () {
    let subId: number
    beforeEach(async () => {
      subId = await createSubscription()
    })
    it('subscription must exist', async function () {
      await expect(
        vrfCoordinatorV2
          .connect(subOwner)
          .removeConsumer(1203123123, randomAddress),
      ).to.be.revertedWith(`InvalidSubscription`)
    })
    it('must be owner', async function () {
      await expect(
        vrfCoordinatorV2.connect(random).removeConsumer(subId, randomAddress),
      ).to.be.revertedWith(`MustBeSubOwner("${subOwnerAddress}")`)
    })
    it('owner can update', async function () {
      const subBefore = await vrfCoordinatorV2.getSubscription(subId)
      await vrfCoordinatorV2.connect(subOwner).addConsumer(subId, randomAddress)
      await expect(
        vrfCoordinatorV2.connect(subOwner).removeConsumer(subId, randomAddress),
      )
        .to.emit(vrfCoordinatorV2, 'SubscriptionConsumerRemoved')
        .withArgs(subId, randomAddress)
      const subAfter = await vrfCoordinatorV2.getSubscription(subId)
      // Subscription should NOT contain the removed consumer
      assert.deepEqual(subBefore.consumers, subAfter.consumers)
    })
    it('can remove all consumers', async function () {
      // Testing the handling of zero.
      await vrfCoordinatorV2.connect(subOwner).addConsumer(subId, randomAddress)
      await vrfCoordinatorV2
        .connect(subOwner)
        .removeConsumer(subId, randomAddress)
      await vrfCoordinatorV2
        .connect(subOwner)
        .removeConsumer(subId, await consumer.getAddress())
      // Should be empty
      const subAfter = await vrfCoordinatorV2.getSubscription(subId)
      assert.deepEqual(subAfter.consumers, [])
    })
  })

  describe('#cancelSubscription', async function () {
    let subId: number
    beforeEach(async () => {
      subId = await createSubscription()
    })
    it('subscription must exist', async function () {
      await expect(
        vrfCoordinatorV2
          .connect(subOwner)
          .cancelSubscription(1203123123, subOwnerAddress),
      ).to.be.revertedWith(`InvalidSubscription`)
    })
    it('must be owner', async function () {
      await expect(
        vrfCoordinatorV2
          .connect(random)
          .cancelSubscription(subId, subOwnerAddress),
      ).to.be.revertedWith(`MustBeSubOwner("${subOwnerAddress}")`)
    })
    it('can cancel', async function () {
      await vrfCoordinatorV2
        .connect(subOwner)
        .fundSubscriptionNative(subId, { value: BigNumber.from('1000') })
      await expect(
        vrfCoordinatorV2
          .connect(subOwner)
          .cancelSubscription(subId, randomAddress),
      )
        .to.emit(vrfCoordinatorV2, 'SubscriptionCanceled')
        .withArgs(subId, randomAddress, BigNumber.from('1000'))
      const randomBalance = await wrapperNativeToken.balanceOf(randomAddress)
      assert.equal(randomBalance.toString(), '1000000000000001000')
      await expect(
        vrfCoordinatorV2.connect(subOwner).getSubscription(subId),
      ).to.be.revertedWith('InvalidSubscription')
    })
    it('can add same consumer after canceling', async function () {
      await vrfCoordinatorV2
        .connect(subOwner)
        .fundSubscriptionNative(subId, { value: BigNumber.from('1000') })
      await vrfCoordinatorV2.connect(subOwner).addConsumer(subId, randomAddress)
      await vrfCoordinatorV2
        .connect(subOwner)
        .cancelSubscription(subId, randomAddress)
      subId = await createSubscription()
      // The cancel should have removed this consumer, so we can add it again.
      await vrfCoordinatorV2.connect(subOwner).addConsumer(subId, randomAddress)
    })
    it('cannot cancel with pending req', async function () {
      await vrfCoordinatorV2
        .connect(subOwner)
        .fundSubscriptionNative(subId, { value: BigNumber.from('1000') })
      await vrfCoordinatorV2.connect(subOwner).addConsumer(subId, randomAddress)
      const testKey = [BigNumber.from('1'), BigNumber.from('2')]
      await vrfCoordinatorV2.registerProvingKey(subOwnerAddress, testKey)
      await vrfCoordinatorV2.connect(owner).reg
      const kh = await vrfCoordinatorV2.hashOfKey(testKey)
      await vrfCoordinatorV2.connect(consumer).requestRandomWords(
        kh, // keyhash
        subId, // subId
        3, // minReqConf
        1000000, // callbackGasLimit
        1, // numWords
      )
      // Should revert with outstanding requests
      await expect(
        vrfCoordinatorV2
          .connect(subOwner)
          .cancelSubscription(subId, randomAddress),
      ).to.be.revertedWith('PendingRequestExists()')
      // However the owner is able to cancel
      // funds go to the sub owner.

      await expect(
        vrfCoordinatorV2.connect(owner).ownerCancelSubscription(9999),
      ).to.be.revertedWith('InvalidSubscription()')

      await expect(
        vrfCoordinatorV2.connect(owner).ownerCancelSubscription(subId),
      )
        .to.emit(vrfCoordinatorV2, 'SubscriptionCanceled')
        .withArgs(subId, subOwnerAddress, BigNumber.from('1000'))
    })
  })

  describe('#recoverFunds', async function () {
    let subId: number
    beforeEach(async () => {
      subId = await createSubscription()
    })

    // Note we can't test the oracleWithdraw without fulfilling a request, so leave
    // that coverage to the go tests.
    it('function that should change internal balance do', async function () {
      type bf = [() => Promise<any>, BigNumber]
      const balanceChangingFns: Array<bf> = [
        [
          async function () {
            await vrfCoordinatorV2
              .connect(subOwner)
              .fundSubscriptionNative(subId, { value: BigNumber.from('1000') })
          },
          BigNumber.from('1000'),
        ],
        [
          async function () {
            await vrfCoordinatorV2
              .connect(subOwner)
              .cancelSubscription(subId, randomAddress)
          },
          BigNumber.from('-1000'),
        ],
      ]
      for (const [fn, expectedBalanceChange] of balanceChangingFns) {
        const startingBalance = await vrfCoordinatorV2.getTotalBalance()
        await fn()
        const endingBalance = await vrfCoordinatorV2.getTotalBalance()
        assert(
          endingBalance.sub(startingBalance).toString() ==
            expectedBalanceChange.toString(),
        )
      }
    })
    it('only owner can recover', async function () {
      await expect(
        vrfCoordinatorV2.connect(subOwner).recoverFunds(randomAddress),
      ).to.be.revertedWith(`Only callable by owner`)
    })

    it('owner can recover wrapperNative transferred', async function () {
      // Set the internal balance
      assert(BigNumber.from('0'), wrapperNativeToken.balanceOf(randomAddress))
      await vrfCoordinatorV2
        .connect(subOwner)
        .fundSubscriptionNative(subId, { value: BigNumber.from('1000') })
      // Circumvent internal balance
      await wrapperNativeToken
        .connect(subOwner)
        .transfer(vrfCoordinatorV2.address, BigNumber.from('1000'))
      // Should recover this 1000
      await expect(vrfCoordinatorV2.connect(owner).recoverFunds(randomAddress))
        .to.emit(vrfCoordinatorV2, 'FundsRecovered')
        .withArgs(randomAddress, BigNumber.from('1000'))
      assert(
        BigNumber.from('1000'),
        wrapperNativeToken.balanceOf(randomAddress),
      )
    })
  })

  it('subscription lifecycle', async function () {
    // Create subscription.
    const tx = await vrfCoordinatorV2.connect(subOwner).createSubscription()
    const receipt = await tx.wait()
    assert(receipt.events[0].event == 'SubscriptionCreated')
    assert(receipt.events[0].args['owner'] == subOwnerAddress, 'sub owner')
    const subId = receipt.events[0].args['subId']
    await vrfCoordinatorV2
      .connect(subOwner)
      .addConsumer(subId, await consumer.getAddress())

    // Fund the subscription
    await expect(
      await vrfCoordinatorV2.connect(subOwner).fundSubscriptionNative(subId, {
        value: BigNumber.from('1000000000000000000'),
      }),
    )
      .to.emit(vrfCoordinatorV2, 'SubscriptionFunded')
      .withArgs(subId, BigNumber.from(0), BigNumber.from('1000000000000000000'))

    // Non-owners cannot change the consumers
    await expect(
      vrfCoordinatorV2.connect(random).addConsumer(subId, randomAddress),
    ).to.be.revertedWith(`MustBeSubOwner("${subOwnerAddress}")`)
    await expect(
      vrfCoordinatorV2.connect(random).removeConsumer(subId, randomAddress),
    ).to.be.revertedWith(`MustBeSubOwner("${subOwnerAddress}")`)

    // Non-owners cannot ask to transfer ownership
    await expect(
      vrfCoordinatorV2
        .connect(random)
        .requestSubscriptionOwnerTransfer(subId, randomAddress),
    ).to.be.revertedWith(`MustBeSubOwner("${subOwnerAddress}")`)

    // Owners can request ownership transfership
    await expect(
      vrfCoordinatorV2
        .connect(subOwner)
        .requestSubscriptionOwnerTransfer(subId, randomAddress),
    )
      .to.emit(vrfCoordinatorV2, 'SubscriptionOwnerTransferRequested')
      .withArgs(subId, subOwnerAddress, randomAddress)

    // Non-requested owners cannot accept
    await expect(
      vrfCoordinatorV2.connect(subOwner).acceptSubscriptionOwnerTransfer(subId),
    ).to.be.revertedWith(`MustBeRequestedOwner("${randomAddress}")`)

    // Requested owners can accept
    await expect(
      vrfCoordinatorV2.connect(random).acceptSubscriptionOwnerTransfer(subId),
    )
      .to.emit(vrfCoordinatorV2, 'SubscriptionOwnerTransferred')
      .withArgs(subId, subOwnerAddress, randomAddress)

    // Transfer it back to subOwner
    vrfCoordinatorV2
      .connect(random)
      .requestSubscriptionOwnerTransfer(subId, subOwnerAddress)
    vrfCoordinatorV2.connect(subOwner).acceptSubscriptionOwnerTransfer(subId)

    // Non-owners cannot cancel
    await expect(
      vrfCoordinatorV2.connect(random).cancelSubscription(subId, randomAddress),
    ).to.be.revertedWith(`MustBeSubOwner("${subOwnerAddress}")`)

    await expect(
      vrfCoordinatorV2
        .connect(subOwner)
        .cancelSubscription(subId, randomAddress),
    )
      .to.emit(vrfCoordinatorV2, 'SubscriptionCanceled')
      .withArgs(subId, randomAddress, BigNumber.from('1000000000000000000'))
    const random2Balance = await wrapperNativeToken.balanceOf(randomAddress)
    assert.equal(random2Balance.toString(), '2000000000000000000')
  })

  describe('#requestRandomWords', async function () {
    let subId: number
    let kh: string
    beforeEach(async () => {
      subId = await createSubscription()
      const testKey = [BigNumber.from('1'), BigNumber.from('2')]
      kh = await vrfCoordinatorV2.hashOfKey(testKey)
    })
    it('invalid subId', async function () {
      await expect(
        vrfCoordinatorV2.connect(random).requestRandomWords(
          kh, // keyhash
          12301928312, // subId
          1, // minReqConf
          1000, // callbackGasLimit
          1, // numWords
        ),
      ).to.be.revertedWith(`InvalidSubscription()`)
    })
    it('invalid consumer', async function () {
      await expect(
        vrfCoordinatorV2.connect(random).requestRandomWords(
          kh, // keyhash
          subId, // subId
          1, // minReqConf
          1000, // callbackGasLimit
          1, // numWords
        ),
      ).to.be.revertedWith(
        `InvalidConsumer(${subId}, "${randomAddress.toString()}")`,
      )
    })
    it('invalid req confs', async function () {
      await expect(
        vrfCoordinatorV2.connect(consumer).requestRandomWords(
          kh, // keyhash
          subId, // subId
          0, // minReqConf
          1000, // callbackGasLimit
          1, // numWords
        ),
      ).to.be.revertedWith(`InvalidRequestConfirmations(0, 3, 200)`)

      await expect(
        vrfCoordinatorV2.connect(consumer).requestRandomWords(
          kh, // keyhash
          subId, // subId
          3, // minReqConf
          1000, // callbackGasLimit
          600, // numWords > MIN_NUM_WORDS
        ),
      ).to.be.revertedWith(`InvalidNumWords(600, 1, 500)`)
      await expect(
        vrfCoordinatorV2.connect(consumer).requestRandomWords(
          kh, // keyhash
          subId, // subId
          3, // minReqConf
          1000, // callbackGasLimit
          0, // numWords < MIN_NUM_WORDS
        ),
      ).to.be.revertedWith(`InvalidNumWords(0, 1, 500)`)
    })
    it('gas limit too high', async function () {
      await vrfCoordinatorV2.connect(subOwner).fundSubscriptionNative(subId, {
        value: BigNumber.from('1000000000000000000'),
      })
      await expect(
        vrfCoordinatorV2.connect(consumer).requestRandomWords(
          kh, // keyhash
          subId, // subId
          3, // minReqConf
          1000001, // callbackGasLimit
          1, // numWords
        ),
      ).to.be.revertedWith(`GasLimitTooBig(1000001, 1000000)`)
    })
    it('nonce increments', async function () {
      await vrfCoordinatorV2.connect(subOwner).fundSubscriptionNative(subId, {
        value: BigNumber.from('1000000000000000000'),
      })
      const r1 = await vrfCoordinatorV2.connect(consumer).requestRandomWords(
        kh, // keyhash
        subId, // subId
        3, // minReqConf
        1000000, // callbackGasLimit
        1, // numWords
      )
      const r1Receipt = await r1.wait()
      const seed1 = r1Receipt.events[0].args['requestId']
      const commitment = await vrfCoordinatorV2.getCommitment(seed1)
      assert(commitment != ethers.utils.formatBytes32String(''))

      const r2 = await vrfCoordinatorV2.connect(consumer).requestRandomWords(
        kh, // keyhash
        subId, // subId
        3, // minReqConf
        1000000, // callbackGasLimit
        1, // numWords
      )
      const r2Receipt = await r2.wait()
      const seed2 = r2Receipt.events[0].args['requestId']
      // const isPendingRequestExists=await vrfCoordinatorV2.pendingRequestExists(subId)
      // assert.equal(isPendingRequestExists,true)
      assert(seed2 != seed1)
    })
    it('emits correct log', async function () {
      await vrfCoordinatorV2.connect(subOwner).fundSubscriptionNative(subId, {
        value: BigNumber.from('1000000000000000000'),
      })
      const reqTx = await vrfCoordinatorV2.connect(consumer).requestRandomWords(
        kh, // keyhash
        subId, // subId
        3, // minReqConf
        1000, // callbackGasLimit
        1, // numWords
      )
      const reqReceipt = await reqTx.wait()
      assert(reqReceipt.events.length == 1)
      const reqEvent = reqReceipt.events[0]
      assert(reqEvent.event == 'RandomWordsRequested', 'wrong event name')
      assert(
        reqEvent.args['keyHash'] == kh,
        `wrong kh ${reqEvent.args['keyHash']} ${kh}`,
      )
      assert(
        reqEvent.args['subId'].toString() == subId.toString(),
        'wrong subId',
      )
      assert(
        reqEvent.args['minimumRequestConfirmations'].toString() ==
          BigNumber.from(3).toString(),
        'wrong minRequestConf',
      )
      assert(
        reqEvent.args['callbackGasLimit'] == 1000,
        'wrong callbackGasLimit',
      )
      assert(reqEvent.args['numWords'] == 1, 'wrong numWords')
      assert(
        reqEvent.args['sender'] == (await consumer.getAddress()),
        'wrong sender address',
      )
    })
    it('set paymentEnabled to false', async function () {
      await vrfCoordinatorV2
        .connect(owner)
        .setConfig(
          c.minimumRequestBlockConfirmations,
          c.maxGasLimit,
          c.gasAfterPaymentCalculation,
          false,
          c.fulfillmentFlatFeePPM,
        )
      await vrfCoordinatorV2.connect(subOwner).fundSubscriptionNative(subId, {
        value: BigNumber.from('1000000000000000000'),
      })
      const reqTx = await vrfCoordinatorV2.connect(consumer).requestRandomWords(
        kh, // keyhash
        subId, // subId
        3, // minReqConf
        1000, // callbackGasLimit
        1, // numWords
      )
      const reqReceipt = await reqTx.wait()
      assert(reqReceipt.events.length == 1)
      const reqEvent = reqReceipt.events[0]
      assert(reqEvent.event == 'RandomWordsRequested', 'wrong event name')
      assert(
        reqEvent.args['keyHash'] == kh,
        `wrong kh ${reqEvent.args['keyHash']} ${kh}`,
      )
      assert(
        reqEvent.args['subId'].toString() == subId.toString(),
        'wrong subId',
      )
      assert(
        reqEvent.args['minimumRequestConfirmations'].toString() ==
          BigNumber.from(3).toString(),
        'wrong minRequestConf',
      )
      assert(
        reqEvent.args['callbackGasLimit'] == 1000,
        'wrong callbackGasLimit',
      )
      assert(reqEvent.args['numWords'] == 1, 'wrong numWords')
      assert(
        reqEvent.args['sender'] == (await consumer.getAddress()),
        'wrong sender address',
      )
      const subAfter = await vrfCoordinatorV2.getSubscription(subId)
      assert(
        BigNumber.from('1000000000000000000').eq(
          BigNumber.from(subAfter.balance),
        ),
        'wrong balance',
      )
    })
    it('add/remove consumer invariant', async function () {
      await vrfCoordinatorV2.connect(subOwner).fundSubscriptionNative(subId, {
        value: BigNumber.from('1000000000000000000'),
      })
      await vrfCoordinatorV2.connect(subOwner).addConsumer(subId, randomAddress)
      await vrfCoordinatorV2
        .connect(subOwner)
        .removeConsumer(subId, randomAddress)
      await expect(
        vrfCoordinatorV2.connect(random).requestRandomWords(
          kh, // keyhash
          subId, // subId
          1, // minReqConf
          1000, // callbackGasLimit
          1, // numWords
        ),
      ).to.be.revertedWith(
        `InvalidConsumer(${subId}, "${randomAddress.toString()}")`,
      )
      await expect(
        vrfCoordinatorV2
          .connect(subOwner)
          .removeConsumer(subId, wrapperNativeToken.address),
      ).to.be.revertedWith(
        `InvalidConsumer(${subId}, "${wrapperNativeToken.address.toString()}")`,
      )
    })
    it('cancel/add subscription invariant', async function () {
      await vrfCoordinatorV2.connect(subOwner).fundSubscriptionNative(subId, {
        value: BigNumber.from('1000000000000000000'),
      })

      await vrfCoordinatorV2
        .connect(subOwner)
        .cancelSubscription(subId, randomAddress)
      subId = await createSubscriptionWithConsumers([])
      // Should not succeed because consumer was previously registered
      // i.e. cancel should be cleaning up correctly.
      await expect(
        vrfCoordinatorV2.connect(random).requestRandomWords(
          kh, // keyhash
          subId, // subId
          1, // minReqConf
          1000, // callbackGasLimit
          1, // numWords
        ),
      ).to.be.revertedWith(
        `InvalidConsumer(${subId}, "${randomAddress.toString()}")`,
      )
    })
  })

  describe('#oracleWithdraw', async function () {
    it('cannot withdraw with no balance', async function () {
      await expect(
        vrfCoordinatorV2
          .connect(oracle)
          .oracleWithdraw(randomAddressString(), BigNumber.from('100')),
      ).to.be.revertedWith(`InsufficientBalance`)

      const oracleWithdrawable =
        await vrfCoordinatorV2.getOracleWithdrawableTokens(
          await oracle.getAddress(),
        )
      assert(oracleWithdrawable == 0)
    })
  })

  describe('#calculatePaymentAmount [ @skip-coverage ]', async function () {
    it('output within sensible range', async function () {
      // By default, hardhat sends txes with the block limit as their gas limit.
      await vrfCoordinatorV2TestHelper
        .connect(oracle)
        .calculatePaymentAmountTest(
          BigNumber.from('0'), // Gas after payment
          0, // Fee PPM
          BigNumber.from('1000000000'), // Wei per unit gas (gas price)
        )
      const paymentAmount = await vrfCoordinatorV2TestHelper.getPaymentAmount()
      // The gas price is 1gwei and the native/kcs price is set to 1e18 wei per unit kcs.
      // paymentAmount = 1e18*weiPerUnitGas*(gasAfterPaymentCalculation + startGas - gasleft()) / uint256(weiPerUnitNative);
      // So we expect x to be in the range (few thousand gas for the call)
      // 1e18*1e9*(30 gas)/1e18 < x < 1e18*1e9*(40 gas)/1e18
      // 30000000000 < x < 40000000000
      const gss = await vrfCoordinatorV2TestHelper.getGasStart()
      assert(
        paymentAmount.gt(BigNumber.from('30000000000')),
        'payment too small',
      )
      assert(
        paymentAmount.lt(BigNumber.from('40000000000')),
        'payment too large',
      )
    })
  })

  describe('#keyRegistration', async function () {
    it('register key emits log', async function () {
      const testKey = [BigNumber.from('1'), BigNumber.from('2')]
      const kh = await vrfCoordinatorV2.hashOfKey(testKey)
      await expect(
        vrfCoordinatorV2.registerProvingKey(subOwnerAddress, testKey),
      )
        .to.emit(vrfCoordinatorV2, 'ProvingKeyRegistered')
        .withArgs(kh, subOwnerAddress)
      const reqConfig = await vrfCoordinatorV2.getRequestConfig()
      assert(reqConfig[2].length == 1) // 1 keyhash registered
    })
    it('cannot re-register key', async function () {
      const testKey = [BigNumber.from('1'), BigNumber.from('2')]
      const kh = await vrfCoordinatorV2.hashOfKey(testKey)
      await vrfCoordinatorV2.registerProvingKey(subOwnerAddress, testKey)
      await expect(
        vrfCoordinatorV2.registerProvingKey(subOwnerAddress, testKey),
      ).to.be.revertedWith(`ProvingKeyAlreadyRegistered("${kh}")`)
    })
    it('deregister key emits log', async function () {
      const testKey = [BigNumber.from('1'), BigNumber.from('2')]
      const kh = await vrfCoordinatorV2.hashOfKey(testKey)
      await vrfCoordinatorV2.registerProvingKey(subOwnerAddress, testKey)
      await expect(vrfCoordinatorV2.deregisterProvingKey(testKey))
        .to.emit(vrfCoordinatorV2, 'ProvingKeyDeregistered')
        .withArgs(kh, subOwnerAddress)
      const reqConfig = await vrfCoordinatorV2.getRequestConfig()
      assert(reqConfig[2].length == 0) // 0 keyhash registered
    })
    it('cannot deregister unregistered key', async function () {
      const testKey = [BigNumber.from('1'), BigNumber.from('2')]
      const kh = await vrfCoordinatorV2.hashOfKey(testKey)
      await expect(
        vrfCoordinatorV2.deregisterProvingKey(testKey),
      ).to.be.revertedWith(`NoSuchProvingKey("${kh}")`)
    })
    it('can register after deregister', async function () {
      const testKey = [BigNumber.from('1'), BigNumber.from('2')]
      const testKey2 = [BigNumber.from('3'), BigNumber.from('4')]
      await vrfCoordinatorV2.registerProvingKey(subOwnerAddress, testKey)
      await vrfCoordinatorV2.deregisterProvingKey(testKey)
      await vrfCoordinatorV2.registerProvingKey(randomAddress, testKey)
      await vrfCoordinatorV2.registerProvingKey(randomAddress, testKey2)
      await vrfCoordinatorV2.deregisterProvingKey(testKey)
    })
  })

  describe('#fulfillRandomWords', async function () {
    beforeEach(async () => {
      const testKey = [BigNumber.from('1'), BigNumber.from('2')]
      await vrfCoordinatorV2.registerProvingKey(subOwnerAddress, testKey)
    })
    it('unregistered key should fail', async function () {
      const proof = [
        [BigNumber.from('1'), BigNumber.from('3')], // pk NOT registered
        [BigNumber.from('1'), BigNumber.from('2')], // gamma
        BigNumber.from('1'), // c
        BigNumber.from('1'), // s
        BigNumber.from('1'), // seed
        randomAddress, // uWitness
        [BigNumber.from('1'), BigNumber.from('2')], // cGammaWitness
        [BigNumber.from('1'), BigNumber.from('2')], // sHashWitness
        BigNumber.from('1'),
      ] // 13 words in proof
      const rc = [
        1, // blockNum
        2, // subId
        3, // callbackGasLimit
        4, // numWords
        randomAddress, // sender
      ]
      await expect(
        vrfCoordinatorV2.connect(oracle).fulfillRandomWords(proof, rc),
      ).to.be.revertedWith(
        `NoSuchProvingKey("0xa15bc60c955c405d20d9149c709e2460f1c2d9a497496a7f46004d1772c3054c")`,
      )
    })

    it('no corresponding request', async function () {
      const proof = [
        [BigNumber.from('1'), BigNumber.from('2')], // pk
        [BigNumber.from('1'), BigNumber.from('2')], // gamma
        BigNumber.from('1'), // c
        BigNumber.from('1'), // s
        BigNumber.from('1'), // seed
        randomAddress, // uWitness
        [BigNumber.from('1'), BigNumber.from('2')], // cGammaWitness
        [BigNumber.from('1'), BigNumber.from('2')], // sHashWitness
        BigNumber.from('1'),
      ] // 13 words in proof
      const rc = [
        1, // blockNum
        2, // subId
        3, // callbackGasLimit
        4, // numWords
        randomAddress, // sender
      ]
      await expect(
        vrfCoordinatorV2.connect(oracle).fulfillRandomWords(proof, rc),
      ).to.be.revertedWith(`NoCorrespondingRequest()`)
    })

    it('incorrect commitment wrong blocknum', async function () {
      const subId = await createSubscription()
      await subOwner.sendTransaction({
        to: wrapperNativeToken.address,
        value: BigNumber.from('1000000000000000000'),
      })
      //await wrapperNativeToken.connect(subOwner).deposit({ value: BigNumber.from('1000000000000000000') })
      await wrapperNativeToken
        .connect(subOwner)
        .approve(
          await vrfCoordinatorV2.address,
          BigNumber.from('1000000000000000000'),
        )
      await vrfCoordinatorV2
        .connect(subOwner)
        .fundSubscription(subId, BigNumber.from('1000000000000000000'))
      const testKey = [BigNumber.from('1'), BigNumber.from('2')]
      const kh = await vrfCoordinatorV2.hashOfKey(testKey)
      const tx = await vrfCoordinatorV2.connect(consumer).requestRandomWords(
        kh, // keyhash
        subId, // subId
        3, // minReqConf
        1000, // callbackGasLimit
        1, // numWords
      )
      const reqReceipt = await tx.wait()
      // We give it the right proof length and a valid preSeed
      // but an invalid commitment
      const preSeed = reqReceipt.events[0].args['preSeed']
      const proof = [
        [BigNumber.from('1'), BigNumber.from('2')],
        [BigNumber.from('1'), BigNumber.from('2')],
        BigNumber.from('1'),
        BigNumber.from('1'),
        preSeed,
        randomAddress,
        [BigNumber.from('1'), BigNumber.from('2')],
        [BigNumber.from('1'), BigNumber.from('2')],
        BigNumber.from('1'),
      ]
      const rc = [
        reqReceipt.blockNumber + 1, // Wrong blocknumber
        subId,
        1000,
        3,
        await consumer.getAddress(),
      ]
      await expect(
        vrfCoordinatorV2.connect(oracle).fulfillRandomWords(proof, rc),
      ).to.be.revertedWith(`IncorrectCommitment()`)
    })

    it('wrong send native', async function () {
      await expect(
        owner.sendTransaction({
          to: vrfCoordinatorV2.address,
          value: ethers.utils.parseEther('1'),
        }),
      ).to.be.revertedWith(`TokenTransferInFailed`)
    })

    it('incorrect subId', async function () {
      // incorrect subId
      const subId = 999999
      await subOwner.sendTransaction({
        to: wrapperNativeToken.address,
        value: BigNumber.from('1000000000000000000'),
      })
      //await wrapperNativeToken.connect(subOwner).deposit({ value: BigNumber.from('1000000000000000000') })
      await wrapperNativeToken
        .connect(subOwner)
        .approve(
          await vrfCoordinatorV2.address,
          BigNumber.from('1000000000000000000'),
        )
      await expect(
        vrfCoordinatorV2
          .connect(subOwner)
          .fundSubscription(subId, BigNumber.from('1000000000000000000')),
      ).to.be.revertedWith(`InvalidSubscription`)
    })

    describe('#recoverWrongToken', async function () {
      beforeEach(async () => {
        await expect(
          otherToken
            .connect(owner)
            .deposit({ value: ethers.utils.parseEther('1') }),
        ).to.not.be.reverted
        await expect(
          otherToken
            .connect(owner)
            .transfer(vrfCoordinatorV2.address, ethers.utils.parseEther('1')),
        ).to.not.be.reverted
      })

      it('claim other token', async function () {
        await expect(
          vrfCoordinatorV2
            .connect(owner)
            .recoverWrongToken(await otherToken.address),
        ).to.not.be.reverted
      })

      it('only owner claim other token', async function () {
        await expect(
          vrfCoordinatorV2
            .connect(consumer)
            .recoverWrongToken(await otherToken.address),
        ).to.be.revertedWith('Only callable by owner')
      })

      it('claim wrapper native token', async function () {
        await expect(
          vrfCoordinatorV2
            .connect(owner)
            .recoverWrongToken(await wrapperNativeToken.address),
        ).to.be.revertedWith(`can not recover wrapper token`)
      })
    })
  })

  /*
    Note that all the fulfillment happy path testing is done in Go, to make use of the existing go code to produce
    proofs offchain.
   */
})
