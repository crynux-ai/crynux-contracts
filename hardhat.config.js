require("@nomicfoundation/hardhat-toolbox");

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
