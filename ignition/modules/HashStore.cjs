const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules")
const env = require('dotenv').config()

const hashStoreModule = buildModule("hashStoreModule", (m) => {

  const HashStore = m.contract("HashStore")

  return { HashStore }
})

module.exports = hashStoreModule
