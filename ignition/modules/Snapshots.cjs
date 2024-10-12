const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules")
const env = require('dotenv').config()

const SnapshotsModule = buildModule("SnapshotsModule", (m) => {

  const initialValidators = process.env.INITIAL_VALIDATORS.split(",")
  const initialRequesters = process.env.INITIAL_REQUESTERS.split(",")

  console.log(`Initial Validators: ${initialValidators}`)
  console.log(`Initial Requesters: ${initialRequesters}`)

  /**
   * Snapshots contract constructor:
   *    uint256 _votingTime,
   *    uint256 _numeratorRequiredMajority,
   *    uint256 _denominatorRequiredMajority,
   *    address[] memory _initialValidators,
   *    address[] memory _initialRequesters
   */
  const Snapshots = m.contract("Snapshots", [120, 2, 3, initialValidators, initialRequesters])

  return { Snapshots }
})

module.exports = SnapshotsModule
