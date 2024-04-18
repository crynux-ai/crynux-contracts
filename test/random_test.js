const { assert, expect } = require("chai");
const helpers = require("@nomicfoundation/hardhat-network-helpers");

describe("Random", () => {
    var v;
    ethers.deployContract("TestRandom").then((res) => {
        v = res;
    });

    it("testManualSeed", async () => {
        await v.testManualSeed(1);
        let generator = await v.generator();
        assert.equal(generator[0], ethers.zeroPadValue("0x0001", 32));
        assert.equal(generator.nonce, 0);
    });

    it("testRandint", async () => {
        await v.testRandint();
        let res = await v.intRes();
        let generator = await v.generator();
        assert.isTrue(res >= 0);
        assert.equal(generator.nonce, 1);
    });

    it("testRandrange", async () => {
        await v.testRandrange();
        let res = await v.intRes();
        let generator = await v.generator();
        assert.isTrue(res >= 0);
        assert.isTrue(res < 3);
        assert.equal(generator.nonce, 2);
    });

    it("testMultinomial", async () => {
        await v.testMultinomial();
        let res = await v.intRes();
        assert.isTrue(res >= 0);
        assert.isTrue(res < 3);
        let generator = await v.generator();
        assert.equal(generator.nonce, 3);
    });

    it("testWrongRandrange", async () => {
        try {
            await v.wrongRandrange();
            assert.fail("wrongRandRange should fail");
        } catch (e) {
            assert.match(e.toString(), /range start should be less than end/);
        }
        assert.isFalse(await v.boolRes());
    });

    it("testWrongMultinomial", async () => {
        await v.testWrongMultinomial();
        assert.isFalse(await v.boolRes());
    });

    it("testWrongMultinomialWeights", async () => {
        await v.testWrongMultinomialWeights();
        assert.isFalse(await v.boolRes());
    });

});
