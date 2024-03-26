const { assert, expect } = require("chai");
const helpers = require("@nomicfoundation/hardhat-network-helpers");

describe("Hamming", () => {
    it("tests hamming", async () => {
        const v = await ethers.deployContract("TestHamming");
        
        let res = await v.testHamming();
        assert.equal(res[0], 0);
        assert.equal(res[1], 8);
    });
});
