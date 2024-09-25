const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules")
const env = require('dotenv').config()

const ResourceConsensusModule = buildModule("ResourceConsensusModule", (m) => {

  const initialValidators = process.env.INITIAL_VALIDATORS.split(",")
  const initialRequesters = process.env.INITIAL_REQUESTERS.split(",")

  console.log(initialValidators)
  console.log(initialRequesters)

  const resourceConsensus = m.contract("ResourceConsensus", [initialValidators, initialRequesters])

  return { resourceConsensus }
})

module.exports = ResourceConsensusModule
