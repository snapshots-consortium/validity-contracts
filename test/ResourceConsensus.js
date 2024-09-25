import assert from 'node:assert'

describe('ResourceConsensus', () => {

	describe('Deployment', () => {
		it('should deploy a new ResourceConsensus contract', async () => {

		  const initialValidators = process.env.INITIAL_VALIDATORS.split(",")
  		const initialRequesters = process.env.INITIAL_REQUESTERS.split(",")

    	const ResourceConsensus = await ethers.getContractFactory('ResourceConsensus')
    	const resourceConsensus = await ResourceConsensus.deploy(initialValidators, initialRequesters)

    	assert.equal(await resourceConsensus.totalValidators(), initialValidators.length)

    })
  })

	it('should return a valid consensus', () => {
		// Test code here
	})
})
