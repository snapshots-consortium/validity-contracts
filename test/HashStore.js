import { expect } from 'chai'


describe("HashStore Contract", function () {
    let HashStore, hashStore, owner
    
    beforeEach(async function () {
        [owner] = await ethers.getSigners()
        HashStore = await ethers.getContractFactory("HashStore")
        hashStore = await HashStore.deploy()
    })

    it("Should store a hash with a timestamp", async function () {
        const documentHash = ethers.keccak256(ethers.toUtf8Bytes("test document"))
        
        const tx = await hashStore.storeHash(documentHash)
        await tx.wait()
        
        const storedTimestamp = await hashStore.timestamps(documentHash)
        expect(storedTimestamp).to.be.gt(0)
    })

    it("Should not allow storing the same hash twice", async function () {
        const documentHash = ethers.keccak256(ethers.toUtf8Bytes("test document"))
        
        await hashStore.storeHash(documentHash)
        
        await expect(hashStore.storeHash(documentHash)).to.be.revertedWith("Hash already stored")
    })

    it("Should return correct timestamp for a stored hash", async function () {
        const documentHash = ethers.keccak256(ethers.toUtf8Bytes("another document"))
        
        const tx = await hashStore.storeHash(documentHash)
        const receipt = await tx.wait()
        const blockTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp
        
        const storedTimestamp = await hashStore.timestamps(documentHash)
        expect(storedTimestamp).to.equal(blockTimestamp)
    })

    it("Should return 0 for an unregistered hash", async function () {
        const unknownHash = ethers.keccak256(ethers.toUtf8Bytes("unknown document"))
        
        const storedTimestamp = await hashStore.timestamps(unknownHash)
        expect(storedTimestamp).to.equal(0)
    })
})

