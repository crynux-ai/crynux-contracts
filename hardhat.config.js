require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-chai-matchers");

module.exports = {
    solidity: {
        version: "0.8.24",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200
            }
        }
    },
    networks: {
        hardhat: {
            gas: "auto"
        }
    },
    paths: {
        sources: "./contracts",
        tests: "./hardhat_test",
        cache: "./cache",
        artifacts: "./artifacts"
    },
};
