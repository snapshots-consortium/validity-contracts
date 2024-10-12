import assert from 'node:assert'

const [ owner, requester, validator1, validator2, validator3 ] = await ethers.getSigners()
const initialValidators = [validator1.address, validator2.address, validator3.address]
const initialRequesters = [requester.address]
const SnapshotsFactory = await ethers.getContractFactory('Snapshots')

describe('Snapshots', () => {

  it('should deploy a new Snapshots contract', async () => {

    const snapshots = await SnapshotsFactory.deploy(120, 2, 3, initialValidators, initialRequesters)
    
    assert.equal(await snapshots.totalValidators(), initialValidators.length)
  })

  it('should accept a new snapshot request', async () => {
    
    const snapshots = await SnapshotsFactory.deploy(120, 2, 3, initialValidators, initialRequesters)

    await snapshots.connect(requester).requestSnapshot(
      '44b379bf-40f0-402d-8886-63c1e5aebb8b',
      'https://example.com/',
      '')

    const snapshot = await snapshots.snapshots('44b379bf-40f0-402d-8886-63c1e5aebb8b')
    assert.equal(await snapshot[7], 0) // struct snapshots at index 7 = totalVotes
  })
})
