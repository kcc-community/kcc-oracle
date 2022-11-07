import { ethers } from 'hardhat'
import { publicAbi } from './test-helpers/helpers'
import { assert, expect } from 'chai'
import { Contract, ContractFactory, Signer } from 'ethers'
import { Personas, getUsers } from './test-helpers/setup'
import { evmRevert } from './test-helpers/matchers'

let confirmedOwnerTestHelperFactory: ContractFactory
let ConfirmedOwnerWithProposalFactory: ContractFactory

let personas: Personas
let owner: Signer
let nonOwner: Signer
let newOwner: Signer

before(async () => {
  const users = await getUsers()
  personas = users.personas
  owner = personas.Carol
  nonOwner = personas.Neil
  newOwner = personas.Ned

  confirmedOwnerTestHelperFactory = await ethers.getContractFactory(
    'contracts/tests/ConfirmedOwnerTestHelper.sol:ConfirmedOwnerTestHelper',
    owner,
  )
  ConfirmedOwnerWithProposalFactory = await ethers.getContractFactory(
    'contracts//ConfirmedOwnerWithProposal.sol:ConfirmedOwnerWithProposal',
    owner,
  )
})

describe('ConfirmedOwnerWithProposal', () => {
  let confirmedOwner: Contract

  beforeEach(async () => {
    confirmedOwner = await confirmedOwnerTestHelperFactory
      .connect(owner)
      .deploy()
  })

  it('has a limited public interface [ @skip-coverage ]', () => {
    publicAbi(confirmedOwner, [
      'acceptOwnership',
      'owner',
      'transferOwnership',
      // test helper public methods
      'modifierOnlyOwner',
    ])
  })

  describe('#constructor', () => {
    it('assigns ownership to the deployer', async () => {
      const [actual, expected] = await Promise.all([
        owner.getAddress(),
        confirmedOwner.owner(),
      ])

      assert.equal(actual, expected)
    })

    it('reverts if assigned to the zero address', async () => {
      await evmRevert(
        ConfirmedOwnerWithProposalFactory.connect(owner).deploy(
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
        ),
        'Cannot set owner to zero',
      )
    })

    it('reverts if pending owner is zero address', async () => {
      const cowp = await ConfirmedOwnerWithProposalFactory.connect(
        owner,
      ).deploy(
        await personas.Carol.getAddress(),
        await personas.Eddy.getAddress(),
      )
      assert.equal(await personas.Carol.getAddress(), await cowp.owner())
    })
  })

  describe('#onlyOwner modifier', () => {
    describe('when called by an owner', () => {
      it('successfully calls the method', async () => {
        const tx = await confirmedOwner.connect(owner).modifierOnlyOwner()
        await expect(tx).to.emit(confirmedOwner, 'Here')
      })
    })

    describe('when called by anyone but the owner', () => {
      it('reverts', async () =>
        await evmRevert(confirmedOwner.connect(nonOwner).modifierOnlyOwner()))
    })
  })

  describe('#transferOwnership', () => {
    describe('when called by an owner', () => {
      it('emits a log', async () => {
        const tx = await confirmedOwner
          .connect(owner)
          .transferOwnership(await newOwner.getAddress())
        await expect(tx)
          .to.emit(confirmedOwner, 'OwnershipTransferRequested')
          .withArgs(await owner.getAddress(), await newOwner.getAddress())
      })

      it('does not allow ownership transfer to self', async () => {
        await evmRevert(
          confirmedOwner
            .connect(owner)
            .transferOwnership(await owner.getAddress()),
          'Cannot transfer to self',
        )
      })
    })
  })

  describe('when called by anyone but the owner', () => {
    it('reverts', async () =>
      await evmRevert(
        confirmedOwner
          .connect(nonOwner)
          .transferOwnership(await newOwner.getAddress()),
      ))
  })

  describe('#acceptOwnership', () => {
    describe('after #transferOwnership has been called', () => {
      beforeEach(async () => {
        await confirmedOwner
          .connect(owner)
          .transferOwnership(await newOwner.getAddress())
      })

      it('allows the recipient to call it', async () => {
        const tx = await confirmedOwner.connect(newOwner).acceptOwnership()
        await expect(tx)
          .to.emit(confirmedOwner, 'OwnershipTransferred')
          .withArgs(await owner.getAddress(), await newOwner.getAddress())
      })

      it('does not allow a non-recipient to call it', async () =>
        await evmRevert(confirmedOwner.connect(nonOwner).acceptOwnership()))
    })
  })
})
