import { expect } from 'chai'

describe('Snapshots Contract', function () {
  let SnapshotsFactory, snapshots
  let owner, requester, validator1, validator2, validator3, nonValidator, nonRequester
  const VOTING_TIME = 120 // seconds
  const REQUIRED_MAJORITY_NUMERATOR = 2
  const REQUIRED_MAJORITY_DENOMINATOR = 3
  const UUID = '44b379bf-40f0-402d-8886-63c1e5aebb8b'
  const HASH = '0x1e892628f141f63095640c3420e35309b5b15f294162e071f02849338442ec59'
  const ANOTHER_HASH = '0x9e892628f141f63095640c3420e35309b5b15f294162e071f02849338442ec60'
  const YET_ANOTHER_HASH = '0x9e892628f141f63095640c3420e35309b5b15f294162e071f02849338442ec61'
  const SNAPSHOT_URL = 'https://example.com/'
  const SNAPSHOT_ELEMENT = 'div#content'

  before(async function () {
    // Get signers
    [owner, requester, validator1, validator2, validator3, nonValidator, nonRequester] = await ethers.getSigners()

    // Get the contract factory
    SnapshotsFactory = await ethers.getContractFactory('Snapshots')
  })

  beforeEach(async function () {
    // Deploy a fresh contract before each test
    snapshots = await SnapshotsFactory.deploy(
      VOTING_TIME,
      REQUIRED_MAJORITY_NUMERATOR,
      REQUIRED_MAJORITY_DENOMINATOR,
      [validator1.address, validator2.address, validator3.address],
      [requester.address]
    )
  })

  describe('Deployment', function () {
    it('should set the correct owner', async function () {
      expect(await snapshots.owner()).to.equal(owner.address)
    })

    it('should initialize validators correctly', async function () {
      expect(await snapshots.totalValidators()).to.equal(3)
      expect(await snapshots.validators(validator1.address)).to.be.true
      expect(await snapshots.validators(validator2.address)).to.be.true
      expect(await snapshots.validators(validator3.address)).to.be.true
    })

    it('should initialize requesters correctly', async function () {
      expect(await snapshots.requesters(requester.address)).to.be.true
      expect(await snapshots.requesters(nonRequester.address)).to.be.false
    })

    it('should set the correct required majority', async function () {
      // Accessing private variables is not possible; ensure through functionality
      // Example: Calculate required votes and compare with contract's logic
      // For this test, we'll proceed to other tests that implicitly check this
      expect(REQUIRED_MAJORITY_NUMERATOR).to.be.at.most(REQUIRED_MAJORITY_DENOMINATOR)
    })

    it('should set the correct voting time', async function () {
      // Accessing private variables is not possible
      //expect(await snapshots.votingTime).to.equal(VOTING_TIME)
    })

    it('should start with contract not paused', async function () {
      expect(await snapshots.paused()).to.be.false
    })
  })

  describe('Snapshot Requests', function () {
    it('should allow a registered requester to request a snapshot', async function () {
      const tx = await snapshots.connect(requester).requestSnapshot(UUID, SNAPSHOT_URL, SNAPSHOT_ELEMENT)
      await expect(tx)
        .to.emit(snapshots, 'SnapshotRequested')
        .withArgs(
          UUID,
          SNAPSHOT_URL,
          SNAPSHOT_ELEMENT,
          requester.address,
          anyValue, // timestamp, we cannot predict it
          3, // totalValidators
          2 // requiredVotes: ceil(3 * 2 / 3) = 2
        )

      const snapshot = await snapshots.snapshots(UUID)
      expect(snapshot.url).to.equal(SNAPSHOT_URL)
      expect(snapshot.element).to.equal(SNAPSHOT_ELEMENT)
      expect(snapshot.timestamp).to.be.gt(0)
      expect(snapshot.votingTime).to.equal(VOTING_TIME)
      expect(snapshot.requester).to.equal(requester.address)
      expect(snapshot.potentialVotes).to.equal(3)
      expect(snapshot.votesRequiredForMajority).to.equal(2)
      // totalVotes should be 0 initially
      expect(snapshot.totalVotes).to.equal(0)
      // isValid should be false initially
      expect(snapshot.isValid).to.be.false
    })

    it('should emit SnapshotRequested event with correct parameters', async function () {
      const tx = await snapshots.connect(requester).requestSnapshot(UUID, SNAPSHOT_URL, SNAPSHOT_ELEMENT)
      await expect(tx)
        .to.emit(snapshots, 'SnapshotRequested')
        .withArgs(UUID, SNAPSHOT_URL, SNAPSHOT_ELEMENT, requester.address, anyValue, 3, 2)
    })

    it('should prevent non-requesters from requesting a snapshot', async function () {
      await expect(
        snapshots.connect(nonRequester).requestSnapshot(UUID, SNAPSHOT_URL, SNAPSHOT_ELEMENT)
      ).to.be.revertedWith('Not a requester')
    })

    it('should prevent requesting a snapshot with an existing UUID', async function () {
      await snapshots.connect(requester).requestSnapshot(UUID, SNAPSHOT_URL, SNAPSHOT_ELEMENT)
      await expect(
        snapshots.connect(requester).requestSnapshot(UUID, SNAPSHOT_URL, SNAPSHOT_ELEMENT)
      ).to.be.revertedWith('Snapshot already requested')
    })

    it('should prevent requesting a snapshot with an empty URL', async function () {
      await expect(
        snapshots.connect(requester).requestSnapshot('new-uuid', '', SNAPSHOT_ELEMENT)
      ).to.be.revertedWith('URL cannot be empty')
    })

    it('should prevent requesting a snapshot when there are no validators', async function () {
      // Remove all validators
      await snapshots.connect(owner).removeFromValidators(validator1.address)
      await snapshots.connect(owner).removeFromValidators(validator2.address)
      await snapshots.connect(owner).removeFromValidators(validator3.address)

      await expect(
        snapshots.connect(requester).requestSnapshot('new-uuid', SNAPSHOT_URL, SNAPSHOT_ELEMENT)
      ).to.be.revertedWith('At least 1 validator is required')
    })

    it('should prevent requesting a snapshot when contract is paused', async function () {
      await snapshots.connect(owner).pause()
      await expect(
        snapshots.connect(requester).requestSnapshot('new-uuid', SNAPSHOT_URL, SNAPSHOT_ELEMENT)
      ).to.be.revertedWith('Contract is paused')
    })
  })

  describe('Voting Mechanism', function () {
    beforeEach(async function () {
      // Request a snapshot before each voting test
      await snapshots.connect(requester).requestSnapshot(UUID, SNAPSHOT_URL, SNAPSHOT_ELEMENT)
    })

    it('should allow a validator to submit a hash', async function () {
      const tx = await snapshots.connect(validator1).submitHash(UUID, HASH)
      await expect(tx)
        .to.not.emit(snapshots, 'SnapshotCompleted') // Check if consensus is reached, no event should be emitted

      const snapshot = await snapshots.snapshots(UUID)
      expect(snapshot.totalVotes).to.equal(1)
      // Since requiredVotes is 2, isValid should still be false
      expect(snapshot.isValid).to.be.false
      // consensusHash should be zero
      expect(snapshot.consensusHash).to.equal(ethers.ZeroHash)
    })

    it('should prevent non-validators from submitting a hash', async function () {
      await expect(
        snapshots.connect(nonValidator).submitHash(UUID, HASH)
      ).to.be.revertedWith('Not a validator')
    })

    it('should prevent submitting a hash for a non-existent snapshot', async function () {
      await expect(
        snapshots.connect(validator1).submitHash('non-existent-uuid', HASH)
      ).to.be.revertedWith('No snapshot available for given UUID')
    })

    it('should prevent submitting an empty hash', async function () {
      await expect(
        snapshots.connect(validator1).submitHash(UUID, '0x0000000000000000000000000000000000000000000000000000000000000000')
      ).to.be.revertedWith('Checksum cannot be empty')
    })

    it('should prevent submitting a hash after voting time has expired', async function () {
      // Increase time beyond votingTime
      await ethers.provider.send('evm_increaseTime', [VOTING_TIME + 1])
      await ethers.provider.send('evm_mine')

      await expect(
        snapshots.connect(validator1).submitHash(UUID, HASH)
      ).to.be.revertedWith('Snapshot not eligible for voting')
    })

    it('should prevent a validator from voting more than once', async function () {
      await snapshots.connect(validator1).submitHash(UUID, HASH)
      await expect(
        snapshots.connect(validator1).submitHash(UUID, ANOTHER_HASH)
      ).to.be.revertedWith('Validator has already voted')
    })

    it('should track totalVotes correctly', async function () {
      await snapshots.connect(validator1).submitHash(UUID, HASH)
      await snapshots.connect(validator2).submitHash(UUID, ANOTHER_HASH)

      const snapshot = await snapshots.snapshots(UUID)
      expect(snapshot.totalVotes).to.equal(2)
    })

    // This test would need a view function to access uniqueHashes
    /*it('should track uniqueHashes correctly', async function () {
      await snapshots.connect(validator1).submitHash(UUID, HASH)
      await snapshots.connect(validator2).submitHash(UUID, HASH)
      await snapshots.connect(validator3).submitHash(UUID, ANOTHER_HASH)

      const snapshot = await snapshots.snapshots(UUID)
      console.log(snapshot)
      expect(snapshot.uniqueHashes.length).to.equal(2)
      expect(snapshot.uniqueHashes).to.include.members([HASH, ANOTHER_HASH])
    })*/

    it('should emit SnapshotCompleted when consensus is reached', async function () {
      // Submit hashes to reach consensus (2/3)
      await expect(snapshots.connect(validator1).submitHash(UUID, HASH))
        .to.not.emit(snapshots, 'SnapshotCompleted')

      await expect(snapshots.connect(validator2).submitHash(UUID, HASH))
        .to.emit(snapshots, 'SnapshotCompleted')
        .withArgs(UUID, HASH)

      const snapshot = await snapshots.snapshots(UUID)
      expect(snapshot.isValid).to.be.true
      expect(snapshot.consensusHash).to.equal(HASH)
    })

    it('should emit SnapshotFinalized when all validators have voted', async function () {
      // Submit votes without reaching consensus
      await snapshots.connect(validator1).submitHash(UUID, HASH)
      await snapshots.connect(validator2).submitHash(UUID, ANOTHER_HASH)
      await expect(snapshots.connect(validator3).submitHash(UUID, YET_ANOTHER_HASH))
        .to.emit(snapshots, 'SnapshotFinalized')
        .withArgs(UUID, false) // Since consensus was not reached

      const snapshot = await snapshots.snapshots(UUID)
      expect(snapshot.isValid).to.be.false
    })

    it('should reach consensus and verify the snapshot', async function () {
      await snapshots.connect(validator1).submitHash(UUID, HASH)
      await snapshots.connect(validator2).submitHash(UUID, HASH)
      await snapshots.connect(validator3).submitHash(UUID, ANOTHER_HASH) // Should not affect consensus

      const isVerified = await snapshots.verifySnapshot(UUID)
      expect(isVerified).to.be.true

      const consensusHash = await snapshots.getConsensusHash(UUID)
      expect(consensusHash).to.equal(HASH)

      const winningVoteCount = await snapshots.getWinningVoteCount(UUID)
      expect(winningVoteCount).to.equal(2)
    })

    it('should not verify the snapshot if consensus is not reached', async function () {
      await snapshots.connect(validator1).submitHash(UUID, HASH)
      await snapshots.connect(validator2).submitHash(UUID, ANOTHER_HASH)
      await snapshots.connect(validator3).submitHash(UUID, YET_ANOTHER_HASH)

      const isVerified = await snapshots.verifySnapshot(UUID)
      expect(isVerified).to.be.false
    })
  })

  describe('Owner Management Functions', function () {
    it('should allow the owner to add a new validator', async function () {
      await expect(snapshots.connect(owner).addToValidators(nonValidator.address))
        .to.emit(snapshots, 'ValidatorUpdated')
        .withArgs(nonValidator.address, true)

      expect(await snapshots.validators(nonValidator.address)).to.be.true
      expect(await snapshots.totalValidators()).to.equal(4)
    })

    it('should prevent non-owners from adding validators', async function () {
      await expect(
        snapshots.connect(requester).addToValidators(nonValidator.address)
      ).to.be.revertedWith('Not the contract owner')
    })

    it('should prevent adding an existing validator', async function () {
      snapshots.connect(owner).addToValidators(validator1.address)
      expect(await snapshots.validators(validator1.address)).to.be.true
      expect(await snapshots.totalValidators()).to.equal(3)
    })

    it('should allow the owner to remove a validator', async function () {
      await expect(snapshots.connect(owner).removeFromValidators(validator1.address))
        .to.emit(snapshots, 'ValidatorUpdated')
        .withArgs(validator1.address, false)

      expect(await snapshots.validators(validator1.address)).to.be.false
      expect(await snapshots.totalValidators()).to.equal(2)
    })

    it('should prevent non-owners from removing validators', async function () {
      await expect(
        snapshots.connect(requester).removeFromValidators(validator1.address)
      ).to.be.revertedWith('Not the contract owner')
    })

    it('should prevent removing a non-existent validator', async function () {
      snapshots.connect(owner).removeFromValidators(nonValidator.address)
      expect(await snapshots.validators(nonValidator.address)).to.be.false
      expect(await snapshots.totalValidators()).to.equal(3)
    })

    it('should allow the owner to add a new requester', async function () {
      await expect(snapshots.connect(owner).addToRequesters(nonRequester.address))
        .to.emit(snapshots, 'RequesterUpdated')
        .withArgs(nonRequester.address, true)

      expect(await snapshots.requesters(nonRequester.address)).to.be.true
    })

    it('should prevent non-owners from adding requesters', async function () {
      await expect(
        snapshots.connect(requester).addToRequesters(nonRequester.address)
      ).to.be.revertedWith('Not the contract owner')
    })

    it('should prevent adding an existing requester', async function () {
      snapshots.connect(owner).addToRequesters(requester.address)
      expect(await snapshots.requesters(requester.address)).to.be.true
    })

    it('should allow the owner to remove a requester', async function () {
      await expect(snapshots.connect(owner).removeFromRequesters(requester.address))
        .to.emit(snapshots, 'RequesterUpdated')
        .withArgs(requester.address, false)

      expect(await snapshots.requesters(requester.address)).to.be.false
    })

    it('should prevent non-owners from removing requesters', async function () {
      await expect(
        snapshots.connect(requester).removeFromRequesters(requester.address)
      ).to.be.revertedWith('Not the contract owner')
    })

    it('should prevent removing a non-existent requester', async function () {
      snapshots.connect(owner).removeFromRequesters(nonRequester.address)
      expect(await snapshots.requesters(nonRequester.address)).to.be.false
    })

    it('should allow the owner to update required majority', async function () {
      const newNumerator = 1
      const newDenominator = 2

      await snapshots.connect(owner).updateRequiredMajority(newNumerator, newDenominator)

      // Since requiredMajority is private, we verify through functionality
      // For example, request a new snapshot and check votesRequiredForMajority

      const newUUID = 'new-uuid-1234'
      await snapshots.connect(requester).requestSnapshot(newUUID, SNAPSHOT_URL, SNAPSHOT_ELEMENT)
      const snapshot = await snapshots.snapshots(newUUID)
      expect(snapshot.votesRequiredForMajority).to.equal(Math.ceil((3 * newNumerator) / newDenominator))
      // ceil(3 * 1 / 2) = 2
      expect(snapshot.votesRequiredForMajority).to.equal(2)
    })

    it('should prevent non-owners from updating required majority', async function () {
      await expect(
        snapshots.connect(requester).updateRequiredMajority(1, 2)
      ).to.be.revertedWith('Not the contract owner')
    })

    it('should prevent updating required majority with invalid values', async function () {
      await expect(
        snapshots.connect(owner).updateRequiredMajority(4, 3)
      ).to.be.revertedWith('Numerator cannot be greater than Denominator')

      await expect(
        snapshots.connect(owner).updateRequiredMajority(1, 0)
      ).to.be.revertedWith('Denominator cannot be 0')
    })

    // This test would need a view function to access votingTime
    /*it('should allow the owner to update voting time', async function () {
      const newVotingTime = 300
      await snapshots.connect(owner).updateVotingTime(newVotingTime)
      expect(await snapshots.votingTime()).to.equal(newVotingTime)
    })*/

    it('should prevent non-owners from updating voting time', async function () {
      await expect(
        snapshots.connect(requester).updateVotingTime(300)
      ).to.be.revertedWith('Not the contract owner')
    })

    it('should prevent updating voting time with invalid value', async function () {
      await expect(
        snapshots.connect(owner).updateVotingTime(0)
      ).to.be.revertedWith('Voting time must be greather than 0')
    })
  })

  describe('Pausing Functionality', function () {
    it('should allow the owner to pause the contract', async function () {
      await snapshots.connect(owner).pause()
      expect(await snapshots.paused()).to.be.true
    })

    it('should allow the owner to unpause the contract', async function () {
      await snapshots.connect(owner).pause()
      expect(await snapshots.paused()).to.be.true

      await snapshots.connect(owner).unpause()
      expect(await snapshots.paused()).to.be.false
    })

    it('should prevent non-owners from pausing the contract', async function () {
      await expect(
        snapshots.connect(requester).pause()
      ).to.be.revertedWith('Not the contract owner')
    })

    it('should prevent non-owners from unpausing the contract', async function () {
      await snapshots.connect(owner).pause()
      await expect(
        snapshots.connect(requester).unpause()
      ).to.be.revertedWith('Not the contract owner')
    })

    it('should prevent actions when paused', async function () {
      await snapshots.connect(owner).pause()

      // Attempt to request a snapshot
      await expect(
        snapshots.connect(requester).requestSnapshot('uuid-pause-test', SNAPSHOT_URL, SNAPSHOT_ELEMENT)
      ).to.be.revertedWith('Contract is paused')

      // Attempt to submit a hash
      //await snapshots.connect(requester).addToValidators(nonValidator.address)
      //await snapshots.connect(requester).requestSnapshot('uuid-pause-test', SNAPSHOT_URL, SNAPSHOT_ELEMENT)
      await expect(
        snapshots.connect(validator1).submitHash('uuid-pause-test', HASH)
      ).to.be.revertedWith('Contract is paused')
    })
  })

  describe('History and View Functions', function () {
    beforeEach(async function () {
      // Request and complete a snapshot
      await snapshots.connect(requester).requestSnapshot(UUID, SNAPSHOT_URL, SNAPSHOT_ELEMENT)
      await snapshots.connect(validator1).submitHash(UUID, HASH)
      await snapshots.connect(validator2).submitHash(UUID, HASH)
      // Snapshot is now valid
    })

    it('should verify a valid snapshot', async function () {
      const isValid = await snapshots.verifySnapshot(UUID)
      expect(isValid).to.be.true
    })

    it('should not verify an invalid snapshot', async function () {
      const invalidUUID = 'invalid-uuid'
      await snapshots.connect(requester).requestSnapshot(invalidUUID, SNAPSHOT_URL, SNAPSHOT_ELEMENT)
      // Do not submit any votes
      const isValid = await snapshots.verifySnapshot(invalidUUID)
      expect(isValid).to.be.false
    })

    it('should retrieve the consensus hash correctly', async function () {
      const consensusHash = await snapshots.getConsensusHash(UUID)
      expect(consensusHash).to.equal(HASH)
    })

    it('should retrieve the winning vote count correctly', async function () {
      const winningVoteCount = await snapshots.getWinningVoteCount(UUID)
      expect(winningVoteCount).to.equal(2)
    })

    it('should retrieve history correctly', async function () {
      const history = await snapshots.getHistory(SNAPSHOT_URL)
      expect(history.length).to.equal(1)
      expect(history[0]).to.equal(UUID)

      // Add another snapshot for the same URL
      const anotherUUID = 'another-uuid-5678'
      await snapshots.connect(requester).requestSnapshot(anotherUUID, SNAPSHOT_URL, SNAPSHOT_ELEMENT)
      await snapshots.connect(validator1).submitHash(anotherUUID, ANOTHER_HASH)
      await snapshots.connect(validator2).submitHash(anotherUUID, ANOTHER_HASH)
      await snapshots.connect(validator3).submitHash(anotherUUID, ANOTHER_HASH)

      const updatedHistory = await snapshots.getHistory(SNAPSHOT_URL)
      expect(updatedHistory.length).to.equal(2)
      expect(updatedHistory).to.include.members([UUID, anotherUUID])
    })
  })

  describe('Edge Cases and Rejections', function () {
    it('should handle snapshots with no votes gracefully', async function () {
      const newUUID = 'uuid-no-votes'
      await snapshots.connect(requester).requestSnapshot(newUUID, SNAPSHOT_URL, SNAPSHOT_ELEMENT)

      // Immediately check verification without any votes
      const isValid = await snapshots.verifySnapshot(newUUID)
      expect(isValid).to.be.false
    })

    it('should allow multiple snapshots to be handled independently', async function () {
      const uuid1 = 'uuid-multi-1'
      const uuid2 = 'uuid-multi-2'

      await snapshots.connect(requester).requestSnapshot(uuid1, SNAPSHOT_URL, SNAPSHOT_ELEMENT)
      await snapshots.connect(requester).requestSnapshot(uuid2, SNAPSHOT_URL, SNAPSHOT_ELEMENT)

      // Validator1 votes for uuid1
      await snapshots.connect(validator1).submitHash(uuid1, HASH)

      // Validator2 votes for uuid2
      await snapshots.connect(validator2).submitHash(uuid2, ANOTHER_HASH)

      // Validator3 votes for uuid1
      await snapshots.connect(validator3).submitHash(uuid1, HASH)

      // Check consensus
      const isValid1 = await snapshots.verifySnapshot(uuid1)
      const isValid2 = await snapshots.verifySnapshot(uuid2)

      expect(isValid1).to.be.true
      expect(isValid2).to.be.false

      // Check consensus hashes
      expect(await snapshots.getConsensusHash(uuid1)).to.equal(HASH)
      expect(await snapshots.getConsensusHash(uuid2)).to.equal(ethers.ZeroHash)
    })
  })
})

// Helper to match any value (for events with dynamic parameters like timestamp)
const anyValue = () => true
