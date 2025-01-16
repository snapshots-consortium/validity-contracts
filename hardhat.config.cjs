require("@nomicfoundation/hardhat-toolbox")
require('dotenv').config()


/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.27"
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      mining: {
        auto: true,
        interval: 2 * 60 * 1000, // should be less then 5 minutes to make event subscription work
      }
    },
    polygon_amoy: {
      url: process.env.RPC_PROVIDER_URL,
      accounts: [process.env.OWNER_PRIVATE_KEY]
    },
    polygon_mainnet: {
      url: process.env.RPC_PROVIDER_URL,
      accounts: [process.env.OWNER_PRIVATE_KEY]
    }
  },
  etherscan: {
    apiKey: process.env.POLYGONSCAN_API_KEY
  },
  sourcify: {
    enabled: true
  }
};
