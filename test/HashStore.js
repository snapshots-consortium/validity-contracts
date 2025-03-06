import { expect } from 'chai'

describe("HashStore Contract", function () {
  let HashStore, hashStore, owner
  
  beforeEach(async function () {
    [owner] = await ethers.getSigners()
    HashStore = await ethers.getContractFactory("HashStore")
    hashStore = await HashStore.deploy()
  })

  it("Should store a hash with a timestamp", async function () {
    const uuid = "123e4567-e89b-12d3-a456-426614174000"
    const documentHash = ethers.keccak256(ethers.encodeBytes32String("test document"))
    
    const tx = await hashStore.storeHash(uuid, documentHash)
    await tx.wait()
    
    const entry = await hashStore.entries(uuid)
    expect(entry.timestamp).to.be.gt(0)
    expect(entry.hash).to.equal(documentHash)
  })

  it("Should not allow storing the same UUID twice", async function () {
    const uuid = "123e4567-e89b-12d3-a456-426614174000"
    const documentHash = ethers.keccak256(ethers.encodeBytes32String("test document"))
    
    await hashStore.storeHash(uuid, documentHash)
    
    await expect(hashStore.storeHash(uuid, documentHash)).to.be.revertedWith("UUID already exists")
  })

  it("Should return correct timestamp and hash for a stored UUID", async function () {
    const uuid = "987e6543-e21b-45d3-b123-123456789abc"
    const documentHash = ethers.keccak256(ethers.encodeBytes32String("another document"))
    
    const tx = await hashStore.storeHash(uuid, documentHash)
    const receipt = await tx.wait()
    const blockTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp
    
    const entry = await hashStore.entries(uuid)
    expect(entry.timestamp).to.equal(blockTimestamp)
    expect(entry.hash).to.equal(documentHash)
  })

  it("Should return empty hash and timestamp 0 for an unknown UUID", async function () {
    const unknownUUID = "00000000-0000-0000-0000-000000000000"
    
    const entry = await hashStore.entries(unknownUUID)
    expect(entry.timestamp).to.equal(0)
    expect(entry.hash).to.equal(ethers.ZeroHash)
  })

  it("should emit a HashStored event", async function () {
    const uuid = "123e4567-e89b-12d3-a456-426614174000"
    const documentHash = ethers.keccak256(ethers.encodeBytes32String("test document"))
    
    const tx = await hashStore.storeHash(uuid, documentHash)
    const receipt = await tx.wait()
    //console.log(receipt)
    const blockTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp
    expect(tx)
      .to.emit(hashStore, "HashStored")
      .withArgs(uuid, documentHash, blockTimestamp)

    const events = await hashStore.queryFilter("HashStored")
    console.log(events)
  })
})
